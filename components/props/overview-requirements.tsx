"use client";
import { motion } from "motion/react";
import { Check, CircleHelp, Clock3 } from "lucide-react";
import { D } from "@/lib/journal/processing";
import { journalMoney } from "@/lib/journal/calculations";
import { journalTimestamp } from "@/lib/timezones";
import type { PhaseProgress } from "@/lib/props/model";

type Requirement = {
  title: string;
  value: string;
  required: string;
  met: boolean | null;
  detail: string;
  progress?: { value: string | null; target: string | null };
};
const money = (v: string | null) =>
  v === null ? "Needs information" : journalMoney(v);
export function OverviewRequirements({
  progress,
  timezone,
}: {
  progress: PhaseProgress;
  timezone: string;
}) {
  const p = progress.tracking;
  if (!p) return null;
  const r = p.rules;
  const rows: Requirement[] = [];
  if (r.stage === "Evaluation") {
    if (p.effectiveTarget !== null)
      rows.push({
        title: "Profit target",
        value: money(p.phaseProfit),
        required: money(p.effectiveTarget),
        met:
          p.phaseProfit === null
            ? null
            : new D(p.phaseProfit).gte(p.effectiveTarget),
        detail: `Phase trading profit, excluding payouts and balance adjustments. Remaining ${money(p.remainingProfit)}. The effective target includes the saved consistency adjustment when configured.`,
        progress: { value: p.phaseProfit, target: p.effectiveTarget },
      });
    if (r.evaluation.tradingDays !== 0)
      rows.push({
        title: "Trading days",
        value:
          p.tradingDays === null ? "Confirm history" : String(p.tradingDays),
        required:
          r.evaluation.tradingDays === null
            ? "Confirm required days"
            : `${r.evaluation.tradingDays} days`,
        met:
          p.tradingDays === null || r.evaluation.tradingDays === null
            ? null
            : p.tradingDays >= r.evaluation.tradingDays,
        detail:
          "Uses the configured firm-session boundary and supported completed sessions. An imported row is not automatically a complete trading day.",
        progress: {
          value: p.tradingDays?.toString() ?? null,
          target: r.evaluation.tradingDays?.toString() ?? null,
        },
      });
  } else if (r.payout.enabled) {
    const trading = r.payout.dayBasis === "trading",
      count = trading ? p.tradingDays : p.qualifyingDays;
    if (r.payout.requiredDays !== 0)
      rows.push({
        title: trading
          ? "Trading days this cycle"
          : "Qualifying profitable days",
        value: count === null ? "Confirm opening days" : String(count),
        required:
          r.payout.requiredDays === null
            ? "Confirm required days"
            : `${r.payout.requiredDays} days`,
        met:
          count === null || r.payout.requiredDays === null
            ? null
            : count >= r.payout.requiredDays,
        detail: trading
          ? "Counts supported trading sessions in the payout cycle, not just winning sessions. Saved reset-session exclusions apply."
          : `Cycle ${p.cycleNumber}; minimum session net profit ${money(r.payout.dailyProfit)}. Partial history, missing fees and overlapping opening counts require confirmation.`,
        progress: {
          value: count?.toString() ?? null,
          target: r.payout.requiredDays?.toString() ?? null,
        },
      });
    if (
      [
        r.payout.minimumBalanceToSubmit,
        r.payout.minimumBalanceAfter,
        r.payout.protectedBuffer,
      ].some((v) => v !== null)
    )
      rows.push({
        title: "Payout balance requirements",
        value: money(p.balance),
        required:
          r.payout.minimumBalanceToSubmit !== null
            ? `Submit at ${money(r.payout.minimumBalanceToSubmit)}`
            : "Review saved buffer rules",
        met:
          p.balance === null
            ? null
            : r.payout.minimumBalanceToSubmit !== null &&
                new D(p.balance).lt(r.payout.minimumBalanceToSubmit)
              ? false
              : p.payout.eligible !== null && new D(p.payout.eligible).gt(0)
                ? true
                : null,
        detail: `Submit balance floor: ${money(r.payout.minimumBalanceToSubmit)}. After-deduction floor: ${money(r.payout.minimumBalanceAfter)}. Protected buffer above loss threshold: ${money(r.payout.protectedBuffer)}. These are separate conditions; a balance above one floor alone does not establish eligibility.`,
      });
    rows.push({
      title: "Payout timing & request limits",
      value:
        p.payout.eligible === null
          ? "Needs information"
          : `${money(p.payout.eligible)} estimated request`,
      required: `Min ${money(r.payout.minimum)}${r.payout.caps.length ? ` / cap ${money(r.payout.caps[Math.min(p.payoutNumber - 1, r.payout.caps.length - 1)])}` : " / confirm applicable cap"}`,
      met: p.payout.eligible === null ? null : new D(p.payout.eligible).gt(0),
      detail: `Earliest configured request: ${p.payout.earliestRequest ? journalTimestamp(p.payout.earliestRequest, timezone) : "Confirm timing where applicable"}. Caps by payout number: ${r.payout.caps.length ? r.payout.caps.map(money).join(", ") : "No configured amount cap"}. Percentage cap: ${r.payout.profitPercent ?? "Not configured"}% of ${r.payout.percentBasis}. Trader split: ${r.payout.split ?? "Confirm"}%. All saved conditions and reserved requests are evaluated by the payout engine; firm approval remains separate.`,
    });
  }
  if (
    r.consistency.status !== "disabled" &&
    (r.consistency.percent !== null || r.consistency.status === "unknown")
  ) {
    const exact = p.consistency.percent;
    const formatted =
      exact === null ? null : new D(exact).toDecimalPlaces(6).toFixed();
    rows.push({
      title: "Consistency",
      value:
        exact === null
          ? r.consistency.percent === null
            ? "Confirm consistency rule"
            : "Needs positive, supported profit"
          : `${formatted === exact ? "" : "about "}${formatted}%`,
      required:
        r.consistency.percent === null
          ? "Confirm whether applicable"
          : `${r.consistency.comparison === "strict" ? "<" : "<="} ${r.consistency.percent}%`,
      met:
        r.consistency.percent === null || exact === null
          ? null
          : p.consistency.met,
      detail: `Best day: ${money(p.consistencyBasis.bestDay)}. Denominator: ${money(p.consistencyBasis.profit)} (${r.consistency.denominator}, ${r.consistency.period}; best day scope ${r.consistency.bestScope === "phase" ? "entire phase" : "assessed period"}). ${exact === null ? "Zero, negative or incomplete net profit does not produce a meaningful percentage." : `Exact percentage: ${exact}%.`} Additional net profit needed: ${money(p.consistency.additional)}, assuming the best day does not increase. Comparison is ${r.consistency.comparison}; rounding is ${r.consistency.rounding}. A shortfall is not automatically a breach.`,
    });
  }
  if (r.evaluation.expiry)
    rows.push({
      title: "Evaluation deadline",
      value: journalTimestamp(r.evaluation.expiry, timezone),
      required: "Actual agreement expiry",
      met: null,
      detail:
        "An expiry date alone does not establish official account status. Confirm directly with the firm.",
    });
  return (
    <section className="prop-overview-requirements">
      <header className="prop-overview-panel-heading">
        <div>
          <h2>Requirements</h2>
          <p>
            {r.stage === "Evaluation"
              ? "Evaluation progress"
              : `Payout cycle ${p.cycleNumber}`}{" "}
            · {p.status}
          </p>
        </div>
      </header>
      <div className="prop-requirement-cards">
        {rows.map((row) => {
          const fill =
            row.progress?.value != null &&
            row.progress.target != null &&
            new D(row.progress.target).gt(0)
              ? D.min(
                  100,
                  D.max(
                    0,
                    new D(row.progress.value)
                      .div(row.progress.target)
                      .times(100),
                  ),
                ).toNumber()
              : null;
          const status =
            row.met === null
              ? "Needs information"
              : row.met
                ? "Met"
                : "In progress";
          return (
            <details className="prop-overview-requirement" key={row.title}>
              <summary>
                <div>
                  <h3>{row.title}</h3>
                  <span
                    className={`prop-requirement-state ${row.met === true ? "met" : ""}`}
                  >
                    {row.met === true ? (
                      <Check size={13} />
                    ) : row.met === null ? (
                      <CircleHelp size={13} />
                    ) : (
                      <Clock3 size={13} />
                    )}{" "}
                    {status}
                  </span>
                </div>
                <p>
                  <strong>{row.value}</strong>
                  <span>{row.required}</span>
                </p>
                {fill !== null && (
                  <div className="prop-overview-fill">
                    <motion.span
                      initial={false}
                      animate={{ width: `${fill}%` }}
                      transition={{ duration: 0.4 }}
                    />
                  </div>
                )}
                <small>Details</small>
              </summary>
              <div className="prop-requirement-explanation">{row.detail}</div>
            </details>
          );
        })}
      </div>
      <p className="prop-overview-chart-note">
        Tracked requirements met does not mean an official pass or approved
        payout.{" "}
        {p.payout.missing.length && r.stage !== "Evaluation"
          ? p.payout.missing[0]
          : p.outstanding[0]}
      </p>
    </section>
  );
}
