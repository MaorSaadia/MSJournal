import { summary } from "./statistics";
import { formatInTimeZone } from "./timezone";
import {
  D,
  direction,
  portionExit,
  sum,
  type Portion,
  type PortionFee,
} from "./processing";
export type JournalFilter = {
  accounts: string[];
  start: string;
  end: string;
  symbol?: string;
  direction?: string;
};
export function localDay(instant: string, timezone: string) {
  return formatInTimeZone(instant, timezone);
}
export function selectedPortions(
  rows: Portion[],
  filter: JournalFilter,
  timezone: string,
) {
  return rows.filter((p) => {
    const day = localDay(portionExit(p), timezone);
    return (
      filter.accounts.includes(p.tradingAccountId) &&
      day >= filter.start &&
      day <= filter.end &&
      (!filter.symbol ||
        filter.symbol === "all" ||
        p.symbol === filter.symbol) &&
      (!filter.direction ||
        filter.direction === "all" ||
        direction(p) === filter.direction)
    );
  });
}
export function realizedPerformance(
  rows: Portion[],
  fees: Record<string, PortionFee>,
  filter: JournalFilter,
  timezone: string,
) {
  const selected = selectedPortions(rows, filter, timezone),
    daily = new Map<string, Portion[]>();
  selected.forEach((p) => {
    const day = localDay(portionExit(p), timezone);
    daily.set(day, [...(daily.get(day) ?? []), p]);
  });
  let running = new D(0);
  const days = [...daily]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => {
      const gross = sum(values.map((p) => p.grossPnl));
      const known = values.filter((p) => fees[p.id]?.amount != null);
      const feeAmount =
        known.length === values.length
          ? sum(known.map((p) => fees[p.id].amount!))
          : null;
      running = running.plus(gross);
      return {
        date,
        gross,
        feeAmount,
        net:
          feeAmount === null ? null : new D(gross).minus(feeAmount).toFixed(),
        estimated: known.some((p) => fees[p.id].kind === "Estimated"),
        count: values.length,
        grossWins: values.filter((p) => new D(p.grossPnl).gt(0)).length,
        netWins:
          feeAmount === null
            ? null
            : values.filter((p) =>
                new D(p.grossPnl).minus(fees[p.id].amount!).gt(0),
              ).length,
        cumulative: running.toFixed(),
        grossStatistics: summary(values.map((p) => p.grossPnl)),
        netStatistics: summary(
          values.map((p) =>
            fees[p.id]?.amount == null
              ? null
              : new D(p.grossPnl).minus(fees[p.id].amount!).toFixed(),
          ),
          known.some((p) => fees[p.id].kind === "Estimated"),
        ),
      };
    });
  const covered = selected.filter((p) => fees[p.id]?.amount != null);
  const feeAmount =
    covered.length === selected.length && selected.length > 0
      ? sum(covered.map((p) => fees[p.id].amount!))
      : null;
  const gross = sum(selected.map((p) => p.grossPnl));
  return {
    selected,
    days,
    gross,
    feeAmount,
    feeCoverage: covered.length,
    net: feeAmount === null ? null : new D(gross).minus(feeAmount).toFixed(),
    estimated: covered.some((p) => fees[p.id].kind === "Estimated"),
  };
}
export function journalMoney(value: string | null, signed = false) {
  if (value === null) return "Unavailable";
  const n = new D(value);
  const [whole, fraction] = n.abs().toFixed(2).split(".");
  return `${n.isNegative() ? "−" : signed && n.gt(0) ? "+" : ""}$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
}
