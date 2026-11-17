import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { billingMemberships, billingPlanChanges } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { getPreferences } from "@/lib/preferences";
import { WorkspaceUnavailableError } from "@/lib/server-error";
import { billingEnvironment, whopConfig } from "./config";
import { getEntitlement } from "./entitlements";
import { configuredPlans, refreshOwner } from "./provider";
import type { VerifiedPlanOption } from "./pricing";
import { whopManagementUrl } from "./policy";
export async function billingStatus(headers?: Headers, refresh = true) {
  const user = await requireUser(headers);
  if (refresh) await refreshOwner(user.id).catch(() => {});
  const [entitlement, preferences, memberships] = await Promise.all([
    getEntitlement(user.id),
    getPreferences(headers),
    getDb()
      .select()
      .from(billingMemberships)
      .where(
        and(
          eq(billingMemberships.ownerId, user.id),
          eq(
            billingMemberships.environment,
            billingEnvironment() as "live" | "sandbox",
          ),
        ),
      )
      .orderBy(desc(billingMemberships.eligibleUntil))
      .catch(() => {
        throw new WorkspaceUnavailableError();
      }),
  ]);
  const config = whopConfig();
  let plans: VerifiedPlanOption[] = [];
  if (config?.checkoutEnabled) {
    try {
      plans = (await configuredPlans(config)).map(
        ({ title, price, option, interval }) => ({
          title,
          price,
          option,
          interval,
        }),
      );
    } catch {
      /* no guessed price */
    }
  }
  const [change] = await getDb().select().from(billingPlanChanges).where(and(
    eq(billingPlanChanges.ownerId, user.id), eq(billingPlanChanges.environment, billingEnvironment() as "sandbox" | "live"),
  )).orderBy(desc(billingPlanChanges.createdAt)).limit(1);
  const target = memberships.find(m => m.membershipId === change?.toMembershipId && m.hasAccess && m.eligibleUntil > new Date());
  const m = target ?? memberships.find(m => !m.cancelAtPeriodEnd && m.hasAccess && m.eligibleUntil > new Date()) ?? memberships[0];
  const interval = config?.purchasePlans.find(p => p.id === m?.planId)?.interval ?? null;
  return {
    userId: user.id,
    timezone: preferences.displayTimezone,
    ...entitlement,
    subscription: m
      ? {
          status: m.status,
          cancelAtPeriodEnd: m.cancelAtPeriodEnd,
          periodEnd: m.periodEnd?.toISOString() ?? null,
          expiresAt: m.expiresAt?.toISOString() ?? null,
          verifiedAt: m.verifiedAt.toISOString(),
          refreshFailed: m.refreshFailed,
          manageUrl: whopManagementUrl(change?.state === "cancel_pending" ? null : m.manageUrl, m.environment),
        }
      : null,
    checkoutAvailable: !!config?.checkoutEnabled && plans.length > 0,
    linkingAvailable: !!config?.clientId,
    plans,
    ...(m ? { currentInterval: interval } : {}),
    ...(change ? { billingChange: { state: change.state, updatedAt: change.updatedAt.toISOString() } } : {}),
  };
}
export type BillingStatus = Awaited<ReturnType<typeof billingStatus>>;
