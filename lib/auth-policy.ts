const destinations = new Set([
  "/",
  "/welcome",
  "/prop-accounts",
  "/settings",
  "/day-view",
  "/trade-view",
  "/notebook",
  "/reports",
  "/strategies",
  "/progress-tracker",
  "/fees",
  "/worksheets",
  "/book",
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
      (destinations.has(url.pathname) || /^\/book\/[a-z0-9-]+$/.test(url.pathname) || /^\/worksheets\/[0-9a-f-]{36}$/.test(url.pathname))
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
  "/sign-up/email",
  "/request-password-reset",
  "/reset-password",
  "/change-password",
  "/send-verification-email",
  "/verify-email",
]);
