import "server-only";
import { z } from "zod";
import { D } from "@/lib/journal/processing";
import { liveAnnualTestAmount, liveAnnualTestOption, proPricing, type PurchasePlan, type VerifiedPlanOption } from "./pricing";
const variantSchema = z.object({
  id: z.string(),
  account: z.object({ id: z.string() }).nullable(),
  product: z.object({ id: z.string() }).nullable(),
  billing_type: z.literal("renewal"),
  currency: z.literal("usd"),
  billing_period: z.number(),
  initial_price: z.number().finite(),
  renewal_price: z.number().finite(),
  trial_period_days: z.number().nullable(),
  initial_price_due: z.object({
    amount: z.string().regex(/^\d+(\.\d+)?$/),
    currency: z.literal("usd"),
  }),
});
export function verifiedPlanOption(
  raw: unknown,
  expected: PurchasePlan,
  scope: { businessId: string; productId: string },
  allowLiveAnnualTest = false,
): (VerifiedPlanOption & { id: string }) | null {
  const result = variantSchema.safeParse(raw);
  if (!result.success) return null;
  const p = result.data,
    price = proPricing[expected.interval];
  const liveTest = allowLiveAnnualTest && expected.interval === "annual" &&
    new D(p.renewal_price).eq(liveAnnualTestAmount);
  const amount = liveTest ? liveAnnualTestAmount : price.amount;
  // Whop adds initial_price to the first renewal. Reject setup charges, trials,
  // other currencies, and near-but-not-equal amounts; formatted_price isn't proof.
  if (
    p.id !== expected.id ||
    p.account?.id !== scope.businessId ||
    p.product?.id !== scope.productId ||
    p.billing_period !== price.days ||
    !new D(p.initial_price).isZero() ||
    !new D(p.renewal_price).eq(amount) ||
    !new D(p.initial_price_due.amount).eq(amount) ||
    (p.trial_period_days ?? 0) !== 0
  )
    return null;
  return {
    id: p.id,
    interval: expected.interval,
    option: liveTest ? liveAnnualTestOption : price.option,
    title: price.title,
    price: liveTest ? `$${liveAnnualTestAmount}/year` : price.price,
    ...(liveTest ? { liveTest: true } : {}),
  };
}
