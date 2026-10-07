import { tzOffset } from "@date-fns/tz";
import { z } from "zod";
export const sourceTimezone = z
  .string()
  .min(1)
  .max(100)
  .refine((value) => {
    // Intl can also accept bare UTC offsets. Imports require a named IANA zone.
    if (value !== "UTC" && !value.includes("/")) return false;
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Choose a valid IANA timezone, such as Asia/Jerusalem.");
// Enumerate real offsets around this wall date, then round-trip every candidate.
// A gap has zero candidates and a repeated hour has two: neither is guessed.
export function parseSourceTime(value: string, timezone: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(
    value.trim(),
  );
  if (!match) throw new Error("Expected MM/DD/YYYY HH:mm:ss.");
  const [, m, d, y, h, min, s] = match;
  const parts = [
    Number(y),
    Number(m),
    Number(d),
    Number(h),
    Number(min),
    Number(s),
  ];
  if (parts[0] < 2000 || parts[0] > 2099)
    throw new Error("Supported year range is 2000–2099.");
  const wall = Date.UTC(
    parts[0],
    parts[1] - 1,
    parts[2],
    parts[3],
    parts[4],
    parts[5],
  );
  const check = new Date(wall);
  if (
    check.getUTCFullYear() !== parts[0] ||
    check.getUTCMonth() + 1 !== parts[1] ||
    check.getUTCDate() !== parts[2] ||
    parts[3] > 23 ||
    parts[4] > 59 ||
    parts[5] > 59
  )
    throw new Error("Invalid calendar date or time.");
  const offsets = new Set<number>();
  for (let hours = -48; hours <= 48; hours += 6)
    offsets.add(tzOffset(timezone, new Date(wall + hours * 3600000)));
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const instants = [...offsets]
    .map((offset) => wall - offset * 60000)
    .filter((instant) => {
      const p = Object.fromEntries(
        formatter
          .formatToParts(new Date(instant))
          .map((p) => [p.type, p.value]),
      );
      return [p.year, p.month, p.day, p.hour, p.minute, p.second]
        .map(Number)
        .every((n, i) => n === parts[i]);
    });
  if (!instants.length)
    throw new Error(
      "This local time does not exist because of a daylight-saving change.",
    );
  if (instants.length !== 1)
    throw new Error(
      "This local time is ambiguous because of a daylight-saving change. Export an unambiguous time before importing.",
    );
  return new Date(instants[0]).toISOString();
}
