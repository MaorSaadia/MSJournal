import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const database = vi.hoisted(() =>
  vi.fn(() => {
    throw Error("Unexpected database access before OAuth validation");
  }),
);
vi.mock("@/db/client", () => ({ getDb: database }));
import { startRecovery } from "@/lib/billing/provider";
const callback = "http://localhost:3000/api/billing/whop/callback";
beforeEach(() => {
  vi.clearAllMocks();
  for (const [key, value] of Object.entries({
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://fixture:fixture@localhost/fixture",
    BETTER_AUTH_SECRET: "fixture_only_at_least_32_characters",
    BETTER_AUTH_URL: "http://localhost:3000",
    WHOP_ENVIRONMENT: "sandbox",
    WHOP_API_KEY: "fixture",
    WHOP_BUSINESS_ID: "biz_fixture",
    WHOP_PRO_PRODUCT_ID: "prod_fixture",
    WHOP_PRO_MONTHLY_PLAN_ID: "plan_fixture",
    WHOP_PRO_PLAN_IDS: "",
    WHOP_PRO_ANNUAL_PLAN_ID: "",
    WHOP_OAUTH_CLIENT_ID: "app_fixture",
    WHOP_CHECKOUT_ENABLED: "false",
    WHOP_LIVE_VERIFIED: "false",
  }))
    vi.stubEnv(key, value);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("OAuth setup validation before linking", () => {
  it("rejects confidential apps before persisting any OAuth state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          id: "app_fixture",
          account: { id: "biz_fixture" },
          oauth_client_type: "confidential",
          redirect_uris: [callback],
        }),
      ),
    );
    await expect(startRecovery("fixture")).rejects.toMatchObject({
      status: 503,
    });
    expect(database).not.toHaveBeenCalled();
  });
  it("requires the exact callback and owning business", async () => {
    for (const patch of [
      { redirect_uris: [] },
      { redirect_uris: ["http://localhost:3000/api/auth/callback/whop"] },
      { account: { id: "biz_foreign" } },
      { id: "app_foreign" },
    ]) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          Response.json({
            id: "app_fixture",
            account: { id: "biz_fixture" },
            oauth_client_type: "public",
            redirect_uris: [callback],
            ...patch,
          }),
        ),
      );
      await expect(startRecovery("fixture")).rejects.toMatchObject({
        status: 503,
      });
    }
    expect(database).not.toHaveBeenCalled();
  });
});
