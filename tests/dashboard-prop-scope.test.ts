import { beforeEach, describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({
  loadCards: vi.fn(),
  accounts: [
    { id: "owned", currency: "USD", archivedAt: null, openingBalance: null, openingBalanceDate: null, nominalSize: null },
    { id: "archived", currency: "USD", archivedAt: "2026-10-01", openingBalance: null, openingBalanceDate: null, nominalSize: null },
  ],
  journal: { portions: [], fees: {}, records: [], unprocessedAccounts: [], states: [] },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/session", () => ({ requireUser: async () => ({ id: "owner" }) }));
vi.mock("@/lib/accounts/service", () => ({
  listTradingAccounts: async () => fixtures.accounts,
  NotFoundError: class NotFoundError extends Error {},
}));
vi.mock("@/lib/journal/service", () => ({ getJournal: async () => fixtures.journal }));
vi.mock("@/lib/preferences", () => ({ getPreferences: async () => ({ displayTimezone: "Asia/Jerusalem" }) }));
vi.mock("@/lib/dashboard/prop-accounts", () => ({ dashboardPropAccounts: fixtures.loadCards }));
vi.mock("@/db/client", () => {
  const rows = Object.assign(Promise.resolve([]), { orderBy: async () => [] });
  const query = { from: () => query, leftJoin: () => query, where: () => rows };
  return { getDb: () => ({ select: () => query }) };
});

import { NotFoundError } from "@/lib/accounts/service";
import { dashboardData } from "@/lib/dashboard/service";

const range = { start: "2026-10-01", end: "2026-10-02" };

describe("Dashboard account-card selection", () => {
  beforeEach(() => fixtures.loadCards.mockReset().mockResolvedValue([]));

  it("rejects foreign and excluded archived accounts before loading card data", async () => {
    for (const accounts of ["foreign", "owned,foreign", "archived"]) {
      await expect(dashboardData({ ...range, accounts })).rejects.toBeInstanceOf(NotFoundError);
    }
    expect(fixtures.loadCards).not.toHaveBeenCalled();
  });

  it("passes only the requested owner and accounts, even when performance filters change", async () => {
    await dashboardData({ ...range, accounts: "owned" });
    await dashboardData({ ...range, start: "2026-10-02", symbol: "MNQ", direction: "long", accounts: "owned" });
    await dashboardData({ ...range, accounts: "archived", archived: "1" });
    expect(fixtures.loadCards.mock.calls).toEqual([
      ["owner", [fixtures.accounts[0]], fixtures.journal, []],
      ["owner", [fixtures.accounts[0]], fixtures.journal, []],
      ["owner", [fixtures.accounts[1]], fixtures.journal, []],
    ]);
  });

  it("keeps the rest of the Dashboard available if the cards fail", async () => {
    fixtures.loadCards.mockRejectedValueOnce(new Error("prop data unavailable"));
    await expect(dashboardData({ ...range, accounts: "" })).resolves.toMatchObject({
      propAccounts: null, days: [], recent: [],
    });
  });
});
