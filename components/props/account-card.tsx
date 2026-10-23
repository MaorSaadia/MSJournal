"use client";
import Link from "next/link";
import { motion } from "motion/react";
import { propPercent } from "@/lib/props/format";
import { D } from "@/lib/journal/processing";
import { journalMoney } from "@/lib/journal/calculations";
import { journalTimestamp } from "@/lib/timezones";
import type { TradingAccount } from "@/lib/accounts/types";
import type { PropData } from "@/lib/props/service";

export function AccountProgressBar({
  value,
  total,
  label,
}: {
  value: string | null;
  total: string | null;
  label: string;
}) {
  const width =
    value !== null && total !== null && new D(total).gt(0)
      ? D.min(100, D.max(0, new D(value).div(total).times(100))).toNumber()
      : 0;
  return (
    <div className="prop-compact-bar" role="img" aria-label={label}>
      <motion.span
        initial={false}
        animate={{ width: `${width}%` }}
        transition={{ duration: 0.4 }}
      />
    </div>
  );
}
export function PropAccountCard({
  account,
  item,
  onSetup,
  onEdit,
  onArchive,
  busy,
}: {
  account: TradingAccount;
  item?: PropData["accounts"][number];
  onSetup: () => void;
  onEdit: () => void;
  onArchive: () => void;
  busy: boolean;
}) {
  const phase = item?.phases.at(-1),
    t = phase?.tracking,
    r = t?.rules;
  const summary = phase?.sessionStats ?? item?.activity;
  const phasePnl =
    t?.phaseProfit ??
    (phase
      ? (phase.net ?? phase.gross)
      : (summary?.net ?? summary?.gross ?? null));
  const basis = phase?.unknownFees ? "gross" : (summary?.basis ?? "net");
  const profitBasis =
    t?.phaseProfit !== null && t?.phaseProfit !== undefined
      ? t.estimatedFees
        ? "estimated net"
        : "net"
      : basis;
  const configured = !!r;
  const earlierImports = !!(phase && item?.phases.length === 1 &&
    phase.phase.kind === "Evaluation" && !phase.phase.previousId && !phase.phase.endAt &&
    item.activity.firstEntry && item.activity.firstEntry < phase.phase.startAt);

  const diagnosis = !item
    ? "Loading account progress..."
    : !phase
      ? "Choose your account plan. Existing imports are ready to reuse."
      : !phase.current
        ? "Choose the rules for this phase."
        : phase.phase.baseline === null && !t?.confirmedSnapshot
          ? "Add your starting balance or a firm dashboard snapshot."
          : !configured
            ? "Finish the product rules for this existing phase."
            : item.needsProcessing
              ? "Process the remaining imported records."
              : !item.activity.count
                ? "Import trades to begin tracking."
                : earlierImports
                  ? "Imported trades fall before the evaluation start. Review phase dates."
                  : t.threshold === null
                    ? "Update threshold from firm dashboard."
                    : t.estimatedFees
                      ? "Fee estimates are in use. Confirm actual trading fees."
                      : phase.unknownFees
                        ? "Some fees are missing. Gross results remain available."
                        : null;
  const missingSetup =
    !phase ||
    !phase.current ||
    !configured ||
    (phase.phase.baseline === null && !t?.confirmedSnapshot);
  const next =
    t?.outstanding[0] ??
    (r?.stage !== "Evaluation" ? t?.payout.missing[0] : null) ??
    t?.status;
  const target = t?.effectiveTarget ?? r?.evaluation.target ?? null;
  const remaining = t?.remainingProfit ?? null;
  const positive = (v: string | null | undefined) =>
    v && new D(v).lt(0) ? "negative" : "positive";
  return (
    <motion.article
      className="prop-progress-card"
      initial={false}
      whileHover={{ y: -1 }}
      transition={{ duration: 0.18 }}
    >
      <header>
        <div>
          <h3>
            <Link href={`/prop-accounts/${account.id}`}>
              {account.displayName}
            </Link>
          </h3>
          <p>
            {r?.product ?? account.programName ?? "Plan not selected"} /{" "}
            {journalMoney(account.nominalSize)} / {r?.stage ?? account.stage}
          </p>
        </div>
        <div className="prop-card-tools">
          <span className={`prop-status ${account.status.toLowerCase()}`}>
            {account.status}
          </span>
          <details>
            <summary aria-label={`Actions for ${account.displayName}`}>
              •••
            </summary>
            <div>
              <button onClick={onEdit}>Edit account identity</button>
              {!account.archivedAt && item && (
                <button onClick={onSetup}>
                  {configured ? "Review setup" : "Finish setup"}
                </button>
              )}
              <Link href={`/fees?accountId=${account.id}`}>
                Fees & net P&L
              </Link>
              <button disabled={busy} onClick={onArchive}>
                {account.archivedAt ? "Restore account" : "Archive account"}
              </button>
            </div>
          </details>
        </div>
      </header>
      {r && (
        <span className="prop-model-badge">
          {r.drawdown.mode === "End-of-day trailing"
            ? "EOD"
            : r.drawdown.mode === "Intraday trailing"
              ? "Intraday"
              : "Static"}
          {r.preset?.customized ? " / Customized" : ""}
        </span>
      )}
      <div className="prop-card-statistics">
        {[
          [phase ? "Phase P&L" : "Imported P&L", phasePnl, profitBasis],
          ["Best session", summary?.best, basis],
          ["Worst session", summary?.worst, basis],
        ].map(([label, value, metricBasis]) => (
          <div key={label}>
            <span>
              {label} / {metricBasis}
            </span>
            <strong className={positive(value)}>
              {value == null ? "—" : journalMoney(value, true)}
            </strong>
          </div>
        ))}
      </div>
      {diagnosis && (
        <div className="prop-card-setup-note">
          <p>{diagnosis}</p>
          {!account.archivedAt &&
            item &&
            (missingSetup ? (
              <button onClick={onSetup}>Finish setup →</button>
            ) : (
              <Link
                href={
                  item?.needsProcessing
                    ? `/trade-view?accounts=${account.id}`
                    : !item?.activity.count
                      ? `/imports?accounts=${account.id}`
                      : earlierImports
                        ? `/prop-accounts/${account.id}`
                        : t?.threshold === null
                        ? `/prop-accounts/${account.id}?snapshot=1#firm-dashboard`
                        : `/fees?accounts=${account.id}`
                }
              >
                {item?.needsProcessing
                  ? "Inspect activity"
                  : !item?.activity.count
                    ? "Import trades"
                    : earlierImports
                      ? "Review phase dates"
                      : t?.threshold === null
                      ? "Update firm snapshot"
                      : "Review fees"}{" "}
                →
              </Link>
            ))}
        </div>
      )}
      {t && r && (
        <div className="prop-card-progress-lines">
          {r.stage === "Evaluation" && target !== null && (
            <section>
              <div>
                <span>
                  Profit target / {t.estimatedFees ? "estimated net" : "net"}
                </span>
                <strong>
                  {t.phaseProfit === null
                    ? "Add missing fees"
                    : journalMoney(t.phaseProfit, true)}{" "}
                  / {journalMoney(target)}
                </strong>
              </div>
              <AccountProgressBar
                value={t.phaseProfit}
                total={target}
                label={`Profit target: ${t.phaseProfit ?? "unknown"} of ${target}`}
              />
              {remaining !== null && (
                <small>
                  {journalMoney(remaining)} remaining
                  {r.evaluation.targetAdjustsForConsistency
                    ? " (includes assessed consistency)"
                    : ""}
                </small>
              )}
            </section>
          )}
          {t.buffer !== null && t.balance !== null && t.threshold !== null && (
            <section className={new D(t.buffer).lte(0) ? "is-warning" : ""}>
              <div>
                <span>Loss buffer remaining</span>
                <strong>{journalMoney(t.buffer)}</strong>
              </div>
              {r.drawdown.distance !== null && (
                <AccountProgressBar
                  value={t.buffer}
                  total={r.drawdown.distance}
                  label={`Buffer remaining ${t.buffer}; visual reference ${r.drawdown.distance} configured drawdown distance`}
                />
              )}
              <small>
                Supported balance {journalMoney(t.balance)} / loss threshold{" "}
                {journalMoney(t.threshold)}
                {r.drawdown.distance !== null
                  ? ` / bar reference: ${journalMoney(r.drawdown.distance)} configured distance`
                  : ""}
              </small>
            </section>
          )}
          {r.stage !== "Evaluation" && (
            <section>
              <div>
                <span>Next payout / cycle {t.cycleNumber}</span>
                <strong>
                  {t.payout.eligible === null
                    ? "Needs confirmation"
                    : `${journalMoney(t.payout.eligible)} estimated request`}
                </strong>
              </div>
              <ul className="prop-payout-checklist">
                {r.payout.requiredDays !== null &&
                  r.payout.requiredDays > 0 && (
                    <li>
                      {r.payout.dayBasis === "trading"
                        ? (t.tradingDays ?? "Confirm days")
                        : (t.qualifyingDays ?? "Confirm days")}{" "}
                      / {r.payout.requiredDays}{" "}
                      {r.payout.dayBasis === "trading"
                        ? "trading"
                        : "qualifying"}{" "}
                      days
                      {r.payout.dailyProfit !== null
                        ? ` at ${journalMoney(r.payout.dailyProfit)} net`
                        : ""}
                    </li>
                  )}
                {r.consistency.percent !== null && (
                  <li>
                    Consistency{" "}
                    {t.consistency.percent === null
                      ? "needs assessed sessions"
                      : `${propPercent(t.consistency.percent)} / ${propPercent(r.consistency.percent)} ${t.consistency.met ? "met" : "outstanding"}`}
                  </li>
                )}
                {r.payout.minimumBalanceToSubmit !== null && (
                  <li>
                    Request balance floor{" "}
                    {journalMoney(r.payout.minimumBalanceToSubmit)}
                  </li>
                )}
                {t.payout.earliestRequest && (
                  <li>
                    Request from{" "}
                    {journalTimestamp(
                      t.payout.earliestRequest,
                      account.reportingTimezone,
                    )}
                  </li>
                )}
                {r.payout.caps.length > 0 && (
                  <li>
                    Request cap{" "}
                    {journalMoney(
                      r.payout.caps[
                        Math.min(t.payoutNumber - 1, r.payout.caps.length - 1)
                      ],
                    )}{" "}
                    / split {r.payout.split === null ? "Confirm" : propPercent(r.payout.split)}
                  </li>
                )}
              </ul>
            </section>
          )}
          {r.stage === "Evaluation" &&
            r.evaluation.tradingDays !== null &&
            r.evaluation.tradingDays > 0 && (
              <p>
                {t.tradingDays ?? "Confirm"} / {r.evaluation.tradingDays}{" "}
                trading days
              </p>
            )}
          {r.stage === "Evaluation" && r.consistency.percent !== null && (
            <p>
              Consistency:{" "}
              {t.consistency.percent === null
                ? "Needs assessed sessions"
                : `${propPercent(t.consistency.percent)}`}{" "}
              / {propPercent(r.consistency.percent)} {r.consistency.comparison}
            </p>
          )}
          {r.daily.mode !== "disabled" &&
            t.positionLimits.dailyLoss !== null && (
              <p>
                Daily loss limit {journalMoney(t.positionLimits.dailyLoss)} /{" "}
                {r.daily.effect === "pause" ? "soft pause" : "hard breach"}.
                Intraday equity check requires the firm dashboard.
              </p>
            )}
          {!diagnosis && next && <p className="prop-card-next">{next}</p>}
        </div>
      )}
      <footer>
        <Link href={`/prop-accounts/${account.id}`}>Open account →</Link>
        <span>
          {phase?.portionCount ?? item?.activity.count ?? 0} source records /{" "}
          {t
            ? journalTimestamp(t.asOf, account.reportingTimezone)
            : (item?.activity.lastExit?.slice(0, 10) ?? "No activity yet")}
        </span>
      </footer>
      {t && (
        <small className="prop-card-quality">
          {t.quality}
          {!phase?.phase.historyConfirmed ? " / Partial history" : ""}. Journal
          tracking; firm approval remains separate.
        </small>
      )}
    </motion.article>
  );
}
