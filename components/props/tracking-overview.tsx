"use client";
import Link from "next/link";
import { D } from "@/lib/journal/processing";
import { Button } from "@/components/ui/button";
import { journalMoney } from "@/lib/journal/calculations";
import { journalTimestamp } from "@/lib/timezones";
import type { PhaseProgress } from "@/lib/props/model";
import type { Payout } from "@/lib/props/tracking-rules";
import { OverviewChart } from "./overview-chart";
import { OverviewRequirements } from "./overview-requirements";
import { OverviewCalendar } from "./overview-calendar";

export function TrackingOverview({ progress, timezone, payouts, onRules, latestImport, readOnly = false }: {
  progress: PhaseProgress; timezone: string; payouts: Payout[];
  onRules: () => void; latestImport: string | null; readOnly?: boolean;
}) {
  const o = progress.imported;
  const p = progress.tracking;
  const money = (value: string | null, signed = false) => value === null ? "\u2014" : journalMoney(value, signed);
  const metrics = [
    { label: "Account balance", value: money(o.balance), note: "Starting balance plus imported net P&L and recorded adjustments.", estimated: o.estimatedFees },
    { label: "Net profit", value: money(o.netProfit, true), note: "Imported realized P&L after recorded fees. Excludes payouts and balance adjustments.", estimated: o.estimatedFees },
    ...(o.targetProfit !== null ? [{ label: "Profit remaining", value: money(o.remainingProfit), note: "Remaining net profit toward the saved target.", estimated: o.estimatedFees }] : []),
    { label: "Loss limit", value: money(o.threshold), note: "Minimum permitted account balance under the saved drawdown rules.", estimated: o.limitEstimated },
    { label: "Remaining loss buffer", value: money(o.buffer), note: "Calculated account balance minus the loss limit.", estimated: o.limitEstimated || o.estimatedFees },
    { label: "Trading days", value: o.tradingDays === null ? "\u2014" : String(o.tradingDays), note: `Sessions with imported trade closes in ${o.sessionTimezone ?? "the configured session timezone"}.`, estimated: false },
  ];
  const ratio = o.netProfit !== null && o.targetProfit !== null && new D(o.targetProfit).gt(0)
    ? D.min(100, D.max(0, new D(o.netProfit).div(o.targetProfit).times(100))).toNumber() : null;
  return (
    <div className="prop-account-overview prop-imported-overview" data-phase-id={progress.phase.id}>
      <div className="prop-import-status">
        <span>Based on imported trades{latestImport ? ` \u00b7 Last imported ${journalTimestamp(latestImport, timezone)}` : " \u00b7 No trades imported yet"}</span>
        <small>Not a live broker balance</small>
        {o.missingRules && !readOnly && <Button variant="outline" onClick={onRules}>Set account rules</Button>}
      </div>
      <div className={`prop-overview-metrics ${o.targetProfit !== null ? "has-target" : ""}`}>
        {metrics.map((metric) => <section key={metric.label} tabIndex={0} title={metric.note}
          className={metric.label === "Net profit" && o.netProfit !== null ? new D(o.netProfit).lt(0) ? "negative" : "positive" : ""}>
          <span>{metric.label}</span><strong>{metric.value}</strong>
          {metric.estimated && <em className="prop-estimate-label">Estimated</em>}
          <small>{metric.note}</small>
        </section>)}
      </div>
      {o.missingFees > 0 && <p className="prop-overview-hint">{o.missingFees} imported records need fees before net results can be calculated. <Link href={`/fees?accountId=${progress.phase.tradingAccountId}`}>Add fees</Link></p>}
      {o.pending && <p className="prop-overview-hint">Some imports still need processing. <Link href={`/trade-view?accounts=${progress.phase.tradingAccountId}`}>Review imports</Link></p>}
      {o.mode === "Intraday trailing" && <p className="prop-overview-hint">Estimated from closed trades. Your firm’s intraday limit may differ.</p>}
      {o.mode !== "Intraday trailing" && o.limitEstimated && <p className="prop-overview-hint">Loss limit estimated from closed trades{ o.estimatedFees ? " and estimated fees" : "" }; open-position P&L is not included.</p>}
      <OverviewChart progress={progress} timezone={timezone} payouts={payouts} />
      {o.targetProfit !== null && <section className="panel prop-simple-target" aria-label="Profit target progress">
        <header><h2>Profit target</h2><span>{money(o.netProfit, true)} <small>/ {money(o.targetProfit)}</small></span></header>
        {ratio !== null && <div className="prop-target-track" role="progressbar" aria-label="Profit target" aria-valuemin={0} aria-valuemax={100} aria-valuenow={ratio}
          aria-valuetext={`${money(o.netProfit, true)} net profit of ${money(o.targetProfit)} target`}><span style={{ width: `${ratio}%` }} /></div>}
        <footer><span>Profit remaining <strong>{money(o.remainingProfit)}</strong></span><small>Other requirements are assessed separately. Firm approval remains separate.</small></footer>
      </section>}
      {p && <OverviewCalendar progress={progress} payouts={payouts} />}
      {p && <details className="prop-overview-checks"><summary>Other account requirements</summary><OverviewRequirements progress={progress} timezone={timezone} /></details>}
    </div>
  );
}
