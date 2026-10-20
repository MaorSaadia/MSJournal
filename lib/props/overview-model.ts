import {
  D,
  sum,
  portionExit,
  type Portion,
  type PortionFee,
} from "@/lib/journal/processing";
import type { Payout } from "./tracking-rules";
import type { Phase, PhaseProgress, RuleVersion } from "./model";
import { firmSession } from "./tracking-calculations";

export function phaseSessionActivity(
  phase: Phase,
  versions: RuleVersion[],
  portions: Portion[],
  fees: Record<string, PortionFee>,
  stop: string,
  recordIds: Record<string, string>,
) {
  const ordered = versions
    .filter((v) => v.phaseId === phase.id && v.rules.tracking)
    .sort((a, b) => a.effectiveAt.localeCompare(b.effectiveAt));
  const sessions = new Map<
    string,
    {
      date: string;
      start: string;
      close: string;
      timezone: string;
      confirmed: boolean;
      activity: {
        id: string;
        recordId: string | null;
        symbol: string;
        at: string;
        gross: string;
        net: string | null;
        estimated: boolean;
      }[];
    }
  >();
  for (const p of portions) {
    const at = portionExit(p);
    if (
      p.tradingAccountId !== phase.tradingAccountId ||
      at < phase.startAt ||
      at >= (phase.endAt && phase.endAt < stop ? phase.endAt : stop) ||
      (p.boughtAt < p.soldAt ? p.boughtAt : p.soldAt) < phase.startAt
    )
      continue;
    const rules = ordered.filter((v) => v.effectiveAt <= at).at(-1)
      ?.rules.tracking;
    if (!rules) continue;
    try {
      const session = firmSession(at, rules);
      const key = `${session.start}|${rules.session.timezone}`;
      const day = sessions.get(key) ?? {
        ...session,
        timezone: rules.session.timezone,
        confirmed: rules.session.confirmed,
        activity: [],
      };
      if (day.activity.some((item) => item.id === p.id)) continue;
      const fee = fees[p.id];
      day.activity.push({
        id: p.id,
        recordId: recordIds[p.id] ?? null,
        symbol: p.symbol,
        at,
        gross: p.grossPnl,
        net:
          fee?.amount == null
            ? null
            : new D(p.grossPnl).minus(fee.amount).toFixed(),
        estimated: fee?.kind === "Estimated",
      });
      sessions.set(key, day);
    } catch {
      /* Ambiguous session boundaries remain warnings in the financial engine. */
    }
  }
  return [...sessions.values()]
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((day) => ({
      ...day,
      gross: sum(day.activity.map((p) => p.gross)),
      net: day.activity.some((p) => p.net === null)
        ? null
        : sum(day.activity.map((p) => p.net!)),
      estimated: day.activity.some((p) => p.estimated),
    }));
}
export type OverviewSession = ReturnType<typeof phaseSessionActivity>[number];

export function overviewReference(progress: PhaseProgress) {
  const p = progress.tracking;
  if (!p) return null;
  if (p.rules.stage === "Evaluation") {
    // Adjust the balance reference for non-trading ledger events, not the trading-profit goal.
    if (
      p.balance !== null &&
      p.phaseProfit !== null &&
      p.effectiveTarget !== null
    )
      return {
        value: new D(p.balance)
          .minus(p.phaseProfit)
          .plus(p.effectiveTarget)
          .toFixed(),
        label: "Effective evaluation target balance",
      };
    return progress.phase.baseline !== null && p.effectiveTarget !== null
      ? {
          value: new D(progress.phase.baseline)
            .plus(p.effectiveTarget)
            .toFixed(),
          label: "Starting balance + profit target reference",
        }
      : null;
  }
  return p.rules.payout.enabled &&
    p.rules.payout.minimumBalanceToSubmit !== null
    ? {
        value: p.rules.payout.minimumBalanceToSubmit,
        label: "Minimum balance to request payout",
      }
    : null;
}
export function accountPosition(progress: PhaseProgress) {
  const p = progress.tracking;
  if (!p) return null;
  const reference = overviewReference(progress);
  const markers = [
    { key: "floor", label: "Loss threshold", value: p.threshold },
    { key: "start", label: "Starting balance", value: progress.phase.baseline },
    { key: "current", label: "Current balance", value: p.balance },
    {
      key: "target",
      label: reference?.label ?? "Target",
      value: reference?.value ?? null,
    },
  ].filter(
    (m): m is { key: string; label: string; value: string } => m.value !== null,
  );
  if (!markers.length) return null;
  const min = D.min(...markers.map((m) => m.value)),
    max = D.max(...markers.map((m) => m.value));
  const pad = D.max(max.minus(min).times("0.08"), "1");
  const lower = min.minus(pad),
    span = max.plus(pad).minus(lower);
  return markers.map((m) => ({
    ...m,
    position: new D(m.value).minus(lower).div(span).times(100).toNumber(),
  }));
}
export function overviewChartRows(progress: PhaseProgress) {
  const rows = new Map<
    string,
    {
      at: number;
      balance: string | null;
      floor: string | null;
      snapshotBalance: string | null;
      snapshotFloor: string | null;
      source: string;
      events: string[];
    }
  >();
  for (const point of (
    progress.tracking?.points ??
    progress.current?.points ??
    []
  ).filter((point) => point.at <= (progress.tracking?.asOf ?? progress.asOf)))
    rows.set(point.at, {
      at: Date.parse(point.at),
      balance: point.balance,
      floor: point.floor,
      snapshotBalance: null,
      snapshotFloor: null,
      source:
        point.reason.includes("snapshot") ||
        point.reason === "Recorded phase baseline"
          ? point.reason
          : `Calculated from recorded activity${progress.tracking?.estimatedFees ? "; estimated fees" : ""} - ${point.reason}`,
      events: [],
    });
  for (const s of progress.snapshots.filter(
    (s) =>
      s.asOf >= progress.phase.startAt &&
      s.asOf <= (progress.phase.endAt ?? progress.asOf),
  )) {
    const row = rows.get(s.asOf) ?? {
      at: Date.parse(s.asOf),
      balance: null,
      floor: null,
      snapshotBalance: null,
      snapshotFloor: null,
      source: "Confirmed firm dashboard snapshot",
      events: [],
    };
    row.snapshotBalance = s.balance;
    row.snapshotFloor = s.threshold;
    row.source = "Confirmed firm dashboard snapshot";
    if (s.threshold === null) row.floor = null;
    rows.set(s.asOf, row);
  }
  return [...rows.values()]
    .sort((a, b) => a.at - b.at)
    .map((row) => ({
      ...row,
      exactBalance: row.snapshotBalance ?? row.balance,
      exactFloor: row.snapshotBalance !== null ? row.snapshotFloor : row.floor,
      balance: row.balance === null ? null : Number(row.balance),
      floor: row.floor === null ? null : Number(row.floor),
      snapshotBalance:
        row.snapshotBalance === null ? null : Number(row.snapshotBalance),
      snapshotFloor:
        row.snapshotFloor === null ? null : Number(row.snapshotFloor),
    }));
}

export function phasePayoutEvents(progress: PhaseProgress, payouts: Payout[]) {
  return payouts
    .filter((p) => p.phaseId === progress.phase.id)
    .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt))
    .flatMap((p, index) => [
      {
        at: p.requestedAt,
        label: `Payout ${index + 1} requested`,
        kind: "requested",
        amount: p.requestedAmount,
      },
      {
        at: p.approvedAt,
        label: `Payout ${index + 1} approved`,
        kind: "approved",
        amount: p.approvedAmount,
      },
      {
        at: p.deductedAt,
        label: `Payout ${index + 1} deducted`,
        kind: "deducted",
        amount: p.deductionAmount,
      },
      {
        at: p.paidAt,
        label: `Payout ${index + 1} paid`,
        kind: "paid",
        amount: p.receiptAmount,
      },
    ])
    .filter(
      (
        e,
      ): e is {
        at: string;
        label: string;
        kind: string;
        amount: string | null;
      } =>
        !!e.at &&
        e.at >= progress.phase.startAt &&
        e.at <= (progress.phase.endAt ?? progress.asOf),
    )
    .sort((a, b) => a.at.localeCompare(b.at));
}
