import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import {
  importBatches,
  importFiles,
  importProvenance,
  tradingAccounts,
  tradovateOrders,
  tradovatePerformance,
  userPreferences,
} from "@/db/schema";
import { requireUser } from "@/lib/session";
import { readConfig } from "@/lib/config";
import { WorkspaceUnavailableError } from "@/lib/server-error";
import { NotFoundError } from "@/lib/accounts/service";
import { classify } from "./identity";
import { hash } from "./parser";
import { ImportError } from "./errors";
import { feePlan, applyFeeTotal } from "@/lib/fees/service";
import { feeAmount, type FeePart } from "@/lib/fees/model";
import {
  counts,
  PARSER_VERSION,
  type ImportOptions,
  type ParsedFile,
  type Preview,
  type StoredIdentity,
  type OrderValues,
  type PerformanceValues,
} from "./types";
type DB = ReturnType<typeof getDb>;
type TX = Parameters<Parameters<DB["transaction"]>[0]>[0];
type Stored = StoredIdentity & { id: string };
const sourceKey = (r: Pick<StoredIdentity, "identity" | "fingerprint" | "occurrence"> & { matchedSource?: { fingerprint: string; occurrence: number } }) => JSON.stringify([r.identity, r.matchedSource?.fingerprint ?? r.fingerprint, r.matchedSource?.occurrence ?? r.occurrence]);
function importFeeParts(files: ParsedFile[], stored: Map<string, Stored[]>) {
  const file = files.find((f) => f.type === "performance");
  if (!file?.rows.length || file.errors.length) throw new ImportError("Resolve Performance CSV errors before adding a fee total.");
  const ids = new Map((stored.get("performance") ?? []).map((r) => [sourceKey(r), r.id]));
  return file.rows.map((r) => ({ ...(r.values as PerformanceValues), id: ids.get(sourceKey(r)) ?? `new:${sourceKey(r)}` }));
}
async function displayZone(db: DB | TX, userId: string) {
  const [pref] = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId));
  return pref?.displayTimezone ?? "Asia/Jerusalem";
}
async function selectedAccount(
  db: DB | TX,
  userId: string,
  id: string,
  locking = false,
) {
  const query = db
    .select()
    .from(tradingAccounts)
    .where(
      and(
        eq(tradingAccounts.id, z.uuid().parse(id)),
        eq(tradingAccounts.ownerId, userId),
      ),
    );
  // Account cannot be edited or archived during a confirmed transaction.
  const [account] = await (locking ? query.for("update") : query);
  if (!account) throw new NotFoundError();
  if (
    account.archivedAt ||
    account.status !== "Active"
  )
    throw new ImportError("Choose an active, unarchived destination account. Only supported Tradovate CSV formats can be imported.");
  return account;
}
async function evaluate(
  db: DB | TX,
  userId: string,
  options: ImportOptions,
  files: ParsedFile[],
  locking = false,
) {
  const account = await selectedAccount(db, userId, options.accountId, locking);
  const stored = new Map<string, Stored[]>();
  for (const file of files) {
    const previous = await db
      .select({ timezone: importBatches.timezone })
      .from(importFiles)
      .innerJoin(
        importBatches,
        and(
          eq(importFiles.batchId, importBatches.id),
          eq(importBatches.ownerId, userId),
        ),
      )
      .where(
        and(
          eq(importFiles.ownerId, userId),
          eq(importFiles.tradingAccountId, account.id),
          eq(importFiles.reportType, file.type),
          eq(importFiles.fileHash, file.hash),
        ),
      );
    const different = previous.find((p) => p.timezone !== options.timezone);
    if (different)
      file.errors.push({
        row: 0,
        column: "Source timezone",
        message: `This identical report was already imported using ${different.timezone}. Changing its source timezone requires an explicit correction workflow, which is not available yet. Nothing will be imported again.`,
      });
    if (file.type === "orders") {
      const ids = [...new Set(file.rows.map((r) => r.identity))];
      const rows = ids.length
        ? await db
            .select({
              id: tradovateOrders.id,
              identity: tradovateOrders.orderId,
              fingerprint: tradovateOrders.fingerprint,
            })
            .from(tradovateOrders)
            .where(
              and(
                eq(tradovateOrders.ownerId, userId),
                eq(tradovateOrders.tradingAccountId, account.id),
                inArray(tradovateOrders.orderId, ids),
              ),
            )
        : [];
      const old = rows.map((r) => ({ ...r, occurrence: 1 }));
      stored.set(file.type, old);
      classify(file, old);
      const identifiers = new Set(
        file.rows.map((r) => (r.values as OrderValues).brokerAccount),
      );
      if (identifiers.size > 1)
        file.errors.push({
          row: 0,
          column: "Account",
          message:
            "Orders contains multiple source accounts. Export one account per import.",
        });
      if (identifiers.size === 1) {
        const identifier = [...identifiers][0];
        if (account.brokerIdentifier && account.brokerIdentifier !== identifier)
          file.errors.push({
            row: 0,
            column: "Account",
            message:
              "Orders account identifier does not match this trading account's configured broker identifier.",
          });
        if (!account.brokerIdentifier && !options.confirmOrders)
          file.errors.push({
            row: 0,
            column: "Account",
            message:
              "Confirm the displayed source account belongs to the selected account. This will not change account settings.",
          });
      }
    } else {
      const ids = [...new Set(file.rows.map((r) => r.identity))];
      const old = ids.length
        ? await db
            .select({
              id: tradovatePerformance.id,
              identity: tradovatePerformance.identity,
              fingerprint: tradovatePerformance.fingerprint,
              occurrence: tradovatePerformance.occurrence,
              buyFillId: tradovatePerformance.buyFillId,
              sellFillId: tradovatePerformance.sellFillId,
              symbol: tradovatePerformance.symbol,
              quantity: tradovatePerformance.quantity,
              buyPrice: tradovatePerformance.buyPrice,
              sellPrice: tradovatePerformance.sellPrice,
              grossPnl: tradovatePerformance.grossPnl,
              boughtAt: tradovatePerformance.boughtAt,
              soldAt: tradovatePerformance.soldAt,
              duration: tradovatePerformance.duration,
            })
            .from(tradovatePerformance)
            .where(
              and(
                eq(tradovatePerformance.ownerId, userId),
                eq(tradovatePerformance.tradingAccountId, account.id),
                inArray(tradovatePerformance.identity, ids),
              ),
            )
        : [];
      const compared = old.map((row) => ({ ...row, values: {
        buyFillId: row.buyFillId, sellFillId: row.sellFillId, symbol: row.symbol,
        quantity: row.quantity, buyPrice: row.buyPrice, sellPrice: row.sellPrice,
        grossPnl: row.grossPnl, boughtAt: row.boughtAt.toISOString(), soldAt: row.soldAt.toISOString(), duration: row.duration,
      } }));
      stored.set(file.type, compared);
      classify(file, compared);
      if (!options.confirmPerformance)
        file.errors.push({
          row: 0,
          column: "Account",
          message:
            "Performance has no account identifier. Explicitly confirm this report belongs to the selected account.",
        });
    }
    if (!file.total && !file.errors.length)
      file.errors.push({
        row: 0,
        column: "file",
        message: "Report contains no source records.",
      });
  }
  return stored;
}
function payloadHash(options: ImportOptions, files: ParsedFile[]) {
  return hash(
    JSON.stringify([
      PARSER_VERSION,
      { ...options, replaceFees: undefined },
      files.map((f) => [f.type, f.name, f.hash]),
    ]),
  );
}
function signedToken(userId: string, payload: string) {
  const data = Buffer.from(
    JSON.stringify({
      userId,
      payload,
      id: randomUUID(),
      expires: Date.now() + 30 * 60000,
    }),
  ).toString("base64url");
  return (
    data +
    "." +
    createHmac("sha256", readConfig().BETTER_AUTH_SECRET)
      .update(data)
      .digest("base64url")
  );
}
function verifyToken(token: string, userId: string, payload: string) {
  try {
    const [data, signature, extra] = token.split(".");
    const expected = createHmac("sha256", readConfig().BETTER_AUTH_SECRET)
      .update(data)
      .digest();
    const supplied = Buffer.from(signature, "base64url");
    if (
      extra ||
      supplied.length !== expected.length ||
      !timingSafeEqual(expected, supplied)
    )
      throw new Error();
    const value = z
      .object({
        userId: z.string(),
        payload: z.string(),
        id: z.uuid(),
        expires: z.number(),
      })
      .parse(JSON.parse(Buffer.from(data, "base64url").toString()));
    if (
      value.userId !== userId ||
      value.payload !== payload ||
      value.expires < Date.now()
    )
      throw new Error();
    return value.id;
  } catch {
    throw new ImportError(
      "Preview expired or the files/settings changed. Review a fresh preview before confirming.",
      409,
    );
  }
}
export async function previewImport(
  options: ImportOptions,
  files: ParsedFile[],
  headers?: Headers,
): Promise<Preview> {
  const user = await requireUser(headers);
  const stored = await evaluate(getDb(), user.id, options, files);
  const canConfirm = files.every((f) => !f.errors.length);
  let feeReview;
  if (options.feeTotal !== undefined && canConfirm) {
    feeAmount.parse(options.feeTotal);
    feeReview = (await feePlan(getDb(), user.id, options.accountId, importFeeParts(files, stored), options.feeTotal, await displayZone(getDb(), user.id))).quote;
  }
  const signedOptions = feeReview ? { ...options, feeFingerprint: feeReview.fingerprint } : options;
  return {
    files,
    counts: counts(files),
    canConfirm,
    token: canConfirm
      ? signedToken(user.id, payloadHash(signedOptions, files))
      : null,
    ...(feeReview && { feeReview }),
  };
}
function chunks<T>(values: T[], size = 200): T[][] {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, i) =>
    values.slice(i * size, (i + 1) * size),
  );
}
export async function confirmImport(
  options: ImportOptions,
  files: ParsedFile[],
  token: string,
  headers?: Headers,
) {
  const user = await requireUser(headers),
    payload = payloadHash(options, files),
    confirmationId = verifyToken(token, user.id, payload);
  return getDb().transaction(async (tx) => {
    // Transaction-scoped locks work with Neon's pooled PostgreSQL connection.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${user.id + ":" + confirmationId},0))`,
    );
    const [prior] = await tx
      .select()
      .from(importBatches)
      .where(
        and(
          eq(importBatches.ownerId, user.id),
          eq(importBatches.confirmationId, confirmationId),
        ),
      );
    if (prior) {
      if (prior.payloadHash !== payload)
        throw new ImportError("Confirmation does not match this import.", 409);
      return {
        id: prior.id,
        outcome: prior.outcome,
        added: prior.added,
        duplicates: prior.duplicates,
      };
    }
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${user.id + ":" + options.accountId},0))`,
    );
    const existing = await evaluate(tx, user.id, options, files, true);
    if (files.some((f) => f.errors.length))
      throw new ImportError(
        "Import blocked: validation or conflicting source records remain. Review a fresh preview; nothing was saved.",
        409,
      );
    let feeZone: string | undefined;
    if (options.feeTotal !== undefined) {
      feeAmount.parse(options.feeTotal);
      feeZone = await displayZone(tx, user.id);
      const fee = await feePlan(tx, user.id, options.accountId, importFeeParts(files, existing), options.feeTotal, feeZone);
      if (fee.quote.fingerprint !== options.feeFingerprint) throw new ImportError("Fees changed since your preview. Review again; nothing was saved.", 409);
      if (fee.quote.replaceRequired && !options.replaceFees) throw new ImportError("Confirm replacing the fees shown in your preview, then review again.", 409);
    }
    const summary = counts(files);
    const scope = { ownerId: user.id, tradingAccountId: options.accountId };
    const feeParts: FeePart[] = [];
    const [batch] = await tx
      .insert(importBatches)
      .values({
        ...scope,
        confirmationId,
        payloadHash: payload,
        timezone: options.timezone,
        parserVersion: PARSER_VERSION,
        total: summary.total,
        added: summary.new,
        duplicates: summary.duplicates,
        outcome: summary.new ? "Imported" : "Already imported",
      })
      .returning();
    for (const file of files) {
      const [savedFile] = await tx
        .insert(importFiles)
        .values({
          ...scope,
          batchId: batch.id,
          reportType: file.type,
          originalName: file.name,
          fileHash: file.hash,
          bytes: file.bytes,
          total: file.total,
          added: file.rows.filter((r) => r.disposition === "new").length,
          duplicates: file.rows.filter((r) => r.disposition === "duplicate")
            .length,
          start: file.start ? new Date(file.start) : null,
          end: file.end ? new Date(file.end) : null,
        })
        .returning();
      const key = sourceKey;
      const references = new Map(
        (existing.get(file.type) ?? []).map((r) => [key(r), r.id]),
      );
      const fresh = file.rows.filter((r) => r.disposition === "new");
      for (const group of chunks(fresh)) {
        if (file.type === "orders") {
          const inserted = await tx
            .insert(tradovateOrders)
            .values(
              group.map((r) => {
                const v = r.values as OrderValues;
                return {
                  ...scope,
                  ...v,
                  timestamp: new Date(v.timestamp),
                  fillTime: v.fillTime ? new Date(v.fillTime) : null,
                  raw: r.raw,
                  fingerprint: r.fingerprint,
                  sourceTimezone: options.timezone,
                };
              }),
            )
            .returning({
              id: tradovateOrders.id,
              identity: tradovateOrders.orderId,
              fingerprint: tradovateOrders.fingerprint,
            });
          inserted.forEach((r) =>
            references.set(key({ ...r, occurrence: 1 }), r.id),
          );
        } else {
          const inserted = await tx
            .insert(tradovatePerformance)
            .values(
              group.map((r) => {
                const v = r.values as PerformanceValues;
                return {
                  ...scope,
                  ...v,
                  boughtAt: new Date(v.boughtAt),
                  soldAt: new Date(v.soldAt),
                  identity: r.identity,
                  occurrence: r.occurrence,
                  raw: r.raw,
                  fingerprint: r.fingerprint,
                  sourceTimezone: options.timezone,
                };
              }),
            )
            .returning({
              id: tradovatePerformance.id,
              identity: tradovatePerformance.identity,
              fingerprint: tradovatePerformance.fingerprint,
              occurrence: tradovatePerformance.occurrence,
            });
          inserted.forEach((r) => references.set(key(r), r.id));
        }
      }
      if (file.type === "performance" && options.feeTotal !== undefined)
        for (const r of file.rows) feeParts.push({ ...(r.values as PerformanceValues), id: references.get(key(r))! });
      for (const group of chunks(file.rows))
        await tx.insert(importProvenance).values(
          group.map((r) => {
            const id = references.get(key(r));
            if (!id)
              throw new ImportError(
                "Source-record reconciliation failed; nothing was saved.",
                409,
              );
            return {
              ...scope,
              fileId: savedFile.id,
              sourceRow: r.row,
              raw: r.raw,
              orderRecordId: file.type === "orders" ? id : null,
              performanceRecordId: file.type === "performance" ? id : null,
            };
          }),
        );
    }
    if (options.feeTotal !== undefined) {
      const plan = await feePlan(tx, user.id, options.accountId, feeParts, options.feeTotal, feeZone!);
      await applyFeeTotal(tx, user.id, options.accountId, feeParts, options.feeTotal, feeZone!, plan.quote.fingerprint, !!options.replaceFees, "", batch.id);
    }
    return {
      id: batch.id,
      outcome: batch.outcome,
      added: batch.added,
      duplicates: batch.duplicates,
    };
  });
}
export async function listImports(headers?: Headers) {
  const user = await requireUser(headers);
  try {
    const db = getDb();
    const batches = await db
      .select({
        batch: importBatches,
        accountName: tradingAccounts.displayName,
      })
      .from(importBatches)
      .innerJoin(
        tradingAccounts,
        and(
          eq(tradingAccounts.id, importBatches.tradingAccountId),
          eq(tradingAccounts.ownerId, user.id),
        ),
      )
      .where(eq(importBatches.ownerId, user.id))
      .orderBy(desc(importBatches.createdAt))
      .limit(100);
    const files = batches.length
      ? await db
          .select()
          .from(importFiles)
          .where(
            and(
              eq(importFiles.ownerId, user.id),
              inArray(
                importFiles.batchId,
                batches.map((b) => b.batch.id),
              ),
            ),
          )
      : [];
    return batches.map((b) => ({
      ...b,
      files: files.filter((f) => f.batchId === b.batch.id),
    }));
  } catch {
    throw new WorkspaceUnavailableError();
  }
}
export async function lastSourceTimezones(
  headers?: Headers,
): Promise<Record<string, string>> {
  const user = await requireUser(headers);
  try {
    const rows = await getDb()
      .selectDistinctOn([importBatches.tradingAccountId], {
        accountId: importBatches.tradingAccountId,
        timezone: importBatches.timezone,
      })
      .from(importBatches)
      .where(eq(importBatches.ownerId, user.id))
      .orderBy(
        importBatches.tradingAccountId,
        desc(importBatches.createdAt),
        desc(importBatches.id),
      );
    return Object.fromEntries(rows.map((r) => [r.accountId, r.timezone]));
  } catch {
    throw new WorkspaceUnavailableError();
  }
}
export async function importDetails(
  id: string,
  page = 1,
  fileId?: string,
  headers?: Headers,
) {
  const user = await requireUser(headers);
  try {
    const db = getDb();
    const [result] = await db
      .select({
        batch: importBatches,
        accountName: tradingAccounts.displayName,
      })
      .from(importBatches)
      .innerJoin(
        tradingAccounts,
        and(
          eq(tradingAccounts.id, importBatches.tradingAccountId),
          eq(tradingAccounts.ownerId, user.id),
        ),
      )
      .where(
        and(
          eq(importBatches.id, z.uuid().parse(id)),
          eq(importBatches.ownerId, user.id),
        ),
      );
    if (!result) throw new NotFoundError();
    const files = await db
      .select()
      .from(importFiles)
      .where(and(eq(importFiles.batchId, id), eq(importFiles.ownerId, user.id)))
      .orderBy(importFiles.reportType);
    const file = fileId ? files.find((f) => f.id === fileId) : files[0];
    if (!file) throw new NotFoundError();
    const currentPage = Math.max(
      1,
      Math.min(
        Math.ceil(file.total / 25),
        Number.isSafeInteger(page) ? page : 1,
      ),
    );
    const rows = await db
      .select({
        row: importProvenance.sourceRow,
        raw: importProvenance.raw,
        timestamp: tradovateOrders.timestamp,
        soldAt: tradovatePerformance.soldAt,
        boughtAt: tradovatePerformance.boughtAt,
      })
      .from(importProvenance)
      .leftJoin(
        tradovateOrders,
        and(
          eq(tradovateOrders.id, importProvenance.orderRecordId),
          eq(tradovateOrders.ownerId, user.id),
        ),
      )
      .leftJoin(
        tradovatePerformance,
        and(
          eq(tradovatePerformance.id, importProvenance.performanceRecordId),
          eq(tradovatePerformance.ownerId, user.id),
        ),
      )
      .where(
        and(
          eq(importProvenance.fileId, file.id),
          eq(importProvenance.ownerId, user.id),
        ),
      )
      .orderBy(importProvenance.sourceRow)
      .limit(25)
      .offset((currentPage - 1) * 25);
    return { ...result, files, file, rows, page: currentPage };
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof z.ZodError)
      throw error;
    throw new WorkspaceUnavailableError();
  }
}
