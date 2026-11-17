import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { billingMemberships } from "@/db/schema";
import { ReviewError } from "@/lib/reviews/model";
import { whopConfig } from "./config";
import { whopMembershipSchema } from "./policy";
import { digest, ProviderUnavailable, reconcileMembership, whopRequest } from "./provider";

// The browser supplies neither a membership ID nor the cancellation timing.
export async function cancelRenewal(ownerId: string, membershipId?: string) {
  const config = whopConfig();
  if (!config)
    throw new ReviewError("Subscription management is temporarily unavailable.", 503);
  const [saved] = await getDb().select().from(billingMemberships)
    .where(and(eq(billingMemberships.ownerId, ownerId), eq(billingMemberships.environment, config.environment), membershipId ? eq(billingMemberships.membershipId, membershipId) : undefined))
    .orderBy(asc(billingMemberships.cancelAtPeriodEnd), desc(billingMemberships.eligibleUntil)).limit(1);
  if (!saved || saved.ownerId !== ownerId || saved.environment !== config.environment)
    throw new ReviewError("No linked subscription was found for your account.", 404);

  const path = `/memberships/${encodeURIComponent(saved.membershipId)}`;
  const remote = whopMembershipSchema.parse(await whopRequest(path, {}, config));
  if (remote.id !== saved.membershipId || remote.user_id !== saved.whopUserId ||
      remote.account.id !== config.businessId || remote.product_id !== config.productId ||
      !config.planIds.includes(remote.variant_id))
    throw new ReviewError("Subscription ownership could not be confirmed.", 403);

  const alreadyEnding = remote.cancel_at_period_end ||
    ["canceling", "canceled", "expired"].includes(remote.status);
  if (!alreadyEnding) {
    if (!["active", "trialing", "past_due"].includes(remote.status) ||
        !remote.current_period_end || Date.parse(remote.current_period_end) <= Date.now())
      throw new ReviewError("This subscription cannot be scheduled for cancellation here. Manage it through Whop.", 409);
    try {
      await whopRequest(`${path}/cancel`, {
        method: "POST",
        headers: { "Idempotency-Key": digest(`cancel-renewal:${config.environment}:${remote.id}:${remote.current_period_end}`) },
        // Omitting this field or sending false would revoke access immediately.
        body: JSON.stringify({ cancel_at_period_end: true }),
      }, config);
    } catch (error) {
      if (error instanceof ProviderUnavailable && error.providerStatus === 403)
        throw new ReviewError("Whop denied this cancellation request. MSJournal's Whop API key needs the membership:cancel permission. Contact support or manage your subscription through Whop. Cancellation has not been confirmed.", 503);
      throw new ReviewError("Cancellation could not be confirmed. Refresh your subscription status before trying again, or manage it through Whop.", 503);
    }
  }
  // Never infer access changes from a cancellation response. Reuse authoritative
  // membership/access checks and the existing paid-period lease calculation.
  try {
    await reconcileMembership(saved.membershipId, ownerId);
    const [confirmed] = await getDb().select().from(billingMemberships)
      .where(and(eq(billingMemberships.ownerId, ownerId), eq(billingMemberships.environment, config.environment), eq(billingMemberships.membershipId, saved.membershipId)))
      .limit(1);
    if (!confirmed || (!confirmed.cancelAtPeriodEnd && !["canceling", "canceled", "expired"].includes(confirmed.status)))
      throw new Error("Awaiting provider confirmation");
  } catch {
    throw new ReviewError("Your cancellation request was sent, but confirmation is pending. Refresh subscription status shortly. Your trading data is unchanged.", 503);
  }
}
