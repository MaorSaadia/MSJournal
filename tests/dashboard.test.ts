import { describe, it, expect } from "vitest";
import {
  balanceEstimates,
  type BalanceAccount,
  type CashAdjustment,
} from "@/lib/balances/model";
import { summary, isCompleteTrade } from "@/lib/journal/statistics";
import { portionEntry, type Portion } from "@/lib/journal/processing";
import { dashboardSchema } from "@/lib/dashboard/model";
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
