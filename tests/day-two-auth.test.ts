import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const auth = vi.hoisted(() => ({ getAuth: vi.fn() }));
vi.mock("@/lib/auth", () => auth);
vi.mock("@/lib/config", () => ({
  isConfigured: () => true,
  emailConfigured: () => false,
}));
vi.mock("better-auth/next-js", () => ({
  toNextJsHandler: () => ({
    POST: async () => {
      throw new Error("private database detail");
    },
    GET: async () =>
      Response.json({ message: "private database detail" }, { status: 500 }),
  }),
}));
import { POST } from "@/app/api/auth/[...all]/route";
describe("public authentication API", () => {
  it("allows signup into the supported handler and sanitizes thrown and returned service failures", async () => {
    auth.getAuth.mockReturnValue({});
    for (const [path, method] of [
      ["sign-up/email", "POST"],
      ["sign-in/email", "POST"],
      ["get-session", "GET"],
    ]) {
      const { GET } = await import("@/app/api/auth/[...all]/route");
      const response = await (method === "GET" ? GET : POST)(
        new Request(`http://localhost:3000/api/auth/${path}`, { method }),
      );
      expect(response.status).toBe(503);
      expect(JSON.stringify(await response.json())).not.toContain(
        "private database detail",
      );
    }
    auth.getAuth.mockClear();
  });
  it("does not report email success when the provider is unconfigured", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/auth/request-password-reset", {
        method: "POST",
      }),
    );
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("EMAIL_UNAVAILABLE");
  });
  it("rejects local administration paths before initializing auth", async () => {
    for (const path of ["admin/create-user", "delete-user"]) {
      const response = await POST(
        new Request(`http://localhost:3000/api/auth/${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "someone@example.com",
            password: "not-a-real-password",
          }),
        }),
      );
      expect(response.status).toBe(403);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    }
    expect(auth.getAuth).not.toHaveBeenCalled();
  });
});
