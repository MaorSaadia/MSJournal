import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { allocateFeeTotal, feeAmount, type FeePart } from "@/lib/fees/model";
import { realizedPerformance } from "@/lib/journal/calculations";
import { D, sum, type Portion } from "@/lib/journal/processing";
import { backupCatalog, validateBackup } from "@/lib/exports/catalog";
const parts: FeePart[] = [
  {
    id: "a",
    quantity: "1",
    grossPnl: "100.12345678",
    boughtAt: "2026-10-01T12:00:00Z",
    soldAt: "2026-10-02T12:00:00Z",
  },
  {
    id: "b",
    quantity: "2",
    grossPnl: "161.37654322",
    boughtAt: "2026-10-01T12:00:00Z",
    soldAt: "2026-10-03T12:00:00Z",
  },
];
describe("broker fee totals", () => {
  it("reconciles gross minus fees exactly and allocates decimal residuals once, with explicit zero supported", () => {
    const result = allocateFeeTotal("12.48", parts);
    expect(result).toMatchObject({ gross: "261.5", net: "249.02" });
    expect(result.allocations.map((a) => a.amount)).toEqual(["4.16", "8.32"]);
    expect(result.allocations.every((a) => a.kind === "Allocated")).toBe(true);
    expect(
      sum(
        allocateFeeTotal("0.00000001", parts).allocations.map((a) => a.amount),
      ),
    ).toBe("0.00000001");
    expect(allocateFeeTotal("0", parts).net).toBe("261.5");
    expect(() => allocateFeeTotal("1", [parts[0], parts[0]])).toThrow();
    expect(feeAmount.safeParse("-1").success).toBe(false);
    expect(feeAmount.safeParse("").success).toBe(false);
  });
  it("uses allocations for partial ranges while preserving full totals and unknown fee coverage", () => {
    const rows: Portion[] = parts.map((p) => ({
      ...p,
      ownerId: "u",
      tradingAccountId: "account",
      symbol: "MNQZ6",
      buyFillId: "shared",
      sellFillId: p.id,
      buyPrice: "100",
      sellPrice: "101",
    }));
    const fees = Object.fromEntries(
      allocateFeeTotal("12.48", parts).allocations.map((a) => [a.sourceId, a]),
    );
    const filter = {
      accounts: ["account"],
      start: "2026-10-01",
      end: "2026-10-31",
    };
    expect(realizedPerformance(rows, fees, filter, "UTC").net).toBe("249.02");
    const partial = realizedPerformance(
      rows,
      fees,
      { ...filter, end: "2026-10-02" },
      "UTC",
    );
    expect(new D(partial.net!).eq(new D(parts[0].grossPnl).minus("4.16"))).toBe(
      true,
    );
    expect(
      realizedPerformance(rows, { a: fees.a }, filter, "UTC").net,
    ).toBeNull();
  });
  it("includes fee total history and allocation relationships in private backups", () => {
    expect(backupCatalog.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        "fee_reconciliations",
        "fee_reconciliation_sources",
      ]),
    );
    const data = {
      auth_users: [{ id: "u" }],
      trading_accounts: [{ id: "a", owner_id: "u" }],
      tradovate_performance_records: [
        { id: "p", owner_id: "u", trading_account_id: "a" },
      ],
      fee_reconciliations: [
        {
          id: "f",
          owner_id: "u",
          trading_account_id: "a",
          import_batch_id: null,
        },
      ],
      fee_reconciliation_sources: [
        {
          reconciliation_id: "f",
          source_id: "p",
          owner_id: "u",
          trading_account_id: "a",
        },
      ],
    };
    expect(() => validateBackup(data, "u")).not.toThrow();
    expect(() =>
      validateBackup(
        {
          ...data,
          fee_reconciliation_sources: [
            { ...data.fee_reconciliation_sources[0], source_id: "foreign" },
          ],
        },
        "u",
      ),
    ).toThrow();
  });
});
