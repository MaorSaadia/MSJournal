import { describe, it, expect } from "vitest";
import {
  viewSchema,
  filterDemo,
  rootSymbol,
  summaryOf,
  rangeBounds,
  type ViewRecord,
} from "@/lib/journal/view-model";
const row = (
  id: string,
  gross: string,
  fee: string | null = "0",
): ViewRecord => ({
  id,
  accountId: "a",
  account: "Synthetic",
  symbol: "MNQH6",
  root: "MNQ",
  direction: "long",
  status: "Matched portions",
  type: "trade",
  entry: "2026-03-08T12:00:00.000Z",
  exit: "2026-03-08T13:00:00.000Z",
  duration: "3600",
  quantity: "1",
  entryPrice: null,
  exitPrice: null,
  gross,
  fees: fee,
  net: fee === null ? null : gross,
  estimated: false,
  feeKind: "Manual",
  fullGross: gross,
  partial: false,
  imported: null,
});
describe("Trade View query semantics", () => {
  it("rejects unsupported sort, page size, invalid ranges and amounts", () => {
    for (const input of [
      { sort: "sql" },
      { size: 10000 },
      { page: 0 },
      { start: "2026-02-30" },
      { start: "2026-03-10", end: "2026-03-01" },
      { min: "2", max: "1" },
      { min: "NaN" },
      { ownerId: "someone" },
    ])
      expect(viewSchema.safeParse(input).success).toBe(false);
  });
  it("parses exact futures contracts without guessing other symbols", () => {
    expect(rootSymbol("MNQH6")).toBe("MNQ");
    expect(rootSymbol("ESH2026")).toBe("ES");
    expect(rootSymbol("arbitrary")).toBeNull();
  });
  it("combines filters and stable numeric sorts across full results", () => {
    const rows = Array.from({ length: 32 }, (_, i) =>
      row(String(i).padStart(2, "0"), String(i)),
    );
    const q = viewSchema.parse({
      search: "synthetic",
      root: "MNQ",
      direction: "long",
      outcome: "profit",
      min: "10",
      sort: "gross",
      order: "desc",
      size: 10,
    });
    const results = filterDemo(rows, q, "America/New_York");
    expect(results).toHaveLength(22);
    expect(results.slice(10, 20)[0].gross).toBe("21");
    expect(summaryOf(results, q).gross).toBe("451");
    expect(
      filterDemo(
        [row("b", "1"), row("a", "1")],
        { ...q, min: undefined },
        "UTC",
      ).map((r) => r.id),
    ).toEqual(["a", "b"]);
  });
  it("retains unknown fees and omits mixed or partial trade win rate", () => {
    const q = viewSchema.parse({ basis: "net" });
    expect(summaryOf([row("a", "3", null)], q).net).toBeNull();
    expect(summaryOf([row("a", "3", "0")], q).net).toBe("3");
    expect(
      summaryOf([{ ...row("a", "3"), type: "portion" }], q).winRate,
    ).toBeNull();
    expect(
      summaryOf([{ ...row("a", "3"), partial: true }], q).winRate,
    ).toBeNull();
    expect(
      summaryOf([{ ...row("a", "3"), estimated: true }], q).estimated,
    ).toBe(true);
  });
  it("uses display-zone civil boundaries across DST", () => {
    const bounds = rangeBounds(
      viewSchema.parse({ start: "2026-03-08", end: "2026-03-08" }),
      "America/New_York",
    );
    expect(Date.parse(bounds.end!) - Date.parse(bounds.start!)).toBe(
      23 * 3600000,
    );
  });
});
