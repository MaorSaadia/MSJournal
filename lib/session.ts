import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "./auth";
import { isConfigured, readConfig } from "./config";
import { isOwner } from "./auth-policy";
import { WorkspaceUnavailableError } from "./server-error";
export class UnauthorizedError extends Error {
  constructor() {
    super("Sign in to your private workspace.");
  }
}
export async function ownerSession(requestHeaders: Headers) {
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
  return session && isOwner(session.user.email, readConfig().OWNER_EMAIL)
    ? session
    : null;
}
export async function requireOwner(requestHeaders?: Headers) {
  const session = await ownerSession(requestHeaders ?? (await headers()));
  if (!session) throw new UnauthorizedError();
  return session.user;
}
export async function requirePageOwner() {
  const session = await ownerSession(await headers());
  if (!session) redirect("/login");
  return session.user;
}
