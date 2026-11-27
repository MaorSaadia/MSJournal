import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Portion, PortionFee } from "@/lib/journal/processing";

const fixtures = vi.hoisted(() => ({
  loadCards: vi.fn(),
  preferences: vi.fn(),
  accounts: [
    { id: "owned", currency: "USD", archivedAt: null, openingBalance: null, openingBalanceDate: null, nominalSize: null },
    { id: "archived", currency: "USD", archivedAt: "2026-10-01", openingBalance: null, openingBalanceDate: null, nominalSize: null },
  ],
  journal: {
    portions: [] as Portion[],
    fees: {} as Record<string, PortionFee>,
    records: [],
    unprocessedAccounts: [],
    states: [],
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/session", () => ({ requireUser: async () => ({ id: "owner" }) }));
vi.mock("@/lib/accounts/service", () => ({
  listTradingAccounts: async () => fixtures.accounts,
  NotFoundError: class NotFoundError extends Error {},
}));
vi.mock("@/lib/journal/service", () => ({ getJournal: async () => fixtures.journal }));
vi.mock("@/lib/preferences", () => ({ getPreferences: fixtures.preferences }));
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
  beforeEach(() => {
    fixtures.loadCards.mockReset().mockResolvedValue([]);
    fixtures.preferences.mockReset().mockResolvedValue({ displayTimezone: "Asia/Jerusalem" });
    fixtures.journal.portions = [];
    fixtures.journal.fees = {};
  });

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

  it("uses the saved range for daily outcomes in either trade statistics mode", async () => {
    const scope = { start: "2026-11-01", end: "2026-11-30", accounts: "owned", basis: "net" };
    fixtures.journal.portions = [
      ["12", "177.88"], ["13", "50.84"], ["16", "69.30"],
      ["17", "257.46"], ["18", "-214.30"], ["24", "73.42"], ["25", "63.96"],
    ].map(([day, grossPnl]) => ({
      id: day, ownerId: "owner", tradingAccountId: "owned",
      symbol: "MNQZ6", buyFillId: `entry-${day}`, sellFillId: `exit-${day}`,
      quantity: "1", buyPrice: "100", sellPrice: "101", grossPnl,
      boughtAt: `2026-11-${day}T14:00:00.000Z`,
      soldAt: `2026-11-${day}T14:15:00.000Z`,
    }));
    fixtures.journal.fees = Object.fromEntries(
      fixtures.journal.portions.map(({ id }) => [id, { amount: "0", kind: "Manual" }]),
    );
    expect((await dashboardData(scope)).dayOutcomes)
      .toMatchObject({ wins: 6, zeros: 0, losses: 1, winRate: "85.7" });

    fixtures.preferences.mockResolvedValue({ displayTimezone: "Asia/Jerusalem", breakevenThreshold: "100.00" });
    for (const outcomeBasis of ["complete", "portions"]) {
      const data = await dashboardData({ ...scope, outcomeBasis });
      expect(data.dayOutcomes).toMatchObject({ wins: 2, zeros: 4, losses: 1, winRate: "28.6" });
      expect(data.dayOutcomes.total).toBe(data.realizedSummary.total);
      expect(data.days.filter((day) => day.outcome === "zero")).toHaveLength(4);
    }
  });
});
