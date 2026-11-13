// Owner-confirmed prices. Monthly and annual are billing schedules of one Pro tier.
export const proPricing = {
  monthly: {
    option: 0,
    title: "Pro Monthly",
    amount: "9.99",
    days: 30,
    price: "$9.99/month",
  },
  annual: {
    option: 1,
    title: "Pro Yearly",
    amount: "89.99",
    days: 365,
    price: "$89.99/year",
  },
} as const;
export type ProInterval = keyof typeof proPricing;
export const annualSaving = "Save 25% compared with monthly billing.";
export const annualEquivalent = "About $7.50/month, billed annually at $89.99.";
export type PurchasePlan = { id: string; interval: ProInterval };
export type VerifiedPlanOption = {
  option: number;
  interval: ProInterval;
  title: string;
  price: string;
};
