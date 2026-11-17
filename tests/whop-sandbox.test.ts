import { describe, it, expect } from "vitest";
import { sandboxEnvironment } from "../scripts/whop-sandbox.mjs";
const values = {
  DATABASE_URL: "postgresql://fixture:fixture@test-branch.neon.tech/test",
  WHOP_API_KEY: "sandbox_fixture",
  WHOP_BUSINESS_ID: "biz_fixture",
  WHOP_PRO_PRODUCT_ID: "prod_fixture",
  WHOP_PRO_MONTHLY_PLAN_ID: "plan_fixture",
  WHOP_WEBHOOK_SECRET: "ws_fixture",
};
const production = {
  DATABASE_URL: "postgresql://fixture:fixture@live-branch.neon.tech/main",
};
describe("isolated Whop sandbox launch", () => {
  it("supports annual checkout only with explicit opt-in and a distinct plan ID", () => {
    expect(sandboxEnvironment({ ...values, WHOP_PRO_ANNUAL_PLAN_ID: "plan_yearly" }, production).WHOP_PRO_ANNUAL_PLAN_ID).toBe("");
    const env = sandboxEnvironment({ ...values, WHOP_PRO_ANNUAL_PLAN_ID: "plan_yearly", WHOP_ANNUAL_CHECKOUT_ENABLED: "true" }, production);
    expect(env.WHOP_PRO_ANNUAL_PLAN_ID).toBe("plan_yearly");
    expect(env.WHOP_ANNUAL_CHECKOUT_ENABLED).toBe("true");
    expect(env.WHOP_LIVE_VERIFIED).toBe("false");
    expect(() => sandboxEnvironment({ ...values, WHOP_PRO_ANNUAL_PLAN_ID: values.WHOP_PRO_MONTHLY_PLAN_ID, WHOP_ANNUAL_CHECKOUT_ENABLED: "true" }, production)).toThrow("distinct");
  });
  it("uses the exact HTTPS tunnel origin for authentication and checkout returns", () => {
    const env = sandboxEnvironment({ ...values, WHOP_SANDBOX_PUBLIC_URL: "https://fixture.ngrok-free.dev" }, production);
    expect(env.BETTER_AUTH_URL).toBe("https://fixture.ngrok-free.dev");
    expect(env.WHOP_LIVE_VERIFIED).toBe("false");
    for (const url of ["http://fixture.test", "https://fixture.test/path", "https://user:pass@fixture.test"]) {
      expect(() => sandboxEnvironment({ ...values, WHOP_SANDBOX_PUBLIC_URL: url }, production)).toThrow("HTTPS origin");
    }
  });
  it("allows an explicitly selected shared database while retaining sandbox-only checkout", () => {
    const env = sandboxEnvironment({ ...values, DATABASE_URL: production.DATABASE_URL, WHOP_SANDBOX_ALLOW_SHARED_DATABASE: "true" }, production);
    expect(env.DATABASE_URL).toBe(production.DATABASE_URL);
    expect(env.WHOP_ENVIRONMENT).toBe("sandbox");
    expect(env.WHOP_LIVE_VERIFIED).toBe("false");
  });
  it("does not accept the application's normal database or pooled aliases", () => {
    expect(() =>
      sandboxEnvironment(
        { ...values, DATABASE_URL: production.DATABASE_URL },
        production,
      ),
    ).toThrow("separate test database");
    expect(() =>
      sandboxEnvironment(
        {
          ...values,
          DATABASE_URL:
            "postgresql://fixture:fixture@live-branch-pooler.neon.tech/main",
        },
        production,
      ),
    ).toThrow("separate test database");
  });
  it("pins the sandbox host selection, disables live/annual access and replaces auth identity", () => {
    const a = sandboxEnvironment(
      { ...values, WHOP_ENVIRONMENT: "live", WHOP_LIVE_VERIFIED: "true" },
      production,
    );
    const b = sandboxEnvironment(values, production);
    expect(a).toMatchObject({
      WHOP_ENVIRONMENT: "sandbox",
      WHOP_CHECKOUT_ENABLED: "true",
      WHOP_LIVE_VERIFIED: "false",
      WHOP_ANNUAL_CHECKOUT_ENABLED: "false",
      BETTER_AUTH_URL: "http://localhost:3101",
      WHOP_OAUTH_CLIENT_ID: "",
    });
    expect(a.BETTER_AUTH_SECRET).not.toBe(b.BETTER_AUTH_SECRET);
  });
  it("fails with a variable name rather than exposing configuration secrets", () => {
    expect(() =>
      sandboxEnvironment(
        { ...values, WHOP_API_KEY: "REPLACE_WITH_SANDBOX_API_KEY" },
        production,
      ),
    ).toThrow("Add WHOP_API_KEY");
  });
});
