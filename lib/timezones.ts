export const DEFAULT_JOURNAL_TIMEZONE = "America/New_York";

export const FEATURED_TIMEZONES = [
  { id: DEFAULT_JOURNAL_TIMEZONE, label: "New York" },
  { id: "Asia/Jerusalem", label: "Israel" },
  { id: "America/Chicago", label: "Chicago" },
  { id: "America/Los_Angeles", label: "Los Angeles" },
  { id: "Europe/London", label: "London" },
  { id: "Europe/Berlin", label: "Berlin" },
  { id: "UTC", label: "UTC" },
  { id: "Asia/Dubai", label: "Dubai" },
  { id: "Asia/Kolkata", label: "Kolkata" },
  { id: "Asia/Tokyo", label: "Tokyo" },
  { id: "Australia/Sydney", label: "Sydney" },
];
export function timezoneChoices() {
  const featured = new Set(FEATURED_TIMEZONES.map((t) => t.id));
  return [
    ...FEATURED_TIMEZONES,
    ...Intl.supportedValuesOf("timeZone")
      .filter((id) => !featured.has(id))
      .map((id) => ({ id, label: id.split("/").at(-1)!.replaceAll("_", " ") })),
  ];
}
export function journalTimestamp(
  value: string | Date | null,
  timezone: string,
) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}
