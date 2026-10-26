import { describe, it, expect } from "vitest";
import {
  earlierImportedStart,
  automaticStartIsEnabled,
  IMPORT_START_ENABLED,
} from "@/lib/props/import-start";
const row = (account: string, boughtAt: string, soldAt: string) => ({
  tradingAccountId: account,
  boughtAt,
  soldAt,
});
describe("imported phase start", () => {
  it("uses earliest entry for long and short records, not the close or another account", () => {
    expect(
      earlierImportedStart(
        [
          row("a", "2026-10-02T12:00:00.000Z", "2026-10-02T12:05:00.000Z"),
          row("a", "2026-10-01T14:10:00.000Z", "2026-10-01T14:00:00.000Z"),
          row("other", "2020-01-01T00:00:00.000Z", "2020-01-01T01:00:00.000Z"),
        ],
        "a",
        "2026-10-26T00:00:00.000Z",
      ),
    ).toBe("2026-10-01T14:00:00.000Z");
  });
  it("does not move forward after deletion or duplicate reprocessing", () => {
    const rows = [
      row("a", "2026-10-01T14:00:00.000Z", "2026-10-01T14:10:00.000Z"),
    ];
    expect(
      earlierImportedStart(rows, "a", "2026-10-01T14:00:00.000Z"),
    ).toBeNull();
    expect(
      earlierImportedStart([], "a", "2026-10-01T14:00:00.000Z"),
    ).toBeNull();
    expect(
      earlierImportedStart(rows, "a", "2026-09-01T00:00:00.000Z"),
    ).toBeNull();
  });
  it("only opts in automatic phases and respects later explicit baseline/date choices", () => {
    expect(automaticStartIsEnabled([])).toBe(false);
    expect(automaticStartIsEnabled([IMPORT_START_ENABLED])).toBe(true);
    expect(
      automaticStartIsEnabled([
        IMPORT_START_ENABLED,
        "Start aligned to imported activity",
      ]),
    ).toBe(true);
    expect(
      automaticStartIsEnabled([
        IMPORT_START_ENABLED,
        "Evaluation start corrected",
      ]),
    ).toBe(false);
    expect(
      automaticStartIsEnabled([
        IMPORT_START_ENABLED,
        "Explicit baseline/history confirmation",
      ]),
    ).toBe(false);
  });
});
