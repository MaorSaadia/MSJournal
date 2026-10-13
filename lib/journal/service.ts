import "server-only";
import { REAL_RECORD_KIND } from "./statistics";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import {
  accountFeeSettings,
  journalPortionFees,
  journalProcessing,
  journalRecords,
  journalSources,
  tradovatePerformance,
  tradingAccounts,
  importProvenance,
  importFiles,
} from "@/db/schema";
import { requireUser } from "@/lib/session";
import { NotFoundError } from "@/lib/accounts/service";
import { WorkspaceUnavailableError } from "@/lib/server-error";
import { reconcileStrategies } from "@/lib/strategies/service";
import { reconcileReviews } from "@/lib/reviews/service";
import {
  PROCESSING_VERSION,
  processPortions,
  feeTotal,
  estimateFee,
  allocateManual,
  type Portion,
  type PortionFee,
  sum,
} from "./processing";

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
async function safeDatabase<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof z.ZodError)
      throw error;
    // Server rendering must never forward raw SQL errors (or their causes) to logs.
    throw new WorkspaceUnavailableError();
  }
}
const scope = (ownerId: string, accountId: string) => ({
  ownerId,
  tradingAccountId: accountId,
});
function portion(row: typeof tradovatePerformance.$inferSelect): Portion {
  const {
    id,
    ownerId,
    tradingAccountId,
    symbol,
    buyFillId,
    sellFillId,
    quantity,
    buyPrice,
    sellPrice,
    grossPnl,
  } = row;
  return {
    id,
    ownerId,
    tradingAccountId,
    symbol,
    buyFillId,
    sellFillId,
    quantity,
    buyPrice,
    sellPrice,
    grossPnl,
    boughtAt: row.boughtAt.toISOString(),
    soldAt: row.soldAt.toISOString(),
  };
}
async function lockAccount(tx: Tx, ownerId: string, accountId: string) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${ownerId + ":" + accountId},0))`,
  );
  const [account] = await tx
    .select()
    .from(tradingAccounts)
    .where(
      and(
        eq(tradingAccounts.id, accountId),
        eq(tradingAccounts.ownerId, ownerId),
      ),
    )
    .for("update");
  if (!account) throw new NotFoundError();
}
async function publish(
  tx: Tx,
  ownerId: string,
  accountId: string,
  applyExisting = false,
) {
  const scoped = scope(ownerId, accountId);
  const rows = await tx
    .select()
    .from(tradovatePerformance)
    .where(
      and(
        eq(tradovatePerformance.ownerId, ownerId),
        eq(tradovatePerformance.tradingAccountId, accountId),
      ),
    );
  const parts = rows.map(portion);
  const [settings] = await tx
    .select()
    .from(accountFeeSettings)
    .where(
      and(
        eq(accountFeeSettings.ownerId, ownerId),
        eq(accountFeeSettings.tradingAccountId, accountId),
      ),
    );
  const oldFees = await tx
    .select()
    .from(journalPortionFees)
    .where(
      and(
        eq(journalPortionFees.ownerId, ownerId),
        eq(journalPortionFees.tradingAccountId, accountId),
      ),
    );
  const fees: Record<string, PortionFee> = Object.fromEntries(
    oldFees.map((f) => [f.sourceId, f]),
  );
  for (const p of parts) {
    if (fees[p.id] && (!applyExisting || fees[p.id].kind === "Manual"))
      continue;
    const value = {
      ...estimateFee(
        p.quantity,
        settings?.contractOverrides[p.symbol] ?? settings?.perSide ?? null,
      ),
      settingRevision: settings?.revision ?? null,
    };
    fees[p.id] = value;
    await tx
      .insert(journalPortionFees)
      .values({ ...scoped, sourceId: p.id, ...value })
      .onConflictDoUpdate({
        target: journalPortionFees.sourceId,
        set: { ...value, updatedAt: new Date() },
      });
  }
  const oldLinks = await tx
    .select()
    .from(journalSources)
    .where(
      and(
        eq(journalSources.ownerId, ownerId),
        eq(journalSources.tradingAccountId, accountId),
      ),
    );
  const previous = new Map(oldLinks.map((l) => [l.sourceId, l.recordId])),
    used = new Set<string>();
  await tx
    .update(journalRecords)
    .set({ current: false })
    .where(
      and(
        eq(journalRecords.ownerId, ownerId),
        eq(journalRecords.tradingAccountId, accountId),
      ),
    );
  // Links are a replaceable derived projection. Immutable sources and fee allocations stay intact.
  await tx
    .delete(journalSources)
    .where(
      and(
        eq(journalSources.ownerId, ownerId),
        eq(journalSources.tradingAccountId, accountId),
      ),
    );
  const groups = processPortions(parts);
  if (
    sum(groups.map((g) => g.grossPnl)) !== sum(parts.map((p) => p.grossPnl)) ||
    new Set(groups.flatMap((g) => g.sourceIds)).size !== parts.length
  ) {
    throw new Error("Derived source reconciliation failed.");
  }
  const publishedGroups: { id: string; sourceIds: string[] }[] = [];
  for (const group of groups) {
    const id =
      group.sourceIds
        .map((s) => previous.get(s))
        .filter((id): id is string => !!id && !used.has(id))
        .sort()[0] ?? randomUUID();
    used.add(id);
    publishedGroups.push({ id, sourceIds: group.sourceIds });
    const total = feeTotal(group.sourceIds.map((s) => fees[s]));
    const { sourceIds, ...derived } = group;
    const values = {
      ...scoped,
      ...derived,
      entryAt: derived.entryAt ? new Date(derived.entryAt) : null,
      exitAt: new Date(derived.exitAt),
      fees: total.amount,
      feeKind: total.kind,
      version: PROCESSING_VERSION,
      current: true,
      updatedAt: new Date(),
    };
    await tx
      .insert(journalRecords)
      .values({ id, ...values })
      .onConflictDoUpdate({ target: journalRecords.id, set: values });
    await tx
      .insert(journalSources)
      .values(
        sourceIds.map((sourceId) => ({ ...scoped, recordId: id, sourceId })),
      );
  }
  await reconcileReviews(tx, ownerId, accountId, publishedGroups);
  await reconcileStrategies(tx, ownerId, accountId, publishedGroups);
  await tx
    .insert(journalProcessing)
    .values({
      ...scoped,
      sourceCount: parts.length,
      version: PROCESSING_VERSION,
      status: "Ready",
    })
    .onConflictDoUpdate({
      target: journalProcessing.tradingAccountId,
      set: {
        sourceCount: parts.length,
        version: PROCESSING_VERSION,
        status: "Ready",
        updatedAt: new Date(),
      },
    });
  return { records: groups.length, portions: parts.length };
}
export async function processAccount(accountId: string, headers?: Headers) {
  const user = await requireUser(headers);
  z.uuid().parse(accountId);
  try {
    return await getDb().transaction(async (tx) => {
      await lockAccount(tx, user.id, accountId);
      return publish(tx, user.id, accountId);
    });
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    // Do not alter previously published results. Persist only a scoped retry indicator.
    try {
      await getDb().transaction(async (tx) => {
        await lockAccount(tx, user.id, accountId);
        await tx
          .insert(journalProcessing)
          .values({
            ...scope(user.id, accountId),
            version: PROCESSING_VERSION,
            status: "Failed",
          })
          .onConflictDoUpdate({
            target: journalProcessing.tradingAccountId,
            set: { status: "Failed", updatedAt: new Date() },
          });
      });
    } catch {
      /* Connection failures may also prevent persisting status. */
    }
    throw new WorkspaceUnavailableError();
  }
}
export async function getJournal(headers?: Headers) {
  const user = await requireUser(headers);
  return safeDatabase(() =>
    getDb().transaction(
      async (tx) => {
        const sources = await tx
          .select()
          .from(tradovatePerformance)
          .where(eq(tradovatePerformance.ownerId, user.id));
        const records = await tx
          .select()
          .from(journalRecords)
          .where(
            and(
              eq(journalRecords.ownerId, user.id),
              eq(journalRecords.current, true),
            ),
          );
        const links = await tx
          .select()
          .from(journalSources)
          .where(eq(journalSources.ownerId, user.id));
        const fees = await tx
          .select()
          .from(journalPortionFees)
          .where(eq(journalPortionFees.ownerId, user.id));
        const states = await tx
          .select()
          .from(journalProcessing)
          .where(eq(journalProcessing.ownerId, user.id));
        const published = new Set(links.map((l) => l.sourceId));
        return {
          portions: sources.filter((p) => published.has(p.id)).map(portion),
          records: records.map((r) => ({
            ...r,
            type: REAL_RECORD_KIND,
            entryAt: r.entryAt?.toISOString() ?? null,
            exitAt: r.exitAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
            sourceIds: links
              .filter((l) => l.recordId === r.id)
              .map((l) => l.sourceId),
          })),
          fees: Object.fromEntries(
            fees.map((f) => [
              f.sourceId,
              {
                amount: f.amount,
                kind: f.kind,
                perSide: f.perSide,
                settingRevision: f.settingRevision,
              },
            ]),
          ),
          states: states.map((s) => ({
            accountId: s.tradingAccountId,
            status: s.status,
            version: s.version,
            sourceCount: s.sourceCount,
            updatedAt: s.updatedAt.toISOString(),
          })),
          unprocessed: sources.filter((p) => !published.has(p.id)).length,
          unprocessedAccounts: [
            ...new Set(
              sources
                .filter((p) => !published.has(p.id))
                .map((p) => p.tradingAccountId),
            ),
          ],
          sourceCount: sources.length,
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    ),
  );
}
export type JournalData = Awaited<ReturnType<typeof getJournal>>;
export async function journalDetails(id: string, headers?: Headers) {
  const user = await requireUser(headers);
  z.uuid().parse(id);
  const details = await safeDatabase(() =>
    getDb().transaction(
      async (tx) => {
        const [row] = await tx
          .select()
          .from(journalRecords)
          .where(
            and(
              eq(journalRecords.id, id),
              eq(journalRecords.ownerId, user.id),
              eq(journalRecords.current, true),
            ),
          );
        if (!row) throw new NotFoundError();
        const joined = await tx
          .select({ source: tradovatePerformance, fee: journalPortionFees })
          .from(journalSources)
          .innerJoin(
            tradovatePerformance,
            and(
              eq(tradovatePerformance.id, journalSources.sourceId),
              eq(tradovatePerformance.ownerId, user.id),
              eq(tradovatePerformance.tradingAccountId, row.tradingAccountId),
            ),
          )
          .leftJoin(
            journalPortionFees,
            and(
              eq(journalPortionFees.sourceId, journalSources.sourceId),
              eq(journalPortionFees.ownerId, user.id),
            ),
          )
          .where(
            and(
              eq(journalSources.recordId, id),
              eq(journalSources.ownerId, user.id),
            ),
          );
        return {
          record: {
            ...row,
            entryAt: row.entryAt?.toISOString() ?? null,
            exitAt: row.exitAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
            sourceIds: joined.map((j) => j.source.id),
          },
          parts: joined.map((j) => portion(j.source)),
          fees: Object.fromEntries(
            joined.map((j) => [
              j.source.id,
              {
                amount: j.fee?.amount ?? null,
                kind: j.fee?.kind ?? "Unknown",
                perSide: j.fee?.perSide ?? null,
                settingRevision: j.fee?.settingRevision ?? null,
              },
            ]),
          ),
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    ),
  );
  const { record, parts, fees } = details;
  const references = await safeDatabase(() =>
    getDb()
      .select({
        sourceId: importProvenance.performanceRecordId,
        row: importProvenance.sourceRow,
        batchId: importFiles.batchId,
        name: importFiles.originalName,
        raw: importProvenance.raw,
      })
      .from(importProvenance)
      .innerJoin(
        importFiles,
        and(
          eq(importFiles.id, importProvenance.fileId),
          eq(importFiles.ownerId, user.id),
        ),
      )
      .where(
        and(
          eq(importProvenance.ownerId, user.id),
          inArray(importProvenance.performanceRecordId, record.sourceIds),
        ),
      ),
  );
  return { record, parts, fees, references };
}
const exactFee = z
  .string()
  .trim()
  .regex(
    /^\d{1,12}(?:\.\d{1,8})?$/,
    "Use a nonnegative decimal with at most 8 fractional digits.",
  );
export const feeSettingsSchema = z.object({
  accountId: z.uuid(),
  perSide: exactFee.nullable(),
  contractOverrides: z
    .record(z.string().regex(/^[A-Za-z0-9._-]{1,40}$/), exactFee)
    .refine((v) => Object.keys(v).length <= 50, "Maximum 50 overrides."),
  applyExisting: z.boolean(),
});
export async function getFeeSettings(accountId: string, headers?: Headers) {
  const user = await requireUser(headers);
  z.uuid().parse(accountId);
  const [account] = await safeDatabase(() =>
    getDb()
      .select({ id: tradingAccounts.id, name: tradingAccounts.displayName })
      .from(tradingAccounts)
      .where(
        and(
          eq(tradingAccounts.ownerId, user.id),
          eq(tradingAccounts.id, accountId),
        ),
      ),
  );
  if (!account) throw new NotFoundError();
  const [settings] = await safeDatabase(() =>
    getDb()
      .select()
      .from(accountFeeSettings)
      .where(
        and(
          eq(accountFeeSettings.ownerId, user.id),
          eq(accountFeeSettings.tradingAccountId, accountId),
        ),
      ),
  );
  return {
    account,
    perSide: settings?.perSide ?? null,
    contractOverrides: settings?.contractOverrides ?? {},
  };
}
export async function saveFeeSettings(input: unknown, headers?: Headers) {
  const user = await requireUser(headers),
    values = feeSettingsSchema.parse(input);
  return safeDatabase(() =>
    getDb().transaction(async (tx) => {
      await lockAccount(tx, user.id, values.accountId);
      const settings = {
        perSide: values.perSide,
        contractOverrides: values.contractOverrides,
        revision: randomUUID(),
        updatedAt: new Date(),
      };
      await tx
        .insert(accountFeeSettings)
        .values({ ...scope(user.id, values.accountId), ...settings })
        .onConflictDoUpdate({
          target: accountFeeSettings.tradingAccountId,
          set: settings,
        });
      return publish(tx, user.id, values.accountId, values.applyExisting);
    }),
  );
}
export async function setManualFees(input: unknown, headers?: Headers) {
  const user = await requireUser(headers),
    values = z
      .object({ recordId: z.uuid(), total: exactFee.nullable() })
      .parse(input);
  return safeDatabase(() =>
    getDb().transaction(async (tx) => {
      const [lookup] = await tx
        .select()
        .from(journalRecords)
        .where(
          and(
            eq(journalRecords.id, values.recordId),
            eq(journalRecords.ownerId, user.id),
            eq(journalRecords.current, true),
          ),
        );
      if (!lookup) throw new NotFoundError();
      await lockAccount(tx, user.id, lookup.tradingAccountId);
      // Revalidate after the account lock in case an overlapping import regrouped this record.
      const [record] = await tx
        .select()
        .from(journalRecords)
        .where(
          and(
            eq(journalRecords.id, values.recordId),
            eq(journalRecords.ownerId, user.id),
            eq(journalRecords.current, true),
          ),
        );
      if (!record) throw new NotFoundError();
      const parts = await tx
        .select({
          id: tradovatePerformance.id,
          quantity: tradovatePerformance.quantity,
        })
        .from(journalSources)
        .innerJoin(
          tradovatePerformance,
          and(
            eq(tradovatePerformance.id, journalSources.sourceId),
            eq(tradovatePerformance.ownerId, user.id),
          ),
        )
        .where(
          and(
            eq(journalSources.recordId, record.id),
            eq(journalSources.ownerId, user.id),
          ),
        );
      if (values.total === null) {
        await tx.delete(journalPortionFees).where(
          and(
            eq(journalPortionFees.ownerId, user.id),
            eq(journalPortionFees.kind, "Manual"),
            inArray(
              journalPortionFees.sourceId,
              parts.map((p) => p.id),
            ),
          ),
        );
      } else
        for (const allocation of allocateManual(values.total, parts)) {
          await tx
            .insert(journalPortionFees)
            .values({
              ...scope(user.id, record.tradingAccountId),
              ...allocation,
            })
            .onConflictDoUpdate({
              target: journalPortionFees.sourceId,
              set: {
                amount: allocation.amount,
                kind: "Manual",
                perSide: null,
                settingRevision: null,
                updatedAt: new Date(),
              },
            });
        }
      return publish(tx, user.id, record.tradingAccountId);
    }),
  );
}
