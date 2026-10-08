import { describe, it, expect } from "vitest";
import {
  calendarWeeks,
  dayBounds,
  monthBounds,
  aggregateCalendar,
  monthEnd,
} from "@/lib/calendar/model";
import {
  D,
  sum,
  allocateManual,
  type Portion,
  type PortionFee,
} from "@/lib/journal/processing";
import { realizedPerformance } from "@/lib/journal/calculations";
const p = (
  id: string,
  date: string,
  gross: string,
  quantity = "1",
): Portion => ({
  id,
  ownerId: "a",
  tradingAccountId: "account-a",
  symbol: "MNQU6",
  buyFillId: "entry",
  sellFillId: id,
  quantity,
  buyPrice: "20000",
  sellPrice: "20001",
  grossPnl: gross,
  boughtAt: "2026-09-01T10:00:00Z",
  soldAt: date,
});
const filter = {
  accounts: ["account-a"],
  start: "2026-09-01",
  end: "2026-09-30",
};
describe("shared calendar realized activity", () => {
  it("supports leap February, six rows, week starts and adjacent-month exclusion", () => {
    expect(monthEnd("2024-02")).toBe("2024-02-29");
    expect(monthEnd("2025-02")).toBe("2025-02-28");
    expect(calendarWeeks("2026-08", 0)).toHaveLength(6);
    expect(
      new Date(calendarWeeks("2026-08", 1)[0][0] + "T12:00:00Z").getUTCDay(),
    ).toBe(1);
    const grid = calendarWeeks("2026-08", 0).flat();
    expect(new Set(grid).size).toBe(42);
    expect(grid.filter((d) => d.startsWith("2026-08"))).toHaveLength(31);
  });
  it("reconciles daily/week/month totals with Day 4, keeping partial exits on two dates and allocating fees once", () => {
    const rows = [
      p("a", "2026-09-02T21:30:00Z", "40", "2"),
      p("b", "2026-09-03T21:30:00Z", "-5"),
      p("edge", "2026-10-01T12:00:00Z", "99"),
    ];
    const allocated = allocateManual("1", rows.slice(0, 2));
    const fees: Record<string, PortionFee> = Object.fromEntries(
      allocated.map(({ sourceId, amount }) => [
        sourceId,
        { amount, kind: "Manual" },
      ]),
    );
    const result = aggregateCalendar(
      rows,
      fees,
      filter,
      "Asia/Jerusalem",
      "2026-09",
      0,
      "net",
    );
    expect(result.days.map((d) => d.date)).toEqual([
      "2026-09-03",
      "2026-09-04",
    ]);
    expect(sum(result.days.map((d) => d.feeAmount!))).toBe("1");
    expect(result.summary.total).toBe("34");
    expect(sum(result.weeks.map((w) => w.summary.total!))).toBe(
      result.summary.total,
    );
    expect(result.summary.total).toBe(
      realizedPerformance(rows, fees, filter, "Asia/Jerusalem").net,
    );
    expect(result.summary.count).toBe(2);
  });
  it("changes only display grouping near midnight and includes each exit once across DST", () => {
    const rows = [p("a", "2026-09-02T21:30:00Z", "1")];
    expect(
      aggregateCalendar(
        rows,
        {},
        filter,
        "Asia/Jerusalem",
        "2026-09",
        0,
        "gross",
      ).days[0].date,
    ).toBe("2026-09-03");
    expect(
      aggregateCalendar(
        rows,
        {},
        filter,
        "America/New_York",
        "2026-09",
        0,
        "gross",
      ).days[0].date,
    ).toBe("2026-09-02");
    for (const [day, hours] of [
      ["2026-03-08", 23],
      ["2026-11-01", 25],
    ] as const) {
      const bounds = dayBounds(day, "America/New_York");
      expect(
        (Date.parse(bounds.end) - Date.parse(bounds.start)) / 3600000,
      ).toBe(hours);
      expect(bounds.end).toBe(
        dayBounds(
          new Date(Date.parse(day + "T12:00:00Z") + 86400000)
            .toISOString()
            .slice(0, 10),
          "America/New_York",
        ).start,
      );
    }
    const autumn = [
      p("early", "2026-11-01T05:30:00Z", "1"),
      p("late", "2026-11-01T06:30:00Z", "2"),
    ];
    const result = aggregateCalendar(
      autumn,
      {},
      { ...filter, start: "2026-11-01", end: "2026-11-30" },
      "America/New_York",
      "2026-11",
      0,
      "gross",
    );
    expect(result.days[0]).toMatchObject({ gross: "3", count: 2 });
    expect(monthBounds("2026-03", "America/New_York").end).toBe(
      dayBounds("2026-04-01", "America/New_York").start,
    );
  });
  it("keeps unknown fees unknown and refuses incomplete net; supports explicit zero and estimated fees", () => {
    const rows = [
      p("a", "2026-09-02T12:00:00Z", "2"),
      p("b", "2026-09-03T12:00:00Z", "0"),
    ];
    const result = aggregateCalendar(
      rows,
      { a: { amount: "0", kind: "Manual" } },
      filter,
      "UTC",
      "2026-09",
      0,
      "net",
    );
    expect(result.basis).toBe("gross");
    expect(result.netAvailable).toBe(false);
    expect(result.days[1].feeAmount).toBeNull();
    expect(result.days[1].net).toBeNull();
    const known = aggregateCalendar(
      rows,
      {
        a: { amount: "0", kind: "Manual" },
        b: { amount: "0.5", kind: "Estimated" },
      },
      filter,
      "UTC",
      "2026-09",
      0,
      "net",
    );
    expect(known.estimated).toBe(true);
    expect(known.summary.total).toBe("1.5");
  });
  it("distinguishes zero activity from an empty day and ranks only active dates", () => {
    const result = aggregateCalendar(
      [p("a", "2026-09-02T12:00:00Z", "0")],
      {},
      filter,
      "UTC",
      "2026-09",
      0,
      "gross",
    );
    expect(result.summary).toMatchObject({
      activeDays: 1,
      zero: 1,
      positive: 0,
      negative: 0,
      count: 1,
      total: "0",
    });
    expect(result.days.find((d) => d.date === "2026-09-03")).toBeUndefined();
    expect(result.summary.best?.date).toBe("2026-09-02");
    const empty = aggregateCalendar(
      [],
      {},
      filter,
      "UTC",
      "2026-09",
      0,
      "gross",
    );
    expect(empty.summary.best).toBeNull();
    expect(empty.summary.worst).toBeNull();
    expect(empty.summary.count).toBe(0);
  });
  it("filters accounts, direction, contract and dates before every summary", () => {
    const rows = [
      p("a", "2026-09-02T12:00:00Z", "1"),
      {
        ...p("foreign", "2026-09-02T12:00:00Z", "99"),
        tradingAccountId: "account-b",
      },
      p("late", "2026-09-03T12:00:00Z", "-5"),
    ];
    const result = aggregateCalendar(
      rows,
      {},
      { ...filter, end: "2026-09-02", symbol: "MNQU6", direction: "long" },
      "UTC",
      "2026-09",
      1,
      "gross",
    );
    expect(new D(result.summary.total!).eq(1)).toBe(true);
    expect(result.summary.count).toBe(1);
    expect(sum(result.weeks.map((w) => w.summary.total!))).toBe("1");
  });
});
