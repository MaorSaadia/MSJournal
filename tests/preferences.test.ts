import { describe, expect, it, vi } from "vitest";
import { getPreferences } from "@/lib/preferences";

const { selectPreferences } = vi.hoisted(() => ({ selectPreferences: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/session", () => ({
  requireUser: async () => ({ id: "test-user", name: "Trader", email: "trader@example.invalid" }),
}));
vi.mock("@/db/client", () => ({
  getDb: () => ({ select: () => ({ from: () => ({ where: selectPreferences }) }) }),
}));

describe("Journal display timezone", () => {
  it("defaults to New York when there is no preference row", async () => {
    selectPreferences.mockResolvedValueOnce([]);
    expect((await getPreferences()).displayTimezone).toBe("America/New_York");
  });

  it("uses the user's saved timezone when present", async () => {
    selectPreferences.mockResolvedValueOnce([{ displayTimezone: "Asia/Jerusalem" }]);
    expect((await getPreferences()).displayTimezone).toBe("Asia/Jerusalem");
  });
});
