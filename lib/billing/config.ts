import "server-only";
import { siteUrl } from "@/lib/seo";
import { readConfig } from "@/lib/config";
import type { WhopEnvironment } from "./policy";
import type { PurchasePlan } from "./pricing";
export function configuredPlanReferences(
  env: Record<string, string | undefined> = process.env,
) {
  const legacy = (env.WHOP_PRO_PLAN_IDS ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const monthly =
    env.WHOP_PRO_MONTHLY_PLAN_ID?.trim() ||
    (legacy.length === 1 ? legacy[0] : undefined);
  const annualCandidate = env.WHOP_PRO_ANNUAL_PLAN_ID?.trim();
  const annual =
    annualCandidate && /^plan_[A-Za-z0-9]+$/.test(annualCandidate)
      ? annualCandidate
      : undefined;
  const purchasePlans: PurchasePlan[] = [];
  if (monthly) purchasePlans.push({ id: monthly, interval: "monthly" });
  if (
    annual &&
    annual !== monthly &&
    env.WHOP_ANNUAL_CHECKOUT_ENABLED === "true"
  )
    purchasePlans.push({ id: annual, interval: "annual" });
  return {
    planIds: [
      ...new Set([
        ...legacy,
        ...(monthly ? [monthly] : []),
        ...(annual ? [annual] : []),
      ]),
    ],
    purchasePlans,
  };
}
export function billingEnvironment(): WhopEnvironment | "disabled" {
  const value = process.env.WHOP_ENVIRONMENT;
  if (value !== "sandbox" && value !== "live") return "disabled";
  if (process.env.NODE_ENV === "production" && value === "sandbox")
    return "disabled";
  return value;
}
export function whopConfig(invalidSettings?: string[]) {
  const environment = billingEnvironment(),
    apiKey = process.env.WHOP_API_KEY;
  const businessId = process.env.WHOP_BUSINESS_ID,
    productId =
      process.env.WHOP_PRO_PRODUCT_ID?.trim() ||
      process.env.WHOP_PRO_MONTHLY_PRODUCT_ID?.trim();
  const { planIds, purchasePlans } = configuredPlanReferences();
  const validBusiness = /^biz_[A-Za-z0-9]+$/.test(businessId ?? "");
  const validProduct = /^prod_[A-Za-z0-9]+$/.test(productId ?? "");
  const validPlans = planIds.length > 0 && planIds.length <= 5 &&
    planIds.every((p) => /^plan_[A-Za-z0-9]+$/.test(p));
  if (
    environment === "disabled" ||
    !apiKey ||
    !validBusiness ||
    !validProduct ||
    !validPlans
  ) {
    if (environment === "disabled") invalidSettings?.push("WHOP_ENVIRONMENT");
    if (!apiKey) invalidSettings?.push("WHOP_API_KEY");
    if (!validBusiness) invalidSettings?.push("WHOP_BUSINESS_ID");
    if (!validProduct) invalidSettings?.push("WHOP_PRO_PRODUCT_ID");
    if (!validPlans) invalidSettings?.push("WHOP_PRO_MONTHLY_PLAN_ID / WHOP_PRO_PLAN_IDS");
    return null;
  }
  return {
    environment,
    apiKey,
    businessId: businessId!,
    productId: productId!,
    planIds,
    purchasePlans,
    apiBase:
      environment === "sandbox"
        ? "https://sandbox-api.whop.com/api/v1"
        : "https://api.whop.com/api/v1",
    oauthBase:
      environment === "sandbox"
        ? "https://sandbox-api.whop.com/oauth"
        : "https://api.whop.com/oauth",
    origin:
      process.env.NODE_ENV === "production"
        ? siteUrl
        : new URL(readConfig().BETTER_AUTH_URL).origin,
    checkoutEnabled:
      process.env.WHOP_CHECKOUT_ENABLED === "true" &&
      (environment !== "live" || process.env.WHOP_LIVE_VERIFIED === "true"),
    clientId: process.env.WHOP_OAUTH_CLIENT_ID,
  };
}
