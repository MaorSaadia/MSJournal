import { D, sum } from "./processing";
export type Summary = {
  count: number;
  covered: number;
  estimated: boolean;
  total: string | null;
  average: string | null;
  wins: number | null;
  losses: number | null;
  zeros: number | null;
  best: string | null;
  worst: string | null;
  winRate: string | null;
  profitFactor: string | null;
  profitFactorNote: string;
  averageWin: string | null;
  averageLoss: string | null;
  averageRatio: string | null;
  maxDrawdown: string | null;
};
const average = (values: string[]) =>
  values.length ? new D(sum(values)).div(values.length).toFixed() : null;
export function summary(
  values: (string | null)[],
  estimated = false,
  rounded = true,
): Summary {
  const eligible = values.every((v) => v !== null),
    known = values.filter((v): v is string => v !== null),
    positive = known.filter((v) => new D(v).gt(0)),
    negative = known.filter((v) => new D(v).lt(0));
  return {
    count: values.length,
    covered: known.length,
    estimated,
    total: eligible ? sum(known) : null,
    average: eligible ? average(known) : null,
    wins: eligible ? positive.length : null,
    losses: eligible ? negative.length : null,
    zeros: eligible ? known.length - positive.length - negative.length : null,
    best:
      eligible && positive.length
        ? positive.reduce((a, b) => (new D(a).gt(b) ? a : b))
        : null,
    worst:
      eligible && negative.length
        ? negative.reduce((a, b) => (new D(a).lt(b) ? a : b))
        : null,
    winRate:
      eligible && values.length
        ? new D(positive.length)
            .div(values.length)
            .times(100)
            .toFixed(rounded ? 1 : undefined)
        : null,
    profitFactor:
      eligible && negative.length
        ? new D(sum(positive))
            .div(new D(sum(negative)).abs())
            .toFixed(rounded ? 2 : undefined)
        : null,
    profitFactorNote: !eligible
      ? "Fee coverage incomplete"
      : !values.length
        ? "No complete trades"
        : !negative.length
          ? positive.length
            ? "No losing trades"
            : "No winning or losing trades"
          : "",
    averageWin: eligible ? average(positive) : null,
    averageLoss: eligible ? average(negative) : null,
    averageRatio:
      eligible && positive.length && negative.length
        ? new D(average(positive)!)
            .div(new D(average(negative)!).abs())
            .toFixed(rounded ? 2 : undefined)
        : null,
    maxDrawdown: null,
  };
}

// Only records explicitly published as complete may enter complete-trade outcomes.
// Shared-fill graphs and matched quantities alone do not prove a flat account.
export function isCompleteTrade(r: { type: string; partial?: boolean }) {
  return r.type === "trade" && !r.partial;
}

// Current Performance-only publication makes no claim of complete positions.
export const REAL_RECORD_KIND = "portion" as const;
