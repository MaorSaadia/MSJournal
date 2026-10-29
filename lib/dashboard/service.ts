import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { dashboardSchema } from "./model";
import { getPreferences } from "@/lib/preferences";
import { getDb } from "@/db/client";
import {
  balanceAdjustments,
  propPhases,
  propRuleVersions,
  journalReviews,
  reviewAttachments,
} from "@/db/schema";
import { requireUser } from "@/lib/session";
import { listTradingAccounts, NotFoundError } from "@/lib/accounts/service";
import { getJournal } from "@/lib/journal/service";
import { reportSchema, summarizeReports } from "@/lib/reports/model";
import { D, portionEntry, portionExit, sum } from "@/lib/journal/processing";
import { localDay, realizedPerformance } from "@/lib/journal/calculations";
import { summary, isCompleteTrade } from "@/lib/journal/statistics";
import { automaticBaselines, type BalancePhase } from "@/lib/balances/automatic";
import { balanceEstimates } from "@/lib/balances/model";
import { WorkspaceUnavailableError } from "@/lib/server-error";
export async function dashboardData(input: unknown, headers?: Headers) {
  const user = await requireUser(headers),
    q = dashboardSchema.parse(input);
  try {
    const [journal, accounts, preferences] = await Promise.all([
      getJournal(headers),
      listTradingAccounts(headers),
      getPreferences(headers),
    ]);
    const available = accounts.filter(
        (a) => q.archived === "1" || !a.archivedAt,
      ),
      ids =
        q.accounts === undefined
          ? available.map((a) => a.id)
          : [...new Set(q.accounts.split(",").filter(Boolean))];
    if (ids.some((id) => !available.some((a) => a.id === id)))
      throw new NotFoundError();
    const selectedAccounts = available.filter((a) => ids.includes(a.id));
    if (selectedAccounts.some((a) => a.currency !== "USD"))
      throw new NotFoundError();
    const scope = {
      start: q.start,
      end: q.end,
      accounts: ids,
      symbol: q.symbol,
      direction: q.direction,
    };
    // Reports is the daily realized service. Statistics use the same decimal helper.
    const timezone = preferences.displayTimezone;
    const realized = realizedPerformance(
      journal.portions,
      journal.fees,
      scope,
      timezone,
    );
    const basis =
      q.basis === "net" &&
      realized.selected.some((p) => journal.fees[p.id]?.amount == null)
        ? "gross"
        : q.basis;
    const report = summarizeReports({
      q: reportSchema.parse({
        start: q.start,
        end: q.end,
        accounts: ids.join(","),
        archived: q.archived,
        symbol: q.symbol,
        direction: q.direction,
        basis,
      }),
      ids,
      timezone,
      portions: journal.portions,
      fees: journal.fees,
      records: [],
      tags: [],
    });
    const parents = new Map(
      journal.records.flatMap((r) => r.sourceIds.map((id) => [id, r] as const)),
    );
    const selectedParentIds = [
      ...new Set(
        realized.selected
          .map((p) => parents.get(p.id)?.id)
          .filter((id): id is string => !!id),
      ),
    ];
    const complete = journal.records.filter(
      (r) =>
        isCompleteTrade(r) &&
        ids.includes(r.tradingAccountId) &&
        localDay(r.exitAt, timezone) >= q.start &&
        localDay(r.exitAt, timezone) <= q.end &&
        (!q.symbol || r.symbol === q.symbol) &&
        (q.direction === "all" || r.direction === q.direction),
    );
    const values =
      q.outcomeBasis === "complete"
        ? complete.map((r) =>
            basis === "gross"
              ? r.grossPnl
              : r.fees === null
                ? null
                : new D(r.grossPnl).minus(r.fees).toFixed(),
          )
        : realized.selected.map((p) =>
            basis === "gross"
              ? p.grossPnl
              : new D(p.grossPnl).minus(journal.fees[p.id].amount!).toFixed(),
          );
    const outcomes = summary(values, basis === "net" && realized.estimated);
    const reviewRows = selectedParentIds.length
      ? await getDb()
          .select({
            status: journalReviews.status,
            hasContent: journalReviews.hasContent,
            hasImages: sql<boolean>`exists(select 1 from ${reviewAttachments} a where a.review_id=${journalReviews.id} and a.owner_id=${user.id} and a.state='ready')`,
          })
          .from(journalReviews)
          .where(
            and(
              eq(journalReviews.ownerId, user.id),
              inArray(journalReviews.recordId, selectedParentIds),
              eq(journalReviews.needsReassignment, false),
            ),
          )
      : [];
    const reviewed = reviewRows.filter((r) => r.status === "reviewed").length;
    const reviewCoverage = {
      reviewed,
      total: selectedParentIds.length,
      percent:
        reviewRows.some(
          (r) => r.status === "reviewed" || r.hasContent || r.hasImages,
        ) && selectedParentIds.length
          ? new D(reviewed).div(selectedParentIds.length).times(100).toFixed(1)
          : null,
    };
    const timeCandidates =
      q.outcomeBasis === "complete"
        ? []
        : realized.selected.map((p) => {
            const parent = parents.get(p.id),
              entry = parent?.direction === "unknown" ? null : portionEntry(p);
            return { p, parent, entry };
          });
    const known = timeCandidates.filter(
      (x): x is typeof x & { entry: string } => x.entry !== null,
    );
    const timePoints = known
      .sort((a, b) => portionExit(b.p).localeCompare(portionExit(a.p)))
      .slice(0, 500)
      .map(({ p, parent, entry }) => {
        const parts = new Intl.DateTimeFormat("en-GB", {
          timeZone: timezone,
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        }).format(entry ? new Date(entry) : new Date());
        const [hour, minute] = parts.split(":").map(Number);
        return {
          id: p.id,
          recordId: parent!.id,
          symbol: p.symbol,
          direction: parent!.direction,
          entry,
          exit: portionExit(p),
          minutes: hour * 60 + minute,
          value:
            basis === "gross"
              ? p.grossPnl
              : new D(p.grossPnl).minus(journal.fees[p.id].amount!).toFixed(),
        };
      });
    const cash = ids.length
      ? await getDb()
          .select()
          .from(balanceAdjustments)
          .where(
            and(
              eq(balanceAdjustments.ownerId, user.id),
              inArray(balanceAdjustments.tradingAccountId, ids),
            ),
          )
      : [];
    const phaseRows = ids.length ? await getDb().select({
      id: propPhases.id, tradingAccountId: propPhases.tradingAccountId,
      startAt: propPhases.startAt, endAt: propPhases.endAt, baseline: propPhases.baseline, rules: propRuleVersions.rules,
    }).from(propPhases).leftJoin(propRuleVersions, and(eq(propRuleVersions.phaseId, propPhases.id), eq(propRuleVersions.ownerId, user.id)))
      .where(and(eq(propPhases.ownerId, user.id), inArray(propPhases.tradingAccountId, ids)))
      .orderBy(asc(propRuleVersions.effectiveAt)) : [];
    const anchors = new Map<string, BalancePhase>();
    for (const phase of phaseRows) if (!anchors.has(phase.id)) anchors.set(phase.id, {
      tradingAccountId: phase.tradingAccountId, startAt: phase.startAt.toISOString(), endAt: phase.endAt?.toISOString() ?? null,
      baseline: phase.baseline, ledgerStart: phase.rules?.tracking?.ledgerStart ?? null,
    });
    const balanceMovements = cash.map((c) => ({ ...c, effectiveAt: c.effectiveAt.toISOString() }));
    const balances = balanceEstimates(
      automaticBaselines(selectedAccounts, journal.portions, [...anchors.values()], q.start, q.end, timezone, balanceMovements),
      journal.portions,
      journal.fees,
      balanceMovements,
      q.start,
      q.end,
      timezone,
    );
    const recent = selectedParentIds
      .map((id) => {
        const parent = journal.records.find((r) => r.id === id)!;
        const ps = realized.selected.filter((p) =>
          parent.sourceIds.includes(p.id),
        );
        return {
          id,
          symbol: parent.symbol,
          exit: parent.exitAt,
          status: parent.status,
          value: sum(
            ps.map((p) =>
              basis === "gross"
                ? p.grossPnl
                : new D(p.grossPnl).minus(journal.fees[p.id].amount!).toFixed(),
            ),
          ),
        };
      })
      .sort((a, b) => b.exit.localeCompare(a.exit))
      .slice(0, 25);
    return {
      userId: user.id,
      timezone: timezone,
      currency: "USD" as const,
      basis,
      requestedBasis: q.basis,
      outcomeBasis: q.outcomeBasis,
      outcomes,
      realizedSummary: report.summary,
      days: report.days.map((day) => ({
        ...day,
        count: realized.days.find((d) => d.date === day.date)?.count ?? 0,
      })),
      feeCoverage: realized.feeCoverage,
      feeTotal: realized.feeAmount,
      netPnl: realized.net,
      allocatedFees: realized.selected.filter((p) => journal.fees[p.id]?.kind === "Allocated").length,
      portionCount: realized.selected.length,
      completeCount: complete.length,
      reviewCoverage,
      timePoints,
      timeCount: known.length,
      excludedEntry: timeCandidates.length - known.length,
      balances,
      recent,
      pending:
        journal.unprocessedAccounts.some((id) => ids.includes(id)) ||
        journal.states.some(
          (s) => ids.includes(s.accountId) && s.status !== "Ready",
        ),
    };
  } catch (e) {
    if (e instanceof NotFoundError) throw e;
    throw new WorkspaceUnavailableError();
  }
}
export type DashboardData = Awaited<ReturnType<typeof dashboardData>>;
