import { describe, it, expect } from "vitest";
import {
  reportSchema,
  summarizeReports,
  summary,
  type ReportRecord,
} from "@/lib/reports/model";
import { viewSchema, filterDemo, summaryOf } from "@/lib/journal/view-model";
import {
  durationBucket,
  entryHour,
  localWeekday,
} from "@/lib/journal/analysis-filters";
import { emptyFields } from "@/lib/reviews/model";
import { D, type Portion, type PortionFee } from "@/lib/journal/processing";
const timezone = "Asia/Jerusalem";
const base = { start: "2026-10-01", end: "2026-10-03", accounts: "a" };
const structured = {
  status: "reviewed" as const,
  mistakes: ["chased", "overtraded"],
  emotions: { before: ["Confident"], during: [], after: ["Frustrated"] },
  adherence: null,
};
function record(
  id: string,
  gross: string,
  exit = "2026-10-01T08:00:00Z",
): ReportRecord {
  return {
    id,
    accountId: "a",
    account: "Fixture",
    symbol: "MNQZ6",
    root: "MNQ",
    direction: "long",
    status: "Complete demo trade",
    type: "trade",
    entry: "2026-10-01T07:00:00Z",
    exit,
    duration: "3600",
    quantity: null,
    entryPrice: null,
    exitPrice: null,
    gross,
    net: gross,
    fees: "0",
    estimated: false,
    feeKind: "Manual",
    fullGross: gross,
    partial: false,
    imported: null,
    reviewData: structured,
    reviewStatus: "reviewed",
    reviewFields: {
      ...emptyFields(),
      mistakes: structured.mistakes,
      emotions: { before: ["Confident"], during: [], after: ["Frustrated"] },
    },
  };
}
function portion(id: string, gross: string, exit: string): Portion {
  return {
    id,
    ownerId: "user",
    tradingAccountId: "a",
    symbol: "MNQZ6",
    quantity: "1",
    buyFillId: "shared",
    sellFillId: id,
    buyPrice: "100",
    sellPrice: "100",
    grossPnl: gross,
    boughtAt: "2026-09-30T20:00:00Z",
    soldAt: exit,
  };
}
const portions = [
  portion("p1", "-10", "2026-09-30T21:30:00Z"),
  portion("p2", "5", "2026-10-02T08:00:00Z"),
  portion("p3", "-3", "2026-10-03T08:00:00Z"),
];
function run(
  overrides: Record<string, unknown> = {},
  records: ReportRecord[] = [],
  fees: Record<string, PortionFee> = {},
) {
  return summarizeReports({
    q: reportSchema.parse({ ...base, ...overrides }),
    ids: ["a"],
    timezone,
    portions,
    fees,
    records,
    tags: [],
  });
}
describe("reports financial bases and exact drills", () => {
  it("attributes portions by local exit, resets cumulative and drawdown at zero, and uses active-day denominators", () => {
    const result = run();
    expect(result.days.map((d) => d.date)).toEqual([
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
    ]);
    expect(result.summary.total).toBe("-8");
    expect(result.summary.count).toBe(3);
    expect(result.days.map((d) => d.cumulative)).toEqual(["-10", "-5", "-8"]);
    expect(result.days.map((d) => d.drawdown)).toEqual(["-10", "-5", "-8"]);
    expect(result.summary.maxDrawdown).toBe("10");
    expect(result.summary.best).toBe("5");
    expect(result.summary.worst).toBe("-10");
    const params = new URL(result.days[0].href, "http://fixture").searchParams;
    expect(viewSchema.parse(Object.fromEntries(params)).dateBasis).toBe(
      "activity",
    );
    expect(params.get("reportFrom")).toContain("/reports?");
  });
  it("keeps unknown net unavailable and labels estimated fees without dropping records", () => {
    const missing = run({ basis: "net" });
    expect(missing.summary.count).toBe(3);
    expect(missing.summary.total).toBeNull();
    expect(missing.days.every((d) => d.cumulative === null)).toBe(true);
    expect(missing.summary.maxDrawdown).toBeNull();
    const fees = Object.fromEntries(
      portions.map((p) => [p.id, { amount: "1", kind: "Estimated" as const }]),
    );
    const known = run({ basis: "net" }, [], fees);
    expect(known.summary.total).toBe("-11");
    expect(known.summary.estimated).toBe(true);
  });
  it("handles all-positive and all-negative active-day extremes", () => {
    const all = portions.map((p) => ({ ...p, grossPnl: "5" }));
    const data = summarizeReports({
      q: reportSchema.parse(base),
      ids: ["a"],
      timezone,
      portions: all,
      fees: {},
      records: [],
      tags: [],
    });
    expect(data.summary.worst).toBe("5");
    expect(data.summary.maxDrawdown).toBe("0");
    const negative = summarizeReports({
      q: reportSchema.parse(base),
      ids: ["a"],
      timezone,
      portions: all.map((p) => ({ ...p, grossPnl: "-5" })),
      fees: {},
      records: [],
      tags: [],
    });
    expect(negative.summary.best).toBe("-5");
    expect(negative.summary.maxDrawdown).toBe("15");
  });
  it("uses all complete trades including breakevens and explicit profit-factor zero denominators", () => {
    const rows = [record("1", "10"), record("2", "-5"), record("3", "0")];
    const result = run({ analysis: "complete" }, rows);
    expect(result.summary.winRate).toBe("33.3");
    expect(result.summary.profitFactor).toBe("2.00");
    expect(result.summary.zeros).toBe(1);
    expect(summary(["1", "0"]).profitFactorNote).toBe("No losing trades");
    expect(summary(["0"]).profitFactorNote).toBe("No winning or losing trades");
    expect(summary([]).profitFactorNote).toBe("No complete trades");
    expect(summary(["0", null]).total).toBeNull();
    expect(JSON.stringify(result)).not.toMatch(/NaN|Infinity/);
  });
  it("counts overlapping tags once and keeps stage, missing fields and record-level comparisons separate", () => {
    const a = record("1", "10"),
      b = record("2", "-5");
    b.reviewData = {
      ...structured,
      mistakes: [],
      emotions: { before: [], during: [], after: [] },
    };
    b.reviewFields = {
      ...a.reviewFields!,
      mistakes: [],
      emotions: { before: [], during: [], after: [] },
    };
    const q = reportSchema.parse({
      ...base,
      mode: "demo",
      tab: "behavior",
      mistakes: "chased,overtraded",
    });
    const data = summarizeReports({
      q,
      ids: ["a"],
      timezone,
      portions: [],
      fees: {},
      records: [a, b],
      tags: [],
    });
    expect(data.summary.count).toBe(1);
    expect(data.summary.total).toBe("10");
    expect(data.groups.mistake.find((g) => g.key === "chased")?.count).toBe(1);
    for (const group of [
      ...data.groups.mistake,
      ...data.groups.plan,
      ...data.groups.emotion,
    ]) {
      const drill = viewSchema.parse(
        Object.fromEntries(new URL(group.href, "http://fixture").searchParams),
      );
      const rows = filterDemo([a, b], drill, timezone);
      expect(rows.length).toBe(group.count);
      expect(new D(summaryOf(rows, drill).gross).eq(group.total!)).toBe(true);
    }
    const all = run({ tab: "behavior" }, [a, b]);
    expect(all.groups.emotion.find((g) => g.key === "missing")?.count).toBe(1);
    expect(all.groups.plan.find((g) => g.key === "missing")?.count).toBe(2);
  });
  it("reconciles weekday, hour, duration, direction and contract drills", () => {
    const rows = [record("1", "10"), record("2", "-5", "2026-10-02T08:00:00Z")];
    for (const instrument of ["root", "contract"]) {
      const result = run(
        { tab: "breakdowns", analysis: "complete", instrument },
        rows,
      );
      for (const groups of Object.values(result.groups))
        for (const group of groups) {
          const q = viewSchema.parse(
            Object.fromEntries(
              new URL(group.href, "http://fixture").searchParams,
            ),
          );
          const selected = filterDemo(rows, q, timezone);
          expect(selected.length).toBe(group.count);
          expect(new D(summaryOf(selected, q).gross).eq(group.total!)).toBe(
            true,
          );
        }
    }
  });
  it("uses exact non-overlapping duration boundaries and saved timezone hours", () => {
    expect(
      ["0", "59.999", "60", "299.9", "300", "900", "3600", null, "-1"].map(
        durationBucket,
      ),
    ).toEqual([
      "under-1",
      "under-1",
      "1-5",
      "1-5",
      "5-15",
      "15-60",
      "60-plus",
      null,
      null,
    ]);
    expect(entryHour("2026-09-30T21:30:00Z", timezone)).toBe(0);
    expect(localWeekday("2026-09-30T21:30:00Z", timezone)).toBe(4);
    expect(entryHour(null, timezone)).toBeNull();
  });
});
