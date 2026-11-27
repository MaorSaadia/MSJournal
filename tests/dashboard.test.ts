import { describe, it, expect } from "vitest";
import {
  balanceEstimates,
  type BalanceAccount,
  type CashAdjustment,
} from "@/lib/balances/model";
import { summary, isCompleteTrade, tradeOutcome, journalRecordKind } from "@/lib/journal/statistics";
import { portionEntry, processPortions, type Portion } from "@/lib/journal/processing";
import { dashboardSchema } from "@/lib/dashboard/model";
import { calendarPerformance } from "@/lib/calendar/model";
import { reportSchema, summarizeReports, type ReportRecord } from "@/lib/reports/model";
import { preferencesSchema } from "@/lib/accounts/validation";
const account: BalanceAccount = {
  id: "a",
  displayName: "Synthetic",
  currency: "USD",
  openingBalance: "100",
  openingBalanceDate: "2026-10-01",
  reportingTimezone: "Asia/Jerusalem",
};
function portion(id: string, pnl: string, exit: string): Portion {
  return {
    id,
    ownerId: "u",
    tradingAccountId: "a",
    symbol: "MNQZ6",
    quantity: "1",
    buyFillId: "b" + id,
    sellFillId: "s" + id,
    buyPrice: "100",
    sellPrice: "101",
    grossPnl: pnl,
    boughtAt: "2026-09-01T00:00:00Z",
    soldAt: exit,
  };
}
const cash = (id: string, amount: string, time: string): CashAdjustment => ({
  id,
  tradingAccountId: "a",
  effectiveAt: time,
  amount,
  kind: Number(amount) > 0 ? "deposit" : "withdrawal",
  explanation: "Synthetic",
});
describe("Configurable breakeven range", () => {
  it("classifies both exact edges and keeps monetary totals and unknown fees intact", () => {
    const values = ["5", "-5.00", "5.00000001", "-5.00000001", "0", "1.25"];
    expect(values.map((value) => tradeOutcome(value, "5"))).toEqual(["zero", "zero", "profit", "loss", "zero", "zero"]);
    expect(tradeOutcome(null, "5")).toBeNull();
    expect(summary(values, false, true, "5")).toMatchObject({
      wins: 1, losses: 1, zeros: 4, winRate: "16.7", total: "1.25",
    });
    expect(summary([...values, null], false, true, "5")).toMatchObject({ total: null, zeros: null });
    expect(summary(values)).toMatchObject({ wins: 3, losses: 2, zeros: 1, total: "1.25" });
  });
  it("automatically classifies linked exits together on the latest exit day", () => {
    const rows = [portion("one", "5", "2026-10-01T14:00:00Z"), portion("two", "40", "2026-10-02T14:01:00Z")];
    rows[1].buyFillId = rows[0].buyFillId;
    const [group] = processPortions(rows);
    expect(group.sourceIds).toEqual(["one", "two"]);
    expect(group.grossPnl).toBe("45");
    const fees = { one: { amount: "0", kind: "Manual" as const }, two: { amount: "41", kind: "Manual" as const } };
    const range = { start: "2026-10-01", end: "2026-10-02" };
    const calendar = calendarPerformance(rows, fees, { ...range, accounts: ["a"] }, "UTC");
    expect(calendar.days.map((day) => [day.net, day.netWins])).toEqual([["5", 1], ["-1", 0]]);
    const result: Omit<ReportRecord, "type"> = {
      id: "position", accountId: "a", account: "Account", symbol: "MNQZ6", root: "MNQ", direction: "long",
      status: group.status, entry: group.entryAt, exit: group.exitAt, duration: null,
      quantity: group.closedQuantity, entryPrice: group.entryPrice, exitPrice: group.exitPrice,
      gross: group.grossPnl, fees: "41", net: "4",
      estimated: false, feeKind: "Manual", fullGross: group.grossPnl, partial: false, imported: null,
      reviewData: { status: "unreviewed", mistakes: [], emotions: { before: [], during: [], after: [] }, adherence: null },
    };
    const reports = (analysis: "complete" | "portions" | "activity", basis: "gross" | "net", status = group.status) => summarizeReports({
      q: reportSchema.parse({ ...range, analysis, basis }), ids: ["a"], timezone: "UTC", portions: rows, fees,
      records: [{ ...result, status, type: journalRecordKind(status) }], tags: [], breakevenThreshold: "5",
    });
    expect(reports("portions", "net").summary).toMatchObject({ wins: 1, losses: 1, zeros: 0, total: "4" });
    expect(reports("complete", "gross").summary).toMatchObject({ wins: 1, zeros: 0, total: "45" });
    expect(reports("complete", "net").summary).toMatchObject({ wins: 0, zeros: 1, total: "4" });
    expect(reports("complete", "net").days.map((day) => day.date)).toEqual(["2026-10-02"]);
    expect(reports("activity", "net").summary).toMatchObject({ wins: 0, losses: 0, zeros: 2, total: "4", best: "5", worst: "-1" });
    expect(reports("complete", "net", "Needs review").summary.count).toBe(0);
  });
  it("accepts cents and zero, and rejects negative or ambiguous preference input", () => {
    const input = { displayName: "Trader", displayTimezone: "UTC", currency: "USD" };
    for (const breakevenThreshold of ["0", "5", "0.05"])
      expect(preferencesSchema.safeParse({ ...input, breakevenThreshold }).success).toBe(true);
    for (const breakevenThreshold of ["-1", "", "5.555", "5e2", "NaN"])
      expect(preferencesSchema.safeParse({ ...input, breakevenThreshold }).success).toBe(false);
    expect(preferencesSchema.safeParse(input).success).toBe(true);
  });
});
describe("Day 8 dashboard statistics and balance boundaries", () => {
  it("counts breakeven portions, uses exact decimals and keeps empty denominators unknown", () => {
    expect(summary(["0.1", "0.2", "-0.1", "0"])).toMatchObject({
      count: 4,
      total: "0.2",
      winRate: "50.0",
      profitFactor: "3.00",
      averageWin: "0.15",
      averageLoss: "-0.1",
      averageRatio: "1.50",
    });
    expect(summary([])).toMatchObject({
      total: "0",
      winRate: null,
      profitFactor: null,
      averageWin: null,
      averageLoss: null,
    });
    expect(summary(["1"])).toMatchObject({
      profitFactor: null,
      profitFactorNote: "No losing trades",
      averageLoss: null,
    });
    expect(summary(["-1"])).toMatchObject({
      winRate: "0.0",
      profitFactor: "0.00",
      averageWin: null,
    });
    expect(summary(["1", null])).toMatchObject({
      count: 2,
      covered: 1,
      total: null,
      winRate: null,
    });
    expect(isCompleteTrade({ type: "portion" })).toBe(false);
    expect(isCompleteTrade({ type: "trade", partial: true })).toBe(false);
    expect(isCompleteTrade({ type: "trade", partial: false })).toBe(true);
  });
  it("anchors baseline in account timezone, carries prior activity, separates cash and never counts pre-baseline activity", () => {
    const portions = [
      portion("before", "999", "2026-09-30T20:59:59Z"),
      portion("boundary", "-10", "2026-09-30T21:00:00Z"),
      portion("later", "5", "2026-10-02T08:00:00Z"),
      portion("after", "999", "2026-10-03T21:00:00Z"),
    ];
    const movements = [
      cash("old", "999", "2026-09-30T20:59:59Z"),
      cash("deposit", "20", "2026-10-01T09:00:00Z"),
      cash("withdraw", "-3", "2026-10-02T09:00:00Z"),
    ];
    const fees = {
      boundary: { amount: "1", kind: "Manual" as const },
      later: { amount: "2", kind: "Estimated" as const },
    };
    const result = balanceEstimates(
      [account],
      portions,
      fees,
      movements,
      "2026-10-02",
      "2026-10-03",
      "Asia/Jerusalem",
    );
    expect(result.accounts[0].baselineInstant).toBe("2026-09-30T21:00:00.000Z");
    expect(result.combined).toMatchObject({
      entering: "109",
      ending: "109",
      missingFees: 0,
      estimated: true,
    });
    expect(result.combined?.points.map((p) => p.value)).toEqual(["109", "109"]);
  });
  it("excludes missing, incompatible and late baselines from aggregation and labels unknown fees", () => {
    const result = balanceEstimates(
      [
        account,
        { ...account, id: "missing", openingBalance: null },
        { ...account, id: "eur", currency: "EUR" },
        { ...account, id: "late", openingBalanceDate: "2026-10-03" },
      ],
      [portion("p", "5", "2026-10-02T08:00:00Z")],
      {},
      [],
      "2026-10-01",
      "2026-10-03",
      "Asia/Jerusalem",
    );
    expect(result.covered).toBe(1);
    expect(result.selected).toBe(4);
    expect(result.combined).toMatchObject({
      entering: "100",
      ending: "105",
      missingFees: 1,
    });
    expect(result.accounts.find((a) => a.id === "late")?.entering).toBeNull();
  });
  it("uses the earlier sell for shorts and rejects malformed dashboard ranges", () => {
    const range = { start: "2026-10-01", end: "2026-10-15" };
    expect(dashboardSchema.parse(range).basis).toBe("net");
    expect(dashboardSchema.parse({ ...range, basis: "gross" }).basis).toBe("gross");
    const p = portion("short", "5", "2026-10-02T08:00:00Z");
    p.boughtAt = "2026-10-02T08:05:00Z";
    expect(portionEntry(p)).toBe("2026-10-02T08:00:00.000Z");
    expect(
      dashboardSchema.safeParse({ start: "2026-02-30", end: "2026-10-01" })
        .success,
    ).toBe(false);
    expect(
      dashboardSchema.safeParse({ start: "2026-10-03", end: "2026-10-01" })
        .success,
    ).toBe(false);
  });
});
