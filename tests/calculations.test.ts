import { describe, expect, it } from "vitest";
import { accounts, trades, cashMovements, initialFilters } from "@/data/demo";
import {
  balanceSeries,
  cumulativeSeries,
  dailyResults,
  drawdownSeries,
  filterTrades,
  metrics,
  netCents,
} from "@/lib/calculations";
import { dayKey, localTimestamp, entryMinutes } from "@/lib/dates";
import type { Trade } from "@/lib/types";
const makeTrade = (net: number, hour = 17): Trade => ({
  id: `t-${hour}`,
  accountId: accounts[0].id,
  symbol: "ES",
  direction: "long",
  entryAt: localTimestamp("2026-03-02", hour - 1, 0),
  closeAt: localTimestamp("2026-03-02", hour, 0),
  grossCents: net + 320,
  commissionCents: 240,
  feesCents: 80,
});
describe("shared financial calculations", () => {
  it("subtracts fees, includes flat trades in win rate, and uses net outcomes", () => {
    const sample = [makeTrade(20000), makeTrade(-10000), makeTrade(0)];
    expect(netCents(sample[0])).toBe(20000);
    expect(metrics(sample)).toMatchObject({
      netCents: 10000,
      profitFactor: 2,
      winLossRatio: 2,
      breakeven: 1,
      dayWinRate: 100,
    });
    expect(metrics(sample).winRate).toBeCloseTo(100 / 3);
  });
  it("handles empty, all-flat, and no-loss results without nonfinite ratios", () => {
    expect(metrics([])).toMatchObject({
      winRate: null,
      dayWinRate: null,
      profitFactor: null,
      winLossRatio: null,
    });
    expect(metrics([makeTrade(0)])).toMatchObject({
      winRate: 0,
      dayWinRate: 0,
      profitFactor: null,
      winLossRatio: null,
    });
    expect(metrics([makeTrade(500)])).toMatchObject({
      profitFactor: null,
      winLossRatio: null,
    });
    expect(metrics([makeTrade(-500)])).toMatchObject({
      profitFactor: 0,
      winLossRatio: null,
    });
  });
  it("starts cumulative P&L at zero before a first-day loss", () => {
    expect(
      cumulativeSeries([makeTrade(-10000)], "2026-03-02", "2026-03-03").map(
        (p) => p.value,
      ),
    ).toEqual([0, -100, -100]);
  });
  it("measures closed-trade drawdown from the running peak including initial zero", () => {
    const sample = [
      makeTrade(-10000, 16),
      makeTrade(30000, 17),
      makeTrade(-15000, 18),
      makeTrade(-10000, 19),
    ];
    expect(drawdownSeries(sample, "2026-03-02").map((p) => p.value)).toEqual([
      0, -100, 0, -150, -250,
    ]);
  });
  it("preserves prior balance, applies cash without changing P&L, and ignores trade filters", () => {
    const f = { ...initialFilters, accounts: [accounts[0].id] };
    const history = balanceSeries(accounts, trades, cashMovements, f);
    const priorNet = trades
      .filter(
        (t) => t.accountId === accounts[0].id && dayKey(t.closeAt) < f.start,
      )
      .reduce((s, t) => s + netCents(t), 0);
    const priorCash = cashMovements
      .filter((c) => c.accountId === accounts[0].id && c.date < f.start)
      .reduce((s, c) => s + c.amountCents, 0);
    expect(history[0].value).toBe(
      (accounts[0].startingBalanceCents + priorNet + priorCash) / 100,
    );
    expect(
      balanceSeries(accounts, trades, cashMovements, {
        ...f,
        symbol: "NQ",
        direction: "short",
      }),
    ).toEqual(history);
    const funded = {
      ...initialFilters,
      accounts: ["demo-tpt"],
      start: "2026-03-18",
      end: "2026-03-18",
    };
    const day = balanceSeries(accounts, trades, cashMovements, funded);
    const result = metrics(filterTrades(trades, funded)).netCents;
    expect(Math.round((day[1].value - day[0].value) * 100)).toBe(
      result - 85000,
    );
    expect(
      balanceSeries(accounts, trades, cashMovements, { ...f, accounts: [] }),
    ).toEqual([]);
    expect(
      balanceSeries(accounts, trades, cashMovements, {
        ...initialFilters,
        start: "2026-01-01",
      })[0].value,
    ).toBe(200000);
  });
  it("reconciles filtered metrics with daily, cumulative, and calendar results", () => {
    const selected = filterTrades(trades, {
      ...initialFilters,
      symbol: "ES",
      direction: "long",
    });
    const expected = metrics(selected).netCents;
    expect(dailyResults(selected).reduce((s, d) => s + d.netCents, 0)).toBe(
      expected,
    );
    expect(
      cumulativeSeries(selected, initialFilters.start, initialFilters.end).at(
        -1,
      )!.value * 100,
    ).toBe(expected);
    expect(
      filterTrades(trades, {
        ...initialFilters,
        start: "2026-10-01",
        end: "2026-10-31",
      }),
    ).toEqual([]);
  });
});
describe("IANA timezone handling", () => {
  it("uses Jerusalem close dates rather than UTC dates", () => {
    const sample = { ...makeTrade(100), closeAt: "2026-03-29T22:15:00Z" };
    expect(dayKey(sample.closeAt)).toBe("2026-03-30");
    expect(dailyResults([sample])[0].date).toBe("2026-03-30");
  });
  it("resolves winter and summer offsets in Jerusalem and New York", () => {
    expect(localTimestamp("2026-03-30", 12, 0)).toBe("2026-03-30T09:00:00.000Z");
    expect(new Date(localTimestamp("2026-01-15", 12, 0)).toISOString()).toBe(
      "2026-01-15T10:00:00.000Z",
    );
    expect(new Date(localTimestamp("2026-03-30", 12, 0)).toISOString()).toBe(
      "2026-03-30T09:00:00.000Z",
    );
    expect(
      new Date(
        localTimestamp("2026-01-15", 12, 0, "America/New_York"),
      ).toISOString(),
    ).toBe("2026-01-15T17:00:00.000Z");
    expect(
      new Date(
        localTimestamp("2026-03-30", 12, 0, "America/New_York"),
      ).toISOString(),
    ).toBe("2026-03-30T16:00:00.000Z");
    expect(entryMinutes("2026-03-30T16:00:00Z", "America/New_York")).toBe(
      12 * 60,
    );
  });
});
