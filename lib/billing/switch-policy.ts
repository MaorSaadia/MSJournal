import { z } from "zod";
import { D } from "@/lib/journal/processing";
import { whopMembershipSchema } from "./policy";

const money = z.object({ amount: z.string(), currency: z.literal("usd") });
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
