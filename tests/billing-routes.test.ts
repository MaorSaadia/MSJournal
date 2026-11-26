import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { affiliateJoinUrl, affiliateReferralCookie } from "@/lib/affiliates";
const mocks = vi.hoisted(() => ({
  configured: true,
  signedIn: true,
  checkout: vi.fn(),
  link: vi.fn(),
  refresh: vi.fn(),
  select: vi.fn(),
  status: vi.fn(),
  drain: vi.fn(),
  sweep: vi.fn(),
  cancel: vi.fn(),
  annualChange: vi.fn(),
  retryChanges: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: vi.fn(),
}));
vi.mock("@/lib/billing/config", () => ({
  whopConfig: () => (mocks.configured ? {} : null),
  billingEnvironment: () => "sandbox",
}));
vi.mock("@/lib/session", () => {
  class UnauthorizedError extends Error {}
  return {
    UnauthorizedError,
    requireUser: async () => {
      if (!mocks.signedIn) throw new UnauthorizedError("Sign in");
      return { id: "session-owner", email: "owner@example.test" };
    },
  };
});
vi.mock("@/lib/billing/status", () => ({ billingStatus: mocks.status }));
vi.mock("@/lib/billing/cancellation", () => ({ cancelRenewal: mocks.cancel }));
vi.mock("@/lib/billing/switching", () => ({ startAnnualChange: mocks.annualChange, retryAnnualChanges: mocks.retryChanges }));
vi.mock("@/lib/billing/provider", () => ({
  startCheckout: mocks.checkout,
  startRecovery: mocks.link,
  refreshOwner: mocks.refresh,
  sweepMemberships: mocks.sweep,
}));
vi.mock("@/lib/billing/webhooks", () => ({ drainBillingEvents: mocks.drain }));
vi.mock("@/lib/billing/entitlements", async (original) => ({
  ...(await original<object>()),
  chooseFreeAccount: mocks.select,
}));
import { POST } from "@/app/api/billing/route";
import { GET as reconcile } from "@/app/api/billing/reconcile/route";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.signedIn = true;
  mocks.configured = true;
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  vi.stubEnv("DATABASE_URL", "postgresql://fixture:fixture@localhost/fixture");
  vi.stubEnv(
    "BETTER_AUTH_SECRET",
    "fixture_only_secret_at_least_32_characters",
  );
  mocks.checkout.mockResolvedValue({
    url: "https://sandbox.whop.com/checkout/fixture",
  });
  mocks.status.mockResolvedValue({ plan: "Free" });
});
const request = (body: object, origin = "http://localhost:3000", cookie = "") =>
  new NextRequest("http://localhost:3000/api/billing", {
    method: "POST",
    headers: { origin, cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
afterEach(() => vi.unstubAllEnvs());
describe("billing request boundaries", () => {
  it("starts an annual change only for the session owner, without accepting plan, source or payment claims", async () => {
    mocks.signedIn = false;
    expect((await POST(request({ action: "switch_annual" }))).status).toBe(401);
    mocks.signedIn = true;
    expect((await POST(request({ action: "switch_annual" }, "https://foreign.example"))).status).toBe(403);
    for (const extra of [{ fromMembershipId: "mem_other" }, { ownerId: "other" }, { paid: true }, { option: 0 }])
      expect((await POST(request({ action: "switch_annual", ...extra }))).status).toBe(400);
    expect(mocks.annualChange).not.toHaveBeenCalled();
    mocks.annualChange.mockResolvedValue({ url: "https://sandbox.whop.com/checkout/ch_fixture" });
    expect((await POST(request({ action: "switch_annual" }))).status).toBe(200);
    expect(mocks.annualChange).toHaveBeenCalledExactlyOnceWith("session-owner");
  });
  it("cancels only for the session owner and rejects client timing or membership claims", async () => {
    mocks.signedIn = false;
    expect((await POST(request({ action: "cancel" }))).status).toBe(401);
    mocks.signedIn = true;
    expect((await POST(request({ action: "cancel" }, "https://foreign.example"))).status).toBe(403);
    for (const claim of [{ membershipId: "mem_foreign" }, { ownerId: "other" }, { cancel_at_period_end: false }])
      expect((await POST(request({ action: "cancel", ...claim }))).status).toBe(400);
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect((await POST(request({ action: "cancel" }))).status).toBe(200);
    expect(mocks.cancel).toHaveBeenCalledExactlyOnceWith("session-owner");
  });
  it("requires a local authenticated session and exact origin", async () => {
    mocks.signedIn = false;
    expect(
      (await POST(request({ action: "checkout", option: 0 }))).status,
    ).toBe(401);
    mocks.signedIn = true;
    expect(
      (
        await POST(
          request({ action: "checkout", option: 0 }, "https://foreign.example"),
        )
      ).status,
    ).toBe(403);
    expect(mocks.checkout).not.toHaveBeenCalled();
  });
  it("rejects client membership/owner/plan claims and uses the session owner", async () => {
    for (const claim of [
      { membershipId: "mem_forged" },
      { ownerId: "foreign" },
      { planId: "plan_forged" },
      { email: "other@example.test" },
    ])
      expect(
        (await POST(request({ action: "checkout", option: 0, ...claim })))
          .status,
      ).toBe(400);
    expect(mocks.checkout).not.toHaveBeenCalled();
    const response = await POST(request({ action: "checkout", option: 0 }));
    expect(response.status).toBe(200);
    expect(mocks.checkout).toHaveBeenCalledWith("session-owner", 0, undefined, "owner@example.test", undefined);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("carries a Whop referral into the signed-in checkout and ignores invalid or client-supplied codes", async () => {
    const landing = proxy(new NextRequest("https://www.msjournal.app/?a=trader_one&campaign=video"));
    expect(landing.headers.get("location")).toBe("https://www.msjournal.app/?campaign=video");
    expect(landing.cookies.get(affiliateReferralCookie)).toMatchObject({
      value: "trader_one", httpOnly: true, secure: true, sameSite: "lax", path: "/api/billing",
    });
    const cookie = landing.headers.get("set-cookie")!.split(";")[0];
    const checkout = { action: "checkout", option: 0 };
    const origin = "http://localhost:3000";
    mocks.signedIn = false;
    expect((await POST(request(checkout, origin, cookie))).status).toBe(401);
    mocks.signedIn = true;
    expect((await POST(request({ ...checkout, affiliate_code: "forged" }, origin, cookie))).status).toBe(400);
    expect((await POST(request(checkout, origin, cookie))).status).toBe(200);
    expect(mocks.checkout).toHaveBeenCalledExactlyOnceWith("session-owner", 0, undefined, "owner@example.test", "trader_one");
    for (const query of ["a=one&a=two", "a=%3Cscript%3E", "a="]) {
      const result = proxy(new NextRequest(`https://www.msjournal.app/?${query}`));
      expect(result.headers.get("location")).toBe("https://www.msjournal.app/");
      expect(result.cookies.has(affiliateReferralCookie)).toBe(false);
    }
  });
  it("keeps enrollment closed without a configured Whop destination and rejects checkout and dashboard links", () => {
    for (const url of ["", "http://whop.com/join", "https://evil.example/join", "https://whop.com/dashboard/biz_fixture", "https://whop.com/product/checkout/plan_fixture", "https://whop.com/store?a=affiliate"])
      expect(affiliateJoinUrl(url)).toBeNull();
    expect(affiliateJoinUrl("https://whop.com/msjournal/affiliate-program/")).toBe("https://whop.com/msjournal/affiliate-program/");
  });
  it("requires the scheduler secret and does not starve reconciliation behind retrying events", async () => {
    vi.stubEnv("BILLING_RECONCILE_SECRET", "fixture_scheduler_secret");
    expect(
      (await reconcile(new Request("http://localhost/api/billing/reconcile")))
        .status,
    ).toBe(401);
    expect(
      (
        await reconcile(
          new Request("http://localhost/api/billing/reconcile", {
            headers: { authorization: "Bearer different" },
          }),
        )
      ).status,
    ).toBe(401);
    mocks.drain.mockResolvedValue(1);
    mocks.sweep.mockResolvedValue(1);
    const result = await reconcile(
      new Request("http://localhost/api/billing/reconcile", {
        headers: { authorization: "Bearer fixture_scheduler_secret" },
      }),
    );
    expect(result.status).toBe(200);
    expect(mocks.sweep).toHaveBeenCalledWith(1);
    mocks.configured = false;
    mocks.sweep.mockClear();
    const unconfigured = await reconcile(
      new Request("http://localhost/api/billing/reconcile", {
        headers: { authorization: "Bearer fixture_scheduler_secret" },
      }),
    );
    expect(unconfigured.status).toBe(503);
    expect(mocks.sweep).not.toHaveBeenCalled();
  });
});
