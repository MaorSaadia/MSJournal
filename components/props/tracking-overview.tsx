"use client";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { journalMoney } from "@/lib/journal/calculations";
import { journalTimestamp } from "@/lib/timezones";
import type { PhaseProgress } from "@/lib/props/model";
import type { Payout } from "@/lib/props/tracking-rules";
import { accountPosition } from "@/lib/props/overview-model";
import { OverviewChart } from "./overview-chart";
import { OverviewRequirements } from "./overview-requirements";
import { OverviewCalendar } from "./overview-calendar";

export function TrackingOverview({
  progress,
  timezone,
  payouts,
  onRules,
  onSnapshot,
  onBaseline,
  readOnly = false,
}: {
  progress: PhaseProgress;
  timezone: string;
  payouts: Payout[];
  onRules: () => void;
  onSnapshot: () => void;
  onBaseline: () => void;
  readOnly?: boolean;
}) {
  const p = progress.tracking;
  if (!p) return null;
  const r = p.rules;
  const money = (value: string | null) =>
    value === null ? "—" : journalMoney(value);
  const at = journalTimestamp(p.asOf, timezone);
  const snapshot = p.confirmedSnapshot && p.confirmedSnapshot.asOf === p.asOf;
  const count =
    r.stage === "Evaluation" || r.payout.dayBasis === "trading"
      ? p.tradingDays
      : p.qualifyingDays;
  const metrics = [
    {
      label: "Account balance",
      value: money(p.balance),
      note:
        p.balance === null
          ? "Add a starting balance or dated snapshot"
          : p.quality,
    },
    {
      label: "Loss threshold",
      value: money(p.threshold),
      note:
        p.threshold === null
          ? "Update from the firm dashboard"
          : `${p.locked ? "Locked" : r.drawdown.mode} · ${snapshot && p.confirmedSnapshot?.threshold !== null ? "Confirmed at snapshot" : "Supported at the balance timestamp"}`,
    },
    {
      label: "Remaining loss buffer",
      value: money(p.buffer),
      note:
        p.buffer === null
          ? "Needs balance and threshold at the same time"
          : `As of ${at} · not live risk enforcement`,
    },
    {
      label: `Phase trading P&L${p.estimatedFees ? " · estimated net" : " · net"}`,
      value: money(p.phaseProfit),
      note:
        p.phaseProfit === null
          ? `Imported gross ${money(progress.gross)} · confirm missing fees/history`
          : "Excludes payouts and balance adjustments",
    },
    {
      label:
        r.stage === "Evaluation"
          ? "Trading days"
          : r.payout.dayBasis === "trading"
            ? "Trading days this cycle"
            : "Qualifying days this cycle",
      value: count === null ? "—" : String(count),
      note:
        count === null
          ? "Confirm session history and opening days"
          : `${r.stage === "Evaluation" ? (r.evaluation.tradingDays ?? "Unspecified") : (r.payout.requiredDays ?? "Unspecified")} required · firm sessions`,
    },
  ];
  const missing =
    p.balance === null ||
    p.threshold === null ||
    progress.phase.baseline === null ||
    p.phaseProfit === null;
  const markers = accountPosition(progress);
  return (
    <div className="prop-account-overview" data-phase-id={progress.phase.id}>
      <div className="prop-overview-metrics">
        {metrics.map((m) => (
          <motion.section
            key={m.label}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <span>{m.label}</span>
            <strong>{m.value}</strong>
            <small>{m.note}</small>
          </motion.section>
        ))}
      </div>
      {missing && (
        <div className="prop-overview-data-note">
          <div>
            <strong>Complete the account picture</strong>
            <p>
              {p.balance === null
                ? "Add an actual starting balance and complete net activity, or anchor tracking to a dated firm snapshot."
                : p.threshold === null
                  ? "The supported balance remains visible. Confirm the loss threshold at the matching timestamp on the firm dashboard."
                  : p.phaseProfit === null
                    ? "Trading profit needs complete history or opening profit and recorded fees. Known balance observations remain visible."
                    : "Add the actual phase starting balance to show its reference marker."}
            </p>
          </div>
          {readOnly ? (
            <p className="small muted">
              Restore this account from More to add tracking data.
            </p>
          ) : (
            <Button
              variant="outline"
              onClick={
                p.balance === null || p.threshold === null
                  ? onSnapshot
                  : onBaseline
              }
            >
              {p.balance === null || p.threshold === null
                ? "Update dashboard snapshot"
                : "Review baseline & history"}
            </Button>
          )}
        </div>
      )}
      <OverviewChart
        progress={progress}
        timezone={timezone}
        payouts={payouts}
      />
      <section className="panel prop-account-position">
        <header className="prop-overview-panel-heading">
          <div>
            <h2>Account position</h2>
            <p>
              Supported at {at} · {p.quality}
            </p>
          </div>
        </header>
        {markers && (
          <>
            <div
              className="prop-position-track"
              role="img"
              aria-label={markers
                .map((m) => `${m.label}: ${journalMoney(m.value)}`)
                .join("; ")}
            >
              {markers.map((m) => (
                <span
                  key={m.key}
                  className={`prop-position-marker ${m.key}`}
                  style={{ left: `${m.position}%` }}
                  title={`${m.label}: ${journalMoney(m.value)}`}
                >
                  <i />
                </span>
              ))}
            </div>
            <div className="prop-position-legend">
              {markers.map((m) => (
                <span key={m.key} className={m.key}>
                  <i />
                  {m.label}
                  <strong>{journalMoney(m.value)}</strong>
                </span>
              ))}
            </div>
          </>
        )}
        <div className="prop-position-values">
          <div>
            <span>Remaining loss buffer</span>
            <strong>{money(p.buffer)}</strong>
          </div>
          <div>
            <span>Current balance</span>
            <strong>{money(p.balance)}</strong>
          </div>
          {r.stage === "Evaluation" && (
            <div>
              <span>Profit remaining to target</span>
              <strong>{money(p.remainingProfit)}</strong>
            </div>
          )}
        </div>
        <p className="prop-overview-chart-note">
          Markers are proportional, including losses, negative balances and
          exceeded targets. Missing observations have no marker.{" "}
          {r.stage === "Evaluation"
            ? "The effective balance reference accounts for recorded non-trading ledger events when known. Otherwise it is labeled as starting balance plus target. Passing is assessed on trading profit separately."
            : "A payout balance floor is shown only when saved rules specify one; it does not establish payout eligibility."}
        </p>
      </section>
      <OverviewRequirements progress={progress} timezone={timezone} />
      {r.stage !== "Evaluation" && p.payout.eligible !== null && (
        <div className="prop-overview-payout-forecast">
          <h2>Payout forecast</h2>
          <div>
            {[
              ["Estimated request", p.payout.eligible],
              ["Trader receipt", p.payout.receipt],
              ["Remaining balance", p.payout.projectedBalance],
              ["Remaining buffer", p.payout.projectedBuffer],
            ].map(([label, value]) => (
              <section key={label}>
                <span>{label}</span>
                <strong>{money(value)}</strong>
              </section>
            ))}
          </div>
          <p>
            After reserved requests and the configured split/threshold event. A
            forecast is not an approved payout or a recorded account deduction.
          </p>
        </div>
      )}
      <OverviewCalendar progress={progress} payouts={payouts} />
      <details className="prop-overview-checks">
        <summary>Data quality, manual checks & official sources</summary>
        <div>
          {[
            ...new Set([
              ...p.warnings,
              ...p.outstanding,
              ...(r.stage !== "Evaluation" ? p.payout.missing : []),
              ...r.restrictions,
            ]),
          ].map((text) => (
            <p key={text}>{text}</p>
          ))}
          <p>
            Session timezone {r.session.timezone}; reset {r.session.reset};
            close {r.session.close}.{" "}
            {r.drawdown.comparison === "touch" ? "Touching" : "Falling below"}{" "}
            the loss threshold is the saved breach comparison. Equity highs and
            concurrent exposure cannot be verified from Performance.csv.
          </p>
          {r.preset?.sources.map((url, i) => (
            <a key={url} href={url} target="_blank" rel="noreferrer">
              Official source {i + 1} · checked {r.preset?.verifiedOn}
            </a>
          ))}
          <Button variant="outline" onClick={onRules}>
            Review rules
          </Button>
        </div>
      </details>
    </div>
  );
}
