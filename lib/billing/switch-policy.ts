import { z } from "zod";
import { D } from "@/lib/journal/processing";
import { whopMembershipSchema, type WhopMembership } from "./policy";

const money = z.object({ amount: z.string(), currency: z.literal("usd") });
const paymentMoney = z.object({
  amount: z.string().regex(/^\d+(\.\d+)?$/),
  currency: z.string().regex(/^[a-z]{3}$/),
});
const paidPeriodPayment = z.object({
  status: z.literal("paid"),
  substatus: z.literal("succeeded"),
  billing_reason: z.enum(["subscription_create", "subscription_cycle"]),
  paid_at: z.iso.datetime({ offset: true }),
  membership_id: z.string(),
  variant_id: z.string(),
  account_id: z.string(),
  product_id: z.string(),
  user: z.object({ id: z.string() }),
  total: paymentMoney,
  refunded_amount: paymentMoney,
});

export function verifiedPaidMembershipPeriod(raw: unknown, membership: WhopMembership, now: Date) {
  if (membership.status !== "active" && membership.status !== "canceling") return false;
  if (!membership.current_period_start || !membership.current_period_end || !Array.isArray(raw)) return false;
  const start = Date.parse(membership.current_period_start);
  const end = Date.parse(membership.current_period_end);
  if (now.getTime() < start || now.getTime() >= end) return false;
  return raw.some((payment: unknown) => {
    const parsed = paidPeriodPayment.safeParse(payment);
    if (!parsed.success) return false;
    const p = parsed.data;
    const paidAt = Date.parse(p.paid_at);
    return p.membership_id === membership.id &&
      p.variant_id === membership.variant_id &&
      p.account_id === membership.account.id &&
      p.product_id === membership.product_id &&
      p.user.id === membership.user_id &&
      paidAt >= start && paidAt <= now.getTime() &&
      p.total.currency === p.refunded_amount.currency &&
      new D(p.total.amount).gt(0) &&
      new D(p.refunded_amount.amount).isZero();
  });
}
export function monthlyChangeSource(raw: unknown, expected: {
  membershipId: string; whopUserId: string; businessId: string; productId: string; monthlyPlanId: string;
}) {
  const parsed = whopMembershipSchema.extend({ billing_period_days: z.literal(30), renewal_price: money }).safeParse(raw);
  if (!parsed.success) return null;
  const m = parsed.data;
  if (m.id !== expected.membershipId || m.user_id !== expected.whopUserId ||
      m.account.id !== expected.businessId || m.product_id !== expected.productId ||
      m.variant_id !== expected.monthlyPlanId || m.status !== "active" ||
      !m.current_period_end || Date.parse(m.current_period_end) <= Date.now()) return null;
  try { return new D(m.renewal_price.amount).eq("9.99") ? m : null; } catch { return null; }
}

export function verifiedAnnualPayment(raw: unknown, expected: {
  membershipId: string; userId: string; planId: string; configurationId: string; businessId: string; productId: string;
}) {
  const parsed = z.object({
    id: z.string().regex(/^pay_[A-Za-z0-9]+$/), status: z.literal("paid"), substatus: z.literal("succeeded"),
    membership_id: z.string(), variant_id: z.string(), account_id: z.string(), product_id: z.string(),
    checkout_configuration_id: z.string(), user: z.object({ id: z.string() }), currency: z.literal("usd"),
    subtotal: money, total: money, refunded_amount: money,
  }).safeParse(raw);
  if (!parsed.success) return false;
  const p = parsed.data;
  if (p.membership_id !== expected.membershipId || p.variant_id !== expected.planId ||
      p.account_id !== expected.businessId || p.product_id !== expected.productId ||
      p.checkout_configuration_id !== expected.configurationId || p.user.id !== expected.userId) return false;
  try { return new D(p.subtotal.amount).eq("89.99") && new D(p.total.amount).gte("89.99") && new D(p.refunded_amount.amount).isZero(); }
  catch { return false; }
}
