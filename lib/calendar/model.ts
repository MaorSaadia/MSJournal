import { TZDate } from "@date-fns/tz";
import { z } from "zod";
import {
  realizedPerformance,
  localDay,
  type JournalFilter,
} from "@/lib/journal/calculations";
import {
  D,
  sum,
  type Portion,
  type PortionFee,
} from "@/lib/journal/processing";

export const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .refine(
    (v) => Number(v.slice(0, 4)) >= 1900 && Number(v.slice(0, 4)) <= 9998,
  );
export const daySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T12:00:00Z");
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
  });
// Civil arithmetic is deliberately UTC; actual query boundaries use the saved IANA zone.
export function shiftDay(day: string, step: number) {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + step);
  return d.toISOString().slice(0, 10);
}
export function shiftMonth(month: string, step: number) {
  const d = new Date(month + "-01T12:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + step);
  return d.toISOString().slice(0, 7);
}
export function monthEnd(month: string) {
  return shiftDay(shiftMonth(month, 1) + "-01", -1);
}
export function calendarWeeks(month: string, start: 0 | 1) {
  const first = month + "-01",
    last = monthEnd(month);
  const offset = (new Date(first + "T12:00:00Z").getUTCDay() - start + 7) % 7;
  const weeks: string[][] = [];
  for (let d = shiftDay(first, -offset); d <= last; d = shiftDay(d, 7))
    weeks.push(Array.from({ length: 7 }, (_, i) => shiftDay(d, i)));
  return weeks;
}
export function dayBounds(day: string, timezone: string) {
  const midnight = (date: string) => {
    const [y, m, d] = date.split("-").map(Number);
    return new TZDate(y, m - 1, d, 0, 0, 0, timezone).toISOString();
  };
  return { start: midnight(day), end: midnight(shiftDay(day, 1)) };
}
export function monthBounds(month: string, timezone: string) {
  return {
    start: dayBounds(month + "-01", timezone).start,
    end: dayBounds(shiftMonth(month, 1) + "-01", timezone).start,
  };
}
export function todayIn(timezone: string) {
  return localDay(new Date().toISOString(), timezone);
}
export type CalendarAccount = { id: string; name: string; archived: boolean };
export type CalendarDay = ReturnType<
  typeof realizedPerformance
>["days"][number];
export type Basis = "gross" | "net";
export function summarize(days: CalendarDay[], basis: Basis) {
  const value = (d: CalendarDay) => (basis === "gross" ? d.gross : d.net);
  const complete = days.every((d) => value(d) !== null);
  const total = complete ? sum(days.map((d) => value(d)!)) : null;
  const ranked = days
    .filter((d) => value(d) !== null)
    .sort((a, b) => new D(value(b)!).cmp(value(a)!));
  return {
    total,
    activeDays: days.length,
    positive: days.filter((d) => value(d) !== null && new D(value(d)!).gt(0))
      .length,
    negative: days.filter((d) => value(d) !== null && new D(value(d)!).lt(0))
      .length,
    zero: days.filter((d) => value(d) !== null && new D(value(d)!).isZero())
      .length,
    count: days.reduce((n, d) => n + d.count, 0),
    best: ranked[0] ?? null,
    worst: ranked.at(-1) ?? null,
  };
}
export function aggregateCalendar(
  rows: Portion[],
  fees: Record<string, PortionFee>,
  filter: JournalFilter,
  timezone: string,
  month: string,
  weekStartsOn: 0 | 1,
  requested: Basis,
) {
  const scope = {
    ...filter,
    start: filter.start > month + "-01" ? filter.start : month + "-01",
    end: filter.end < monthEnd(month) ? filter.end : monthEnd(month),
  };
  const performance = realizedPerformance(rows, fees, scope, timezone);
  const netAvailable =
    performance.selected.length > 0 && performance.feeAmount !== null;
  const basis = requested === "net" && netAvailable ? "net" : "gross";
  const weeks = calendarWeeks(month, weekStartsOn).map((dates) => ({
    dates,
    summary: summarize(
      performance.days.filter((d) => dates.includes(d.date)),
      basis,
    ),
  }));
  return {
    month,
    timezone,
    weekStartsOn,
    basis,
    requestedBasis: requested,
    netAvailable,
    estimated: performance.estimated,
    days: performance.days,
    weeks,
    summary: summarize(performance.days, basis),
    range: { start: filter.start, end: filter.end },
  };
}
export type CalendarMonth = ReturnType<typeof aggregateCalendar> & {
  accounts: CalendarAccount[];
  mode: "real" | "demo";
  processing: { unpublished: number; failed: boolean; outdated: boolean };
  today: string;
};
export type DayContribution = {
  id: string;
  account: string;
  symbol: string;
  direction: string;
  exitAt: string;
  quantity: string | null;
  gross: string;
  fees: string | null;
  net: string | null;
  estimated: boolean;
  status: string;
  partial: boolean;
  href: string | null;
};
export type CalendarDetails = {
  date: string;
  timezone: string;
  accounts: CalendarAccount[];
  day: CalendarDay | null;
  records: DayContribution[];
  mode: "real" | "demo";
};
