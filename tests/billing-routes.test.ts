import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  signedIn: true,
  checkout: vi.fn(),
  link: vi.fn(),
  refresh: vi.fn(),
  select: vi.fn(),
  status: vi.fn(),
  drain: vi.fn(),
  sweep: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/session", () => {
  class UnauthorizedError extends Error {}
  return {
    UnauthorizedError,
    requireUser: async () => {
      if (!mocks.signedIn) throw new UnauthorizedError("Sign in");
      return { id: "session-owner" };
    },
  };
});
vi.mock("@/lib/billing/status", () => ({ billingStatus: mocks.status }));
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
const request = (body: object, origin = "http://localhost:3000") =>
  new Request("http://localhost:3000/api/billing", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
afterEach(() => vi.unstubAllEnvs());
describe("billing request boundaries", () => {
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
    ])
      expect(
        (await POST(request({ action: "checkout", option: 0, ...claim })))
          .status,
      ).toBe(400);
    expect(mocks.checkout).not.toHaveBeenCalled();
    const response = await POST(request({ action: "checkout", option: 0 }));
    expect(response.status).toBe(200);
    expect(mocks.checkout).toHaveBeenCalledWith("session-owner", 0);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
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
  });
});
