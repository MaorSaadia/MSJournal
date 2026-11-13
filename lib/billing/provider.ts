import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, asc, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import {
  billingCheckouts,
  billingIdentities,
  billingMemberships,
  billingOAuthStates,
  billingProfiles,
} from "@/db/schema";
import { ReviewError } from "@/lib/reviews/model";
import { billingLock } from "./entitlements";
import { billingEnvironment, whopConfig } from "./config";
import { verifiedPlanOption } from "./plan-verification";
import {
  RECHECK_MS,
  WHOP_API_VERSION,
  safeWhopUrl,
  verifiedLease,
  whopMembershipSchema,
  type WhopMembership,
} from "./policy";

export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
type Config = NonNullable<ReturnType<typeof whopConfig>>;
export class ProviderUnavailable extends ReviewError {
  constructor() {
    super(
      "Subscription status could not refresh. Your last confirmed access is kept within its verified period. Please try again shortly.",
      503,
    );
  }
}
export async function whopRequest(
  path: string,
  options: RequestInit = {},
  config = whopConfig(),
) {
  if (!config) throw new ProviderUnavailable();
  let response: Response;
  try {
    response = await fetch(config.apiBase + path, {
      ...options,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(3500),
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Api-Version-Date": WHOP_API_VERSION,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  } catch {
    throw new ProviderUnavailable();
  }
  if (!response.ok) throw new ProviderUnavailable();
  try {
    return await response.json();
  } catch {
    throw new ProviderUnavailable();
  }
}
export async function configuredPlans(config: Config) {
  const plans = [];
  for (const expected of config.purchasePlans) {
    try {
      const plan = verifiedPlanOption(
        await whopRequest(
          `/variants/${encodeURIComponent(expected.id)}`,
          {},
          config,
        ),
        expected,
        config,
      );
      if (plan) plans.push(plan);
    } catch {
      /* An unavailable optional annual plan must not hide valid Monthly. */
    }
  }
  return plans;
}
function assertScope(m: WhopMembership, config: Config) {
  if (
    m.account.id !== config.businessId ||
    m.product_id !== config.productId ||
    !config.planIds.includes(m.variant_id) ||
    !m.user_id
  )
    throw new ReviewError(
      "This subscription cannot be linked to MSJournal Pro.",
      403,
    );
}
async function identity(
  tx: Parameters<typeof billingLock>[0],
  ownerId: string,
  userId: string,
  environment: "live" | "sandbox",
) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`whop-identity:${environment}:${userId}`},0))`,
  );
  const [mine] = await tx
    .select()
    .from(billingIdentities)
    .where(
      and(
        eq(billingIdentities.ownerId, ownerId),
        eq(billingIdentities.environment, environment),
      ),
    );
  const [theirs] = await tx
    .select()
    .from(billingIdentities)
    .where(
      and(
        eq(billingIdentities.whopUserId, userId),
        eq(billingIdentities.environment, environment),
      ),
    );
  if (
    (mine && mine.whopUserId !== userId) ||
    (theirs && theirs.ownerId !== ownerId)
  )
    throw new ReviewError(
      "This subscription is already linked to a different account. Sign in to the original MSJournal account or contact support.",
      409,
    );
  await tx
    .insert(billingIdentities)
    .values({ ownerId, environment, whopUserId: userId })
    .onConflictDoNothing();
}

// Event payloads never grant access. Resolve ownership from a persisted checkout
// proof (or an OAuth-confirmed identity), then fetch the authoritative membership.
export async function reconcileMembership(
  membershipId: string,
  expectedOwner?: string,
  oauthUserId?: string,
) {
  const config = whopConfig();
  if (!config) throw new ProviderUnavailable();
  if (!/^mem_[A-Za-z0-9]+$/.test(membershipId))
    throw new ReviewError("Invalid subscription reference.", 400);
  let ownerId = expectedOwner;
  let checkoutProof: { binding: string; attempt: string } | undefined;
  if (!ownerId) {
    const [known] = await getDb()
      .select()
      .from(billingMemberships)
      .where(
        and(
          eq(billingMemberships.membershipId, membershipId),
          eq(billingMemberships.environment, config.environment),
        ),
      );
    ownerId = known?.ownerId;
  }
  const initial = whopMembershipSchema.parse(
    await whopRequest(`/memberships/${membershipId}`, {}, config),
  );
  try {
    assertScope(initial, config);
  } catch (e) {
    // A known membership moved out of the configured paid scope is no longer
    // eligible. A provider HTTP failure, by contrast, never clears its lease.
    if (ownerId)
      await getDb()
        .update(billingMemberships)
        .set({
          hasAccess: false,
          eligibleUntil: new Date(),
          checkedAt: new Date(),
        })
        .where(
          and(
            eq(billingMemberships.ownerId, ownerId),
            eq(billingMemberships.membershipId, membershipId),
            eq(billingMemberships.environment, config.environment),
          ),
        );
    throw e;
  }
  if (!ownerId) {
    const proof = initial.metadata.msjournal_binding;
    const attemptId = initial.metadata.msjournal_checkout;
    if (
      typeof proof !== "string" ||
      !/^[a-f0-9]{64}$/.test(proof) ||
      typeof attemptId !== "string" ||
      !z.uuid().safeParse(attemptId).success
    )
      return { linked: false };
    const [attempt] = await getDb()
      .select()
      .from(billingCheckouts)
      .where(
        and(
          eq(billingCheckouts.id, attemptId),
          eq(billingCheckouts.nonceHash, digest(proof)),
          eq(billingCheckouts.environment, config.environment),
        ),
      );
    if (
      !attempt ||
      !attempt.configurationId ||
      attempt.planId !== initial.variant_id
    )
      return { linked: false };
    const checkout = await whopRequest(
      `/checkout_configurations/${encodeURIComponent(attempt.configurationId)}`,
      {},
      config,
    );
    if (
      checkout.account_id !== config.businessId ||
      checkout.variant?.id !== attempt.planId ||
      checkout.metadata?.msjournal_binding !== proof ||
      checkout.metadata?.msjournal_checkout !== attempt.id
    )
      return { linked: false };
    ownerId = attempt.ownerId;
    checkoutProof = { binding: proof, attempt: attempt.id };
  }
  const owner = ownerId;
  try {
    return await getDb().transaction(async (tx) => {
      await billingLock(tx, owner);
      // Serialize reads as well as writes; older notifications cannot overwrite
      // newer state with an earlier event body or an earlier in-flight API read.
      const m = whopMembershipSchema.parse(
        await whopRequest(`/memberships/${membershipId}`, {}, config),
      );
      assertScope(m, config);
      if (m.user_id !== initial.user_id)
        throw new ReviewError(
          "Subscription ownership changed. Please refresh again.",
          409,
        );
      if (
        checkoutProof &&
        (m.metadata.msjournal_binding !== checkoutProof.binding ||
          m.metadata.msjournal_checkout !== checkoutProof.attempt)
      )
        throw new ReviewError(
          "Subscription checkout could not be confirmed.",
          403,
        );
      const [known] = await tx
        .select()
        .from(billingMemberships)
        .where(
          and(
            eq(billingMemberships.membershipId, membershipId),
            eq(billingMemberships.environment, config.environment),
          ),
        );
      if (known && known.ownerId !== owner)
        throw new ReviewError(
          "This subscription is already linked to a different account.",
          409,
        );
      if (oauthUserId && m.user_id !== oauthUserId)
        throw new ReviewError(
          "Subscription ownership could not be confirmed.",
          403,
        );
      if (!known && expectedOwner && !oauthUserId)
        throw new ReviewError(
          "Link your subscription securely before refreshing it.",
          403,
        );
      await identity(tx, owner, m.user_id!, config.environment);
      const access = z
        .object({
          has_access: z.boolean(),
          access_level: z.enum(["no_access", "admin", "customer"]),
        })
        .parse(
          await whopRequest(
            `/users/${encodeURIComponent(m.user_id!)}/access/${encodeURIComponent(config.productId)}`,
            {},
            config,
          ),
        );
      const now = new Date(),
        valid = access.has_access && access.access_level === "customer";
      // A provider response older than our confirmed membership revision is not
      // allowed to restore stale access. Retain the bounded existing lease.
      if (known && Date.parse(m.updated_at) < known.providerUpdatedAt.getTime())
        return { linked: true };
      let manageUrl: string | null = null;
      if (m.manage_url) {
        try {
          manageUrl = safeWhopUrl(m.manage_url, config.environment, "manage");
        } catch {
          /* no unsafe link */
        }
      }
      const row = {
        ownerId: owner,
        whopUserId: m.user_id!,
        environment: config.environment,
        membershipId: m.id,
        businessId: m.account.id,
        productId: m.product_id,
        planId: m.variant_id,
        status: m.status,
        hasAccess: valid,
        cancelAtPeriodEnd: m.cancel_at_period_end,
        periodEnd: m.current_period_end ? new Date(m.current_period_end) : null,
        expiresAt: m.expires_at ? new Date(m.expires_at) : null,
        providerUpdatedAt: new Date(m.updated_at),
        verifiedAt: now,
        checkedAt: now,
        eligibleUntil: verifiedLease(m, valid, now),
        manageUrl,
        refreshFailed: false,
      };
      await tx
        .insert(billingMemberships)
        .values(row)
        .onConflictDoUpdate({
          target: [
            billingMemberships.environment,
            billingMemberships.membershipId,
          ],
          set: row,
        });
      return { linked: true };
    });
  } catch (e) {
    if (e instanceof ProviderUnavailable)
      await getDb()
        .update(billingMemberships)
        .set({ refreshFailed: true, checkedAt: new Date() })
        .where(
          and(
            eq(billingMemberships.ownerId, owner),
            eq(billingMemberships.membershipId, membershipId),
            eq(billingMemberships.environment, config.environment),
          ),
        );
    throw e;
  }
}
export async function refreshOwner(ownerId: string, manual = false) {
  const config = whopConfig();
  if (!config) return;
  const allowed = await getDb().transaction(async (tx) => {
    await billingLock(tx, ownerId);
    const [profile] = await tx
      .select()
      .from(billingProfiles)
      .where(eq(billingProfiles.ownerId, ownerId));
    if (
      profile.refreshedAt &&
      Date.now() - profile.refreshedAt.getTime() < (manual ? 60000 : RECHECK_MS)
    ) {
      if (manual)
        throw new ReviewError(
          "Please wait a minute before refreshing again.",
          429,
        );
      return false;
    }
    await tx
      .update(billingProfiles)
      .set({ refreshedAt: new Date() })
      .where(eq(billingProfiles.ownerId, ownerId));
    return true;
  });
  if (!allowed) return;
  const memberships = await getDb()
    .select()
    .from(billingMemberships)
    .where(
      and(
        eq(billingMemberships.ownerId, ownerId),
        eq(billingMemberships.environment, config.environment),
      ),
    )
    .orderBy(asc(billingMemberships.checkedAt))
    .limit(2);
  let failed = false;
  for (const m of memberships) {
    try {
      await reconcileMembership(m.membershipId, ownerId);
    } catch {
      failed = true;
      await getDb()
        .update(billingMemberships)
        .set({ refreshFailed: true, checkedAt: new Date() })
        .where(
          and(
            eq(billingMemberships.environment, config.environment),
            eq(billingMemberships.membershipId, m.membershipId),
            eq(billingMemberships.ownerId, ownerId),
          ),
        );
    }
  }
  if (failed && manual)
    throw new ReviewError(new ProviderUnavailable().message, 503);
}
export async function startCheckout(ownerId: string, planChoice: number) {
  const config = whopConfig();
  if (!config?.checkoutEnabled)
    throw new ReviewError(
      "Pro checkout is not available yet. Your Free account and worksheets remain available.",
      503,
    );
  const plans = await configuredPlans(config),
    plan = plans.find((p) => p.option === planChoice);
  if (!plan) throw new ReviewError("Choose an available Pro option.", 400);
  const requestId = randomUUID(),
    binding = randomBytes(32).toString("hex");
  await getDb().transaction(async (tx) => {
    await billingLock(tx, ownerId);
    const result = await tx.execute<{ n: number }>(
      sql`select count(*)::int n from billing_checkouts where owner_id=${ownerId} and created_at>now()-interval '10 minutes'`,
    );
    if (result.rows[0].n >= 3)
      throw new ReviewError(
        "Please wait before starting another checkout.",
        429,
      );
    const entitlement = await getEntitlementOutsideLock(tx, ownerId);
    if (entitlement)
      throw new ReviewError(
        "You already have Pro. Use Manage subscription to change your billing.",
        409,
      );
    await tx.insert(billingCheckouts).values({
      id: requestId,
      ownerId,
      environment: config.environment,
      planId: plan.id,
      nonceHash: digest(binding),
    });
  });
  const checkout = await whopRequest(
    "/checkout_configurations",
    {
      method: "POST",
      headers: { "Idempotency-Key": requestId },
      body: JSON.stringify({
        account_id: config.businessId,
        variant_id: plan.id,
        mode: "payment",
        metadata: { msjournal_checkout: requestId, msjournal_binding: binding },
        redirect_url: `${config.origin}/settings/billing?checkout=pending`,
      }),
    },
    config,
  );
  if (
    checkout.account_id !== config.businessId ||
    checkout.variant?.id !== plan.id ||
    checkout.mode !== "payment" ||
    typeof checkout.id !== "string"
  )
    throw new ProviderUnavailable();
  const url = safeWhopUrl(
    checkout.purchase_url,
    config.environment,
    "checkout",
  );
  await getDb()
    .update(billingCheckouts)
    .set({ configurationId: checkout.id })
    .where(
      and(
        eq(billingCheckouts.id, requestId),
        eq(billingCheckouts.ownerId, ownerId),
      ),
    );
  return { url };
}
async function getEntitlementOutsideLock(
  tx: Parameters<typeof billingLock>[0],
  ownerId: string,
) {
  const rows = await tx.execute<{ pro: boolean }>(
    sql`select msjournal_is_pro(${ownerId}) pro`,
  );
  return rows.rows[0].pro;
}

export async function startRecovery(ownerId: string) {
  const config = whopConfig();
  if (!config?.clientId)
    throw new ReviewError(
      "Subscription linking is not available yet. Please try again later.",
      503,
    );
  const state = randomBytes(32).toString("hex"),
    verifier = randomBytes(32).toString("base64url");
  await getDb().transaction(async (tx) => {
    await billingLock(tx, ownerId);
    await tx
      .delete(billingOAuthStates)
      .where(eq(billingOAuthStates.ownerId, ownerId));
    await tx.insert(billingOAuthStates).values({
      ownerId,
      stateHash: digest(state),
      environment: config.environment,
      verifier,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
  });
  const parameters = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: `${config.origin}/api/billing/whop/callback`,
    scope: "openid",
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  });
  return { url: `${config.oauthBase}/authorize?${parameters}` };
}
export async function completeRecovery(
  ownerId: string,
  state: string,
  code: string,
) {
  const config = whopConfig();
  if (
    !config?.clientId ||
    !/^[a-f0-9]{64}$/.test(state) ||
    !code ||
    code.length > 4096
  )
    throw new ReviewError(
      "Subscription linking expired. Start again from Billing.",
      400,
    );
  const [attempt] = await getDb()
    .delete(billingOAuthStates)
    .where(
      and(
        eq(billingOAuthStates.ownerId, ownerId),
        eq(billingOAuthStates.stateHash, digest(state)),
        eq(billingOAuthStates.environment, config.environment),
      ),
    )
    .returning();
  if (!attempt || attempt.expiresAt.getTime() < Date.now())
    throw new ReviewError(
      "Subscription linking expired. Start again from Billing.",
      400,
    );
  const response = await fetch(`${config.oauthBase}/token`, {
    method: "POST",
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: config.clientId,
      redirect_uri: `${config.origin}/api/billing/whop/callback`,
      code,
      code_verifier: attempt.verifier,
    }),
  });
  if (!response.ok) throw new ProviderUnavailable();
  const tokens = z
    .object({ access_token: z.string(), refresh_token: z.string().optional() })
    .parse(await response.json());
  try {
    const infoResponse = await fetch(`${config.oauthBase}/userinfo`, {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!infoResponse.ok) throw new ProviderUnavailable();
    const info = z
      .object({ sub: z.string().regex(/^user_[A-Za-z0-9]+$/) })
      .parse(await infoResponse.json());
    await getDb().transaction(async (tx) => {
      await billingLock(tx, ownerId);
      await identity(tx, ownerId, info.sub, config.environment);
    });
    const params = new URLSearchParams({
      account_id: config.businessId,
      product_id: config.productId,
      user_id: info.sub,
      first: "3",
    });
    for (const status of [
      "active",
      "past_due",
      "canceling",
      "trialing",
      "completed",
    ])
      params.append("statuses", status);
    for (const id of config.planIds) params.append("variant_ids", id);
    const result = z
      .object({ data: z.array(z.object({ id: z.string() })) })
      .parse(await whopRequest(`/memberships?${params}`, {}, config));
    for (const m of result.data)
      await reconcileMembership(m.id, ownerId, info.sub);
  } finally {
    if (tokens.refresh_token)
      await fetch(`${config.oauthBase}/revoke`, {
        method: "POST",
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(3000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: tokens.refresh_token,
          client_id: config.clientId,
        }),
      }).catch(() => {});
    // OAuth tokens are never persisted or returned to the browser.
  }
}
export async function sweepMemberships(limit = 3) {
  const environment = billingEnvironment();
  if (environment === "disabled") return 0;
  await getDb()
    .delete(billingOAuthStates)
    .where(lt(billingOAuthStates.expiresAt, new Date()));
  const rows = await getDb()
    .select()
    .from(billingMemberships)
    .where(
      and(
        eq(billingMemberships.environment, environment),
        lt(billingMemberships.checkedAt, new Date(Date.now() - RECHECK_MS)),
      ),
    )
    .orderBy(asc(billingMemberships.checkedAt))
    .limit(Math.min(limit, 3));
  for (const row of rows) {
    try {
      await reconcileMembership(row.membershipId, row.ownerId);
    } catch {
      await getDb()
        .update(billingMemberships)
        .set({ checkedAt: new Date(), refreshFailed: true })
        .where(
          and(
            eq(billingMemberships.membershipId, row.membershipId),
            eq(billingMemberships.environment, environment),
          ),
        );
    }
  }
  return rows.length;
}
