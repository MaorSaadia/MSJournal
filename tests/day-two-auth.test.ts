import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const auth = vi.hoisted(() => ({ getAuth: vi.fn() }));
vi.mock("@/lib/auth", () => auth);
import { POST } from "@/app/api/auth/[...all]/route";
describe("public authentication API", () => {
  it("rejects public signup and local administration paths before initializing auth", async () => {
    for (const path of [
      "sign-up/email",
      "admin/create-user",
      "request-password-reset",
    ]) {
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
