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
const eventSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.string().max(100),
  api_version: z.literal("v1"),
  api_version_date: z.literal(WHOP_API_VERSION),
  account_id: z.string(),
  data: z
    .object({
      id: z.string(),
      membership_id: z.string().nullable().optional(),
      payment_id: z.string().nullable().optional(),
      membership: z.object({ id: z.string() }).nullable().optional(),
    })
    .passthrough(),
});
export function verifiedWebhook(raw: string, headers: Headers, key: string) {
  let event: unknown;
  try {
    event = unwrapWebhook(raw, { headers: Object.fromEntries(headers), key });
  } catch {
    throw new ReviewError("Webhook signature verification failed.", 401);
  }
  const parsed = eventSchema.safeParse(event);
  if (!parsed.success || parsed.data.id !== headers.get("webhook-id"))
    throw new ReviewError("Unsupported webhook envelope or API version.", 400);
  return parsed.data;
}
export async function acceptWebhook(raw: string, headers: Headers) {
  const config = whopConfig(),
    key = process.env.WHOP_WEBHOOK_SECRET;
  if (!config || !key) throw new ReviewError("Webhook is not configured.", 503);
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
