import "server-only";
import { createHash } from "node:crypto";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import * as tables from "@/db/schema";
import { requireUser } from "@/lib/session";
import { ReviewError } from "@/lib/reviews/model";
import { cleanupScreenshots } from "@/lib/reviews/service";
import { NotFoundError, type AccountTx } from "./service";

type Summary = {
  imports: number; sourceRecords: number; journalRecords: number;
  reviews: number; screenshots: number; phases: number; payouts: number;
  version: string; filesVersion: string;
};
async function lockArchived(tx: AccountTx, ownerId: string, id: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${ownerId + ":" + id},0))`);
  const [account] = await tx.select().from(tables.tradingAccounts).where(and(
    eq(tables.tradingAccounts.ownerId, ownerId), eq(tables.tradingAccounts.id, id),
  )).for("update");
  if (!account) throw new NotFoundError();
  if (!account.archivedAt) throw new ReviewError("Archive this account before deleting it.", 409);
  const phases = tx.select({ id: tables.propPhases.id }).from(tables.propPhases)
    .where(and(eq(tables.propPhases.ownerId, ownerId), eq(tables.propPhases.tradingAccountId, id)));
  const [linked] = await tx.select({ id: tables.propPhases.id }).from(tables.propPhases).where(and(
    eq(tables.propPhases.ownerId, ownerId), ne(tables.propPhases.tradingAccountId, id),
    inArray(tables.propPhases.previousId, phases),
  )).limit(1);
  if (linked) throw new ReviewError("Another account depends on this phase history. Keep it archived to preserve that relationship.", 409);
  return account;
}
async function summary(tx: AccountTx, ownerId: string, id: string) {
  const result = await tx.execute<Summary>(sql`
    select
      (select count(*)::int from import_batches where owner_id=${ownerId} and trading_account_id=${id}) as imports,
      ((select count(*) from tradovate_performance_records where owner_id=${ownerId} and trading_account_id=${id}) +
       (select count(*) from tradovate_order_records where owner_id=${ownerId} and trading_account_id=${id}))::int as "sourceRecords",
      (select count(*)::int from journal_records where owner_id=${ownerId} and trading_account_id=${id}) as "journalRecords",
      (select count(*)::int from journal_reviews where owner_id=${ownerId} and trading_account_id=${id}) as reviews,
      (select count(*)::int from review_attachments where owner_id=${ownerId} and trading_account_id=${id}) as screenshots,
      (select count(*)::int from prop_phases where owner_id=${ownerId} and trading_account_id=${id}) as phases,
      (select count(*)::int from prop_payouts where owner_id=${ownerId} and phase_id in
        (select id from prop_phases where owner_id=${ownerId} and trading_account_id=${id})) as payouts,
      concat_ws(':',
        (select coalesce(sum(revision),0) from journal_reviews where owner_id=${ownerId} and trading_account_id=${id}),
        (select coalesce(sum(revision),0) from strategy_assignments where owner_id=${ownerId} and trading_account_id=${id}),
        (select count(*) from fee_reconciliations where owner_id=${ownerId} and trading_account_id=${id}),
        (select count(*) from prop_events where owner_id=${ownerId} and phase_id in
          (select id from prop_phases where owner_id=${ownerId} and trading_account_id=${id})),
        (select count(*) from prop_snapshots where owner_id=${ownerId} and phase_id in
          (select id from prop_phases where owner_id=${ownerId} and trading_account_id=${id})),
        (select coalesce(sum(revision),0) from prop_payouts where owner_id=${ownerId} and phase_id in
          (select id from prop_phases where owner_id=${ownerId} and trading_account_id=${id}))) as version,
      (select concat_ws(':',count(*),coalesce(sum(revision),0)) from review_attachments
        where owner_id=${ownerId} and trading_account_id=${id}) as "filesVersion"
  `);
  return result.rows[0];
}
function fingerprint(account: typeof tables.tradingAccounts.$inferSelect, value: Summary) {
  const { screenshots: _screenshots, filesVersion: _filesVersion, ...data } = value;
  void _screenshots; void _filesVersion;
  return createHash("sha256").update(JSON.stringify([account.id, account.updatedAt.toISOString(), data])).digest("hex");
}
export async function accountDeletionPreview(id: string, headers: Headers) {
  const owner = await requireUser(headers);
  z.uuid().parse(id);
  return getDb().transaction(async (tx) => {
    const account = await lockArchived(tx, owner.id, id);
    const value = await summary(tx, owner.id, id);
    return { accountName: account.displayName, counts: {
      imports: value.imports, sourceRecords: value.sourceRecords, journalRecords: value.journalRecords,
      reviews: value.reviews, screenshots: value.screenshots, phases: value.phases, payouts: value.payouts,
    }, fingerprint: fingerprint(account, value), filesVersion: value.filesVersion };
  });
}
const deletionInput = z.object({
  accountName: z.string().max(100), fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  filesVersion: z.string().max(100), confirmed: z.literal(true),
}).strict();
export async function deleteArchivedAccount(id: string, input: unknown, headers: Headers) {
  const owner = await requireUser(headers);
  z.uuid().parse(id);
  const q = deletionInput.parse(input);
  const check = async (tx: AccountTx) => {
    const account = await lockArchived(tx, owner.id, id);
    const value = await summary(tx, owner.id, id);
    if (account.displayName !== q.accountName || fingerprint(account, value) !== q.fingerprint)
      throw new ReviewError("Account data changed. Review a fresh deletion summary before continuing.", 409);
    return value;
  };
  const hasFiles = await getDb().transaction(async (tx) => {
    const value = await check(tx);
    if (q.filesVersion !== value.filesVersion)
      throw new ReviewError("Screenshots changed. Review a fresh deletion summary before continuing.", 409);
    if (value.screenshots) await tx.update(tables.reviewAttachments).set({ state: "deleting" })
      .where(and(eq(tables.reviewAttachments.ownerId, owner.id), eq(tables.reviewAttachments.tradingAccountId, id)));
    return value.screenshots > 0;
  });
  // Existing attachment metadata is a durable retry ledger until private objects are removed.
  if (hasFiles) {
    try { await cleanupScreenshots(owner.id, id); }
    catch { throw new ReviewError("Screenshot removal could not finish. The account remains archived. Check private storage, then refresh this summary and retry deletion. Some screenshots may already have been removed.", 409); }
  }
  await getDb().transaction(async (tx) => {
    const current = await check(tx);
    if (current.screenshots) throw new ReviewError("Screenshots are still being removed. Refresh this summary and retry deletion to continue. The account remains archived.", 409);
    const phases = tx.select({ id: tables.propPhases.id }).from(tables.propPhases)
      .where(and(eq(tables.propPhases.ownerId, owner.id), eq(tables.propPhases.tradingAccountId, id)));
    const payouts = tx.select({ id: tables.propPayouts.id }).from(tables.propPayouts)
      .where(and(eq(tables.propPayouts.ownerId, owner.id), inArray(tables.propPayouts.phaseId, phases)));
    await tx.delete(tables.propPayoutEvents).where(and(eq(tables.propPayoutEvents.ownerId, owner.id), inArray(tables.propPayoutEvents.payoutId, payouts)));
    for (const table of [tables.propPayouts, tables.propEvents, tables.propSnapshots, tables.propRuleVersions])
      await tx.delete(table).where(and(eq(table.ownerId, owner.id), inArray(table.phaseId, phases)));
    await tx.delete(tables.propPhases).where(and(eq(tables.propPhases.ownerId, owner.id), eq(tables.propPhases.tradingAccountId, id)));
    // Child-first order respects restrictive FKs; each delete is scoped by owner AND account.
    for (const table of [
      tables.strategyAssignments, tables.reviewSources, tables.journalReviews,
      tables.journalSources, tables.journalPortionFees, tables.journalRecords,
      tables.journalProcessing, tables.accountFeeSettings, tables.balanceAdjustments,
      tables.feeReconciliationSources, tables.feeReconciliations,
      tables.importProvenance, tables.importFiles, tables.importBatches,
      tables.tradovateOrders, tables.tradovatePerformance,
    ]) await tx.delete(table).where(and(eq(table.ownerId, owner.id), eq(table.tradingAccountId, id)));
    await tx.delete(tables.tradingAccounts).where(and(eq(tables.tradingAccounts.ownerId, owner.id), eq(tables.tradingAccounts.id, id)));
  });
  return { deleted: true };
}
export type AccountDeletionPreview = Awaited<ReturnType<typeof accountDeletionPreview>>;
