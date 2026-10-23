import { D, sum, portionExit, type Portion, type PortionFee } from "@/lib/journal/processing";
import type { CashAdjustment } from "@/lib/balances/model";
import type { Phase, RuleVersion } from "./model";
import type { Payout, TrackingRules } from "./tracking-rules";
import { firmSession, nextThreshold } from "./tracking-calculations";

type Point = {
  at: string; balance: string | null; floor: string | null; target: string | null;
  netPnl: string | null; estimated: boolean; sessionDate: string | null;
};
/** Journal projection only. Never used to certify a breach, pass or payout eligibility. */
export function importedOverview(
  phase: Phase, versions: RuleVersion[], all: Portion[], fees: Record<string, PortionFee>,
  cash: CashAdjustment[], payouts: Payout[], now: string, pending = false,
) {
  const stop = phase.endAt && phase.endAt < now ? phase.endAt : now;
  const configured = versions.filter((v) => v.phaseId === phase.id && v.rules.tracking && v.effectiveAt < stop)
    .sort((a, b) => a.effectiveAt.localeCompare(b.effectiveAt));
  const rules = configured.at(-1)?.rules.tracking ?? null;
  const policyAt = (at: string) => configured.filter((v) => v.effectiveAt <= at).at(-1)?.rules.tracking ?? null;
  const baseline = phase.baseline ?? rules?.ledgerStart ?? null;
  const targetProfit = phase.kind === "Evaluation"
    ? rules?.evaluation.target ?? versions.at(-1)?.rules.profitTarget ?? null : null;
  const parts = [...new Map(all.filter((p) => p.tradingAccountId === phase.tradingAccountId &&
    portionExit(p) >= phase.startAt && portionExit(p) < stop &&
    (p.boughtAt < p.soldAt ? p.boughtAt : p.soldAt) >= phase.startAt).map((p) => [p.id, p])).values()]
    .sort((a, b) => portionExit(a).localeCompare(portionExit(b)));
  const netOf = (p: Portion) => fees[p.id]?.amount == null ? null : new D(p.grossPnl).minus(fees[p.id].amount!).toFixed();
  const missingFees = parts.filter((p) => netOf(p) === null).length;
  const estimatedFees = parts.some((p) => fees[p.id]?.kind === "Estimated");
  const netProfit = missingFees || pending ? null : sum(parts.map((p) => netOf(p)!));
  const phasePayouts = [...new Map(payouts.filter((p) => p.phaseId === phase.id).map((p) => [p.id, p])).values()];
  const excludedDeductions = new Set(payouts.filter((p) => p.phaseId !== phase.id && p.deductionId).map((p) => p.deductionId));
  const ledger = new Map(cash.filter((c) => c.tradingAccountId === phase.tradingAccountId &&
    c.effectiveAt >= phase.startAt && c.effectiveAt < stop && !excludedDeductions.has(c.id)).map((c) => [c.id, { at: c.effectiveAt, amount: c.amount }]));
  // A payout deduction already in the cash ledger is counted exactly once. Receipt/payment is not another deduction.
  for (const payout of phasePayouts) {
    if (!payout.deductedAt || payout.deductionAmount === null || payout.deductedAt < phase.startAt || payout.deductedAt >= stop) continue;
    const key = payout.deductionId ?? `payout:${payout.id}`;
    if (!ledger.has(key)) ledger.set(key, { at: payout.deductedAt, amount: new D(payout.deductionAmount).negated().toFixed() });
  }
  type Event = { pnl: (string | null)[]; cash: string[]; close: { key: string; date: string; policy: TrackingRules; boundary: boolean }[]; reset: boolean; payoutFloor: string | null };
  const events = new Map<string, Event>();
  const eventAt = (at: string) => {
    let event = events.get(at);
    if (!event) { event = { pnl: [], cash: [], close: [], reset: false, payoutFloor: null }; events.set(at, event); }
    return event;
  };
  eventAt(phase.startAt); eventAt(stop);
  const sessions = new Map<string, { date: string; net: (string | null)[] }>();
  let sessionError = false;
  for (const part of parts) {
    const at = portionExit(part); eventAt(at).pnl.push(netOf(part));
    const policy = policyAt(at);
    if (!policy) { sessionError = true; continue; }
    try {
      const day = firmSession(at, policy), key = `${policy.session.timezone}|${day.start}`;
      const value = sessions.get(key) ?? { date: day.date, net: [] };
      value.net.push(netOf(part)); sessions.set(key, value);
    } catch { sessionError = true; }
  }
  for (const value of ledger.values()) eventAt(value.at).cash.push(value.amount);
  let steps = 0;
  for (let i = 0; i < configured.length; i++) {
    const version = configured[i], policy = version.rules.tracking!;
    const from = version.effectiveAt > phase.startAt ? version.effectiveAt : phase.startAt;
    const until = configured[i + 1]?.effectiveAt ?? stop;
    if (from >= stop) continue;
    eventAt(from);
    try {
      let day = firmSession(from, policy);
      while (day.start < until && steps++ < 10000) {
        if (day.close > from && day.close <= until && day.close <= stop)
          eventAt(day.close).close.push({ key: `${policy.session.timezone}|${day.start}`, date: day.date, policy, boundary: day.close === day.end });
        if (day.end > from && day.end <= until && day.end <= stop) eventAt(day.end).reset = true;
        day = firmSession(day.end, policy);
      }
    } catch { sessionError = true; }
  }
  if (steps >= 10000) sessionError = true;
  for (const payout of phasePayouts) {
    for (const [kind, at] of Object.entries({ requested: payout.requestedAt, approved: payout.approvedAt, deducted: payout.deductedAt, paid: payout.paidAt })) {
      if (!at || at < phase.startAt || at >= stop) continue;
      const rule = policyAt(at)?.drawdown;
      if (rule?.payoutEvent === kind && rule.payoutThreshold !== null) eventAt(at).payoutFloor = rule.payoutThreshold;
    }
  }
  let balance = baseline === null ? null : new D(baseline);
  let threshold: string | null = null, high: string | null = baseline, pendingFloor: string | null = null;
  let locked = false, active: TrackingRules | null = null, cashTotal = new D(0);
  const points: Point[] = [], daily: Point[] = [];
  const estimated = (policy: TrackingRules | null) => !!policy &&
    (policy.drawdown.mode === "Intraday trailing" || policy.drawdown.basis === "equity" || estimatedFees && policy.drawdown.mode !== "Static");
  const floorAt = () => {
    if (!active || sessionError && active.drawdown.mode === "End-of-day trailing") return null;
    if (active.drawdown.mode !== "Static" && !locked && balance === null) return null;
    return threshold;
  };
  const point = (at: string, pnl: string | null, sessionDate: string | null): Point => ({
    at, balance: balance?.toFixed() ?? null, floor: floorAt(), netPnl: pnl, sessionDate,
    target: baseline !== null && active?.stage === "Evaluation" && active.evaluation.target !== null ? new D(baseline).plus(active.evaluation.target).plus(cashTotal).toFixed() : null,
    estimated: estimated(active),
  });
  const closeDay = (policy: TrackingRules) => {
    if (policy.drawdown.mode !== "End-of-day trailing" || balance === null || threshold === null || sessionError) return;
    high = D.max(high ?? balance, balance).toFixed();
    const next = nextThreshold(threshold, high, policy, locked);
    if (policy.drawdown.activation === "nextSession") pendingFloor = next;
    else threshold = next;
    if (policy.drawdown.cap !== null && new D(next).gte(policy.drawdown.cap) && policy.drawdown.lockTrigger === "cap") {
      // Activation still follows the configured schedule even when the next threshold reaches its cap.
      if (policy.drawdown.activation === "immediate") locked = true;
    }
  };
  for (const [at, event] of [...events].sort(([a], [b]) => a.localeCompare(b))) {
    const policy = policyAt(at);
    if (policy && policy !== active) {
      if (active && JSON.stringify(active.drawdown) !== JSON.stringify(policy.drawdown)) pendingFloor = null;
      active = policy; locked = policy.drawdown.allowCorrection ? policy.drawdown.locked : locked || policy.drawdown.locked;
      high = D.max(high ?? baseline ?? "0", policy.drawdown.highWater ?? high ?? baseline ?? "0").toFixed();
      const initialBase = policy.drawdown.mode === "Static" ? baseline : policy.drawdown.highWater ?? baseline;
      const derived = initialBase !== null && policy.drawdown.distance !== null ? new D(initialBase).minus(policy.drawdown.distance) : null;
      const derivedFloor = derived === null ? null : policy.drawdown.cap === null ? derived.toFixed() : D.min(derived, policy.drawdown.cap).toFixed();
      const initial = policy.drawdown.locked && policy.drawdown.cap !== null && policy.drawdown.lockTrigger === "cap"
        ? policy.drawdown.cap : policy.drawdown.initialThreshold ?? derivedFloor;
      if (initial !== null) threshold = threshold === null || policy.drawdown.allowCorrection ? initial : D.max(threshold, initial).toFixed();
    }
    // A reset at the same instant as a close belongs to the following session; its trades are applied afterwards.
    for (const close of event.close.filter((c) => c.boundary)) closeDay(close.policy);
    if (event.reset && pendingFloor !== null) {
      threshold = threshold === null ? pendingFloor : D.max(threshold, pendingFloor).toFixed(); pendingFloor = null;
      if (active?.drawdown.cap !== null && active?.drawdown.cap !== undefined && threshold !== null &&
        new D(threshold).gte(active.drawdown.cap) && active.drawdown.lockTrigger === "cap") locked = true;
    }
    const boundaryRows = event.close.filter((c) => c.boundary).map((close) => {
      const values = sessions.get(close.key)?.net ?? [];
      return point(at, values.length ? values.some((v) => v === null) ? null : sum(values as string[]) : null, close.date);
    });
    if (event.pnl.some((value) => value === null)) balance = null;
    else if (balance !== null) balance = balance.plus(sum(event.pnl as string[]));
    const adjustment = sum(event.cash); cashTotal = cashTotal.plus(adjustment);
    if (balance !== null) balance = balance.plus(adjustment);
    if (active?.drawdown.mode === "Intraday trailing" && balance !== null && threshold !== null) {
      high = D.max(high ?? balance, balance).toFixed();
      const next = nextThreshold(threshold, high, active, locked);
      if (active.drawdown.activation === "nextSession") pendingFloor = next;
      else {
        threshold = next;
        if (active.drawdown.cap !== null && new D(threshold).gte(active.drawdown.cap) && active.drawdown.lockTrigger === "cap") locked = true;
      }
    }
    if (event.payoutFloor !== null) { threshold = event.payoutFloor; pendingFloor = null; locked = true; }
    for (const close of event.close.filter((c) => !c.boundary)) closeDay(close.policy);
    const row = point(at, event.pnl.length ? event.pnl.some((v) => v === null) ? null : sum(event.pnl as string[]) : null, null);
    points.push(row);
    if (at === phase.startAt) daily.push({ ...row });
    daily.push(...boundaryRows);
    for (const close of event.close.filter((c) => !c.boundary)) {
      const values = sessions.get(close.key)?.net ?? [];
      daily.push({ ...point(at, values.length ? values.some((v) => v === null) ? null : sum(values as string[]) : null, close.date) });
    }
  }
  const last = points.at(-1);
  const missingRules = baseline === null || rules === null || sessionError || phase.kind === "Evaluation" && targetProfit === null ||
    rules.drawdown.initialThreshold === null && rules.drawdown.distance === null && !(rules.drawdown.locked && rules.drawdown.cap !== null);
  return {
    balance: pending ? null : last?.balance ?? null, netProfit,
    threshold: last?.floor ?? null, buffer: !pending && last?.balance !== null && last?.balance !== undefined && last.floor !== null ? new D(last.balance).minus(last.floor).toFixed() : null,
    baseline, targetProfit,
    remainingProfit: targetProfit !== null && netProfit !== null ? D.max(0, new D(targetProfit).minus(netProfit)).toFixed() : null,
    tradingDays: sessionError || !rules ? null : sessions.size,
    estimatedFees, limitEstimated: estimated(rules), missingFees, missingRules, pending,
    partialHistory: !phase.historyConfirmed, sessionError,
    sessionTimezone: rules?.session.timezone ?? null,
    mode: rules?.drawdown.mode ?? null,
    points: pending ? points.map((p) => ({ ...p, balance: null })) : points,
    daily: pending ? daily.map((p) => ({ ...p, balance: null })) : daily,
  };
}
export type ImportedOverview = ReturnType<typeof importedOverview>;
