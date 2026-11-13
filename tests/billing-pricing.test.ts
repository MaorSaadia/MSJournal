import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { verifiedPlanOption } from "@/lib/billing/plan-verification";
import { configuredPlanReferences, whopConfig } from "@/lib/billing/config";
import { configuredPlans, startCheckout } from "@/lib/billing/provider";
import { annualEquivalent, annualSaving } from "@/lib/billing/pricing";
const scope = { businessId: "biz_fixture", productId: "prod_fixture" };
const monthly = { id: "plan_monthly", interval: "monthly" as const },
  annual = { id: "plan_annual", interval: "annual" as const };
const variant = (yearly = false) => ({
  id: yearly ? annual.id : monthly.id,
  account: { id: scope.businessId },
  product: { id: scope.productId },
  currency: "usd",
  billing_type: "renewal",
  billing_period: yearly ? 365 : 30,
  initial_price: 0,
  renewal_price: yearly ? 89.99 : 9.99,
  trial_period_days: null,
  initial_price_due: { amount: yearly ? "89.99" : "9.99", currency: "usd" },
  formatted_price: "Untrusted display text",
});
beforeEach(() => {
  for (const [key, value] of Object.entries({
    NODE_ENV: "development",
    DATABASE_URL: "postgresql://fixture:fixture@localhost/fixture",
    BETTER_AUTH_SECRET: "fixture_secret_at_least_32_characters",
    BETTER_AUTH_URL: "http://localhost:3000",
    WHOP_ENVIRONMENT: "sandbox",
    WHOP_API_KEY: "fixture_key",
    WHOP_BUSINESS_ID: scope.businessId,
    WHOP_PRO_PRODUCT_ID: scope.productId,
    WHOP_PRO_PLAN_IDS: "",
    WHOP_PRO_MONTHLY_PLAN_ID: monthly.id,
    WHOP_PRO_ANNUAL_PLAN_ID: "",
    WHOP_CHECKOUT_ENABLED: "true",
  }))
    vi.stubEnv(key, value);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("owner-confirmed Pro billing schedules", () => {
  it("verifies USD Monthly and Yearly amounts and intervals with stable option identities", () => {
    expect(verifiedPlanOption(variant(), monthly, scope)).toMatchObject({
      option: 0,
      interval: "monthly",
      title: "Pro Monthly",
      price: "$9.99/month",
    });
    expect(verifiedPlanOption(variant(true), annual, scope)).toMatchObject({
      option: 1,
      interval: "annual",
      title: "Pro Yearly",
      price: "$89.99/year",
    });
    expect(annualSaving).toBe("Save 25% compared with monthly billing.");
    expect(annualEquivalent).toBe(
      "About $7.50/month, billed annually at $89.99.",
    );
  });
  it("rejects wrong price, currency, cadence, scope, setup charges and trials", () => {
    for (const patch of [
      { renewal_price: 9.98 },
      { renewal_price: 9.990001 },
      { currency: "eur" },
      { billing_period: 365 },
      { billing_period: 31 },
      { billing_type: "one_time" },
      { initial_price: 9.99 },
      { trial_period_days: 7 },
      { initial_price_due: { amount: "0.00", currency: "usd" } },
      { initial_price_due: { amount: "9.99", currency: "eur" } },
      { account: { id: "biz_foreign" } },
      { product: { id: "prod_foreign" } },
      { id: "plan_foreign" },
      { initial_price_due: null },
    ])
      expect(
        verifiedPlanOption({ ...variant(), ...patch }, monthly, scope),
        JSON.stringify(patch),
      ).toBeNull();
    expect(
      verifiedPlanOption(
        { ...variant(true), renewal_price: 90 },
        annual,
        scope,
      ),
    ).toBeNull();
    expect(
      verifiedPlanOption(
        { ...variant(true), billing_period: 360 },
        annual,
        scope,
      ),
    ).toBeNull();
  });
  it("launches with Monthly only and allows an explicitly configured optional annual ID", () => {
    expect(whopConfig()?.purchasePlans).toEqual([monthly]);
    vi.stubEnv("WHOP_PRO_ANNUAL_PLAN_ID", annual.id);
    expect(whopConfig()?.purchasePlans).toEqual([monthly, annual]);
    expect(configuredPlanReferences().planIds).toEqual([monthly.id, annual.id]);
    vi.stubEnv("WHOP_PRO_ANNUAL_PLAN_ID", "not-a-plan");
    expect(whopConfig()?.purchasePlans).toEqual([monthly]);
  });
  it("preserves the legacy membership allowlist without guessing purchase intervals from several IDs", () => {
    const config = configuredPlanReferences({
      WHOP_PRO_PLAN_IDS: "plan_legacy1,plan_legacy2",
      WHOP_PRO_MONTHLY_PLAN_ID: monthly.id,
      WHOP_PRO_ANNUAL_PLAN_ID: annual.id,
    });
    expect(config.planIds).toEqual([
      "plan_legacy1",
      "plan_legacy2",
      monthly.id,
      annual.id,
    ]);
    expect(config.purchasePlans).toEqual([monthly, annual]);
    expect(
      configuredPlanReferences({ WHOP_PRO_PLAN_IDS: "plan_old" }).purchasePlans,
    ).toEqual([{ id: "plan_old", interval: "monthly" }]);
    expect(
      configuredPlanReferences({ WHOP_PRO_PLAN_IDS: "plan_a,plan_b" })
        .purchasePlans,
    ).toEqual([]);
  });
  it("does not request or display an unconfigured annual plan", async () => {
    const fetcher = vi.fn(async () => Response.json(variant()));
    vi.stubGlobal("fetch", fetcher);
    expect((await configuredPlans(whopConfig()!)).map((p) => p.option)).toEqual(
      [0],
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(startCheckout("fixture", 1)).rejects.toMatchObject({
      status: 400,
    });
  });
  it("hides an invalid or unavailable annual plan while keeping Monthly purchasable", async () => {
    vi.stubEnv("WHOP_PRO_ANNUAL_PLAN_ID", annual.id);
    for (const response of [
      Response.json({ ...variant(true), renewal_price: 99.99 }),
      new Response(null, { status: 503 }),
    ]) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url) =>
          String(url).endsWith(annual.id)
            ? response.clone()
            : Response.json(variant()),
        ),
      );
      expect(
        (await configuredPlans(whopConfig()!)).map((p) => p.option),
      ).toEqual([0]);
    }
  });
  it("shows annual only after verification and never substitutes it for a stale Monthly choice", async () => {
    vi.stubEnv("WHOP_PRO_ANNUAL_PLAN_ID", annual.id);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) =>
        Response.json(variant(String(url).endsWith(annual.id))),
      ),
    );
    expect((await configuredPlans(whopConfig()!)).map((p) => p.option)).toEqual(
      [0, 1],
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) =>
        Response.json(
          String(url).endsWith(annual.id)
            ? variant(true)
            : { ...variant(), currency: "eur" },
        ),
      ),
    );
    expect((await configuredPlans(whopConfig()!)).map((p) => p.option)).toEqual(
      [1],
    );
    await expect(startCheckout("fixture", 0)).rejects.toMatchObject({
      status: 400,
    });
  });
});
