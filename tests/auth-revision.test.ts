import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { authError } from "@/lib/auth-messages";
import { signupInput } from "@/lib/auth-validation";
import { readConfig } from "@/lib/config";
const email = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: email.send };
  },
}));
import { sendAuthEmail, EmailDeliveryError } from "@/lib/auth-email";
describe("standard authentication", () => {
  it("does not require an owner allowlist and refuses a verification gate without email delivery", () => {
    const config = {
      DATABASE_URL: "postgresql://user:placeholder@localhost/journal",
      BETTER_AUTH_SECRET: "a".repeat(32),
      BETTER_AUTH_URL: "http://localhost:3000",
    };
    expect(readConfig(config).AUTH_REQUIRE_EMAIL_VERIFICATION).toBe("false");
    expect(() =>
      readConfig({ ...config, AUTH_REQUIRE_EMAIL_VERIFICATION: "true" }),
    ).toThrow();
  });
  it("validates confirmation and distinguishes credentials, service, origin and expired-link failures", () => {
    expect(
      signupInput.safeParse({
        name: "Trader",
        email: "trader@example.com",
        password: "long-enough-password",
        confirmPassword: "different",
      }).success,
    ).toBe(false);
    expect(authError({ status: 401 }, "login")).toContain("incorrect");
    expect(authError({ status: 503 }, "login")).toContain(
      "temporarily unavailable",
    );
    expect(authError({ status: 403 }, "login")).toContain("configured address");
    expect(
      authError({ status: 400, code: "INVALID_TOKEN" }, "reset"),
    ).toContain("expired");
  });
});
describe("Resend delivery", () => {
  beforeEach(() => {
    email.send.mockReset();
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://user:placeholder@localhost/journal",
    );
    vi.stubEnv("BETTER_AUTH_SECRET", "a".repeat(32));
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    vi.stubEnv("AUTH_REQUIRE_EMAIL_VERIFICATION", "false");
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("AUTH_EMAIL_FROM", "Journal <auth@example.com>");
  });
  afterEach(() => vi.unstubAllEnvs());
  it("rejects provider failures and never returns the provider's private details", async () => {
    email.send.mockResolvedValue({
      error: { message: "private provider details" },
      data: null,
    });
    await expect(
      sendAuthEmail("user@example.com", "https://example.com/reset", "reset"),
    ).rejects.toBeInstanceOf(EmailDeliveryError);
  });
  it("awaits an accepted provider delivery instead of reporting false success", async () => {
    email.send.mockResolvedValue({ data: { id: "accepted" }, error: null });
    await expect(
      sendAuthEmail("user@example.com", "https://example.com/reset", "reset"),
    ).resolves.toBeUndefined();
    expect(email.send).toHaveBeenCalledTimes(1);
  });
});
