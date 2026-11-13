import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
vi.mock("server-only", () => ({}));
import {
  deriveEntitlement,
  verifiedLease,
  safeWhopUrl,
  WHOP_API_VERSION,
  whopMembershipSchema,
} from "@/lib/billing/policy";
import { billingEnvironment, whopConfig } from "@/lib/billing/config";
import { verifiedWebhook } from "@/lib/billing/webhooks";
const now = new Date("2026-11-13T10:00:00Z");
const membership = () =>
  whopMembershipSchema.parse({
    id: "mem_fixture",
    account: { id: "biz_fixture" },
    product_id: "prod_fixture",
    variant_id: "plan_fixture",
    user_id: "user_fixture",
    status: "active",
    updated_at: now.toISOString(),
    current_period_end: "2026-12-01T10:00:00Z",
    expires_at: null,
    cancel_at_period_end: false,
    manage_url: "https://whop.com/billing/manage/mber_fixture",
    metadata: {},
  });
afterEach(() => vi.unstubAllEnvs());
describe("billing access policy", () => {
  it("keeps archived accounts in usage and excess accounts readable", () => {
    const accounts = [
      { id: "one", name: "One", archived: true },
      { id: "two", name: "Two", archived: false },
    ];
    expect(deriveEntitlement(accounts, null, false)).toMatchObject({
      usage: 2,
      needsSelection: true,
      accounts: [{ writable: false }, { writable: false }],
    });
    expect(
      deriveEntitlement(accounts, "one", false).accounts.map((a) => a.writable),
    ).toEqual([true, false]);
    expect(
      deriveEntitlement(accounts, "one", true).accounts.map((a) => a.writable),
    ).toEqual([true, true]);
    expect(deriveEntitlement(accounts, "deleted", false)).toMatchObject({
      freeAccountId: null,
      needsSelection: true,
    });
  });
  it("preserves cancellation time and caps outage access by verified lease/expiry", () => {
    const m = membership();
    expect(
      verifiedLease(
        { ...m, cancel_at_period_end: true },
        true,
        now,
      ).toISOString(),
    ).toBe("2026-11-13T16:00:00.000Z");
    expect(
      verifiedLease(
        { ...m, current_period_end: "2026-11-13T11:00:00Z" },
        true,
        now,
      ).toISOString(),
    ).toBe("2026-11-13T11:00:00.000Z");
    expect(
      verifiedLease(
        { ...m, expires_at: "2026-11-13T10:30:00Z" },
        true,
        now,
      ).toISOString(),
    ).toBe("2026-11-13T10:30:00.000Z");
    for (const status of [
      "canceled",
      "expired",
      "unresolved",
      "drafted",
    ] as const)
      expect(verifiedLease({ ...m, status }, true, now)).toEqual(now);
    expect(verifiedLease(m, false, now)).toEqual(now);
  });
  it("uses authoritative access for payment issues, not a universal failed-payment rule", () => {
    const m = {
      ...membership(),
      status: "past_due" as const,
      current_period_end: "2026-11-12T10:00:00Z",
    };
    expect(verifiedLease(m, true, now).toISOString()).toBe(
      "2026-11-13T10:15:00.000Z",
    );
    expect(verifiedLease(m, false, now)).toEqual(now);
  });
  it("rejects unsafe provider destinations and environment mixing", () => {
    expect(
      safeWhopUrl(
        "https://sandbox.whop.com/checkout/ch_fixture",
        "sandbox",
        "checkout",
      ),
    ).toContain("sandbox.whop.com");
    for (const url of [
      "https://whop.com.evil.test/checkout/ch_fixture",
      "https://user:pass@whop.com/checkout/ch_fixture",
      "http://whop.com/checkout/ch_fixture",
      "https://whop.com/anything",
      "https://sandbox.whop.com/checkout/ch_fixture",
    ])
      expect(() => safeWhopUrl(url, "live", "checkout")).toThrow();
    vi.stubEnv("WHOP_ENVIRONMENT", "sandbox");
    vi.stubEnv("NODE_ENV", "production");
    expect(billingEnvironment()).toBe("disabled");
    vi.stubEnv("WHOP_ENVIRONMENT", "live");
    vi.stubEnv("WHOP_API_KEY", "fixture");
    vi.stubEnv("WHOP_BUSINESS_ID", "biz_fixture");
    vi.stubEnv("WHOP_PRO_PRODUCT_ID", "prod_fixture");
    vi.stubEnv("WHOP_PRO_PLAN_IDS", "plan_fixture");
    vi.stubEnv("WHOP_PRO_MONTHLY_PLAN_ID", "plan_fixture");
    vi.stubEnv("WHOP_PRO_ANNUAL_PLAN_ID", "");
    vi.stubEnv("WHOP_CHECKOUT_ENABLED", "true");
    vi.stubEnv("WHOP_LIVE_VERIFIED", "false");
    expect(whopConfig()?.checkoutEnabled).toBe(false);
    vi.stubEnv("WHOP_LIVE_VERIFIED", "true");
    expect(whopConfig()?.checkoutEnabled).toBe(true);
  });
});
describe("Whop Standard Webhooks verification", () => {
  const key = "ws_fixture_only_not_a_provider_secret";
  function signed(body: string, timestamp = Math.floor(Date.now() / 1000)) {
    const id = "msg_fixture",
      signature = createHmac("sha256", key)
        .update(`${id}.${timestamp}.${body}`)
        .digest("base64");
    return new Headers({
      "webhook-id": id,
      "webhook-timestamp": String(timestamp),
      "webhook-signature": `v1,${signature}`,
    });
  }
  const raw = () =>
    JSON.stringify({
      id: "msg_fixture",
      type: "membership.updated",
      api_version: "v1",
      api_version_date: WHOP_API_VERSION,
      account_id: "biz_fixture",
      data: { id: "mem_fixture" },
    });
  it("accepts a signed raw body and rejects tampering, missing signatures and replay", () => {
    const body = raw(),
      headers = signed(body);
    expect(verifiedWebhook(body, headers, key).type).toBe("membership.updated");
    expect(() => verifiedWebhook(body + " ", headers, key)).toThrow(
      "signature",
    );
    expect(() => verifiedWebhook(body, new Headers(), key)).toThrow(
      "signature",
    );
    expect(() =>
      verifiedWebhook(
        body,
        signed(body, Math.floor(Date.now() / 1000) - 601),
        key,
      ),
    ).toThrow("signature");
  });
  it("rejects authentic envelopes pinned to the wrong API or with another event ID", () => {
    const body = raw().replace(WHOP_API_VERSION, "2020-01-01");
    expect(() => verifiedWebhook(body, signed(body), key)).toThrow("envelope");
    const mismatch = raw().replace('"id":"msg_fixture"', '"id":"msg_other"');
    expect(() => verifiedWebhook(mismatch, signed(mismatch), key)).toThrow(
      "envelope",
    );
  });
});
