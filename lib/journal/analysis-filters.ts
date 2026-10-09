export const durationBuckets = [
  "under-1",
  "1-5",
  "5-15",
  "15-60",
  "60-plus",
] as const;
export const durationLabels: Record<(typeof durationBuckets)[number], string> =
  {
    "under-1": "Under 1 minute",
    "1-5": "1–5 minutes",
    "5-15": "5–15 minutes",
    "15-60": "15–60 minutes",
    "60-plus": "60+ minutes",
  };
export const durationBounds = {
  "under-1": [0, 60],
  "1-5": [60, 300],
  "5-15": [300, 900],
  "15-60": [900, 3600],
  "60-plus": [3600, null],
} as const;
export function durationBucket(seconds: string | null) {
  if (
    seconds === null ||
    !Number.isFinite(Number(seconds)) ||
    Number(seconds) < 0
  )
    return null;
  return (
    durationBuckets.find(
      (key) =>
        Number(seconds) >= durationBounds[key][0] &&
        (durationBounds[key][1] === null ||
          Number(seconds) < durationBounds[key][1]!),
    ) ?? null
  );
}
export function entryHour(instant: string | null, timezone: string) {
  return instant === null
    ? null
    : Number(
        new Intl.DateTimeFormat("en", {
          timeZone: timezone,
          hour: "2-digit",
          hourCycle: "h23",
        }).format(new Date(instant)),
      );
}
export function localWeekday(instant: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    weekday: "short",
  }).format(new Date(instant));
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts);
}
