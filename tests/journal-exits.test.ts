import { describe, expect, it } from "vitest";
import { exitBreakdown } from "../lib/journal/exits";
import type { Portion } from "../lib/journal/processing";
const part = (id: string, overrides: Partial<Portion> = {}): Portion => ({
  id,
  ownerId: "owner",
  tradingAccountId: "account",
  symbol: "MNQ",
  buyFillId: "entry",
  sellFillId: id,
  quantity: "1",
  buyPrice: "100",
  sellPrice: "110",
  grossPnl: "20",
  boughtAt: "2026-10-20T10:00:00Z",
  soldAt: "2026-10-20T10:05:00Z",
  ...overrides,
});
describe("recorded exit breakdown", () => {
  it("combines matched portions of one exit fill once and preserves exact fees", () => {
    const a = part("a"),
      b = part("b", { sellFillId: "a", quantity: "2", grossPnl: "40" });
    const c = part("c", { soldAt: "2026-10-20T10:10:00Z", grossPnl: "-10" });
    const result = exitBreakdown([c, b, a], {
      a: { amount: "1.04", kind: "Allocated" },
      b: { amount: "2.08", kind: "Allocated" },
      c: { amount: "1.04", kind: "Allocated" },
    });
    expect(result.totalQuantity).toBe("4");
    expect(result.exits).toHaveLength(2);
    expect(result.exits[0]).toMatchObject({
      quantity: "3",
      gross: "60",
      fees: "3.12",
      net: "56.88",
      share: 75,
      sourceCount: 2,
    });
    expect(result.exits[1].net).toBe("-11.04");
  });
  it("uses the buy fill for a short exit and keeps unknown fees unknown", () => {
    const p = part("short", {
      boughtAt: "2026-10-20T10:10:00Z",
      sellPrice: "110",
      buyPrice: "100",
    });
    expect(exitBreakdown([p], {}).exits[0]).toMatchObject({
      side: "short",
      price: "100",
      fees: null,
      net: null,
    });
    expect(
      exitBreakdown([p], { short: { amount: "0", kind: "Manual" } }).exits[0]
        .net,
    ).toBe("20");
  });
  it("does not merge distinct same-time fills or invent an unknown-direction exit price", () => {
    const a = part("a"),
      b = part("b"),
      unknown = part("unknown", { soldAt: "2026-10-20T10:00:00Z" });
    const { exits } = exitBreakdown([a, b, unknown], {});
    expect(exits).toHaveLength(3);
    expect(exits[0]).toMatchObject({ side: "unknown", price: null });
  });
});
