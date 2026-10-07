import { describe, expect, it } from "vitest";
import { parseReport, exactDecimal } from "@/lib/imports/parser";
import { parseSourceTime, sourceTimezone } from "@/lib/imports/time";
import { classify } from "@/lib/imports/identity";
import { MAX_ROWS, counts, type ParsedFile } from "@/lib/imports/types";
import { inspectReportType } from "@/lib/imports/reports";
import { journalTimestamp, timezoneChoices } from "@/lib/timezones";
import { csv, order, performance } from "./fixtures/tradovate";
const parse = (
  type: "orders" | "performance",
  rows: Record<string, string>[],
) =>
  parseReport(
    Buffer.from(csv(type, rows)),
    "synthetic.csv",
    type,
    "Asia/Jerusalem",
  );
const stored = (file: ParsedFile) =>
  file.rows.map(({ identity, fingerprint, occurrence }) => ({
    identity,
    fingerprint,
    occurrence,
  }));
describe("verified Tradovate source formats", () => {
  it("preserves string IDs, raw quotes, exact decimals, symbols and canceled orders without inventing fills", () => {
    const result = parse("orders", [
      order(),
      order({
        orderId: "other",
        "Order ID": "other",
        Status: " Canceled",
        avgPrice: "",
        filledQty: "",
        "Fill Time": "",
        "Filled Qty": "",
        "Avg Fill Price": "",
        decimalFillAvg: "",
        "Notional Value": "",
      }),
    ]);
    expect(result.errors).toEqual([]);
    expect(result.total).toBe(2);
    expect(result.rows[0].raw.Text).toBe("Synthetic, quoted text");
    expect(result.rows[0].values).toMatchObject({
      orderId: "9007199254740993101",
      symbol: "MNQU6",
      timestamp: "2026-09-02T13:52:15.000Z",
      notionalValue: "80001",
    });
    expect(result.rows[1].values).toMatchObject({
      status: "Canceled",
      filledQuantity: null,
      averagePrice: null,
      fillTime: null,
    });
    expect(exactDecimal("99999999999999999999.12345678")).toBe(
      "99999999999999999999.12345678",
    );
  });
  it("keeps matched portions, short ordering and gross reported accounting P&L", () => {
    const result = parse("performance", [
      performance(),
      performance({ buyFillId: "another", pnl: "$1,234.50" }),
    ]);
    expect(result.errors).toEqual([]);
    expect(result.rows[0].values).toMatchObject({
      grossPnl: "-45",
      boughtAt: "2026-09-02T13:52:32.000Z",
      soldAt: "2026-09-02T13:52:15.000Z",
    });
    expect(result.rows[1].values).toMatchObject({ grossPnl: "1234.5" });
  });
  it("reports malformed source rows, headers, report mismatches, invalid grouping and invalid UTF-8", () => {
    const bad = parse("performance", [
      performance({ qty: "unknown" }),
      performance({ boughtTimestamp: "02/30/2026 10:00:00" }),
    ]);
    expect(bad.errors.map((e) => [e.row, e.column])).toEqual([
      [2, "qty"],
      [3, "boughtTimestamp"],
    ]);
    expect(counts([bad]).invalid).toBe(2);
    expect(() => exactDecimal("1,23.45")).toThrow();
    expect(() => exactDecimal("NaN")).toThrow();
    expect(
      parseReport(
        Buffer.from("symbol,pnl\nMNQ,$2"),
        "wrong.csv",
        "performance",
        "UTC",
      ).errors[0].column,
    ).toBe("headers");
    expect(
      parseReport(
        Buffer.from(csv("performance", [performance()])),
        "wrong.csv",
        "orders",
        "UTC",
      ).errors[0].message,
    ).toContain("main Performance uploader");
    expect(
      parseReport(new Uint8Array([255]), "bad.csv", "orders", "UTC").errors[0]
        .message,
    ).toContain("UTF-8");
  });
  it("enforces row limits and rejects internal empty rows instead of silently dropping data", () => {
    expect(
      parse(
        "performance",
        Array.from({ length: MAX_ROWS + 1 }, () => performance()),
      ).errors[0].message,
    ).toContain("Maximum");
    const trailing =
      csv(
        "performance",
        Array.from({ length: MAX_ROWS }, () => performance({ qty: "invalid" })),
      ) + "\r\n".repeat(20);
    const bounded = parseReport(
      Buffer.from(trailing),
      "trailing.csv",
      "performance",
      "UTC",
    );
    expect(bounded.total).toBe(MAX_ROWS);
    expect(bounded.errors.some((e) => e.message.startsWith("Maximum"))).toBe(
      false,
    );
    const text = csv("performance", [performance(), performance()]).replace(
      "\r\nMNQU6",
      "\r\n\r\nMNQU6",
    );
    expect(
      parseReport(Buffer.from(text), "empty.csv", "performance", "UTC").errors
        .length,
    ).toBeGreaterThan(0);
  });
  it("uses Jerusalem/New York DST, rejects gaps/repeated hours, and never uses machine timezone", () => {
    expect(
      parseSourceTime("10/25/2026 01:30:00+03:00", "America/New_York"),
    ).toBe("2026-10-24T22:30:00.000Z");
    expect(
      parseSourceTime("2026-09-02T16:52:15+03:00", "America/New_York"),
    ).toBe("2026-09-02T13:52:15.000Z");
    expect(() =>
      parseSourceTime("09/02/2026 16:52:15+25:00", "Asia/Jerusalem"),
    ).toThrow("offset");
    expect(sourceTimezone.safeParse("+03:00").success).toBe(false);
    expect(parseSourceTime("01/15/2026 12:00:00", "Asia/Jerusalem")).toBe(
      "2026-01-15T10:00:00.000Z",
    );
    expect(parseSourceTime("07/15/2026 12:00:00", "Asia/Jerusalem")).toBe(
      "2026-07-15T09:00:00.000Z",
    );
    expect(() =>
      parseSourceTime("03/27/2026 02:30:00", "Asia/Jerusalem"),
    ).toThrow("does not exist");
    expect(() =>
      parseSourceTime("10/25/2026 01:30:00", "Asia/Jerusalem"),
    ).toThrow("ambiguous");
    expect(parseSourceTime("07/15/2026 12:00:00", "America/New_York")).toBe(
      "2026-07-15T16:00:00.000Z",
    );
    expect(() =>
      parseSourceTime("03/08/2026 02:30:00", "America/New_York"),
    ).toThrow("does not exist");
  });
});
it("uses shared header detection and keeps journal presentation separate from source identity", () => {
  expect(inspectReportType(csv("orders", [order()]), "performance")).toBe(
    "This is a Tradovate Orders report. Select your Performance CSV, or use Advanced Orders import.",
  );
  expect(
    inspectReportType(csv("performance", [performance()]), "performance"),
  ).toBeNull();
  expect(inspectReportType("unknown,headers\n1,2", "performance")).toContain(
    "Expected a Tradovate Performance",
  );
  const result = parse("performance", [performance()]);
  const before = structuredClone(result.rows);
  expect(journalTimestamp("2026-09-02T13:52:15Z", "Asia/Jerusalem")).toContain(
    "16:52:15",
  );
  expect(
    journalTimestamp("2026-09-02T13:52:15Z", "America/New_York"),
  ).toContain("09:52:15");
  expect(result.rows).toEqual(before);
  expect(timezoneChoices().map((t) => t.id)).toEqual(
    expect.arrayContaining([
      "Asia/Jerusalem",
      "America/New_York",
      "America/Chicago",
      "America/Los_Angeles",
      "Europe/London",
      "Europe/Berlin",
      "UTC",
      "Asia/Dubai",
      "Asia/Kolkata",
      "Asia/Tokyo",
      "Australia/Sydney",
    ]),
  );
});
describe("record-level overlaps", () => {
  it("recognizes unchanged orders, overlaps and repeated order rows without merging changes", () => {
    const old = parse("orders", [order()]);
    const next = parse("orders", [
      order(),
      order(),
      order({ orderId: "new", "Order ID": "new" }),
    ]);
    classify(next, stored(old));
    expect(next.rows.map((r) => r.disposition)).toEqual([
      "duplicate",
      "duplicate",
      "new",
    ]);
    const changed = parse("orders", [order({ Text: "changed" })]);
    classify(changed, stored(old));
    expect(changed.rows[0].disposition).toBe("conflict");
    expect(changed.errors[0].message).toContain("precedence");
  });
  it("preserves visible identical portions with different fill IDs and legitimate multiplicity", () => {
    const old = parse("performance", [performance(), performance()]);
    classify(old, []);
    expect(old.rows.map((r) => r.occurrence)).toEqual([1, 2]);
    const overlap = parse("performance", [
      performance(),
      performance(),
      performance({ buyFillId: "new-buy" }),
    ]);
    classify(overlap, stored(old));
    expect(overlap.rows.map((r) => r.disposition)).toEqual([
      "duplicate",
      "duplicate",
      "new",
    ]);
    const ambiguous = parse("performance", [performance()]);
    classify(ambiguous, stored(old));
    expect(ambiguous.rows[0].disposition).toBe("conflict");
    const different = parse("performance", [
      performance({ qty: "1" }),
      performance(),
    ]);
    classify(different, stored(old));
    expect(different.rows.every((r) => r.disposition === "conflict")).toBe(
      true,
    );
  });
  it("flags changed source timezone instead of silently reusing old UTC instants", () => {
    const old = parse("orders", [order()]);
    const other = parseReport(
      Buffer.from(csv("orders", [order()])),
      "orders.csv",
      "orders",
      "America/New_York",
    );
    classify(other, stored(old));
    expect(other.rows[0].disposition).toBe("conflict");
  });
});
