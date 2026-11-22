import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { monthlyChangeSource, verifiedAnnualPayment, verifiedPaidMembershipPeriod } from "@/lib/billing/switch-policy";
import { whopMembershipSchema } from "@/lib/billing/policy";
const scope = { membershipId: "mem_monthly", whopUserId: "user_buyer", businessId: "biz_fixture", productId: "prod_fixture", monthlyPlanId: "plan_monthly" };
const monthly = () => ({ id: scope.membershipId, user_id: scope.whopUserId, account: { id: scope.businessId },
  product_id: scope.productId, variant_id: scope.monthlyPlanId, status: "active", billing_period_days: 30,
  renewal_price: { amount: "9.99", currency: "usd" }, current_period_end: new Date(Date.now() + 86400000).toISOString(),
  updated_at: new Date().toISOString(), expires_at: null, cancel_at_period_end: false, manage_url: null, metadata: {},
});
const paidScope = { membershipId: "mem_yearly", userId: "user_buyer", planId: "plan_yearly", configurationId: "ch_fixture", businessId: "biz_fixture", productId: "prod_fixture" };
const payment = () => ({ id: "pay_fixture", status: "paid", substatus: "succeeded", membership_id: paidScope.membershipId,
  user: { id: paidScope.userId }, variant_id: paidScope.planId, account_id: paidScope.businessId, product_id: paidScope.productId,
  checkout_configuration_id: paidScope.configurationId, currency: "usd", subtotal: { amount: "89.99", currency: "usd" },
  total: { amount: "106.19", currency: "usd" }, refunded_amount: { amount: "0.00", currency: "usd" },
});
describe("verified monthly-to-yearly change boundaries", () => {
  it("accepts only the owner's current $9.99 USD monthly subscription", () => {
    expect(monthlyChangeSource(monthly(), scope)).not.toBeNull();
    for (const patch of [{ user_id: "user_other" }, { variant_id: "plan_other" }, { account: { id: "biz_other" } },
      { billing_period_days: 365 }, { renewal_price: { amount: "10.00", currency: "usd" } },
      { status: "past_due" }, { current_period_end: "2020-01-01T00:00:00Z" }])
      expect(monthlyChangeSource({ ...monthly(), ...patch }, scope)).toBeNull();
  });
  it("requires paid, unrefunded yearly payment tied to the exact checkout, owner and plan", () => {
    expect(verifiedAnnualPayment(payment(), paidScope)).toBe(true);
    for (const patch of [{ status: "pending" }, { status: "open" }, { substatus: "refunded" }, { substatus: "dispute_under_review" },
      { membership_id: "mem_other" }, { user: { id: "user_other" } }, { account_id: "biz_other" }, { product_id: "prod_other" },
      { variant_id: "plan_other" }, { checkout_configuration_id: "ch_other" }, { currency: "eur" },
      { subtotal: { amount: "89.98", currency: "usd" } }, { total: { amount: "0.00", currency: "usd" } },
      { refunded_amount: { amount: "1.00", currency: "usd" } }])
      expect(verifiedAnnualPayment({ ...payment(), ...patch }, paidScope)).toBe(false);
  });
});

describe("paid membership verification for Whop admins", () => {
  const now = new Date("2026-11-22T17:26:00Z");
  const membership = whopMembershipSchema.parse({
    ...monthly(),
    id: paidScope.membershipId,
    variant_id: paidScope.planId,
    current_period_start: "2026-11-22T17:00:08Z",
    current_period_end: "2027-11-22T17:00:08Z",
  });
  const paid = {
    ...payment(),
    billing_reason: "subscription_create",
    paid_at: "2026-11-22T17:00:10Z",
    total: { amount: "1.02", currency: "usd" },
  };
  it("requires a positive, unrefunded subscription payment tied to the member and current period", () => {
    expect(verifiedPaidMembershipPeriod([paid], membership, now)).toBe(true);
    expect(verifiedPaidMembershipPeriod([{ ...paid, billing_reason: "subscription_cycle" }], { ...membership, status: "canceling" }, now)).toBe(true);
    expect(verifiedPaidMembershipPeriod([], membership, now)).toBe(false);
    expect(verifiedPaidMembershipPeriod([paid], membership, new Date(membership.current_period_end!))).toBe(false);
    expect(verifiedPaidMembershipPeriod([paid], { ...membership, status: "expired" }, now)).toBe(false);
    for (const patch of [
      { paid_at: "2025-11-22T17:00:10Z" },
      { paid_at: "2026-11-22T17:30:00Z" },
      { status: "pending" },
      { substatus: "partially_refunded" },
      { refunded_amount: { amount: "0.01", currency: "usd" } },
      { total: { amount: "0", currency: "usd" } },
      { billing_reason: "one_time" },
      { membership_id: "mem_other" },
      { account_id: "biz_other" },
      { product_id: "prod_other" },
      { variant_id: "plan_other" },
      { user: { id: "user_other" } },
    ]) expect(verifiedPaidMembershipPeriod([{ ...paid, ...patch }], membership, now)).toBe(false);
  });
});
