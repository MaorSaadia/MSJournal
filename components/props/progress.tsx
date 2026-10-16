"use client";
import Link from "next/link";
import { journalMoney, localDay } from "@/lib/journal/calculations";
import { journalTimestamp } from "@/lib/timezones";
import type { PhaseProgress } from "@/lib/props/model";
import { Help } from "@/components/dashboard/panel";
export function ProgressBar({
  value,
  target,
}: {
  value: string | null;
  target: string | null;
}) {
  const fill =
    value !== null && target !== null && Number(target) > 0
      ? Math.max(0, Math.min(100, (Number(value) / Number(target)) * 100))
      : 0;
  return (
    <div className="prop-progress-bar" aria-hidden>
      <span style={{ width: `${fill}%` }} />
    </div>
  );
}
export function PropSummary({
  progress,
  timezone,
}: {
  progress: PhaseProgress | null;
  timezone: string;
}) {
  const p = progress?.current;
  const tracked = progress?.tracking;
  if (tracked)
    return (
      <div className="prop-card-progress">
        <p>
          <strong>
            {tracked.rules.product} · {tracked.rules.stage}
          </strong>
          <span className="badge violet-badge">
            {tracked.rules.drawdown.mode}
          </span>
        </p>
        <div>
          <span>
            {tracked.rules.stage === "Evaluation"
              ? `${tracked.estimatedFees ? "Estimated net" : "Net"} profit toward target`
              : `Payout cycle ${tracked.cycleNumber}`}
          </span>
          <strong>
            {tracked.rules.stage === "Evaluation"
              ? tracked.phaseProfit === null
                ? "Confirm starting profit"
                : journalMoney(tracked.phaseProfit, true)
              : tracked.payout.eligible === null
                ? "Complete payout inputs"
                : `${journalMoney(tracked.payout.eligible)} estimated request`}
          </strong>
          {tracked.rules.stage === "Evaluation" && (
            <ProgressBar
              value={tracked.phaseProfit}
              target={tracked.rules.evaluation.target}
            />
          )}
        </div>
        <div>
          <span>Remaining loss buffer</span>
          <strong>
            {tracked.buffer === null
              ? "Update from firm dashboard"
              : journalMoney(tracked.buffer)}
          </strong>
          <small>
            {journalTimestamp(tracked.asOf, timezone)} · {tracked.quality}
          </small>
        </div>
        <div>
          <span>Qualifying days</span>
          <strong>
            {tracked.qualifyingDays ?? "Confirm opening days"} /{" "}
            {tracked.rules.payout.requiredDays ??
              tracked.rules.evaluation.tradingDays ??
              "Not configured"}
          </strong>
        </div>
        <p>
          {tracked.outstanding[0] ??
            (tracked.rules.stage === "Evaluation"
              ? tracked.status
              : (tracked.payout.missing[0] ?? tracked.status))}
        </p>
      </div>
    );
  return (
    <div className="prop-card-progress">
      <div>
        <span>Profit target</span>
        <strong>
          {p?.rules.profitTarget !== null && p
            ? `${journalMoney(p.total)} / ${journalMoney(p.rules.profitTarget)}`
            : "Not configured"}
        </strong>
        {p && <ProgressBar value={p.total} target={p.rules.profitTarget} />}
      </div>
      <div>
        <span>Qualifying days</span>
        <strong>
          {p && p.rules.minimumDays !== null
            ? `${p.qualifying ?? "Unconfirmed"} / ${p.rules.minimumDays}`
            : "Not configured"}
        </strong>
      </div>
      <div>
        <span>
          {p?.balanceEstimated
            ? "Imported balance · estimated fees"
            : "Imported balance estimate"}
        </span>
        <strong>{journalMoney(p?.lastBalance ?? null)}</strong>
      </div>
      <div>
        <span>Latest manual balance</span>
        <strong>{journalMoney(progress?.snapshots[0]?.balance ?? null)}</strong>
      </div>
      <div>
        <span>Buffer at last imported close</span>
        <strong>{journalMoney(p?.buffer ?? null)}</strong>
      </div>
      <p>
        {p?.state ?? "Set up a tracking phase"}
        {progress?.latestActivity
          ? ` · ${journalTimestamp(progress.latestActivity, timezone)}`
          : " · No imported phase activity"}
      </p>
    </div>
  );
}
export function RequirementOverview({
  progress,
  timezone,
}: {
  progress: PhaseProgress;
  timezone: string;
}) {
  const p = progress.current;
  if (!p)
    return (
      <p className="prop-setup">
        Configure optional rules in the Rules tab to start tracking
        requirements.
      </p>
    );
  const r = p.rules;
  return (
    <>
      <div className="prop-metrics">
        <section>
          <span>
            Trading profit · {r.basis}
            <Help
              label="Trading profit"
              text="Phase-to-date profit since the original tracking cutoff, evaluated with the selected version’s P&L basis. Rule edits never reset phase profit. Deposits and withdrawals are excluded. Unknown net fees remain incomplete; estimated fees are labeled."
            />
          </span>
          <strong className={Number(p.total) < 0 ? "negative" : "positive"}>
            {journalMoney(p.total, true)}
          </strong>
          <small>
            {r.profitTarget === null
              ? "Target not configured"
              : `Target ${journalMoney(r.profitTarget)} · remaining ${journalMoney(p.remainingProfit)}`}
          </small>
          <ProgressBar value={p.total} target={r.profitTarget} />
        </section>
        <section>
          <span>
            Completed qualifying days
            <Help
              label="Qualifying days"
              text="Confirmed rule timezone/reset only. Count is based on imported realized exits, not opening-trade coverage. Partial and unfinished rule days are excluded. Phase counts retain the confirmed rules in force for each historical interval."
            />
          </span>
          <strong>{p.qualifying ?? "Unconfirmed"}</strong>
          <small>
            {r.minimumDays === null
              ? "Minimum not configured"
              : `${p.remainingDays ?? "Unknown"} remaining of ${r.minimumDays}`}
          </small>
        </section>
        <section>
          <span>
            Buffer at last imported close
            <Help
              label="Drawdown buffer"
              text="An imported balance estimate versus the floor applicable at that observation. Balance uses the phase baseline plus net realized P&L and recorded cash; estimated fees remain estimates. Not live available risk. A positive buffer does not prove no breach occurred between observations."
            />
          </span>
          <strong>{journalMoney(p.buffer, true)}</strong>
          <small>
            {p.lastClose
              ? new Date(p.lastClose).toISOString()
              : "Set a baseline and supported rule"}
          </small>
        </section>
        <section>
          <span>Next applicable floor</span>
          <strong>{journalMoney(p.latestFloor)}</strong>
          <small>
            {r.drawdownMode} ·{" "}
            {p.balanceEstimated ? "estimated fees" : "after known fees"}
          </small>
        </section>
      </div>
      <div className="prop-requirements">
        <h2>
          Requirements <span className="badge violet-badge">{p.state}</span>
        </h2>
        <dl>
          <div>
            <dt>Profit target</dt>
            <dd>
              {r.profitTarget === null
                ? "Not configured"
                : p.targetReached
                  ? "Target reached in imported data; status unchanged"
                  : "Tracking"}
            </dd>
          </div>
          <div>
            <dt>Qualifying days</dt>
            <dd>
              {r.minimumDays === null
                ? "Not configured"
                : p.qualifying === null
                  ? "Confirm day settings / resolve incomplete data"
                  : p.qualifying >= r.minimumDays
                    ? "Count reached in imported data"
                    : "Tracking completed rule days"}
            </dd>
          </div>
          <div>
            <dt>
              Daily loss · realized only{" "}
              <Help
                label="Daily loss"
                text="Checks chronological realized-close prefixes, batching equal timestamps. Performance.csv does not include unrealized equity, so this cannot prove whether an intraday equity limit was breached. A recovered final daily total does not erase an observed crossing. A crossing is strictly below minus the configured limit; equality is the boundary."
              />
            </dt>
            <dd>
              {r.dailyLoss === null
                ? "Not configured"
                : !r.daySettingsConfirmed
                  ? "Day settings not confirmed"
                  : `${p.days.filter((d) => d.lossCrossing).length} observed realized crossings · limit ${journalMoney(r.dailyLoss)}`}
            </dd>
          </div>
          <div>
            <dt>Drawdown</dt>
            <dd>
              {r.drawdownMode === "Intraday trailing"
                ? "Manual snapshots; equity high-water unsupported"
                : `${p.crossings.length} imported threshold crossings observed`}
            </dd>
          </div>
          <div>
            <dt>
              Best-day consistency{" "}
              <Help
                label="Consistency formula"
                text="Largest positive qualifying-day P&L / phase-to-date P&L. Denominator includes all phase-to-date realized outcomes, including losing/nonqualifying days, and excludes cash. Evaluated only when total P&L is positive. This custom formula is not universal firm policy."
              />
            </dt>
            <dd>
              {r.consistencyPercent === null
                ? "Not configured"
                : `${p.consistency === null ? "Unavailable" : Number(p.consistency).toFixed(2) + "%"} · ${r.consistencyComparison === "strict" ? "<" : "≤"} ${r.consistencyPercent}%${p.consistencyMet === null ? "" : p.consistencyMet ? " · within configured threshold" : " · above configured threshold"}`}
            </dd>
          </div>
          <div>
            <dt>Maximum contracts</dt>
            <dd>
              {r.maximumContracts === null
                ? "Not configured"
                : `${r.maximumContracts} · reference only; concurrent open exposure unavailable`}
            </dd>
          </div>
        </dl>
      </div>
      {p.warnings.length > 0 && (
        <details className="prop-guidance">
          <summary>Data confidence · {p.warnings.length} items</summary>
          {p.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </details>
      )}
      <p className="prop-local-note">
        Rule period {p.effectiveAt} → {p.endAt} · {r.timezone}, reset{" "}
        {r.resetTime}, {r.dayLabel}-date labels.{" "}
        {r.daySettingsConfirmed
          ? "Day settings confirmed"
          : "Day settings unconfirmed"}
        .
      </p>
      <p className="prop-local-note">
        Full phase realized P&L: gross {journalMoney(progress.gross, true)} ·
        net {journalMoney(progress.net, true)}.{" "}
        <Link
          href={`/trade-view?accounts=${progress.phase.tradingAccountId}&start=${localDay(progress.phase.startAt, timezone)}&end=${localDay(progress.phase.endAt ?? progress.asOf, timezone)}&dateBasis=activity&outcomeBasis=portions`}
        >
          Inspect sources
        </Link>
      </p>
    </>
  );
}
