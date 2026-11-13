import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { billingMemberships } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { getPreferences } from "@/lib/preferences";
import { WorkspaceUnavailableError } from "@/lib/server-error";
import { billingEnvironment, whopConfig } from "./config";
import { getEntitlement } from "./entitlements";
import { configuredPlans, refreshOwner } from "./provider";
import type { VerifiedPlanOption } from "./pricing";
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
  const m = memberships[0];
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
          manageUrl: m.manageUrl,
        }
      : null,
    checkoutAvailable: !!config?.checkoutEnabled && plans.length > 0,
    linkingAvailable: !!config?.clientId,
    plans,
  };
}
export type BillingStatus = Awaited<ReturnType<typeof billingStatus>>;
