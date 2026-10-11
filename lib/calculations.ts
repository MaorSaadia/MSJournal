import { summary } from "./journal/statistics";
import { D } from "./journal/processing";
import { dayKey, dateKeys } from "./dates";
import type {
  Account,
  CashMovement,
  DailyResult,
  Filters,
  Trade,
} from "./types";

export const netCents = (trade: Trade) =>
  trade.grossCents - trade.commissionCents - trade.feesCents;
export function filterTrades(
  trades: Trade[],
  filters: Filters,
  includeDates = true,
) {
  return trades.filter(
    (t) =>
      filters.accounts.includes(t.accountId) &&
      (filters.symbol === "all" || filters.symbol === t.symbol) &&
      (filters.direction === "all" || filters.direction === t.direction) &&
      (!includeDates ||
        (dayKey(t.closeAt) >= filters.start &&
          dayKey(t.closeAt) <= filters.end)),
  );
}
export function dailyResults(trades: Trade[]): DailyResult[] {
  const days = new Map<string, DailyResult>();
  for (const trade of trades) {
    const date = dayKey(trade.closeAt);
    const day = days.get(date) ?? {
      date,
      netCents: 0,
      trades: [],
      wins: 0,
      losses: 0,
      breakeven: 0,
    };
    const net = netCents(trade);
    day.netCents += net;
    day.trades.push(trade);
    if (net > 0) day.wins++;
    else if (net < 0) day.losses++;
    else day.breakeven++;
    days.set(date, day);
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}
export function metrics(trades: Trade[]) {
  const stats = summary(
    trades.map((t) => String(netCents(t))),
    false,
    false,
  );
  const days = dailyResults(trades),
    dayStats = summary(
      days.map((d) => String(d.netCents)),
      false,
      false,
    );
  const averageWin =
    stats.averageWin === null ? null : Number(stats.averageWin);
  const averageLoss =
    stats.averageLoss === null
      ? null
      : new D(stats.averageLoss).abs().toNumber();
  return {
    count: stats.count,
    wins: stats.wins!,
    losses: stats.losses!,
    breakeven: stats.zeros!,
    netCents: Number(stats.total),
    positive: new D(stats.averageWin ?? 0).times(stats.wins!).toNumber(),
    negative: new D(stats.averageLoss ?? 0)
      .times(stats.losses!)
      .abs()
      .toNumber(),
    days: days.length,
    winRate: stats.winRate === null ? null : Number(stats.winRate),
    dayWinRate: dayStats.winRate === null ? null : Number(dayStats.winRate),
    profitFactor:
      stats.profitFactor === null ? null : Number(stats.profitFactor),
    averageWin,
    averageLoss,
    winLossRatio:
      stats.averageRatio === null ? null : Number(stats.averageRatio),
  };
}
export function cumulativeSeries(trades: Trade[], start: string, end: string) {
  const daily = new Map(dailyResults(trades).map((d) => [d.date, d.netCents]));
  let total = 0;
  return [
    { date: start, value: 0, opening: true },
    ...dateKeys(start, end).map((date) => {
      total += daily.get(date) ?? 0;
      return { date, value: total / 100, opening: false };
    }),
  ];
}
export function drawdownSeries(trades: Trade[], start: string) {
  let cumulative = 0,
    peak = 0;
  return [
    { index: 0, date: start, value: 0 },
    ...[...trades]
      .sort((a, b) => a.closeAt.localeCompare(b.closeAt))
      .map((t, i) => {
        cumulative += netCents(t);
        peak = Math.max(peak, cumulative);
        return {
          index: i + 1,
          date: dayKey(t.closeAt),
          value: (cumulative - peak) / 100,
        };
      }),
  ];
}
export function balanceSeries(
  accounts: Account[],
  trades: Trade[],
  cash: CashMovement[],
  filters: Filters,
) {
  const selected = accounts.filter((a) => filters.accounts.includes(a.id));
  if (!selected.length) return [];
  const ids = new Set(selected.map((a) => a.id));
  // Balance scope intentionally ignores symbol and direction. Prior results remain in the opening.
  const scopedTrades = trades.filter((t) => ids.has(t.accountId));
  const daily = new Map(
    dailyResults(scopedTrades).map((d) => [d.date, d.netCents]),
  );
  const cashOn = (date: string) =>
    cash
      .filter((c) => ids.has(c.accountId) && c.date === date)
      .reduce((s, c) => s + c.amountCents, 0);
  const initial = selected
    .filter((a) => a.openedOn <= filters.start)
    .reduce((s, a) => s + a.startingBalanceCents, 0);
  let balance =
    initial +
    scopedTrades
      .filter((t) => dayKey(t.closeAt) < filters.start)
      .reduce((s, t) => s + netCents(t), 0) +
    cash
      .filter((c) => ids.has(c.accountId) && c.date < filters.start)
      .reduce((s, c) => s + c.amountCents, 0);
  return [
    { date: filters.start, value: balance / 100, opening: true },
    ...dateKeys(filters.start, filters.end).map((date) => {
      balance += selected
        .filter((a) => a.openedOn === date && date !== filters.start)
        .reduce((s, a) => s + a.startingBalanceCents, 0);
      balance += (daily.get(date) ?? 0) + cashOn(date);
      return { date, value: balance / 100, opening: false };
    }),
  ];
}
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
export function money(cents: number, signed = false) {
  return `${signed && cents > 0 ? "+" : ""}${currency.format(cents / 100)}`;
}
export function compactMoney(dollars: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(dollars);
}
export function ratio(value: number | null) {
  return value === null ? "—" : value.toFixed(2);
}
