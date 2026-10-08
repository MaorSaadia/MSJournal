import { describe, it, expect } from "vitest";
import {
  D,
  processPortions,
  portionExit,
  estimateFee,
  allocateManual,
  feeTotal,
  sum,
  type Portion,
} from "@/lib/journal/processing";
import { localDay, realizedPerformance } from "@/lib/journal/calculations";
const p = (id: string, override: Partial<Portion> = {}): Portion => ({
  id,
  ownerId: "user-a",
  tradingAccountId: "account-a",
  symbol: "MNQU6",
  buyFillId: `buy-${id}`,
  sellFillId: `sell-${id}`,
  quantity: "1",
  buyPrice: "20000",
  sellPrice: "20001",
  grossPnl: "2",
  boughtAt: "2026-09-01T10:00:00Z",
  soldAt: "2026-09-01T10:01:00Z",
  ...override,
});
describe("Performance-only matching evidence and realized money", () => {
  it("uses buy/sell chronology for long and short, with no guessed equal-timestamp direction", () => {
    const rows = [
      p("long"),
      p("short", { boughtAt: "2026-09-01T10:02:00Z", grossPnl: "-2" }),
      p("equal", { soldAt: "2026-09-01T10:00:00Z", grossPnl: "0" }),
    ];
    const groups = processPortions(rows);
    expect(groups.find((g) => g.sourceIds.includes("long"))?.direction).toBe(
      "long",
    );
    expect(groups.find((g) => g.sourceIds.includes("short"))?.direction).toBe(
      "short",
    );
    expect(groups.find((g) => g.sourceIds.includes("equal"))).toMatchObject({
      direction: "unknown",
      status: "Needs review",
      entryAt: null,
    });
    expect(portionExit(rows[1])).toBe("2026-09-01T10:02:00.000Z");
    expect(sum(groups.map((g) => g.grossPnl))).toBe("0");
  });
  it("connects split exits and scale-in only through shared fills, preserving matched quantities and weighted prices", () => {
    const rows = [
      p("a", { buyFillId: "entry-1", quantity: "2", grossPnl: "4" }),
      p("b", {
        buyFillId: "entry-1",
        sellFillId: "shared-exit",
        soldAt: "2026-09-01T10:03:00Z",
        sellPrice: "20002",
        grossPnl: "4",
      }),
      p("c", {
        buyFillId: "entry-2",
        sellFillId: "shared-exit",
        buyPrice: "20001",
        boughtAt: "2026-09-01T10:02:00Z",
        soldAt: "2026-09-01T10:03:00Z",
        sellPrice: "20002",
        grossPnl: "2",
      }),
    ];
    const [g] = processPortions(rows);
    expect(g.sourceIds).toEqual(["a", "b", "c"]);
    expect(g.closedQuantity).toBe("4");
    expect(new D(g.entryPrice!)).toEqual(new D("20000.25"));
    expect(new D(g.exitPrice!)).toEqual(new D("20001.5"));
    expect(g.grossPnl).toBe("10");
    expect(g.status).toBe("Matched portions");
    expect(g.explanation).toContain(
      "do not prove a complete flat-to-flat position",
    );
    expect(processPortions([...rows].reverse())).toEqual([g]);
  });
  it("never groups by proximity or month and flags inconsistent fill metadata; scopes exact contracts, accounts and users", () => {
    const base = p("a", { buyFillId: "split" }),
      boundary = p("b", { buyFillId: "split", soldAt: "2026-10-01T00:01:00Z" });
    expect(processPortions([base, boundary])).toHaveLength(1);
    const separate = [
      p("near"),
      p("contract", { symbol: "MESU6", buyFillId: "split" }),
      p("account", { tradingAccountId: "other", buyFillId: "split" }),
      p("user", { ownerId: "other", buyFillId: "split" }),
    ];
    expect(processPortions([base, ...separate])).toHaveLength(5);
    const conflict = processPortions([
      base,
      p("conflict", { buyFillId: "split", buyPrice: "20003" }),
    ]);
    expect(conflict[0].status).toBe("Needs review");
    expect(conflict[0].grossPnl).toBe("4");
    // Even a balanced represented graph can omit an open portion at the export boundary.
    expect(processPortions([base])[0].status).not.toMatch(
      /complete|closed trade/i,
    );
  });
  it("preserves authoritative decimal gross and distinguishes unknown, estimated, manual zero and incomplete fee coverage", () => {
    expect(estimateFee("3", "0.62")).toMatchObject({
      amount: "3.72",
      kind: "Estimated",
    });
    expect(estimateFee("3", null).amount).toBeNull();
    const rows = [
      p("a", { grossPnl: "0.10000001" }),
      p("b", { grossPnl: "0.2" }),
      p("c", { grossPnl: "-0.3" }),
    ];
    expect(sum(processPortions(rows).map((g) => g.grossPnl))).toBe(
      "0.00000001",
    );
    const manual = allocateManual("0.00000001", rows);
    expect(sum(manual.map((f) => f.amount))).toBe("0.00000001");
    expect(manual.every((f) => new D(f.amount).gte(0))).toBe(true);
    expect(feeTotal([{ amount: "0", kind: "Manual" }])).toMatchObject({
      amount: "0",
      kind: "Manual",
    });
    expect(
      feeTotal([
        { amount: "0", kind: "Manual" },
        { amount: null, kind: "Unknown" },
      ]).amount,
    ).toBeNull();
  });
  it("allocates partial exits to their own DST-aware local days, reconciling selection and cumulative totals", () => {
    const rows = [
      p("a", { soldAt: "2026-09-01T21:30:00Z", grossPnl: "10" }),
      p("b", {
        buyFillId: "buy-a",
        soldAt: "2026-09-02T21:30:00Z",
        grossPnl: "-3",
      }),
    ];
    expect(processPortions(rows)).toHaveLength(1);
    const filter = {
      accounts: ["account-a"],
      start: "2026-09-01",
      end: "2026-09-03",
    };
    const israel = realizedPerformance(rows, {}, filter, "Asia/Jerusalem"),
      ny = realizedPerformance(rows, {}, filter, "America/New_York");
    expect(israel.days.map((d) => d.date)).toEqual([
      "2026-09-02",
      "2026-09-03",
    ]);
    expect(ny.days.map((d) => d.date)).toEqual(["2026-09-01", "2026-09-02"]);
    expect(sum(israel.days.map((d) => d.gross))).toBe(israel.gross);
    expect(israel.days.at(-1)?.cumulative).toBe("7");
    expect(israel.net).toBeNull();
    expect(
      realizedPerformance(
        rows,
        {},
        { ...filter, start: "2026-09-02", end: "2026-09-02" },
        "Asia/Jerusalem",
      ).gross,
    ).toBe("10");
    expect(localDay("2026-11-01T03:30:00Z", "America/New_York")).toBe(
      "2026-10-31",
    );
    expect(localDay("2026-11-01T06:30:00Z", "America/New_York")).toBe(
      "2026-11-01",
    );
  });
});
