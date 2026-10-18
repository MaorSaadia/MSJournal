"use client";
import { journalMoney } from "@/lib/journal/calculations";
import { journalTimestamp } from "@/lib/timezones";
import type { PhaseProgress } from "@/lib/props/model";
import { ProgressBar } from "./progress";
export function TrackingOverview({
  progress,
  timezone,
}: {
  progress: PhaseProgress;
  timezone: string;
}) {
  const p = progress.tracking;
  if (!p) return null;
  const r = p.rules,
    money = (v: string | null) =>
      v === null ? "Confirm on firm dashboard" : journalMoney(v, true);
  return (
    <>
      <div className="prop-freshness prop-rule-summary">
        <strong>
          {r.firm} · {r.product} · {r.stage}
        </strong>
        <span className="badge violet-badge">{r.drawdown.mode}</span>
        <span>
          {r.preset?.customized
            ? "Customized"
            : r.preset
              ? `Preset parameters checked ${r.preset.verifiedOn}`
              : "Custom rules"}
        </span>
        <span>{p.status}</span>
      </div>
      <div className="prop-metrics">
        <section>
          <span>
            {r.stage === "Evaluation"
              ? `${p.estimatedFees ? "Estimated net" : "Net"} profit toward target`
              : `${p.estimatedFees ? "Estimated net" : "Net"} profit this payout cycle`}
          </span>
          <strong>
            {money(r.stage === "Evaluation" ? p.phaseProfit : p.cycleProfit)}
          </strong>
          <small>
            {r.stage === "Evaluation"
              ? `Remaining ${money(p.remainingProfit)}`
              : `Cycle ${p.cycleNumber} · best day ${money(p.bestDay)}`}
          </small>
          {r.stage === "Evaluation" && (
            <ProgressBar value={p.phaseProfit} target={p.effectiveTarget} />
          )}
        </section>
        <section>
          <span>Current supported balance</span>
          <strong>{money(p.balance)}</strong>
          <small>{p.quality}</small>
        </section>
        <section>
          <span>Loss threshold</span>
          <strong>{money(p.threshold)}</strong>
          <small>
            {p.locked
              ? "Locked (recorded / configured event)"
              : r.drawdown.mode}{" "}
            ·{" "}
            {r.drawdown.comparison === "touch"
              ? "Touching is a breach"
              : "Falling below is a breach"}
          </small>
        </section>
        <section>
          <span>Remaining loss buffer</span>
          <strong>{money(p.buffer)}</strong>
          <small>{journalTimestamp(p.asOf, timezone)} · not live risk</small>
        </section>
      </div>
      {r.stage !== "Evaluation" && p.payout.eligible === null && (
        <section
          className="prop-payout-notice"
          aria-label="Payout estimate needs confirmation"
        >
          <strong>Payout estimate needs confirmation</strong>
          <p>
            {p.payout.missing[0] ?? "Complete the missing inputs below."} Use
            Rules or Update from firm dashboard to add the missing details.
          </p>
        </section>
      )}
      {r.stage !== "Evaluation" && p.payout.eligible !== null && (
        <div className="prop-metrics">
          <section>
            <span>Estimated eligible request</span>
            <strong>
              {p.payout.eligible === null
                ? "Complete missing inputs"
                : journalMoney(p.payout.eligible)}
            </strong>
            <small>Forecast only; firm approval is separate</small>
          </section>
          <section>
            <span>Estimated trader receipt</span>
            <strong>{money(p.payout.receipt)}</strong>
            <small>
              {r.payout.split}% split · reserved requests{" "}
              {journalMoney(p.payout.reserved)}
            </small>
          </section>
          <section>
            <span>Projected balance after request</span>
            <strong>{money(p.payout.projectedBalance)}</strong>
            <small>
              After reserved requests and estimated eligible request
            </small>
          </section>
          <section>
            <span>Projected remaining buffer</span>
            <strong>{money(p.payout.projectedBuffer)}</strong>
            <small>Includes configured payout threshold change</small>
          </section>
        </div>
      )}
      <section className="prop-requirements">
        <h2>Requirements & next action</h2>
        <dl>
          <div>
            <dt>
              {r.stage === "Evaluation"
                ? "Trading days"
                : r.payout.dayBasis === "trading"
                  ? "Trading days this payout cycle"
                  : "Qualifying payout days"}
            </dt>
            <dd>
              {r.stage === "Evaluation" || r.payout.dayBasis === "trading"
                ? (p.tradingDays ?? "Confirm opening days")
                : (p.qualifyingDays ?? "Confirm opening days")}{" "}
              /{" "}
              {r.stage === "Evaluation"
                ? (r.evaluation.tradingDays ?? "Not configured")
                : (r.payout.requiredDays ?? "Not configured")}
              {r.stage !== "Evaluation" &&
                r.payout.dayBasis !== "trading" &&
                r.payout.dailyProfit !== null &&
                ` · daily net minimum ${money(r.payout.dailyProfit)}`}
            </dd>
          </div>
          <div>
            <dt>
              Consistency · {r.consistency.period} · {r.consistency.denominator}
            </dt>
            <dd title="Additional profit assumes the best day does not increase; uses the configured strict/inclusive comparison and rounding.">
              {r.consistency.percent === null
                ? "Not configured / disabled"
                : `${p.consistency.percent ?? "Confirm assessed days"}% · ${r.consistency.comparison === "strict" ? "less than" : "at most"} ${r.consistency.percent}% · additional net ${money(p.consistency.additional)}`}
            </dd>
          </div>
          <div>
            <dt>Daily loss</dt>
            <dd>
              {r.daily.mode === "disabled"
                ? "Disabled in saved rules"
                : `${r.daily.mode} · ${money(p.positionLimits.dailyLoss)} · ${r.daily.basis} from session start · ${r.daily.effect === "pause" ? "Soft pause" : "Hard breach"}`}{" "}
              · equity path not verifiable from this import
            </dd>
          </div>
          <div>
            <dt>Applicable position limits</dt>
            <dd>
              {p.positionLimits.minis ?? "Confirm"} minis /{" "}
              {p.positionLimits.micros ?? "Confirm"} micros · scaling{" "}
              {r.positions.activation} · concurrent exposure not verifiable from
              this import
            </dd>
          </div>
          <div>
            <dt>Firm session</dt>
            <dd>
              {r.session.timezone} · reset {r.session.reset} · close{" "}
              {r.session.close} · threshold activation {r.drawdown.activation}
            </dd>
          </div>
          {r.evaluation.expiry && (
            <div>
              <dt>Evaluation expiry</dt>
              <dd>{journalTimestamp(r.evaluation.expiry, timezone)}</dd>
            </div>
          )}
          {r.evaluation.activationDays !== null && (
            <div>
              <dt>Activation deadline</dt>
              <dd>
                {r.evaluation.activationDays} calendar days after the firm’s
                recorded pass; check the purchase agreement
              </dd>
            </div>
          )}
          {p.payout.earliestRequest && (
            <div>
              <dt>Earliest configured request</dt>
              <dd>{journalTimestamp(p.payout.earliestRequest, timezone)}</dd>
            </div>
          )}
        </dl>
        <ul>
          {[
            ...p.outstanding,
            ...(r.stage !== "Evaluation" ? p.payout.missing : []),
          ].map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
        {!p.outstanding.length &&
          (r.stage === "Evaluation" || !p.payout.missing.length) && (
            <p>
              Tracked requirements met. Confirm with the firm; imports never
              certify a pass.
            </p>
          )}
      </section>
      {!!p.warnings.length && (
        <details open className="prop-local-note">
          <summary>Data quality and missing inputs</summary>
          <ul>
            {p.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </details>
      )}
      <details>
        <summary>Manual rule checks and source information</summary>
        <ul>
          {r.restrictions.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
        {r.preset?.sources.map((u, i) => (
          <p key={u}>
            <a href={u} target="_blank" rel="noreferrer">
              {r.preset?.verifiedOn
                ? "Official source"
                : "Saved source (unverified)"}{" "}
              {i + 1} ↗
            </a>
          </p>
        ))}
        <p>
          Previous compliance and intraday highs cannot be reconstructed from
          closed trades.
        </p>
      </details>
      <section className="panel prop-days">
        <header className="panel-header">
          <h2>Session-level net progress</h2>
        </header>
        <div className="prop-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Firm session date</th>
                <th>Net P&L</th>
                <th>Coverage</th>
                <th>Qualifying</th>
              </tr>
            </thead>
            <tbody>
              {p.days.map((d) => (
                <tr key={d.start}>
                  <td>{d.date}</td>
                  <td>
                    {d.net === null
                      ? "Add missing fees"
                      : journalMoney(d.net, true)}
                  </td>
                  <td>
                    {d.complete ? "Completed session" : "Partial / unfinished"}
                  </td>
                  <td>
                    {d.qualifying === null
                      ? "Needs confirmation"
                      : d.qualifying
                        ? "Yes"
                        : "No"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!p.days.length && (
            <p className="prop-setup">
              Import account activity or enter confirmed opening values. No
              sample progress is shown.
            </p>
          )}
        </div>
      </section>
    </>
  );
}
