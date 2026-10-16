import type Decimal from "decimal.js";
import {
  D,
  sum,
  portionExit,
  type Portion,
  type PortionFee,
} from "@/lib/journal/processing";
import { localDay } from "@/lib/journal/calculations";
import { shiftDay } from "@/lib/calendar/model";
import { localInstant } from "./validation";
import type { Phase, RuleVersion, Snapshot } from "./model";
import type { CashAdjustment } from "@/lib/balances/model";
import type { TrackingRules, SnapshotDetails, Payout } from "./tracking-rules";

export function firmSession(at: string, r: TrackingRules) {
  const date = localDay(at, r.session.timezone);
  const startDate =
    at < localInstant(`${date}T${r.session.reset}`, r.session.timezone)
      ? shiftDay(date, -1)
      : date;
  const endDate = shiftDay(startDate, 1);
  const closeDate = r.session.close > r.session.reset ? startDate : endDate;
  return {
    date: endDate,
    start: localInstant(`${startDate}T${r.session.reset}`, r.session.timezone),
    end: localInstant(`${endDate}T${r.session.reset}`, r.session.timezone),
    close: localInstant(`${closeDate}T${r.session.close}`, r.session.timezone),
  };
}
export function nextThreshold(
  previous: string,
  high: string,
  r: TrackingRules,
  locked = false,
) {
  if (locked || r.drawdown.mode === "Static" || r.drawdown.distance === null)
    return previous;
  const candidate = new D(high).minus(r.drawdown.distance);
  return D.max(
    previous,
    r.drawdown.cap === null ? candidate : D.min(candidate, r.drawdown.cap),
  ).toFixed();
}
export function consistencyProgress(
  profit: string | null,
  best: string | null,
  r: TrackingRules,
) {
  const c = r.consistency;
  if (c.percent === null) return { percent: null, met: true, additional: "0" };
  if (profit === null || best === null || new D(profit).lte(0))
    return { percent: null, met: false, additional: null };
  const ratio = (p: Decimal) => {
    const value = new D(best).div(p).times(100);
    return c.rounding === "exact"
      ? value
      : value.toDecimalPlaces(
          c.digits,
          c.rounding === "floor" ? D.ROUND_FLOOR : D.ROUND_HALF_UP,
        );
  };
  const accepts = (p: Decimal) =>
    c.comparison === "strict"
      ? ratio(p).lt(c.percent!)
      : ratio(p).lte(c.percent!);
  const percent = ratio(new D(profit));
  let lo = new D(profit).times(100).floor(),
    hi = D.max(
      lo.plus(1),
      new D(best).times(10000).div(c.percent).ceil().plus(2),
    );
  // Search in cents using the exact configured comparison and rounding policy.
  if (!accepts(hi.div(100))) hi = hi.times(10);
  while (hi.minus(lo).gt(1)) {
    const mid = lo.plus(hi).div(2).floor();
    if (accepts(mid.div(100))) hi = mid;
    else lo = mid;
  }
  return {
    percent: percent.toFixed(),
    met: accepts(new D(profit)),
    additional: accepts(new D(profit))
      ? "0"
      : D.max(0, hi.div(100).minus(profit)).toFixed(),
  };
}
export type TrackingSnapshot = Snapshot & { details?: SnapshotDetails | null };
export function trackingProgress(
  phase: Phase,
  versions: RuleVersion[],
  all: Portion[],
  fees: Record<string, PortionFee>,
  cash: CashAdjustment[],
  snapshots: TrackingSnapshot[],
  payouts: Payout[],
  now: string,
  pending = false,
) {
  const stop = phase.endAt && phase.endAt < now ? phase.endAt : now;
  const configured = versions
    .filter((v) => v.rules.tracking && v.effectiveAt <= stop)
    .sort((a, b) => a.effectiveAt.localeCompare(b.effectiveAt));
  const version = configured.at(-1);
  if (!version) return null;
  const r = version.rules.tracking!;
  const rulesAt = (at: string) =>
    configured.filter((v) => v.effectiveAt <= at).at(-1)?.rules.tracking ?? r;
  const phaseSnapshots = snapshots
    .filter(
      (s) =>
        s.phaseId === phase.id && s.asOf <= stop && s.asOf >= phase.startAt,
    )
    .sort((a, b) => a.asOf.localeCompare(b.asOf));
  const anchor = phaseSnapshots.at(-1),
    opening = anchor?.details;
  const phasePayouts = payouts.filter((p) => p.phaseId === phase.id);
  const warnings: string[] = [];
  if (!r.session.confirmed)
    warnings.push("Confirm the firm's session timezone, reset and close time.");
  if (!r.manualConfirmed && (!r.preset || r.preset.gaps.length))
    warnings.push(
      "Review unresolved product rules and explicitly confirm custom configuration.",
    );
  if (pending) warnings.push("Process the remaining imported activity.");
  const parts = all.filter(
    (p) =>
      p.tradingAccountId === phase.tradingAccountId &&
      portionExit(p) >= phase.startAt &&
      portionExit(p) < stop,
  );
  const crossing = parts.filter(
    (p) => (p.boughtAt < p.soldAt ? p.boughtAt : p.soldAt) < phase.startAt,
  );
  if (crossing.length)
    warnings.push(
      "Activity spans a phase boundary; confirm it on the firm's dashboard.",
    );
  const usable = parts.filter((p) => !crossing.includes(p));
  const estimatedFees = usable.filter(
    (p) => fees[p.id]?.kind === "Estimated",
  ).length;
  if (estimatedFees)
    warnings.push(
      `${estimatedFees} source portions use estimated fees; net figures are estimates. Confirm actual fees before interpreting eligibility.`,
    );
  const netOf = (p: Portion) =>
    fees[p.id]?.amount == null
      ? null
      : new D(p.grossPnl).minus(fees[p.id].amount!).toFixed();
  const total = (ps: Portion[]) =>
    ps.some((p) => netOf(p) === null) ? null : sum(ps.map((p) => netOf(p)!));
  const afterAnchor = usable.filter(
    (p) => !anchor || portionExit(p) > anchor.asOf,
  );
  const anchorAt = anchor?.asOf ?? phase.startAt;
  const importedAt = afterAnchor.map(portionExit).sort().at(-1) ?? anchorAt;
  const coverageThrough = phase.historyConfirmed
    ? stop
    : [anchorAt, opening?.coverageThrough ?? anchorAt].sort().at(-1)!;
  const projectionComplete = coverageThrough >= importedAt;
  if (!projectionComplete)
    warnings.push(
      "Later activity is a partial-history projection; confirm imported coverage through its latest timestamp before interpreting eligibility.",
    );
  const observed = anchor?.balance ?? phase.baseline;
  const missingFees = afterAnchor.filter((p) => netOf(p) === null).length;
  if (missingFees)
    warnings.push(
      `${missingFees} later source portions need fees. Missing fees are not zero.`,
    );
  if (!phase.historyConfirmed && !anchor)
    warnings.push(
      "Confirm complete history or record a firm dashboard snapshot.",
    );
  if (anchor && !phase.historyConfirmed)
    warnings.push(
      "Snapshot-based partial history does not establish previous compliance.",
    );
  const phaseProfit =
    opening?.openingConfirmed &&
    opening.phaseProfit !== null &&
    total(afterAnchor) !== null
      ? new D(opening.phaseProfit).plus(total(afterAnchor)!).toFixed()
      : phase.historyConfirmed
        ? total(usable)
        : null;
  const resets = phasePayouts
    .flatMap((p) => {
      const fields = {
        requested: p.requestedAt,
        approved: p.approvedAt,
        deducted: p.deductedAt,
        paid: p.paidAt,
      };
      return Object.entries(fields)
        .filter(
          ([event, at]) =>
            at &&
            at <= stop &&
            at >= phase.startAt &&
            rulesAt(at).payout.resetEvent === event,
        )
        .map(([, at]) => at!);
    })
    .sort();
  const lastReset = resets.at(-1) ?? phase.startAt;
  const resetsAfterAnchor = resets.filter((at) => at > anchorAt);
  const cycleStart =
    resetsAfterAnchor.at(-1) ?? opening?.cycleStartedAt ?? lastReset;
  const useOpeningCycle =
    !!opening?.openingConfirmed &&
    !resetsAfterAnchor.length &&
    cycleStart <= anchorAt;
  const cycleParts = usable.filter((p) =>
    useOpeningCycle ? portionExit(p) > anchorAt : portionExit(p) >= cycleStart,
  );
  const cycleImported = total(cycleParts);
  const cycleProfit =
    useOpeningCycle && opening?.cycleProfit != null && cycleImported !== null
      ? new D(opening.cycleProfit).plus(cycleImported).toFixed()
      : phase.historyConfirmed || resetsAfterAnchor.length
        ? cycleImported
        : null;
  const payoutNumber =
    (opening?.payoutNumber ?? opening?.cycleNumber ?? 1) +
    phasePayouts.filter(
      (p) => p.approvedAt && (!opening || p.approvedAt > anchorAt),
    ).length;
  const cycleNumber =
    (opening?.cycleNumber ?? 1) +
    (opening ? resetsAfterAnchor.length : resets.length);
  let balance: string | null = observed;
  if (
    observed === null ||
    missingFees ||
    pending ||
    (!phase.historyConfirmed && !anchor) ||
    crossing.length
  )
    balance = null;
  const adjustments = cash.filter(
    (c) =>
      c.tradingAccountId === phase.tradingAccountId &&
      !payouts.some((p) => p.phaseId !== phase.id && p.deductionId === c.id) &&
      c.effectiveAt < stop &&
      (anchor ? c.effectiveAt > anchorAt : c.effectiveAt >= anchorAt),
  );
  if (balance !== null)
    balance = new D(balance)
      .plus(total(afterAnchor) ?? "0")
      .plus(sum(adjustments.map((c) => c.amount)))
      .toFixed();
  const dayMap = new Map<
    string,
    {
      date: string;
      start: string;
      end: string;
      close: string;
      profits: (string | null)[];
      opening: boolean;
      manualQualification: boolean | null;
      r: TrackingRules;
    }
  >();
  let sessionError = false;
  const assessedParts =
    r.stage === "Evaluation"
      ? phase.historyConfirmed
        ? usable
        : afterAnchor
      : cycleParts;
  for (const p of assessedParts) {
    try {
      const policy = rulesAt(portionExit(p)),
        day = firmSession(portionExit(p), policy);
      const value = dayMap.get(day.start) ?? {
        ...day,
        profits: [],
        opening: false,
        manualQualification: null as boolean | null,
        r: policy,
      };
      value.profits.push(netOf(p));
      dayMap.set(day.start, value);
    } catch {
      sessionError = true;
    }
  }
  for (const d of opening?.openingConfirmed && useOpeningCycle
    ? opening.daily
    : []) {
    try {
      const day = firmSession(
        localInstant(`${d.date}T12:00`, r.session.timezone),
        r,
      );
      const value = dayMap.get(day.start) ?? {
        ...day,
        profits: [],
        opening: true,
        manualQualification: null as boolean | null,
        r,
      };
      value.manualQualification = value.profits.length ? null : d.qualifying;
      value.profits.push(d.profit);
      value.opening = true;
      dayMap.set(day.start, value);
    } catch {
      sessionError = true;
    }
  }
  if (sessionError)
    warnings.push(
      "A session time is ambiguous or nonexistent across DST; correct it before interpreting progress.",
    );
  const days = [...dayMap.values()]
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((d) => {
      const complete =
        d.close <= coverageThrough &&
        (phase.historyConfirmed ||
          d.start > anchorAt ||
          d.opening ||
          resetsAfterAnchor.some((at) => d.start >= at));
      const net = d.profits.some((p) => p === null)
        ? null
        : sum(d.profits as string[]);
      return {
        date: d.date,
        start: d.start,
        close: d.close,
        complete,
        net,
        qualifying:
          complete && net !== null
            ? (d.manualQualification ??
              new D(net).gte(d.r.payout.dailyProfit ?? "0"))
            : null,
      };
    });
  const openingAggregate =
    !!opening?.openingConfirmed && !opening.daily.length && useOpeningCycle;
  const partialOpeningSession =
    openingAggregate &&
    days.some((d) => d.start <= anchorAt && anchorAt < d.close);
  if (partialOpeningSession)
    warnings.push(
      "Aggregate opening counts overlap a partial session. Supply dated daily opening details or a session-boundary snapshot.",
    );
  const dayDataKnown =
    r.session.confirmed &&
    !sessionError &&
    !pending &&
    !crossing.length &&
    (phase.historyConfirmed ||
      !!opening?.openingConfirmed ||
      !!resetsAfterAnchor.length) &&
    days.every((d) => d.net !== null) &&
    !partialOpeningSession;
  const completed = days.filter((d) => d.complete && d.net !== null);
  const qualifyingDays =
    dayDataKnown && (!openingAggregate || opening?.qualifyingDays !== null)
      ? completed.filter((d) => d.qualifying).length +
        (openingAggregate ? (opening!.qualifyingDays ?? 0) : 0)
      : null;
  const tradingDays =
    dayDataKnown && (!openingAggregate || opening?.tradingDays !== null)
      ? completed.length + (openingAggregate ? (opening!.tradingDays ?? 0) : 0)
      : null;
  const bestDay =
    dayDataKnown &&
    days.every((d) => d.complete) &&
    (!openingAggregate || opening?.bestDay !== null)
      ? D.max(
          "0",
          ...completed.map((d) => d.net!),
          ...(openingAggregate && opening?.bestDay ? [opening.bestDay] : []),
        ).toFixed()
      : null;
  let consistencyProfit =
    r.consistency.denominator === "positiveDays"
      ? dayDataKnown &&
        (!openingAggregate ||
          !opening?.cycleProfit ||
          new D(opening.cycleProfit).eq(0))
        ? sum(completed.filter((d) => new D(d.net!).gt(0)).map((d) => d.net!))
        : null
      : r.consistency.period === "phase"
        ? phaseProfit
        : cycleProfit;
  let assessedBest = bestDay;
  if (
    r.stage !== "Evaluation" &&
    r.consistency.period === "phase" &&
    r.consistency.percent !== null
  ) {
    const fullDays = new Map<string, string[]>();
    let supported = phase.historyConfirmed;
    for (const part of usable) {
      try {
        const day = firmSession(portionExit(part), rulesAt(portionExit(part)));
        const value = netOf(part);
        if (value === null || day.close > coverageThrough) supported = false;
        else fullDays.set(day.date, [...(fullDays.get(day.date) ?? []), value]);
      } catch {
        supported = false;
      }
    }
    const fullProfits = [...fullDays.values()].map(sum);
    assessedBest = supported ? D.max(0, ...fullProfits).toFixed() : null;
    if (r.consistency.denominator === "positiveDays")
      consistencyProfit = supported
        ? sum(fullProfits.filter((v) => new D(v).gt(0)))
        : null;
  }
  const consistency = consistencyProgress(consistencyProfit, assessedBest, r);
  const initialRules = rulesAt(anchorAt);
  let threshold = anchor?.threshold ?? initialRules.drawdown.initialThreshold;
  let high = anchor?.details?.highWater ?? initialRules.drawdown.highWater;
  let locked = anchor?.details?.locked ?? initialRules.drawdown.locked;
  let running = observed === null ? null : new D(observed),
    pendingFloor: string | null = null;
  const points: {
    at: string;
    balance: string | null;
    floor: string | null;
    reason: string;
  }[] = [
    {
      at: anchorAt,
      balance: observed,
      floor: threshold,
      reason: anchor
        ? "Confirmed firm dashboard snapshot"
        : "Recorded phase baseline",
    },
  ];
  const events = new Map<
    string,
    {
      pnl: string[];
      cash: string[];
      close: boolean;
      reset: boolean;
      payoutFloor: string | null;
    }
  >();
  const eventAt = (at: string) => {
    const e = events.get(at) ?? {
      pnl: [],
      cash: [],
      close: false,
      reset: false,
      payoutFloor: null,
    };
    events.set(at, e);
    return e;
  };
  for (const p of afterAnchor) {
    const net = netOf(p);
    if (net !== null) eventAt(portionExit(p)).pnl.push(net);
  }
  for (const c of adjustments) eventAt(c.effectiveAt).cash.push(c.amount);
  for (const s of phasePayouts) {
    for (const [event, at] of Object.entries({
      requested: s.requestedAt,
      approved: s.approvedAt,
      deducted: s.deductedAt,
      paid: s.paidAt,
    })) {
      if (!at || at <= anchorAt || at >= stop) continue;
      const config = rulesAt(at).drawdown;
      if (event === config.payoutEvent && config.payoutThreshold !== null)
        eventAt(at).payoutFloor = config.payoutThreshold;
    }
  }
  try {
    let day = firmSession(anchorAt, r),
      steps = 0;
    while (day.close < coverageThrough && steps++ < 10000) {
      if (day.close > anchorAt) eventAt(day.close).close = true;
      if (day.end > anchorAt && day.end < coverageThrough)
        eventAt(day.end).reset = true;
      day = firmSession(day.end, r);
    }
    if (steps >= 10000)
      warnings.push(
        "Tracking range exceeds 10,000 sessions; add a current snapshot.",
      );
  } catch {
    sessionError = true;
  }
  const sessionChanged = configured.some(
    (v) =>
      v.effectiveAt > anchorAt &&
      JSON.stringify(v.rules.tracking!.session) !== JSON.stringify(r.session),
  );
  const trackingGap = !anchor && configured[0].effectiveAt > phase.startAt;
  if (sessionChanged || trackingGap)
    warnings.push(
      "The session/rule history changed. Add a dated firm threshold anchor before deriving EOD threshold history.",
    );
  let eodReliable =
    balance !== null &&
    projectionComplete &&
    r.session.confirmed &&
    !sessionError &&
    high !== null &&
    r.drawdown.distance !== null &&
    r.drawdown.basis === "balance" &&
    !sessionChanged &&
    !trackingGap;
  for (const v of configured.filter((v) => v.effectiveAt > anchorAt))
    eventAt(v.effectiveAt);
  for (const [at, e] of [...events].sort(([a], [b]) => a.localeCompare(b))) {
    const policy = rulesAt(at);
    const change = configured.find((v) => v.effectiveAt === at)?.rules.tracking;
    if (
      change?.drawdown.initialThreshold !== null &&
      change?.drawdown.initialThreshold !== undefined
    )
      threshold =
        change.drawdown.allowCorrection || threshold === null
          ? change.drawdown.initialThreshold
          : D.max(threshold, change.drawdown.initialThreshold).toFixed();
    if (e.reset && pendingFloor !== null) {
      threshold =
        threshold === null
          ? pendingFloor
          : D.max(threshold, pendingFloor).toFixed();
      pendingFloor = null;
    }
    if (
      e.close &&
      eodReliable &&
      running !== null &&
      high !== null &&
      threshold !== null &&
      policy.drawdown.mode === "End-of-day trailing"
    ) {
      high = D.max(high, running).toFixed();
      const value = nextThreshold(threshold, high, policy, locked);
      if (policy.drawdown.activation === "nextSession") pendingFloor = value;
      else threshold = value;
      if (
        policy.drawdown.lockTrigger === "cap" &&
        policy.drawdown.cap !== null &&
        new D(value).gte(policy.drawdown.cap)
      )
        locked = true;
    }
    if (e.payoutFloor !== null) {
      threshold = e.payoutFloor;
      locked = true;
    }
    if (running !== null) running = running.plus(sum(e.pnl)).plus(sum(e.cash));
    if (
      e.cash.length &&
      policy.drawdown.mode !== "Static" &&
      !locked &&
      e.payoutFloor === null
    )
      eodReliable = false;
    if (
      e.pnl.length ||
      e.cash.length ||
      e.close ||
      e.reset ||
      e.payoutFloor !== null
    )
      points.push({
        at,
        balance:
          balance !== null && running !== null ? running.toFixed() : null,
        floor:
          at < configured[0].effectiveAt ||
          (policy.drawdown.mode === "Intraday trailing" && !locked) ||
          (!eodReliable && policy.drawdown.mode !== "Static")
            ? null
            : threshold,
        reason: e.close
          ? "Completed session close"
          : e.reset
            ? "Next session activation"
            : "Realized close / recorded event; not live equity",
      });
  }
  if (anchorAt < configured[0].effectiveAt) points[0].floor = null;
  const latestActivity = [
    anchorAt,
    ...afterAnchor.map(portionExit),
    ...adjustments.map((c) => c.effectiveAt),
    ...points.filter((p) => p.floor !== null).map((p) => p.at),
  ]
    .sort()
    .at(-1)!;
  const thresholdKnown =
    r.drawdown.mode === "Static" ||
    locked ||
    (r.drawdown.mode === "End-of-day trailing" && eodReliable);
  const currentThreshold = thresholdKnown
    ? threshold
    : latestActivity <= anchorAt
      ? (anchor?.threshold ?? null)
      : null;
  if (r.drawdown.mode === "Intraday trailing" && !locked)
    warnings.push(
      "Intraday equity highs are not in Performance.csv. Only the dated firm threshold is confirmed; later thresholds are unknown.",
    );
  const buffer =
    balance !== null && currentThreshold !== null
      ? new D(balance).minus(currentThreshold).toFixed()
      : null;
  const breachObserved = points.some(
    (p) =>
      p.floor !== null &&
      p.balance !== null &&
      (r.drawdown.comparison === "touch"
        ? new D(p.balance).lte(p.floor)
        : new D(p.balance).lt(p.floor)),
  );
  const ledgerBase = r.ledgerStart ?? (!anchor ? phase.baseline : null);
  const completedCycleCount = Math.max(0, payoutNumber - 1);
  const outstanding: string[] = [];
  if (r.stage === "Evaluation") {
    if (phaseProfit === null)
      outstanding.push("Confirm phase profit / complete net history.");
    else if (r.evaluation.target === null)
      outstanding.push("Configure the evaluation target.");
    else if (new D(phaseProfit).lt(r.evaluation.target))
      outstanding.push("Reach the profit target.");
    if (r.evaluation.tradingDays === null)
      outstanding.push(
        "Confirm the required trading-day count; enter zero when none is required.",
      );
    if (
      r.evaluation.tradingDays !== null &&
      (tradingDays === null || tradingDays < r.evaluation.tradingDays)
    )
      outstanding.push("Complete the required trading days.");
  }
  if (!consistency.met)
    outstanding.push(
      "Meet consistency; additional profit assumes your best day does not increase.",
    );
  if (currentThreshold === null || balance === null)
    outstanding.push("Update the confirmed balance and loss threshold.");
  if (breachObserved)
    outstanding.push(
      "Review an observed threshold crossing with the firm; status is not automatically changed.",
    );
  let tierCutoff = anchorAt;
  try {
    tierCutoff = firmSession(stop, r).start;
  } catch {
    /* Reported in session warnings. */
  }
  const tierReference =
    r.positions.activation === "immediate"
      ? balance
      : (points
          .filter(
            (p) =>
              p.reason === "Completed session close" &&
              p.balance !== null &&
              p.at < tierCutoff,
          )
          .at(-1)?.balance ?? observed);
  const tierProfit =
    tierReference !== null && ledgerBase !== null
      ? new D(tierReference).minus(ledgerBase)
      : null;
  const tier =
    tierProfit === null
      ? null
      : ([...r.positions.tiers]
          .sort((a, b) => new D(a.profit).cmp(b.profit))
          .filter((t) => tierProfit.gte(t.profit))
          .at(-1) ?? null);
  const positionLimits = {
    minis: tier?.minis ?? r.positions.minis,
    micros: tier?.micros ?? r.positions.micros,
    dailyLoss:
      r.daily.mode === "tiers"
        ? (tier?.dailyLoss ?? null)
        : r.daily.mode === "fixed"
          ? r.daily.amount
          : null,
  };
  const payoutMissing: string[] = [];
  const p = r.payout;
  if (!p.enabled || r.stage === "Evaluation")
    payoutMissing.push("Payouts are not enabled for this stage.");
  if (!p.verified && !r.manualConfirmed)
    payoutMissing.push("Confirm the product's complete payout policy.");
  if (phase.endAt)
    payoutMissing.push(
      "This phase has ended; new payout forecasts require an active funded phase.",
    );
  if (breachObserved || crossing.length)
    payoutMissing.push(
      "Resolve the observed threshold / phase boundary warning with the firm.",
    );
  if (!r.manualConfirmed && r.preset?.gaps.length)
    payoutMissing.push(...r.preset.gaps);
  if (
    cycleProfit === null ||
    qualifyingDays === null ||
    balance === null ||
    currentThreshold === null
  )
    payoutMissing.push(
      "Confirm cycle opening values, complete sessions, fees, balance and threshold.",
    );
  if (
    opening?.openingConfirmed &&
    opening.payoutNumber === null &&
    (p.caps.length || p.maxPayouts !== null)
  )
    payoutMissing.push(
      "Confirm the next payout number; cycle number alone does not establish approved payout count.",
    );
  if (p.resetEvent === null)
    payoutMissing.push("Configure the precise payout-cycle reset event.");
  if (p.minimum === null)
    payoutMissing.push("Configure the minimum payout request.");
  if (p.requiredDays === null)
    payoutMissing.push(
      "Configure the required payout-day count; enter zero when none is required.",
    );
  if (
    p.requiredDays !== null &&
    (qualifyingDays === null || qualifyingDays < p.requiredDays)
  )
    payoutMissing.push("Complete the required qualifying days.");
  if (
    p.minimumCycleProfit !== null &&
    (cycleProfit === null || new D(cycleProfit).lt(p.minimumCycleProfit))
  )
    payoutMissing.push("Reach the required cycle profit.");
  if (p.maxPayouts !== null && completedCycleCount >= p.maxPayouts)
    payoutMissing.push(
      "The configured maximum payout count has been reached; record the firm's next phase separately.",
    );
  if (!consistency.met) payoutMissing.push("Meet cycle consistency.");
  if (estimatedFees)
    payoutMissing.push(
      "Replace estimated fees with confirmed fees for payout eligibility.",
    );
  if (pending || sessionError || !r.session.confirmed || partialOpeningSession)
    payoutMissing.push("Resolve incomplete tracking inputs.");
  if (!projectionComplete)
    payoutMissing.push("Confirm complete activity after the snapshot cutoff.");
  if (r.evaluation.expiry && stop >= r.evaluation.expiry)
    outstanding.push("The recorded evaluation access period has ended.");
  const firstTrade =
    cycleParts
      .map((p) => (p.boughtAt < p.soldAt ? p.boughtAt : p.soldAt))
      .sort()[0] ?? null;
  const waitAnchor =
    p.waitFrom === "firstTrade"
      ? firstTrade
      : p.waitFrom === "lastPaid"
        ? (phasePayouts
            .map((p) => p.paidAt)
            .filter((p): p is string => !!p)
            .sort()
            .at(-1) ?? null)
        : cycleStart;
  const earliestRequest =
    p.waitHours !== null && waitAnchor
      ? new Date(
          new Date(waitAnchor).getTime() + p.waitHours * 3600000,
        ).toISOString()
      : null;
  if (p.waitHours && (!earliestRequest || stop < earliestRequest))
    payoutMissing.push("Wait until the configured request time.");
  const dailyCapExceeded =
    p.dailyProfitCap !== null &&
    days.some((d) => d.net !== null && new D(d.net).gt(p.dailyProfitCap!));
  if (dailyCapExceeded)
    payoutMissing.push(
      "A daily profit cap was exceeded. Confirm the firm's forfeiture adjustment and a new dashboard snapshot.",
    );
  const reserved = sum(
    phasePayouts
      .filter(
        (p) =>
          ["Requested", "Approved", "Paid"].includes(p.status) && !p.deductedAt,
      )
      .map((p) => p.approvedAmount ?? p.requestedAmount),
  );
  if (phasePayouts.some((p) => p.status === "Paid" && !p.deductedAt))
    payoutMissing.push(
      "Record the actual account deduction for the paid payout; it remains reserved in the forecast.",
    );
  let eligible: string | null = null;
  if (!payoutMissing.length && balance !== null && currentThreshold !== null) {
    const postThreshold =
      r.drawdown.payoutEvent && r.drawdown.payoutThreshold !== null
        ? r.drawdown.payoutThreshold
        : currentThreshold;
    const remainingFloor = D.max(
      new D(postThreshold).plus(
        r.drawdown.comparison === "touch" ? "0.01" : "0",
      ),
      p.minimumBalanceAfter ?? postThreshold,
      new D(postThreshold).plus(p.protectedBuffer ?? "0"),
    );
    const available = new D(balance).minus(reserved).minus(remainingFloor);
    let max = D.max(0, available);
    if (
      p.minimumBalanceToSubmit !== null &&
      new D(balance).minus(reserved).lt(p.minimumBalanceToSubmit)
    )
      max = new D(0);
    const cap = p.caps[Math.min(payoutNumber - 1, p.caps.length - 1)];
    if (cap !== undefined) max = D.min(max, cap);
    if (p.profitPercent !== null) {
      const base =
        p.percentBasis === "cycleProfit"
          ? cycleProfit
          : ledgerBase !== null
            ? new D(balance).minus(ledgerBase).toFixed()
            : null;
      if (base === null)
        payoutMissing.push(
          "Confirm the ledger profit baseline for the percentage cap.",
        );
      else
        max = D.min(
          max,
          D.max(0, new D(base).times(p.profitPercent).div(100).minus(reserved)),
        );
    }
    eligible = payoutMissing.length
      ? null
      : max.toDecimalPlaces(2, D.ROUND_FLOOR).toFixed();
    if (eligible !== null && new D(eligible).lt(p.minimum!)) eligible = "0";
  }
  const projectedBalance =
    eligible !== null && balance !== null
      ? new D(balance).minus(reserved).minus(eligible).toFixed()
      : null;
  const payoutThreshold =
    r.drawdown.payoutThreshold !== null
      ? D.max(
          currentThreshold ?? r.drawdown.payoutThreshold,
          r.drawdown.payoutThreshold,
        ).toFixed()
      : currentThreshold;
  return {
    rules: r,
    versionId: version.id,
    estimatedFees,
    phaseProfit,
    cycleProfit,
    cycleNumber,
    payoutNumber,
    cycleStart,
    qualifyingDays,
    tradingDays,
    bestDay,
    consistency,
    remainingProfit:
      phaseProfit !== null && r.evaluation.target !== null
        ? D.max(0, new D(r.evaluation.target).minus(phaseProfit)).toFixed()
        : null,
    balance,
    threshold: currentThreshold,
    buffer,
    asOf: latestActivity,
    confirmedSnapshot: anchor ?? null,
    highWater: high,
    locked,
    quality: estimatedFees
      ? "Includes estimated fees; not a confirmed firm balance"
      : anchor && latestActivity === anchorAt
        ? "Confirmed snapshot"
        : "Derived from recorded activity; not live equity",
    days,
    points,
    positionLimits,
    breachObserved,
    warnings: [...new Set(warnings)],
    outstanding,
    status:
      phase.status === "Passed"
        ? "Officially passed, recorded by user"
        : ["Failed", "Closed"].includes(phase.status)
          ? `${phase.status}, recorded by user`
          : warnings.some((w) => !w.startsWith("Snapshot-based")) ||
              outstanding.some(
                (s) => s.startsWith("Confirm") || s.startsWith("Update"),
              )
            ? "Needs verification"
            : outstanding.length ||
                (r.stage !== "Evaluation" &&
                  (payoutMissing.length || eligible === "0"))
              ? "In progress"
              : "Tracked requirements met",
    payout: {
      missing: [...new Set(payoutMissing)],
      eligible,
      receipt:
        eligible === null
          ? null
          : new D(eligible)
              .times(p.split)
              .div(100)
              .toDecimalPlaces(2, D.ROUND_FLOOR)
              .toFixed(),
      reserved,
      earliestRequest,
      projectedBalance,
      projectedBuffer:
        projectedBalance !== null && payoutThreshold !== null
          ? new D(projectedBalance).minus(payoutThreshold).toFixed()
          : null,
    },
  };
}
export type TrackingProgress = ReturnType<typeof trackingProgress>;
