import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "./auth";
import { isConfigured, readConfig } from "./config";
import { WorkspaceUnavailableError } from "./server-error";
export class UnauthorizedError extends Error {
  constructor() {
    super("Sign in to your private workspace.");
  }
}
export async function userSession(requestHeaders: Headers) {
  if (!isConfigured()) return null;
  let session;
  try {
    session = await getAuth().api.getSession({
      headers: requestHeaders,
      query: { disableCookieCache: true },
    });
  } catch {
    throw new WorkspaceUnavailableError();
  }
  return session &&
    (readConfig().AUTH_REQUIRE_EMAIL_VERIFICATION !== "true" ||
      session.user.emailVerified)
    ? session
    : null;
}
export async function requireUser(requestHeaders?: Headers) {
  const session = await userSession(requestHeaders ?? (await headers()));
  if (!session) throw new UnauthorizedError();
  return session.user;
}
export async function requirePageUser() {
  const session = await userSession(await headers());
  if (!session) redirect("/login");
  return session.user;
}
