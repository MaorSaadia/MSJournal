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
  const text = value.trim();
  const local =
    /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})(?:\s?(Z|[+-]\d{2}:\d{2}))?$/.exec(
      text,
    );
  const iso =
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(Z|[+-]\d{2}:\d{2})$/.exec(
      text,
    );
  if (!local && !iso)
    throw new Error(
      "Expected MM/DD/YYYY HH:mm:ss, optionally with Z or ±HH:mm; ISO timestamps require an explicit offset.",
    );
  const [, m, d, y, h, min, s] = local ?? [
    "",
    iso![2],
    iso![3],
    iso![1],
    iso![4],
    iso![5],
    iso![6],
  ];
  const explicit = local?.[7] ?? iso?.[7];
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
  if (explicit) {
    if (explicit === "Z") return new Date(wall).toISOString();
    const hour = Number(explicit.slice(1, 3)),
      minute = Number(explicit.slice(4, 6));
    if (
      hour > 14 ||
      minute > 59 ||
      (hour === 14 && minute !== 0) ||
      explicit === "-00:00"
    )
      throw new Error("Invalid or unknown explicit UTC offset.");
    const offset = (hour * 60 + minute) * (explicit[0] === "-" ? -1 : 1);
    return new Date(wall - offset * 60000).toISOString();
  }
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
