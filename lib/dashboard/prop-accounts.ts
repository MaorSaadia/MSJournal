import "server-only";
import { and, asc, desc, eq, inArray, lte } from "drizzle-orm";
import { getDb } from "@/db/client";
import { propPhases, propRuleVersions, propSnapshots, propPayouts } from "@/db/schema";
import type { TradingAccount } from "@/lib/accounts/types";
import type { CashAdjustment } from "@/lib/balances/model";
import { PROCESSING_VERSION } from "@/lib/journal/processing";
import type { getJournal } from "@/lib/journal/service";
import { propAccountSummary } from "./prop-summary";

export async function dashboardPropAccounts(
  ownerId: string,
  selected: TradingAccount[],
  journal: Awaited<ReturnType<typeof getJournal>>,
  cash: CashAdjustment[],
) {
  const accounts = selected.filter((account) => account.stage !== "Personal");
  if (!accounts.length) return [];
  const ids = accounts.map((account) => account.id);
  const currentTime = new Date();
  const now = currentTime.toISOString();

  return getDb().transaction(async (db) => {
    const phases = await db.selectDistinctOn([propPhases.tradingAccountId]).from(propPhases)
      .where(and(eq(propPhases.ownerId, ownerId), inArray(propPhases.tradingAccountId, ids), lte(propPhases.startAt, currentTime)))
      .orderBy(asc(propPhases.tradingAccountId), desc(propPhases.startAt), desc(propPhases.id));
    const phaseIds = phases.map((phase) => phase.id);
    const [versions, snapshots, payouts] = phaseIds.length ? await Promise.all([
      db.select().from(propRuleVersions)
        .where(and(eq(propRuleVersions.ownerId, ownerId), inArray(propRuleVersions.phaseId, phaseIds), lte(propRuleVersions.effectiveAt, currentTime)))
        .orderBy(asc(propRuleVersions.effectiveAt)),
      db.select().from(propSnapshots)
        .where(and(eq(propSnapshots.ownerId, ownerId), inArray(propSnapshots.phaseId, phaseIds), lte(propSnapshots.asOf, currentTime))),
      // Keep payout deductions from preceding phases out of the current phase ledger.
      db.select({ payout: propPayouts, accountId: propPhases.tradingAccountId }).from(propPayouts)
        .innerJoin(propPhases, and(eq(propPhases.id, propPayouts.phaseId), eq(propPhases.ownerId, ownerId)))
        .where(and(eq(propPayouts.ownerId, ownerId), inArray(propPhases.tradingAccountId, ids))),
    ]) : [[], [], []];
    return accounts.map((account) => {
      const phase = phases.find((p) => p.tradingAccountId === account.id);
      return propAccountSummary({
        account,
        phase: phase && { ...phase, startAt: phase.startAt.toISOString(), endAt: phase.endAt?.toISOString() ?? null, statusAt: phase.statusAt.toISOString() },
        versions: versions.filter((v) => v.phaseId === phase?.id).map((v) => ({ ...v, effectiveAt: v.effectiveAt.toISOString() })),
        snapshots: snapshots.filter((s) => s.phaseId === phase?.id).map((s) => ({ ...s, asOf: s.asOf.toISOString() })),
        payouts: payouts.filter((p) => p.accountId === account.id).map(({ payout }) => ({
          ...payout.fields, id: payout.id, phaseId: payout.phaseId, revision: payout.revision, deductionId: payout.deductionId,
        })),
        portions: journal.portions.filter((p) => p.tradingAccountId === account.id),
        fees: journal.fees,
        cash: cash.filter((c) => c.tradingAccountId === account.id),
        now,
        pending: journal.unprocessedAccounts.includes(account.id) ||
          journal.states.some((state) => state.accountId === account.id && (state.status !== "Ready" || state.version !== PROCESSING_VERSION)),
      });
    });
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
