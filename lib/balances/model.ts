import {
  D,
  sum,
  portionExit,
  type Portion,
  type PortionFee,
} from "@/lib/journal/processing";
import { dayBounds, shiftDay } from "@/lib/calendar/model";
export type BalanceAccount = {
  id: string;
  displayName: string;
  currency: string;
  openingBalance: string | null;
  openingBalanceDate: string | null;
  reportingTimezone: string;
  openingBalanceInstant?: string;
  balanceThrough?: string | null;
  baselineSource?: "manual" | "phase" | "account-size";
};
export type CashAdjustment = {
  id: string;
  tradingAccountId: string;
  effectiveAt: string;
  amount: string;
  kind: "deposit" | "withdrawal" | "other";
  explanation: string;
};
export type BalancePoint = { date: string; value: string | null };
export type AccountBalance = {
  id: string;
  name: string;
  timezone: string;
  baseline: string | null;
  baselineDate: string | null;
  baselineInstant: string | null;
  baselineSource: "manual" | "phase" | "account-size" | null;
  entering: string | null;
  ending: string | null;
  missingFees: number;
  estimated: boolean;
  coversStart: boolean;
  points: BalancePoint[];
  adjustments: CashAdjustment[];
};
export function balanceEstimates(
  accounts: BalanceAccount[],
  portions: Portion[],
  fees: Record<string, PortionFee>,
  adjustments: CashAdjustment[],
  start: string,
  end: string,
  timezone: string,
) {
  const bounds = {
    start: new Date(dayBounds(start, timezone).start).toISOString(),
    end: new Date(dayBounds(end, timezone).end).toISOString(),
  };
  const dates: string[] = [];
  for (let date = start; date <= end; date = shiftDay(date, 1))
    dates.push(date);
  const rows: AccountBalance[] = accounts.map((a) => {
    const baselineInstant = a.openingBalanceInstant ?? (a.openingBalanceDate
      ? new Date(
          dayBounds(a.openingBalanceDate, a.reportingTimezone).start,
        ).toISOString()
      : null);
    const stop = a.balanceThrough && a.balanceThrough < bounds.end ? a.balanceThrough : bounds.end;
    const applicable = portions.filter(
      (p) =>
        p.tradingAccountId === a.id &&
        baselineInstant !== null &&
        Date.parse(portionExit(p)) >= Date.parse(baselineInstant) &&
        Date.parse(portionExit(p)) < Date.parse(stop) &&
        (!a.openingBalanceInstant || (p.boughtAt < p.soldAt ? p.boughtAt : p.soldAt) >= a.openingBalanceInstant),
    );
    const cash = adjustments.filter(
      (c) =>
        c.tradingAccountId === a.id &&
        baselineInstant !== null &&
        Date.parse(c.effectiveAt) >= Date.parse(baselineInstant) &&
        Date.parse(c.effectiveAt) < Date.parse(stop),
    );
    const valueBefore = (instant: string) =>
      new D(a.openingBalance!)
        .plus(
          sum(
            applicable
              .filter((p) => Date.parse(portionExit(p)) < Date.parse(instant))
              .map((p) =>
                new D(p.grossPnl).minus(fees[p.id]?.amount ?? 0).toFixed(),
              ),
          ),
        )
        .plus(
          sum(
            cash
              .filter((c) => Date.parse(c.effectiveAt) < Date.parse(instant))
              .map((c) => c.amount),
          ),
        )
        .toFixed();
    const coversStart =
      a.currency === "USD" &&
      baselineInstant !== null &&
      baselineInstant <= bounds.start &&
      a.openingBalance !== null;
    const validEnd =
      a.currency === "USD" &&
      baselineInstant !== null &&
      baselineInstant < bounds.end &&
      a.openingBalance !== null;
    return {
      id: a.id,
      name: a.displayName,
      timezone: a.reportingTimezone,
      baseline: a.openingBalance,
      baselineDate: a.openingBalanceDate,
      baselineInstant,
      baselineSource: a.baselineSource ?? (a.openingBalance !== null ? "manual" : null),
      entering: coversStart ? valueBefore(bounds.start) : null,
      ending: validEnd ? valueBefore(bounds.end) : null,
      missingFees: applicable.filter((p) => fees[p.id]?.amount == null).length,
      estimated: applicable.some((p) => fees[p.id]?.kind === "Estimated"),
      coversStart,
      points: validEnd
        ? dates
            .filter(
              (date) =>
                Date.parse(dayBounds(date, timezone).end) >
                Date.parse(baselineInstant!),
            )
            .map((date) => ({
              date,
              value: valueBefore(dayBounds(date, timezone).end),
            }))
        : [],
      adjustments: adjustments
        .filter((c) => c.tradingAccountId === a.id)
        .sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt))
        .slice(0, 10),
    };
  });
  const covered = rows.filter((r) => r.coversStart || (r.baselineSource !== "manual" && r.ending !== null)),
    combined = covered.length
      ? {
          entering: covered.every((r) => r.entering !== null) ? sum(covered.map((r) => r.entering!)) : null,
          ending: sum(covered.map((r) => r.ending!)),
          points: dates.map((date) => {
            const values = covered.map((r) => r.points.find((p) => p.date === date)?.value ?? null);
            return { date, value: values.every((v) => v !== null) ? sum(values as string[]) : null };
          }),
          missingFees: covered.reduce((n, r) => n + r.missingFees, 0),
          estimated: covered.some((r) => r.estimated),
        }
      : null;
  return {
    accounts: rows,
    combined,
    covered: covered.length,
    selected: accounts.length,
  };
}
export type Balances = ReturnType<typeof balanceEstimates>;
