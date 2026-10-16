import { TZDate } from "@date-fns/tz";
import {
  D,
  sum,
  portionExit,
  type Portion,
  type PortionFee,
} from "@/lib/journal/processing";
import { localDay } from "@/lib/journal/calculations";
import { shiftDay } from "@/lib/calendar/model";
import { localInstant, type PropRules } from "./validation";
import type { CashAdjustment } from "@/lib/balances/model";
import { trackingProgress } from "./tracking-calculations";
import type { SnapshotDetails, Payout } from "./tracking-rules";
export type Phase = {
  id: string;
  tradingAccountId: string;
  previousId: string | null;
  kind: "Evaluation" | "Funded";
  label: string;
  startAt: string;
  endAt: string | null;
  baseline: string | null;
  historyConfirmed: boolean;
  status: string;
  statusAt: string;
  note: string;
};
export type RuleVersion = {
  id: string;
  phaseId: string;
  effectiveAt: string;
  rules: PropRules;
};
export type Snapshot = {
  details?: SnapshotDetails | null;
  id: string;
  phaseId: string;
  asOf: string;
  balance: string;
  threshold: string | null;
  qualifyingDays: number | null;
  note: string;
};
export function ruleBoundary(
  date: string,
  rules: Pick<PropRules, "timezone" | "resetTime">,
) {
  // Reject nonexistent/repeated reset wall times rather than guessing a UTC offset.
  return localInstant(`${date}T${rules.resetTime}`, rules.timezone);
}
export function ruleDay(instant: string, rules: PropRules) {
  const date = localDay(instant, rules.timezone);
  const startDate =
    instant < ruleBoundary(date, rules) ? shiftDay(date, -1) : date;
  const start = ruleBoundary(startDate, rules),
    end = ruleBoundary(shiftDay(startDate, 1), rules);
  return {
    date: rules.dayLabel === "start" ? startDate : shiftDay(startDate, 1),
    start,
    end,
  };
}
// Display-input helper uses the account's source timezone, independent of journal preferences.
export function wallInput(instant: string, timezone: string, seconds = false) {
  const date = new TZDate(instant, timezone);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}${seconds ? `:${String(date.getSeconds()).padStart(2, "0")}` : ""}`;
}
export function overlaps(
  a: { startAt: string; endAt: string | null },
  b: { startAt: string; endAt: string | null },
) {
  return a.startAt < (b.endAt ?? "9999") && b.startAt < (a.endAt ?? "9999");
}
function earliest(p: Portion) {
  return p.boughtAt < p.soldAt ? p.boughtAt : p.soldAt;
}
export function phaseProgress(
  phase: Phase,
  versions: RuleVersion[],
  all: Portion[],
  fees: Record<string, PortionFee>,
  cash: CashAdjustment[],
  snapshots: Snapshot[],
  now: string,
  pending = false,
  payouts: Payout[] = [],
) {
  const stop = phase.endAt && phase.endAt < now ? phase.endAt : now;
  const scoped = all.filter(
    (p) =>
      p.tradingAccountId === phase.tradingAccountId &&
      portionExit(p) >= phase.startAt &&
      portionExit(p) < stop,
  );
  const outbound = phase.endAt
    ? all.filter(
        (p) =>
          p.tradingAccountId === phase.tradingAccountId &&
          earliest(p) >= phase.startAt &&
          earliest(p) < phase.endAt! &&
          portionExit(p) >= phase.endAt!,
      )
    : [];
  const ambiguous = [
    ...scoped.filter((p) => earliest(p) < phase.startAt),
    ...outbound,
  ];
  const portions = scoped.filter((p) => earliest(p) >= phase.startAt);
  const gross = sum(portions.map((p) => p.grossPnl));
  const unknownFees = portions.filter((p) => fees[p.id]?.amount == null).length;
  const net = unknownFees
    ? null
    : sum(
        portions.map((p) =>
          new D(p.grossPnl).minus(fees[p.id].amount!).toFixed(),
        ),
      );
  const adjustments = cash.filter(
    (c) =>
      c.tradingAccountId === phase.tradingAccountId &&
      c.effectiveAt >= phase.startAt &&
      c.effectiveAt < stop,
  );
  const ordered = [...versions].sort((a, b) =>
    a.effectiveAt.localeCompare(b.effectiveAt),
  );
  const periods = ordered.map((version, index) => {
    const r = version.rules,
      start = version.effectiveAt,
      end =
        ordered[index + 1]?.effectiveAt && ordered[index + 1].effectiveAt < stop
          ? ordered[index + 1].effectiveAt
          : stop;
    const candidates = portions.filter(
      (p) => portionExit(p) >= start && portionExit(p) < end,
    );
    const crossing = candidates.filter(
      (p) => earliest(p) < start && start > phase.startAt,
    );
    const parts = candidates.filter((p) => !crossing.includes(p));
    const targetParts = portions.filter((p) => portionExit(p) < end);
    const unknown =
      r.basis === "net"
        ? targetParts.filter((p) => fees[p.id]?.amount == null).length
        : 0;
    const estimated =
      r.basis === "net" &&
      targetParts.some((p) => fees[p.id]?.kind === "Estimated");
    const value = (p: Portion): string | null =>
      r.basis === "gross"
        ? p.grossPnl
        : fees[p.id]?.amount == null
          ? null
          : new D(p.grossPnl).minus(fees[p.id].amount!).toFixed();
    const total = unknown ? null : sum(targetParts.map((p) => value(p)!));
    const periodTotal = parts.some((p) => value(p) === null)
      ? null
      : sum(parts.map((p) => value(p)!));
    const warnings: string[] = [];
    if (!phase.historyConfirmed)
      warnings.push("Phase history has not been confirmed complete.");
    if (pending) warnings.push("Some source activity is not processed.");
    if (ambiguous.length || crossing.length)
      warnings.push(
        `${ambiguous.length + crossing.length} portions spanning a phase/rule boundary are excluded; inspect their sources.`,
      );
    if (unknown)
      warnings.push(
        `${unknown} portions have unknown fees; net progress is incomplete.`,
      );
    const dayMap = new Map<
      string,
      { date: string; start: string; end: string; parts: Portion[] }
    >();
    let boundaryError = false;
    if (r.daySettingsConfirmed)
      for (const p of parts) {
        try {
          const day = ruleDay(portionExit(p), r);
          const existing = dayMap.get(day.date);
          if (existing) existing.parts.push(p);
          else dayMap.set(day.date, { ...day, parts: [p] });
        } catch {
          boundaryError = true;
        }
      }
    if (boundaryError)
      warnings.push(
        "A rule reset falls in a DST gap/repeated hour; revise the reset settings before interpreting day results.",
      );
    const days = [...dayMap.values()]
      .sort((a, b) => a.start.localeCompare(b.start))
      .map((day) => {
        const complete = day.start >= start && day.end <= end;
        const available = day.parts.every((p) => value(p) !== null);
        const pnl = available ? sum(day.parts.map((p) => value(p)!)) : null;
        const batches = new Map<string, string[]>();
        for (const p of day.parts) {
          const at = portionExit(p);
          batches.set(at, [...(batches.get(at) ?? []), value(p) ?? "0"]);
        }
        let running = new D(0),
          minimum = new D(0);
        for (const [, values] of [...batches].sort(([a], [b]) =>
          a.localeCompare(b),
        )) {
          running = running.plus(sum(values));
          minimum = D.min(minimum, running);
        }
        return {
          date: day.date,
          start: day.start,
          end: day.end,
          complete,
          count: day.parts.length,
          pnl,
          qualifying:
            complete && pnl !== null
              ? r.qualification === "activity" ||
                new D(pnl).gte(r.dayThreshold!)
              : null,
          minimum: available ? minimum.toFixed() : null,
          lossCrossing:
            available && r.dailyLoss !== null
              ? minimum.lt(new D(r.dailyLoss).neg())
              : null,
        };
      });
    const completedClosings = new Set(
      days.filter((d) => d.end <= end && d.end > start).map((d) => d.end),
    );
    if (
      r.drawdownMode === "End-of-day trailing" &&
      r.daySettingsConfirmed &&
      start < end
    ) {
      try {
        const firstClose = ruleDay(start, r).end;
        if (firstClose <= end) completedClosings.add(firstClose);
      } catch {
        boundaryError = true;
        warnings.push(
          "The first rule-day reset is not uniquely defined; trailing-floor estimates are unavailable.",
        );
      }
    }
    const dayAvailable = r.daySettingsConfirmed && !boundaryError && !unknown;
    const qualifying = dayAvailable
      ? days.filter((d) => d.qualifying === true).length
      : null;
    const positives = days
      .filter(
        (d) => d.qualifying === true && d.pnl !== null && new D(d.pnl).gt(0),
      )
      .map((d) => d.pnl!);
    const ambiguousBeforeEnd = ambiguous.filter(
      (p) =>
        portionExit(p) < end ||
        (phase.endAt !== null && phase.endAt <= end && outbound.includes(p)),
    ).length;
    const consistency =
      dayAvailable &&
      positives.length > 0 &&
      phase.historyConfirmed &&
      !pending &&
      !ambiguousBeforeEnd &&
      !crossing.length &&
      days.every((d) => d.complete) &&
      total !== null &&
      new D(total).gt(0)
        ? new D(positives.length ? D.max(...positives).toFixed() : "0")
            .div(total)
            .times(100)
            .toFixed()
        : null;
    const consistencyMet =
      r.consistencyPercent === null || consistency === null
        ? null
        : r.consistencyComparison === "strict"
          ? new D(consistency).lt(r.consistencyPercent)
          : new D(consistency).lte(r.consistencyPercent);
    const balancePortions = portions.filter((p) => portionExit(p) < end);
    const missingPhaseFees = balancePortions.some(
      (p) => fees[p.id]?.amount == null,
    );
    if (missingPhaseFees)
      warnings.push(
        "Imported balance estimates require known fees across the entire phase; gross profit can still be shown separately.",
      );
    if (
      r.drawdownMode === "End-of-day trailing" &&
      r.startingHighWater === null
    )
      warnings.push(
        "Confirm the target account’s starting high-water mark before deriving a trailing floor.",
      );
    const balanceKnown =
      phase.baseline !== null &&
      !missingPhaseFees &&
      ambiguousBeforeEnd === 0 &&
      crossing.length === 0 &&
      phase.historyConfirmed &&
      !pending;
    let balance = phase.baseline === null ? null : new D(phase.baseline);
    let highWater =
      r.startingHighWater === null ? null : new D(r.startingHighWater);
    let floor =
      r.drawdownMode === "Static"
        ? r.staticFloor
        : r.drawdownMode === "End-of-day trailing" &&
            highWater !== null &&
            r.trailingDistance !== null
          ? highWater.minus(r.trailingDistance).toFixed()
          : null;
    const cap = (f: string | null) =>
      f !== null &&
      r.floorCap !== null &&
      r.drawdownMode === "End-of-day trailing"
        ? D.min(f, r.floorCap).toFixed()
        : f;
    floor = cap(floor);
    const events = new Map<
      string,
      { pnl: string[]; cash: string[]; close: boolean }
    >();
    for (const p of balancePortions) {
      const at = portionExit(p);
      const event = events.get(at) ?? { pnl: [], cash: [], close: false };
      const v =
        fees[p.id]?.amount == null
          ? null
          : new D(p.grossPnl).minus(fees[p.id].amount!).toFixed();
      if (v !== null) event.pnl.push(v);
      event.close = true;
      events.set(at, event);
    }
    for (const c of adjustments.filter((c) => c.effectiveAt < end)) {
      const event = events.get(c.effectiveAt) ?? {
        pnl: [],
        cash: [],
        close: false,
      };
      event.cash.push(c.amount);
      events.set(c.effectiveAt, event);
    }
    const sortedEvents = [...events].sort(([a], [b]) => a.localeCompare(b));
    const completed = [...completedClosings];
    const times = [
      ...new Set([
        ...sortedEvents.map(([at]) => at),
        ...(r.drawdownMode === "End-of-day trailing" && dayAvailable
          ? completed
          : []),
      ]),
    ].sort();
    const points: {
      at: string;
      balance: string | null;
      floor: string | null;
      reason: string;
    }[] = [];
    let cashUncertain = false,
      lastClose: string | null = null,
      lastBalance: string | null = null,
      lastFloor: string | null = null;
    const crossings: { at: string; balance: string; floor: string }[] = [];
    for (const at of times) {
      // At a reset boundary the completed day's close excludes events at the new day's start.
      if (
        at >= start &&
        completed.includes(at) &&
        r.drawdownMode === "End-of-day trailing" &&
        balanceKnown &&
        !cashUncertain &&
        balance !== null &&
        highWater !== null &&
        r.trailingDistance !== null
      ) {
        highWater = D.max(highWater, balance);
        floor = cap(highWater.minus(r.trailingDistance).toFixed());
        points.push({
          at,
          balance: balance.toFixed(),
          floor,
          reason: "Completed rule day; floor applies from this reset",
        });
      }
      const event = events.get(at);
      if (!event) continue;
      if (balance !== null)
        balance = balance.plus(sum(event.cash)).plus(sum(event.pnl));
      if (event.cash.length && at >= start && r.drawdownMode !== "Static")
        cashUncertain = true;
      if (at >= start && event.close) {
        const usableFloor =
          balanceKnown &&
          !cashUncertain &&
          r.drawdownMode !== "Intraday trailing" &&
          (r.drawdownMode !== "End-of-day trailing" || dayAvailable)
            ? floor
            : null;
        lastClose = at;
        lastBalance =
          balanceKnown && balance !== null ? balance.toFixed() : null;
        lastFloor = usableFloor;
        points.push({
          at,
          balance: lastBalance,
          floor: usableFloor,
          reason: "Imported realized close; not live equity",
        });
        if (
          lastBalance !== null &&
          usableFloor !== null &&
          new D(lastBalance).lt(usableFloor)
        )
          crossings.push({ at, balance: lastBalance, floor: usableFloor });
      }
    }
    if (phase.baseline === null)
      warnings.push(
        "Set an observed phase starting balance to estimate buffers.",
      );
    if (cashUncertain)
      warnings.push(
        "Cash adjustment treatment for trailing floors is unknown. Record a new manual dashboard threshold; no later official floor is inferred.",
      );
    if (r.drawdownMode === "Intraday trailing")
      warnings.push(
        "Intraday equity highs are unavailable. Thresholds use dated manual snapshots only.",
      );
    const balanceEstimated = balancePortions.some(
      (p) => fees[p.id]?.kind === "Estimated",
    );
    const incomplete =
      !phase.historyConfirmed ||
      pending ||
      boundaryError ||
      ambiguousBeforeEnd > 0 ||
      crossing.length > 0 ||
      unknown > 0 ||
      (missingPhaseFees &&
        (r.staticFloor !== null || r.trailingDistance !== null));
    return {
      id: version.id,
      effectiveAt: start,
      endAt: end,
      rules: r,
      total,
      periodTotal,
      portionCount: parts.length,
      qualifying,
      remainingDays:
        r.minimumDays !== null && qualifying !== null
          ? Math.max(0, r.minimumDays - qualifying)
          : null,
      remainingProfit:
        r.profitTarget !== null && total !== null
          ? D.max(0, new D(r.profitTarget).minus(total)).toFixed()
          : null,
      targetReached:
        r.profitTarget !== null && total !== null
          ? new D(total).gte(r.profitTarget)
          : null,
      consistency,
      consistencyMet,
      estimated,
      balanceEstimated,
      state: incomplete
        ? "Incomplete data"
        : estimated ||
            (balanceEstimated &&
              (r.staticFloor !== null || r.trailingDistance !== null))
          ? "Estimated"
          : r.profitTarget !== null &&
              total !== null &&
              new D(total).gte(r.profitTarget)
            ? "Target reached in imported data"
            : "Tracking",
      warnings,
      days,
      points,
      crossings,
      lastClose,
      lastBalance,
      latestFloor:
        balanceKnown &&
        !cashUncertain &&
        (r.drawdownMode !== "End-of-day trailing" || dayAvailable)
          ? floor
          : null,
      lastFloor,
      buffer:
        lastBalance !== null && lastFloor !== null
          ? new D(lastBalance).minus(lastFloor).toFixed()
          : null,
    };
  });
  // Targets use phase-to-date trading profit. Day qualification keeps the rule in force
  // for each completed interval; a rule revision does not create a phase/reset.
  const localQualifying = periods.map((p) => p.qualifying);
  periods.forEach((p, index) => {
    const earlier = periods.slice(0, index + 1);
    const gapActivity = portions.some(
      (part) =>
        portionExit(part) < ordered[0].effectiveAt &&
        portionExit(part) < p.endAt,
    );
    const counts = earlier.map((v, i) =>
      v.portionCount === 0 ? 0 : localQualifying[i],
    );
    p.qualifying =
      p.rules.daySettingsConfirmed &&
      !gapActivity &&
      counts.every((c) => c !== null)
        ? counts.reduce<number>((n, c) => n + (c ?? 0), 0)
        : null;
    p.remainingDays =
      p.rules.minimumDays !== null && p.qualifying !== null
        ? Math.max(0, p.rules.minimumDays - p.qualifying)
        : null;
    const sameBasis = earlier.every((v) => v.rules.basis === p.rules.basis);
    const positiveDays = earlier.flatMap((v) =>
      v.days
        .filter(
          (d) => d.qualifying === true && d.pnl !== null && new D(d.pnl).gt(0),
        )
        .map((d) => d.pnl!),
    );
    const ready =
      p.qualifying !== null &&
      phase.historyConfirmed &&
      !pending &&
      !ambiguous.filter((part) => portionExit(part) < p.endAt).length &&
      sameBasis &&
      earlier.every(
        (v) => v.days.every((d) => d.complete) && v.state !== "Incomplete data",
      );
    p.consistency =
      ready &&
      positiveDays.length > 0 &&
      p.total !== null &&
      new D(p.total).gt(0)
        ? new D(D.max(...positiveDays)).div(p.total).times(100).toFixed()
        : null;
    p.consistencyMet =
      p.consistency === null || p.rules.consistencyPercent === null
        ? null
        : p.rules.consistencyComparison === "strict"
          ? new D(p.consistency).lt(p.rules.consistencyPercent)
          : new D(p.consistency).lte(p.rules.consistencyPercent);
    if (!sameBasis && p.rules.consistencyPercent !== null)
      p.warnings.push(
        "Best-day consistency is unavailable across mixed gross/net rule versions; the phase profit denominator remains shown separately.",
      );
    if (
      p.qualifying === null &&
      p.rules.daySettingsConfirmed &&
      p.rules.minimumDays !== null
    )
      p.warnings.push(
        "Earlier realized activity has unconfirmed or unconfigured day rules; the full-phase qualifying count is incomplete.",
      );
  });
  const current = periods.filter((p) => p.effectiveAt <= stop).at(-1) ?? null;
  return {
    phase,
    tracking: trackingProgress(
      phase,
      versions,
      all,
      fees,
      cash,
      snapshots,
      payouts,
      now,
      pending,
    ),
    gross,
    net,
    unknownFees,
    ambiguous: ambiguous.length,
    portionCount: portions.length,
    latestActivity: scoped.map(portionExit).sort().at(-1) ?? null,
    periods,
    current,
    snapshots: snapshots
      .filter((s) => s.phaseId === phase.id)
      .sort((a, b) => b.asOf.localeCompare(a.asOf))
      .map((s) => ({
        ...s,
        buffer:
          s.threshold === null
            ? null
            : new D(s.balance).minus(s.threshold).toFixed(),
      })),
    asOf: now,
  };
}
export type PhaseProgress = ReturnType<typeof phaseProgress>;
