import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
const auth = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getAuth: () => ({ api: { getSession: auth.getSession } }),
}));
vi.mock("@/lib/config", () => ({
  isConfigured: () => true,
  readConfig: () => ({ OWNER_EMAIL: "owner@example.com" }),
}));
import { ownerSession, requireOwner, UnauthorizedError } from "@/lib/session";
describe("private session authorization", () => {
  beforeEach(() => auth.getSession.mockReset());
  it("rejects absent or non-owner library sessions and disables cached-cookie authorization", async () => {
    auth.getSession.mockResolvedValue(null);
    await expect(requireOwner(new Headers())).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    auth.getSession.mockResolvedValue({
      user: { id: "other", email: "outsider@example.com" },
    });
    expect(await ownerSession(new Headers())).toBeNull();
    auth.getSession.mockResolvedValue({
      user: { id: "owner", email: "OWNER@example.com" },
    });
    expect((await requireOwner(new Headers())).id).toBe("owner");
    expect(auth.getSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: { disableCookieCache: true } }),
    );
  });
  it("does not authorize a deleted or revoked database session", async () => {
    auth.getSession.mockResolvedValueOnce({
      user: { id: "owner", email: "owner@example.com" },
    });
    expect((await requireOwner(new Headers())).id).toBe("owner");
    auth.getSession.mockResolvedValue(null);
    await expect(requireOwner(new Headers())).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });
});
