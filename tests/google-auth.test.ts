import { afterEach, describe, expect, it, vi } from "vitest";

const handlers = vi.hoisted(() => ({
  GET: vi.fn(async () => new Response(null, { status: 302 })),
  POST: vi.fn(async () => Response.json({ redirect: true })),
}));
vi.mock("better-auth/next-js", () => ({ toNextJsHandler: () => handlers }));
vi.mock("@/lib/auth", () => ({ getAuth: () => ({}) }));

import { GET, POST } from "@/app/api/auth/[...all]/route";

const request = (path: string, body?: unknown) =>
  new Request(`https://www.msjournal.app/api/auth${path}`, body === undefined
    ? {}
    : { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
const start = {
  provider: "google",
  callbackURL: "/settings/billing",
  errorCallbackURL: "/signup?next=%2Fsettings%2Fbilling&google=error",
  requestSignUp: true,
};
function configure(google: boolean) {
  vi.stubEnv("DATABASE_URL", "postgresql://fixture:fixture@localhost/fixture");
  vi.stubEnv("BETTER_AUTH_SECRET", "fixture-secret-at-least-32-characters-long");
  vi.stubEnv("BETTER_AUTH_URL", "https://www.msjournal.app");
  vi.stubEnv("AUTH_REQUIRE_EMAIL_VERIFICATION", "false");
  vi.stubEnv("GOOGLE_CLIENT_ID", "fixture-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", google ? "fixture-secret" : "");
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("Google OAuth routes", () => {
  it("opens the Google code flow and only its callback when configured", async () => {
    configure(true);
    const startRequest = request("/sign-in/social", start);
    const response = await POST(startRequest);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(handlers.POST).toHaveBeenCalledExactlyOnceWith(startRequest);
    expect((await GET(request("/callback/google?code=mock&state=mock"))).status).toBe(302);
    expect((await GET(request("/callback/github"))).status).toBe(403);
    expect((await POST(request("/link-social", start))).status).toBe(403);
  });

  it("keeps the email flow usable without Google and blocks extra OAuth scopes", async () => {
    configure(false);
    expect((await POST(request("/sign-in/social", start))).status).toBe(503);
    expect((await GET(request("/callback/google"))).status).toBe(503);
    expect((await POST(request("/sign-in/email", {}))).status).toBe(200);
    configure(true);
    expect((await POST(request("/sign-in/social", { ...start, provider: "github" }))).status).toBe(400);
    expect((await POST(request("/sign-in/social", { ...start, scopes: ["extra-scope"] }))).status).toBe(400);
  });
});
