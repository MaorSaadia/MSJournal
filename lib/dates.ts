import { TZDate } from "@date-fns/tz";
import { addDays, format } from "date-fns";

export const JOURNAL_TIMEZONE = "Asia/Jerusalem";
export const DISPLAY_TIMEZONES = [
  "Asia/Jerusalem",
  "America/New_York",
  "Europe/London",
  "UTC",
] as const;
// Zoned construction interprets a local wall-clock date using IANA DST rules.
// Future CSV import must additionally reject ambiguous/nonexistent local times.
export function localTimestamp(
  date: string,
  hour: number,
  minute: number,
  timezone = JOURNAL_TIMEZONE,
) {
  const [year, month, day] = date.split("-").map(Number);
  const zoned = new TZDate(
    year,
    month - 1,
    day,
    hour,
    minute,
    0,
    timezone,
  );
  return new Date(zoned.getTime()).toISOString();
}
export function dayKey(timestamp: string, timezone = JOURNAL_TIMEZONE) {
  return format(new TZDate(timestamp, timezone), "yyyy-MM-dd");
}
export function dayDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new TZDate(year, month - 1, day, 12, 0, 0, JOURNAL_TIMEZONE);
}
export function dateLabel(date: string, pattern = "MMM d") {
  return format(dayDate(date), pattern);
}
export function dateKeys(start: string, end: string) {
  const result: string[] = [];
  for (
    let day = dayDate(start);
    dayKey(day.toISOString()) <= end;
    day = addDays(day, 1)
  ) {
    result.push(dayKey(day.toISOString()));
  }
  return result;
}
export function entryMinutes(timestamp: string, timezone = JOURNAL_TIMEZONE) {
  const date = new TZDate(timestamp, timezone);
  return date.getHours() * 60 + date.getMinutes();
}
export function timeLabel(minutes: number) {
  const rounded = Math.round(minutes);
  return `${Math.floor(rounded / 60)
    .toString()
    .padStart(2, "0")}:${(rounded % 60).toString().padStart(2, "0")}`;
}
export function timestampLabel(timestamp: string, timezone = JOURNAL_TIMEZONE) {
  return format(new TZDate(timestamp, timezone), "MMM d, HH:mm");
}
export function currentMonth() {
  return format(new TZDate(new Date(), JOURNAL_TIMEZONE), "yyyy-MM");
}
