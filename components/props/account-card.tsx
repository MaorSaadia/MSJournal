"use client";
import { LoadingState } from "@/components/ui/loading";

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
  onDelete,
  busy,
  loading = !item,
}: {
  account: TradingAccount;
  item?: PropData["accounts"][number];
  onSetup: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
  busy: boolean;
  loading?: boolean;
}) {
  const phase = item?.phases.at(-1),
    t = phase?.tracking,
    r = t?.rules;
  const summary = phase?.sessionStats ?? item?.activity;
  const o = phase?.imported;
  const basis = phase?.unknownFees ? "gross" : (summary?.basis ?? "net");
  const phasePnl = phase ? (o?.netProfit ?? phase.gross) : (summary?.net ?? summary?.gross ?? null);
  const profitBasis = phase ? o?.netProfit == null ? "gross" : o.estimatedFees ? "estimated net" : "net" : summary?.basis ?? "net";
  const configured = !!r;
  const earlierImports = !!(phase && item?.phases.length === 1 &&
    phase.phase.kind === "Evaluation" && !phase.phase.previousId && !phase.phase.endAt &&
    item.activity.firstEntry && item.activity.firstEntry < phase.phase.startAt);

  const diagnosis = !item ? null
    : !phase ? "Choose your account plan. Existing imports are ready to reuse."
    : !configured || o?.missingRules ? "Set the starting balance and account rules."
    : item.needsProcessing ? "Process the remaining imported records."
    : earlierImports ? "Imported trades fall before the evaluation start. Review phase dates."
    : !item.activity.count ? "Import trades to begin tracking."
    : o?.missingFees ? "Some fees are missing. Gross results remain available." : null;
  const missingSetup = !phase || !configured || !!o?.missingRules;
  const target = o?.targetProfit ?? null;
  const remaining = o?.remainingProfit ?? null;
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
          <span className={`prop-status ${account.archivedAt ? "archived" : account.status.toLowerCase()}`}>
            {account.archivedAt ? "Archived" : account.status}
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
              <button disabled={busy} aria-busy={busy} onClick={onArchive}>
                {account.archivedAt ? "Restore account" : "Archive account"}
              </button>
              {account.archivedAt && <button disabled={busy} aria-busy={busy} className="negative" onClick={onDelete}>Delete permanently</button>}
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
      {loading ? <LoadingState variant="metrics" label={`Loading progress for ${account.displayName}`} /> : !item ? <p className="prop-local-note">Progress could not load. Use Retry above.</p> : <div className="prop-card-statistics">
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
      </div>}
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
                        : `/fees?accountId=${account.id}`
                }
              >
                {item?.needsProcessing
                  ? "Inspect activity"
                  : !item?.activity.count
                    ? "Import trades"
                    : earlierImports
                      ? "Review phase dates"
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
                  {o?.netProfit == null
                    ? "Add missing fees"
                    : journalMoney(o.netProfit, true)}{" "}
                  / {journalMoney(target)}
                </strong>
              </div>
              <AccountProgressBar
                value={o?.netProfit ?? null}
                total={target}
                label={`Profit target: ${o?.netProfit ?? "unknown"} of ${target}`}
              />
              {remaining !== null && (
                <small>
                  {journalMoney(remaining)} remaining
                </small>
              )}
            </section>
          )}
          {o && o.buffer !== null && o.balance !== null && o.threshold !== null && (
            <section className={new D(o.buffer).lte(0) ? "is-warning" : ""}>
              <div>
                <span>Loss buffer remaining{o.limitEstimated ? " (estimated)" : ""}</span>
                <strong>{journalMoney(o.buffer)}</strong>
              </div>
              {r.drawdown.distance !== null && (
                <AccountProgressBar
                  value={o.buffer}
                  total={r.drawdown.distance}
                  label={`Buffer remaining ${o.buffer}; visual reference ${r.drawdown.distance} configured drawdown distance`}
                />
              )}
              <small>
                Account balance {journalMoney(o.balance)} / loss limit{" "}
                {journalMoney(o.threshold)}
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
                {o?.tradingDays ?? "Set session"} / {r.evaluation.tradingDays}{" "}
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
        </div>
      )}
      <footer>
        <Link href={`/prop-accounts/${account.id}`}>Open account →</Link>
        <span>
          {phase?.portionCount ?? item?.activity.count ?? "—"} source records /{" "}
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
