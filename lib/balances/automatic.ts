import type { BalanceAccount, CashAdjustment } from "./model";
import { localDay } from "@/lib/journal/calculations";
import { type Portion } from "@/lib/journal/processing";
import { dayBounds } from "@/lib/calendar/model";

export type BalancePhase = {
  tradingAccountId: string;
  startAt: string;
  endAt: string | null;
  baseline: string | null;
  ledgerStart: string | null;
};

export function automaticBaselines(
  accounts: (BalanceAccount & {
    nominalSize: string | null;
    startDate: string | null;
  })[],
  portions: Portion[],
  phases: BalancePhase[],
  start: string,
  end: string,
  timezone: string,
  adjustments: CashAdjustment[] = [],
): BalanceAccount[] {
  const cutoff = dayBounds(end, timezone).end;
  return accounts.map((account) => {
    // An explicitly entered dashboard balance remains authoritative, including zero.
    if (account.openingBalance !== null && account.openingBalanceDate !== null)
      return { ...account, baselineSource: "manual" };
    const phase = phases
      .filter((p) => p.tradingAccountId === account.id && p.startAt < cutoff)
      .sort((a, b) => a.startAt.localeCompare(b.startAt))
      .at(-1);
    const amount =
      phase?.baseline ??
      phase?.ledgerStart ??
      account.openingBalance ??
      account.nominalSize;
    if (amount === null) return account;
    if (phase)
      return {
        ...account,
        openingBalance: amount,
        openingBalanceDate: localDay(phase.startAt, account.reportingTimezone),
        openingBalanceInstant: phase.startAt,
        balanceThrough: phase.endAt,
        baselineSource:
          phase.baseline !== null || phase.ledgerStart !== null
            ? "phase"
            : "account-size",
      };
    // Without an explicit phase, size is the user's default before recorded activity.
    const days = portions
      .filter((p) => p.tradingAccountId === account.id)
      .map((p) =>
        localDay(
          p.boughtAt < p.soldAt ? p.boughtAt : p.soldAt,
          account.reportingTimezone,
        ),
      );
    const date = [
      start,
      ...(account.startDate ? [account.startDate] : []),
      ...days,
      ...adjustments.filter((c) => c.tradingAccountId === account.id).map((c) => localDay(c.effectiveAt, account.reportingTimezone)),
    ].sort()[0];
    return {
      ...account,
      openingBalance: amount,
      openingBalanceDate: date,
      baselineSource: "account-size",
    };
  });
}
