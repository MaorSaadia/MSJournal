export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export function isOwner(email: string, configuredEmail: string) {
  return normalizeEmail(email) === normalizeEmail(configuredEmail);
}
const destinations = new Set([
  "/",
  "/prop-accounts",
  "/settings",
  "/day-view",
  "/trade-view",
  "/notebook",
  "/reports",
  "/strategies",
  "/progress-tracker",
]);
export function safeRedirect(value: unknown) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\x00-\x20]/.test(value)
  )
    return "/";
  try {
    const url = new URL(value, "https://msjournal.invalid");
    return url.origin === "https://msjournal.invalid" &&
      destinations.has(url.pathname)
      ? `${url.pathname}${url.search}`
      : "/";
  } catch {
    return "/";
  }
}
export const publicAuthPaths = new Set([
  "/sign-in/email",
  "/sign-out",
  "/get-session",
]);
