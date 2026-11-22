import "server-only";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { unwrapWebhook } from "@whop/sdk/helpers";
import { getDb } from "@/db/client";
import { billingWebhookEvents } from "@/db/schema";
import { ReviewError } from "@/lib/reviews/model";
import { whopConfig } from "./config";
import { WHOP_API_VERSION } from "./policy";
import { reconcileMembership, sweepMemberships, whopRequest } from "./provider";
import { completeAnnualChange } from "./switching";

export const billingEvents = [
  "membership.activated",
  "membership.updated",
  "payment.succeeded",
  "payment.failed",
  "payment.requires_action",
  "refund.created",
  "refund.updated",
  "dispute.created",
  "dispute.updated",
];
let loggedWebhookConfigError = false;
const eventSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.string().max(100),
  api_version: z.literal("v1"),
  // Both signed envelope versions use the fields consumed below. Provider
  // reads remain pinned independently; an event body never grants access.
  api_version_date: z.enum([WHOP_API_VERSION, "2026-11-14-1"]),
  account_id: z.string().min(1).nullish(),
  company_id: z.string().min(1).nullish(),
  data: z
    .object({
      id: z.string(),
      membership_id: z.string().nullable().optional(),
      payment_id: z.string().nullable().optional(),
      membership: z.object({ id: z.string() }).nullable().optional(),
    })
    .passthrough(),
});
const membershipAccountSchema = z.object({
  account: z.object({ id: z.string().min(1) }),
});
const paymentAccountSchema = z.object({
  account_id: z.string().min(1),
});
export function verifiedWebhook(raw: string, headers: Headers, key: string) {
  let event: unknown;
  try {
    event = unwrapWebhook(raw, { headers: Object.fromEntries(headers), key });
  } catch {
    throw new ReviewError("Webhook signature verification failed.", 401);
  }
  const parsed = eventSchema.safeParse(event);
  if (!parsed.success) {
    // Report schema paths only. Never return webhook field values or headers.
    const fields = [...new Set(parsed.error.issues.map(
      (issue) => issue.path.join(".") || "body",
    ))];
    throw new ReviewError(
      `Unsupported webhook envelope (invalid fields: ${fields.join(", ")}).`,
      400,
    );
  }
  if (parsed.data.id !== headers.get("webhook-id"))
    throw new ReviewError("Unsupported webhook envelope (id does not match webhook-id).", 400);
  const { account_id, company_id, ...envelope } = parsed.data;
  // Whop uses company_id in the legacy v1 envelope. The REST API pin and
  // provider-side membership verification are independent of this field name.
  if (account_id && company_id && account_id !== company_id)
    throw new ReviewError("Unsupported webhook envelope (account_id and company_id disagree).", 400);
  const envelopeAccountId = account_id ?? company_id;
  const membershipAccount = envelope.type.startsWith("membership.")
    ? membershipAccountSchema.safeParse(envelope.data)
    : undefined;
  const membershipAccountId = membershipAccount?.success
    ? membershipAccount.data.account.id
    : undefined;
  const paymentAccount = envelope.type.startsWith("payment.")
    ? paymentAccountSchema.safeParse(envelope.data)
    : undefined;
  const payloadAccountId = paymentAccount?.success
    ? paymentAccount.data.account_id
    : membershipAccountId;
  if (envelopeAccountId && payloadAccountId && envelopeAccountId !== payloadAccountId)
    throw new ReviewError("Unsupported webhook envelope (payload account disagrees with the envelope).", 400);
  const accountId = envelopeAccountId ?? payloadAccountId;
  if (!accountId)
    throw new ReviewError("Unsupported webhook envelope (no business account ID).", 400);
  return { ...envelope, account_id: accountId };
}
export async function acceptWebhook(raw: string, headers: Headers) {
  const invalidSettings: string[] = [];
  const config = whopConfig(invalidSettings);
  const key = process.env.WHOP_WEBHOOK_SECRET;
  if (!config || !key) {
    if (!key) invalidSettings.push("WHOP_WEBHOOK_SECRET");
    if (process.env.NODE_ENV === "production" && !loggedWebhookConfigError) {
      loggedWebhookConfigError = true;
      console.warn("[Whop webhook] Missing or invalid settings", invalidSettings);
    }
    throw new ReviewError("Webhook is not configured.", 503);
  }
  const event = verifiedWebhook(raw, headers, key);
  if (event.account_id !== config.businessId)
    throw new ReviewError("Webhook account is not configured.", 403);
  const supported = billingEvents.includes(event.type);
  const membershipId = event.type.startsWith("membership.")
    ? event.data.id
    : (event.data.membership_id ?? event.data.membership?.id ?? null);
  const paymentId = event.type.startsWith("payment.")
    ? event.data.id
    : (event.data.payment_id ?? null);
  await getDb()
    .insert(billingWebhookEvents)
    .values({
      environment: config.environment,
      eventId: event.id,
      type: event.type,
      membershipId:
        membershipId && /^mem_[A-Za-z0-9]+$/.test(membershipId)
          ? membershipId
          : null,
      paymentId:
        paymentId && /^pay_[A-Za-z0-9]+$/.test(paymentId) ? paymentId : null,
      state: supported ? "pending" : "ignored",
    })
    .onConflictDoNothing();
  return { environment: config.environment, id: event.id, supported };
}
export async function processBillingEvent(
  environment: "sandbox" | "live",
  id: string,
) {
  if (whopConfig()?.environment !== environment) return;
  await getDb().transaction(async (tx) => {
    const [event] = await tx
      .select()
      .from(billingWebhookEvents)
      .where(
        and(
          eq(billingWebhookEvents.environment, environment),
          eq(billingWebhookEvents.eventId, id),
        ),
      )
      .for("update", { skipLocked: true });
    if (!event || ["processed", "ignored"].includes(event.state)) return;
    let state: "processed" | "failed" | "ignored" = "processed",
      lastError: string | null = null;
    try {
      let membershipId = event.membershipId;
      if (!membershipId && event.paymentId) {
        const payment = await whopRequest(`/payments/${event.paymentId}`);
        const candidate = payment.membership_id ?? payment.membership?.id;
        if (
          typeof candidate === "string" &&
          /^mem_[A-Za-z0-9]+$/.test(candidate)
        )
          membershipId = candidate;
      }
      if (membershipId) {
        const result = await reconcileMembership(membershipId);
        if (!result.linked) {
          state = "failed";
          lastError = "awaiting_secure_link";
        }
        if (result.linked) await completeAnnualChange(membershipId);
      } else {
        await sweepMemberships(1);
      }
    } catch (e) {
      if (e instanceof ReviewError && [403, 409].includes(e.status)) {
        state = "ignored";
        lastError = "scope_or_link_conflict";
      } else {
        state = "failed";
        lastError = "reconciliation_failed";
      }
    }
    await tx
      .update(billingWebhookEvents)
      .set({
        state,
        lastError,
        attempts: event.attempts + 1,
        processedAt: new Date(),
      })
      .where(
        and(
          eq(billingWebhookEvents.environment, environment),
          eq(billingWebhookEvents.eventId, id),
        ),
      );
  });
}
export async function drainBillingEvents() {
  const config = whopConfig();
  if (!config) return 0;
  const events = await getDb()
    .select()
    .from(billingWebhookEvents)
    .where(
      and(
        eq(billingWebhookEvents.environment, config.environment),
        inArray(billingWebhookEvents.state, ["pending", "failed"]),
        or(
          eq(billingWebhookEvents.state, "pending"),
          sql`${billingWebhookEvents.processedAt}<now()-interval '1 minute'`,
        ),
      ),
    )
    .orderBy(
      sql`${billingWebhookEvents.processedAt} asc nulls first`,
      asc(billingWebhookEvents.receivedAt),
    )
    .limit(1);
  for (const event of events)
    await processBillingEvent(config.environment, event.eventId);
  return events.length;
}
