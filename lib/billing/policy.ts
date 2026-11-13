import { z } from "zod";

export const WHOP_API_VERSION = "2026-11-12";
export const RECHECK_MS = 10 * 60 * 1000;
export const MAX_VERIFIED_LEASE_MS = 6 * 60 * 60 * 1000;
export const whopMembershipSchema = z.object({
  id: z.string().regex(/^mem_[A-Za-z0-9]+$/),
  account: z.object({ id: z.string() }),
  product_id: z.string(),
  variant_id: z.string(),
  user_id: z.string().nullable(),
  status: z.enum([
    "active",
    "trialing",
    "past_due",
    "completed",
    "canceled",
    "expired",
    "unresolved",
    "drafted",
    "canceling",
  ]),
  updated_at: z.iso.datetime({ offset: true }),
  current_period_end: z.iso.datetime({ offset: true }).nullable(),
  expires_at: z.iso.datetime({ offset: true }).nullable(),
  cancel_at_period_end: z.boolean(),
  manage_url: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
});
export type WhopMembership = z.infer<typeof whopMembershipSchema>;
export type WhopEnvironment = "sandbox" | "live";
export type Entitlement = {
  plan: "Free" | "Pro";
  usage: number;
  freeAccountId: string | null;
  needsSelection: boolean;
  accounts: {
    id: string;
    name: string;
    archived: boolean;
    writable: boolean;
  }[];
};
export function verifiedLease(
  m: WhopMembership,
  hasAccess: boolean,
  now: Date,
) {
  if (
    !hasAccess ||
    !m.user_id ||
    !["active", "trialing", "past_due", "completed", "canceling"].includes(
      m.status,
    )
  )
    return now;
  let end = now.getTime() + MAX_VERIFIED_LEASE_MS;
  // Past-due access is explicitly verified against Whop's access endpoint, not
  // inferred from an elapsed billing period. Recheck its grace more frequently.
  if (m.status === "past_due") end = now.getTime() + 15 * 60 * 1000;
  for (const boundary of [
    m.expires_at,
    m.status !== "past_due" ? m.current_period_end : null,
  ])
    if (boundary) end = Math.min(end, Date.parse(boundary));
  return new Date(Math.max(now.getTime(), end));
}
export function deriveEntitlement(
  accounts: { id: string; name: string; archived: boolean }[],
  freeAccountId: string | null,
  pro: boolean,
): Entitlement {
  const selected = accounts.some((a) => a.id === freeAccountId)
    ? freeAccountId
    : null;
  return {
    plan: pro ? "Pro" : "Free",
    usage: accounts.length,
    freeAccountId: selected,
    needsSelection: !pro && accounts.length > 1 && !selected,
    accounts: accounts.map((a) => ({
      ...a,
      writable: pro || (!!selected && a.id === selected),
    })),
  };
}
export function safeWhopUrl(
  value: unknown,
  environment: WhopEnvironment,
  type: "checkout" | "manage",
) {
  if (typeof value !== "string") throw new Error("Invalid billing destination");
  const url = new URL(value);
  const host = environment === "sandbox" ? "sandbox.whop.com" : "whop.com";
  if (
    url.protocol !== "https:" ||
    url.hostname !== host ||
    url.username ||
    url.password ||
    url.port ||
    !(type === "checkout"
      ? url.pathname.startsWith("/checkout/")
      : url.pathname.startsWith("/billing/"))
  )
    throw new Error("Invalid billing destination");
  return url.toString();
}
