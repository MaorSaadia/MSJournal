import "server-only";
import { createHash } from "node:crypto";
import { and, eq, inArray, sql, desc } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  feeReconciliations as reports,
  feeReconciliationSources as sources,
  journalPortionFees as fees,
  tradovatePerformance as performance,
  tradingAccounts,
  userPreferences,
} from "@/db/schema";
import { requireUser } from "@/lib/session";
import { NotFoundError } from "@/lib/accounts/service";
import { ReviewError } from "@/lib/reviews/model";
import { localDay } from "@/lib/journal/calculations";
import { D } from "@/lib/journal/processing";
import { dayBounds } from "@/lib/calendar/model";
import { lockAccount, publish } from "@/lib/journal/service";
import {
  allocateFeeTotal,
  feeScopeSchema,
  saveFeeTotalSchema,
  type FeePart,
  type FeeQuote,
} from "./model";
type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
const scoped = (ownerId: string, tradingAccountId: string) => ({
  ownerId,
  tradingAccountId,
});
export async function feePlan(
  db: Db | Tx,
  ownerId: string,
  accountId: string,
  parts: FeePart[],
  total: string,
  timezone: string,
) {
  if (!parts.length || parts.length > 10000)
    throw new ReviewError(
      "Choose 1–10,000 Performance records for a fee total.",
    );
  const { gross, net } = allocateFeeTotal(total, parts);
  const ids = parts.map((p) => p.id),
    persisted = ids.filter((id) => !id.startsWith("new:"));
  const previous = persisted.length
    ? await db
        .select()
        .from(fees)
        .where(
          and(
            eq(fees.ownerId, ownerId),
            eq(fees.tradingAccountId, accountId),
            inArray(fees.sourceId, persisted),
          ),
        )
    : [];
  const links = persisted.length
    ? await db
        .select()
        .from(sources)
        .where(
          and(
            eq(sources.ownerId, ownerId),
            eq(sources.tradingAccountId, accountId),
            eq(sources.active, true),
            inArray(sources.sourceId, persisted),
          ),
        )
    : [];
  const reportIds = [...new Set(links.map((r) => r.reconciliationId))];
  const overlaps = reportIds.length
    ? await db
        .select()
        .from(reports)
        .where(
          and(
            eq(reports.ownerId, ownerId),
            eq(reports.tradingAccountId, accountId),
            eq(reports.active, true),
            inArray(reports.id, reportIds),
          ),
        )
    : [];
  const allLinks = reportIds.length
    ? await db
        .select()
        .from(sources)
        .where(
          and(
            eq(sources.ownerId, ownerId),
            eq(sources.tradingAccountId, accountId),
            eq(sources.active, true),
            inArray(sources.reconciliationId, reportIds),
          ),
        ).limit(10001)
    : [];
  const selected = new Set(ids);
  if (allLinks.some((l) => !selected.has(l.sourceId)))
    throw new ReviewError(
      "These records overlap part of an existing fee total. Edit that total in Fees, or choose a wider range containing all its records. No fees were changed.",
      409,
    );
  const manualRecords = previous.filter((f) => f.kind === "Manual").length;
  const unchanged =
    overlaps.length === 1 &&
    persisted.length === parts.length &&
    allLinks.length === parts.length &&
    new D(overlaps[0].total).eq(total) &&
    manualRecords === 0;
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify([
        timezone,
        new D(total).toFixed(),
        ids.slice().sort(),
        previous.sort((a, b) => a.sourceId.localeCompare(b.sourceId)),
        overlaps.sort((a, b) => a.id.localeCompare(b.id)),
        allLinks.sort((a, b) => a.sourceId.localeCompare(b.sourceId)),
      ]),
    )
    .digest("hex");
  const dates = parts
    .map((p) =>
      localDay(
        new Date(
          Math.max(Date.parse(p.boughtAt), Date.parse(p.soldAt)),
        ).toISOString(),
        timezone,
      ),
    )
    .sort();
  const quote: FeeQuote = {
    count: parts.length,
    gross,
    total: new D(total).toFixed(),
    net,
    start: dates[0],
    end: dates.at(-1)!,
    timezone,
    fingerprint,
    existingTotals: overlaps.length,
    manualRecords,
    replaceRequired: !unchanged && (overlaps.length > 0 || manualRecords > 0),
    unchanged,
  };
  return { quote, overlaps };
}
export async function applyFeeTotal(
  tx: Tx,
  ownerId: string,
  accountId: string,
  parts: FeePart[],
  total: string,
  timezone: string,
  expected: string,
  replace: boolean,
  note = "",
  importBatchId?: string,
) {
  const plan = await feePlan(tx, ownerId, accountId, parts, total, timezone);
  if (plan.quote.fingerprint !== expected)
    throw new ReviewError(
      "Fees or records changed since this preview. Review again before saving; nothing was changed.",
      409,
    );
  if (plan.quote.replaceRequired && !replace)
    throw new ReviewError(
      "Confirm replacing the fees shown in the preview. Fees are replaced, never added a second time.",
      409,
    );
  if (plan.quote.unchanged && (!note || note === plan.overlaps[0].note))
    return { id: plan.overlaps[0].id, unchanged: true };
  const scope = scoped(ownerId, accountId);
  if (plan.overlaps.length) {
    const ids = plan.overlaps.map((r) => r.id);
    await tx
      .update(sources)
      .set({ active: false })
      .where(
        and(
          eq(sources.ownerId, ownerId),
          inArray(sources.reconciliationId, ids),
        ),
      );
    await tx
      .update(reports)
      .set({ active: false })
      .where(and(eq(reports.ownerId, ownerId), inArray(reports.id, ids)));
  }
  const [report] = await tx
    .insert(reports)
    .values({
      ...scope,
      total,
      gross: plan.quote.gross,
      start: plan.quote.start,
      end: plan.quote.end,
      timezone,
      note,
      importBatchId: importBatchId ?? null,
    })
    .returning();
  const { allocations } = allocateFeeTotal(total, parts);
  for (let i = 0; i < allocations.length; i += 200) {
    const batch = allocations.slice(i, i + 200);
    await tx
      .insert(sources)
      .values(
        batch.map((a) => ({
          ...scope,
          reconciliationId: report.id,
          sourceId: a.sourceId,
          amount: a.amount,
        })),
      );
    await tx
      .insert(fees)
      .values(batch.map((a) => ({ ...scope, ...a })))
      .onConflictDoUpdate({
        target: fees.sourceId,
        set: {
          amount: sql`excluded.amount`,
          kind: "Allocated",
          perSide: null,
          settingRevision: null,
          updatedAt: new Date(),
        },
      });
  }
  return { id: report.id, unchanged: false };
}
async function selectParts(
  db: Db | Tx,
  ownerId: string,
  scope: ReturnType<typeof feeScopeSchema.parse>,
  timezone: string,
): Promise<FeePart[]> {
  if (scope.id) {
    const [report] = await db
      .select()
      .from(reports)
      .where(
        and(
          eq(reports.ownerId, ownerId),
          eq(reports.tradingAccountId, scope.accountId),
          eq(reports.id, scope.id),
          eq(reports.active, true),
        ),
      );
    if (!report) throw new NotFoundError();
    const rows = await db
      .select({ part: performance })
      .from(sources)
      .innerJoin(
        performance,
        and(
          eq(performance.id, sources.sourceId),
          eq(performance.ownerId, ownerId),
          eq(performance.tradingAccountId, scope.accountId),
        ),
      )
      .where(
        and(
          eq(sources.ownerId, ownerId),
          eq(sources.reconciliationId, report.id),
          eq(sources.active, true),
        ),
      )
      .limit(10001);
    return rows.map(({ part }) => ({
      ...part,
      boughtAt: part.boughtAt.toISOString(),
      soldAt: part.soldAt.toISOString(),
    }));
  }
  const start = dayBounds(scope.start, timezone).start,
    end = dayBounds(scope.end, timezone).end;
  const rows = await db
    .select()
    .from(performance)
    .where(
      and(
        eq(performance.ownerId, ownerId),
        eq(performance.tradingAccountId, scope.accountId),
        sql`greatest(${performance.boughtAt},${performance.soldAt}) >= ${start}::timestamptz and greatest(${performance.boughtAt},${performance.soldAt}) < ${end}::timestamptz`,
      ),
    )
    .limit(10001);
  return rows.map((part) => ({
    ...part,
    boughtAt: part.boughtAt.toISOString(),
    soldAt: part.soldAt.toISOString(),
  }));
}
export async function getFees(input: unknown, headers: Headers) {
  const user = await requireUser(headers),
    scope = feeScopeSchema.parse(input);
  return getDb().transaction(
    async (tx) => {
      const [account] = await tx
        .select()
        .from(tradingAccounts)
        .where(
          and(
            eq(tradingAccounts.id, scope.accountId),
            eq(tradingAccounts.ownerId, user.id),
          ),
        );
      if (!account) throw new NotFoundError();
      const [pref] = await tx
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, user.id));
      const timezone = pref?.displayTimezone ?? "Asia/Jerusalem";
      const parts = await selectParts(tx, user.id, scope, timezone);
      if (parts.length > 10000)
        throw new ReviewError(
          "Narrow this range to at most 10,000 Performance records.",
          413,
        );
      const history = await tx
        .select()
        .from(reports)
        .where(
          and(
            eq(reports.ownerId, user.id),
            eq(reports.tradingAccountId, scope.accountId),
          ),
        )
        .orderBy(desc(reports.createdAt))
        .limit(100);
      const current = parts.length
        ? await tx
            .select()
            .from(fees)
            .where(
              and(
                eq(fees.ownerId, user.id),
                eq(fees.tradingAccountId, scope.accountId),
                inArray(
                  fees.sourceId,
                  parts.map((p) => p.id),
                ),
              ),
            )
        : [];
      const feeTotal = parts.length > 0 && current.filter((f) => f.amount !== null).length === parts.length
        ? current.reduce((n, f) => n.plus(f.amount!), new D(0)).toFixed()
        : null;
      const gross = parts.reduce((n, p) => n.plus(p.grossPnl), new D(0)).toFixed();
      return {
        userId: user.id,
        timezone,
        account: {
          id: account.id,
          name: account.displayName,
          currency: account.currency,
        },
        count: parts.length,
        gross,
        feeTotal,
        net: feeTotal === null ? null : new D(gross).minus(feeTotal).toFixed(),
        covered: current.filter((f) => f.amount !== null).length,
        history: history.map((r) => ({
          ...r,
          net: new D(r.gross).minus(r.total).toFixed(),
          createdAt: r.createdAt.toISOString(),
        })),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export async function previewFees(input: unknown, headers: Headers) {
  const user = await requireUser(headers);
  const body = saveFeeTotalSchema
    .omit({ fingerprint: true, replace: true, confirmed: true })
    .parse(input);
  return getDb().transaction(
    async (tx) => {
      const [account] = await tx
        .select()
        .from(tradingAccounts)
        .where(
          and(
            eq(tradingAccounts.ownerId, user.id),
            eq(tradingAccounts.id, body.scope.accountId),
          ),
        );
      if (!account) throw new NotFoundError();
      const [pref] = await tx
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, user.id));
      const timezone = pref?.displayTimezone ?? "Asia/Jerusalem";
      const parts = await selectParts(tx, user.id, body.scope, timezone);
      return {
        userId: user.id,
        ...(
          await feePlan(
            tx,
            user.id,
            body.scope.accountId,
            parts,
            body.total,
            timezone,
          )
        ).quote,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export async function saveFees(input: unknown, headers: Headers) {
  const user = await requireUser(headers),
    body = saveFeeTotalSchema.parse(input);
  return getDb().transaction(async (tx) => {
    await lockAccount(tx, user.id, body.scope.accountId);
    const [pref] = await tx
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, user.id));
    const timezone = pref?.displayTimezone ?? "Asia/Jerusalem";
    const parts = await selectParts(tx, user.id, body.scope, timezone);
    const result = await applyFeeTotal(
      tx,
      user.id,
      body.scope.accountId,
      parts,
      body.total,
      timezone,
      body.fingerprint,
      body.replace,
      body.note,
    );
    await publish(tx, user.id, body.scope.accountId);
    return result;
  });
}
export type FeesData = Awaited<ReturnType<typeof getFees>>;
