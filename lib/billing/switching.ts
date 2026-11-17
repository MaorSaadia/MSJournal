import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { billingCheckouts, billingMemberships, billingPlanChanges } from "@/db/schema";
import { ReviewError } from "@/lib/reviews/model";
import { whopConfig } from "./config";
import { safeWhopUrl, whopMembershipSchema } from "./policy";
import { configuredPlans, digest, reconcileMembership, startCheckout, whopRequest } from "./provider";
import { cancelRenewal } from "./cancellation";
import { monthlyChangeSource, verifiedAnnualPayment } from "./switch-policy";
import { verifiedPlanOption } from "./plan-verification";

export async function startAnnualChange(ownerId: string) {
  const config = whopConfig();
  if (!config?.checkoutEnabled) throw new ReviewError("Billing changes are not available yet.", 503);
  const annual = (await configuredPlans(config)).find(p => p.interval === "annual");
  const monthlyId = config.purchasePlans.find(p => p.interval === "monthly")?.id;
  if (!annual || !monthlyId) throw new ReviewError("Verified Yearly pricing is not available.", 503);
  const [existingAnnual] = await getDb().select().from(billingMemberships).where(and(
    eq(billingMemberships.ownerId, ownerId), eq(billingMemberships.environment, config.environment),
    eq(billingMemberships.planId, annual.id), inArray(billingMemberships.status, ["active", "trialing", "past_due", "canceling"]),
  )).limit(1);
  if (existingAnnual) throw new ReviewError("You already have verified Yearly access. Do not pay again.", 409);
  const [saved] = await getDb().select().from(billingMemberships).where(and(
    eq(billingMemberships.ownerId, ownerId), eq(billingMemberships.environment, config.environment),
  )).orderBy(desc(billingMemberships.eligibleUntil)).limit(1);
  if (!saved || saved.ownerId !== ownerId || saved.environment !== config.environment || saved.planId !== monthlyId)
    throw new ReviewError("Only a linked Monthly subscription can change to Yearly here.", 409);
  const source = monthlyChangeSource(await whopRequest(`/memberships/${saved.membershipId}`, {}, config), {
    membershipId: saved.membershipId, whopUserId: saved.whopUserId,
    businessId: config.businessId, productId: config.productId, monthlyPlanId: monthlyId,
  });
  if (!source) throw new ReviewError("Your current billing details need verification. Refresh subscription status or manage it through Whop.", 409);

  const [pending] = await getDb().select().from(billingPlanChanges).where(and(
    eq(billingPlanChanges.ownerId, ownerId), eq(billingPlanChanges.environment, config.environment),
    eq(billingPlanChanges.fromMembershipId, saved.membershipId),
    inArray(billingPlanChanges.state, ["checkout", "awaiting_payment", "cancel_pending"]),
  )).limit(1);
  if (pending) {
    if (pending.state === "cancel_pending") throw new ReviewError("Yearly is confirmed. Monthly renewal cancellation is being retried; do not pay again.", 409);
    const [attempt] = await getDb().select().from(billingCheckouts).where(and(
      eq(billingCheckouts.id, pending.checkoutId), eq(billingCheckouts.ownerId, ownerId),
      eq(billingCheckouts.environment, config.environment), eq(billingCheckouts.planId, annual.id),
    ));
    if (!attempt?.configurationId) throw new ReviewError("Yearly checkout is still being prepared. Please try again shortly.", 409);
    const payments = await whopRequest(`/payments?${new URLSearchParams({
      account_id: config.businessId, user_id: saved.whopUserId, status: "paid", first: "20",
      created_after: new Date(pending.createdAt.getTime() - 60000).toISOString(),
    })}`, {}, config);
    if (!Array.isArray(payments.data) || payments.page_info?.has_next_page)
      throw new ReviewError("Payment history needs verification before reopening checkout. Refresh subscription status.", 503);
    if (payments.data.some((p: { checkout_configuration_id?: string }) => p.checkout_configuration_id === attempt.configurationId))
      throw new ReviewError("Whop has received payment for this checkout. Do not pay again; refresh subscription status while we confirm the billing change.", 409);
    const checkout = await whopRequest(`/checkout_configurations/${attempt.configurationId}`, {}, config);
    if (checkout.account_id !== config.businessId || checkout.variant?.id !== annual.id ||
        checkout.metadata?.msjournal_checkout !== attempt.id ||
        typeof checkout.metadata?.msjournal_binding !== "string" || digest(checkout.metadata.msjournal_binding) !== attempt.nonceHash)
      throw new ReviewError("The existing checkout could not be verified.", 503);
    return { url: safeWhopUrl(checkout.purchase_url, config.environment, "checkout") };
  }
  return startCheckout(ownerId, annual.option, { fromMembershipId: saved.membershipId });
}

// Invoked after provider reconciliation, never from a success redirect alone.
export async function completeAnnualChange(membershipId: string) {
  const config = whopConfig();
  if (!config) return;
  const [linked] = await getDb().select().from(billingMemberships).where(and(
    eq(billingMemberships.environment, config.environment), eq(billingMemberships.membershipId, membershipId),
  ));
  if (!linked) return;
  const [candidate] = await getDb().select().from(billingPlanChanges).where(and(
    eq(billingPlanChanges.ownerId, linked.ownerId), eq(billingPlanChanges.environment, config.environment),
    eq(billingPlanChanges.toPlanId, linked.planId),
    inArray(billingPlanChanges.state, ["checkout", "awaiting_payment", "cancel_pending"]),
  )).limit(1);
  if (!candidate) return;
  const remote = whopMembershipSchema.parse(await whopRequest(`/memberships/${membershipId}`, {}, config));
  const checkoutId = remote.metadata.msjournal_checkout;
  const proof = remote.metadata.msjournal_binding;
  if (!z.uuid().safeParse(checkoutId).success || typeof proof !== "string" || !/^[a-f0-9]{64}$/.test(proof)) return;
  await getDb().transaction(async tx => {
    const [change] = await tx.select().from(billingPlanChanges).where(and(
      eq(billingPlanChanges.checkoutId, checkoutId as string), eq(billingPlanChanges.environment, config.environment),
      inArray(billingPlanChanges.state, ["checkout", "awaiting_payment", "cancel_pending"]),
    )).for("update", { skipLocked: true });
    if (!change) return;
    const [target] = await tx.select().from(billingMemberships).where(and(
      eq(billingMemberships.ownerId, change.ownerId), eq(billingMemberships.environment, config.environment),
      eq(billingMemberships.membershipId, membershipId), eq(billingMemberships.planId, change.toPlanId),
    ));
    const [source] = await tx.select().from(billingMemberships).where(and(
      eq(billingMemberships.ownerId, change.ownerId), eq(billingMemberships.environment, config.environment),
      eq(billingMemberships.membershipId, change.fromMembershipId),
    ));
    const [attempt] = await tx.select().from(billingCheckouts).where(and(
      eq(billingCheckouts.id, change.checkoutId), eq(billingCheckouts.ownerId, change.ownerId),
      eq(billingCheckouts.environment, config.environment), eq(billingCheckouts.nonceHash, digest(proof)),
    ));
    if (!source || !target?.hasAccess || target.eligibleUntil <= new Date() || !attempt?.configurationId ||
        remote.id !== membershipId || remote.status !== "active" || remote.account.id !== config.businessId ||
        remote.product_id !== config.productId || remote.variant_id !== change.toPlanId ||
        remote.user_id !== source.whopUserId || target.whopUserId !== source.whopUserId ||
        attempt.planId !== change.toPlanId || source.membershipId === membershipId) return;
    // Finish already-consented, paid changes even if new checkout is disabled.
    const annual = config.planIds.includes(change.toPlanId) && verifiedPlanOption(
      await whopRequest(`/variants/${change.toPlanId}`, {}, config), { id: change.toPlanId, interval: "annual" }, config,
    );
    if (!annual) return;
    const payments = await whopRequest(`/payments?${new URLSearchParams({ account_id: config.businessId, membership_id: membershipId, status: "paid", first: "3" })}`, {}, config);
    const paid = Array.isArray(payments.data) && payments.data.some((p: unknown) => verifiedAnnualPayment(p, {
      membershipId, userId: source.whopUserId, planId: change.toPlanId, configurationId: attempt.configurationId!,
      businessId: config.businessId, productId: config.productId,
    }));
    if (!paid) return;
    const access = await whopRequest(`/users/${encodeURIComponent(source.whopUserId)}/access/${config.productId}`, {}, config);
    if (!access.has_access || access.access_level !== "customer") return;
    let state: "complete" | "cancel_pending" = "complete";
    try { await cancelRenewal(change.ownerId, change.fromMembershipId); }
    catch { state = "cancel_pending"; }
    await tx.update(billingPlanChanges).set({
      state, toMembershipId: membershipId, updatedAt: new Date(),
      completedAt: state === "complete" ? new Date() : null,
      lastError: state === "complete" ? null : "monthly_cancellation_pending",
    }).where(and(eq(billingPlanChanges.checkoutId, change.checkoutId), eq(billingPlanChanges.ownerId, change.ownerId)));
  });
}

// Durable retry path shared by Billing and the existing reconciliation scheduler.
export async function retryAnnualChanges(ownerId?: string) {
  const config = whopConfig();
  if (!config) return;
  const changes = await getDb().select().from(billingPlanChanges).where(and(
    eq(billingPlanChanges.environment, config.environment),
    ownerId ? eq(billingPlanChanges.ownerId, ownerId) : undefined,
    inArray(billingPlanChanges.state, ["awaiting_payment", "cancel_pending"]),
    sql`${billingPlanChanges.updatedAt} < now() - interval '30 seconds'`,
  )).orderBy(asc(billingPlanChanges.updatedAt)).limit(1);
  for (const change of changes) {
    const candidates = await getDb().select().from(billingMemberships).where(and(
      eq(billingMemberships.ownerId, change.ownerId), eq(billingMemberships.environment, config.environment),
      eq(billingMemberships.planId, change.toPlanId),
    )).orderBy(desc(billingMemberships.verifiedAt)).limit(2);
    try {
      // Recover a paid checkout whose webhook was missed, using the original
      // buyer plus the existing nonce/configuration proof, never an email match.
      if (!candidates.length) {
        const [source] = await getDb().select().from(billingMemberships).where(and(
          eq(billingMemberships.ownerId, change.ownerId), eq(billingMemberships.environment, config.environment),
          eq(billingMemberships.membershipId, change.fromMembershipId),
        ));
        if (source) {
          const recent = await whopRequest(`/memberships?${new URLSearchParams({
            account_id: config.businessId, user_id: source.whopUserId, first: "3",
            created_after: new Date(change.createdAt.getTime() - 60000).toISOString(),
          })}`, {}, config);
          for (const m of Array.isArray(recent.data) ? recent.data : []) {
            if (m.variant_id !== change.toPlanId || m.user_id !== source.whopUserId || !/^mem_[A-Za-z0-9]+$/.test(m.id ?? "")) continue;
            const result = await reconcileMembership(m.id);
            if (result.linked) await completeAnnualChange(m.id);
          }
        }
      }
      for (const candidate of candidates) await completeAnnualChange(candidate.membershipId);
    }
    catch { /* retry later; never manufacture payment or access */ }
    await getDb().update(billingPlanChanges).set({ updatedAt: new Date() }).where(and(
      eq(billingPlanChanges.checkoutId, change.checkoutId), eq(billingPlanChanges.ownerId, change.ownerId),
    ));
  }
}
