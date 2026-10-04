import { dateKeys, dayDate, localTimestamp } from "@/lib/dates";
import type { Account, CashMovement, Filters, Trade } from "@/lib/types";

export const DEMO_PERIOD = { start: "2026-01-01", end: "2026-03-31" };
export const accounts: Account[] = [
  {
    id: "demo-apex",
    name: "Evergreen",
    firm: "Apex Trader Funding",
    stage: "Evaluation",
    startingBalanceCents: 5000000,
    openedOn: "2026-01-01",
  },
  {
    id: "demo-mffu",
    name: "Northstar",
    firm: "MyFundedFutures",
    stage: "Funded",
    startingBalanceCents: 5000000,
    openedOn: "2026-01-01",
  },
  {
    id: "demo-lucid",
    name: "Summit",
    firm: "Lucid Trading",
    stage: "Evaluation",
    startingBalanceCents: 5000000,
    openedOn: "2026-01-01",
  },
  {
    id: "demo-tpt",
    name: "Harbor",
    firm: "Take Profit Trader",
    stage: "Funded",
    startingBalanceCents: 5000000,
    openedOn: "2026-01-01",
  },
];
export const cashMovements: CashMovement[] = [
  {
    accountId: "demo-mffu",
    date: "2026-02-12",
    amountCents: -120000,
    description: "Fictional withdrawal",
  },
  {
    accountId: "demo-tpt",
    date: "2026-03-18",
    amountCents: -85000,
    description: "Fictional withdrawal",
  },
  {
    accountId: "demo-apex",
    date: "2026-02-02",
    amountCents: 25000,
    description: "Fictional cash adjustment",
  },
];
// Deterministic, complete closed trades. All monetary inputs are integer USD cents.
// Entire fixture is fictional; no broker executions or real account information.
const outcomes = [
  -18500, 34200, 12600, -9400, 46500, 0, 21800, -15200, 28400, 6800, -24700,
  39100, 17300, -8200, 52400,
];
export const trades: Trade[] = dateKeys(DEMO_PERIOD.start, DEMO_PERIOD.end)
  .flatMap((date, index) => {
    const weekday = dayDate(date).getDay();
    if (weekday === 0 || weekday === 6 || index % 13 === 0) return [];
    return Array.from({ length: 2 + (index % 4) }, (_, n) => {
      const commissionCents = 240 + (n % 2) * 120;
      const feesCents = 80;
      const net = outcomes[(index * 7 + n * 3) % outcomes.length];
      // March opens with a losing day to exercise the cumulative opening zero.
      const netCents = date === "2026-03-02" ? -9500 - n * 4500 : net;
      const minute = (index * 11 + n * 17) % 60;
      return {
        id: `DEMO-${date}-${n}`,
        accountId: accounts[(index + n) % accounts.length].id,
        symbol: (["ES", "NQ", "MES", "MNQ"] as const)[(index + n * 2) % 4],
        direction: (index + n) % 2 ? ("short" as const) : ("long" as const),
        entryAt: localTimestamp(date, 15 + n, minute),
        closeAt: localTimestamp(date, 16 + n, minute),
        grossCents: netCents + commissionCents + feesCents,
        commissionCents,
        feesCents,
      };
    });
  })
  .sort((a, b) => a.closeAt.localeCompare(b.closeAt));
export const initialFilters: Filters = {
  accounts: accounts.map((a) => a.id),
  start: "2026-03-01",
  end: "2026-03-31",
  symbol: "all",
  direction: "all",
};
export const illustrativeProfile = [
  { axis: "Consistency", value: 74 },
  { axis: "Risk control", value: 82 },
  { axis: "Selectivity", value: 63 },
  { axis: "Recovery", value: 70 },
  { axis: "Efficiency", value: 88 },
  { axis: "Planning", value: 76 },
];
