export function authError(
  error: { status?: number; code?: string },
  mode: "login" | "signup" | "recovery" | "reset" | "verify",
) {
  if (error.status === 429)
    return "Too many attempts. Please wait one minute and try again.";
  if (error.status && error.status >= 500)
    return mode === "recovery" || mode === "verify"
      ? "Email recovery is temporarily unavailable. Please try again later."
      : "Authentication is temporarily unavailable. Please try again later.";
  if (error.code === "EMAIL_NOT_VERIFIED")
    return "Verify your email before signing in. You can request a new verification link.";
  if (
    mode === "reset" &&
    ["INVALID_TOKEN", "TOKEN_EXPIRED"].includes(error.code ?? "")
  )
    return "This reset link is invalid or expired. Request a new link.";
  if (mode === "login" && error.status === 401)
    return "The email or password is incorrect.";
  if (
    mode === "signup" &&
    error.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"
  )
    return "Unable to create this account. Try signing in or recovering your password.";
  if (error.status === 403)
    return "This request could not be accepted. Open MSJournal at its configured address and try again.";
  return "Unable to complete this request. Check your entries and try again.";
}
