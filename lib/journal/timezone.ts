// Calendar-date extraction via IANA rules, independent of the server's local timezone.
export function formatInTimeZone(instant: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (name: string) => parts.find((p) => p.type === name)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
