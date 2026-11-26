import Link from "next/link";
import { ArrowUpRight, WalletCards } from "lucide-react";
import { AccountAccessLabel } from "@/components/billing/access";
import type { DashboardPropAccount } from "@/lib/dashboard/prop-summary";
import { journalMoney } from "@/lib/journal/calculations";
import { journalTimestamp } from "@/lib/timezones";

function milestoneText(milestone: NonNullable<DashboardPropAccount["milestone"]>) {
  switch (milestone.kind) {
    case "target":
      if (Number(milestone.remaining) === 0)
        return milestone.estimated ? "Profit target met using estimated fees" : "Profit target met";
      return `${journalMoney(milestone.remaining)} remaining to target${milestone.estimated ? " (estimated)" : ""}`;
    case "payout-days":
      return `${milestone.count} / ${milestone.required} ${milestone.basis} days toward payout`;
    case "message":
      return milestone.text;
  }
}

export function DashboardPropAccountCards({
  accounts, timezone, onOpen, onRetry, pending,
}: {
  accounts: DashboardPropAccount[] | null;
  timezone: string;
  onOpen: () => void;
  onRetry: () => void;
  pending: boolean;
}) {
  return (
    <section className="prop-overview dashboard-prop-accounts" aria-labelledby="dashboard-prop-accounts-title">
      <header>
        <div>
          <WalletCards size={17} aria-hidden="true" />
          <h2 id="dashboard-prop-accounts-title">Your prop accounts</h2>
        </div>
        <p>Latest journal data</p>
      </header>
      {accounts === null ? (
        <p className="dashboard-action-state" role="status">
          Prop account progress could not load.{" "}
          <button type="button" onClick={onRetry} disabled={pending}>Try again</button>
        </p>
      ) : accounts.length === 0 ? (
        <p className="dashboard-action-state">
          No prop accounts in this selection.{" "}
          <Link href="/prop-accounts" onClick={onOpen}>View Prop Accounts</Link>
        </p>
      ) : (
        <div className="prop-grid">
          {accounts.map(({ id, name, firm, stage, status, archived, balance, milestone }) => (
            <article key={id}>
              <Link className="dashboard-prop-card" href={`/prop-accounts/${id}`} onClick={onOpen} aria-label={`Open prop account ${name}`}>
                <div className="prop-account-top">
                  <span className="account-glyph" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
                  <div>
                    <h3>{name}</h3>
                    <p>{firm ?? "Prop firm not set"}</p>
                  </div>
                  <span className={`stage-badge ${!archived && stage !== "Evaluation" ? "funded" : ""}`}>{stage}</span>
                </div>
                <div className="dashboard-prop-status">
                  {archived && <span className="badge">Archived</span>}
                  {status !== "Active" && <span className="badge">{status}</span>}
                  <AccountAccessLabel accountId={id} />
                </div>
                <div className="prop-balance">
                  <span>{balance?.source === "snapshot" ? "Recorded balance" : "Journal balance"}</span>
                  <strong>{balance ? journalMoney(balance.value) : "Needs data"}</strong>
                </div>
                {balance && (
                  <>
                    <p className="prop-start">
                      {balance.source === "snapshot" ? "Firm snapshot" : balance.estimatedFees ? "Includes estimated fees" : "Journal estimate"}
                      {" · "}<time dateTime={balance.asOf}>{journalTimestamp(balance.asOf, timezone)}</time>
                    </p>
                    {balance.buffer !== null && (
                      <div className="dashboard-prop-buffer">
                        <span>{balance.estimatedBuffer ? "Estimated loss buffer" : "Loss buffer"}</span>
                        <strong className={Number(balance.buffer) <= 0 ? "negative" : undefined}>{journalMoney(balance.buffer)}</strong>
                      </div>
                    )}
                  </>
                )}
                <div className="dashboard-prop-next">
                  <span>{milestone ? milestoneText(milestone) : "Open account"}</span>
                  <ArrowUpRight size={14} aria-hidden="true" />
                </div>
              </Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
