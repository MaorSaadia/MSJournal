"use client";
import { LoadingIndicator, LoadingState } from "@/components/ui/loading";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import type { TradingAccount } from "@/lib/accounts/types";
import type { PropRules } from "@/lib/props/validation";
import type { PropData } from "@/lib/props/service";
import { usePrivateRequest } from "@/components/calendar/cache-provider";
import { DeleteAccountDialog } from "@/components/accounts/delete-account-dialog";
import { AccountForm } from "@/components/accounts/account-form";
import { Button } from "@/components/ui/button";
import { journalMoney, localDay } from "@/lib/journal/calculations";
import { journalTimestamp } from "@/lib/timezones";
import {
  PhaseForm,
  RulesForm,
  SnapshotForm,
  StatusForm,
  CopyRulesForm,
} from "./forms";
import { requestJson } from "@/lib/client-api";
import { TrackingSetup } from "./tracking-setup";
import { AccountSetupDialog } from "./account-setup-dialog";
import { PhaseStartCorrection } from "./phase-start-correction";
import { TrackingOverview } from "./tracking-overview";
import { TrackingSnapshotForm } from "./tracking-snapshot";
import { useOverviewLocation } from "./overview-location";
import { PayoutLog } from "./payouts";
function AccountDetailContent({
  account: initial,
  ownedAccounts,
}: {
  account: TradingAccount;
  ownedAccounts: TradingAccount[];
}) {
  const router = useRouter(),
    [settings, setSettings] = useState(false),
    [deleting, setDeleting] = useState(false),
    [setupOpen, setSetupOpen] = useState(false),
    [account, setAccount] = useState(initial),
    [feedback, setFeedback] = useState(""),
    [copiedRules, setCopiedRules] = useState<PropRules | null>(null),
    [copiedEffective, setCopiedEffective] = useState<string | null>(null);
  const { search, patch, accountHref } = useOverviewLocation(account.id);
  const tab = search.get("snapshot") === "1" ? "Rules" : ["Overview", "Rules", "Payouts", "History"].includes(
    search.get("tab") ?? "",
  )
    ? search.get("tab")!
    : "Overview";
  const setTab = (value: string) => patch({ tab: value, snapshot: null });
  const state = usePrivateRequest<PropData>(
      `accountId=${account.id}`,
      "/api/prop-progress",
    ),
    data = state.data,
    item = data?.accounts.find((a) => a.account.id === account.id);
  const progress =
    item?.phases.find((p) => p.phase.id === search.get("phase")) ??
    item?.phases.at(-1) ??
    null;
  const wantsSnapshot = search.get("snapshot") === "1";
  useEffect(() => {
    if (!wantsSnapshot || tab !== "Rules") return;
    const summary = document.getElementById("firm-dashboard");
    const details = summary?.closest("details");
    if (details) {
      details.open = true;
      summary?.scrollIntoView({ block: "start" });
    }
  }, [wantsSnapshot, tab, progress?.phase.id]);
  const saved = ({
    phaseId,
    accountId,
  }: {
    phaseId: string;
    accountId: string;
  }) => {
    setFeedback(
      "Saved. Progress reflects the dated configuration; account status remains user-managed.",
    );
    if (accountId !== account.id)
      router.push(`/prop-accounts/${accountId}?phase=${phaseId}`);
    else {
      patch({ phase: phaseId, snapshot: null });
      state.refresh();
      router.refresh();
    }
  };
  const metadata = item?.account ?? account;
  const query = progress
    ? new URLSearchParams({
        accounts: account.id,
        archived: metadata.archivedAt ? "1" : "0",
        start: localDay(
          progress.phase.startAt,
          data?.timezone ?? account.reportingTimezone,
        ),
        end: localDay(
          progress.phase.endAt ?? progress.asOf,
          data?.timezone ?? account.reportingTimezone,
        ),
        dateBasis: "activity",
        outcomeBasis: "portions",
      })
    : new URLSearchParams({ accounts: account.id });
  async function archive() {
    try {
      const r = await requestJson<{ account: TradingAccount }>(
        `/api/trading-accounts/${account.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ archived: !metadata.archivedAt }),
        },
      );
      setAccount(r.account);
      state.refresh();
      router.refresh();
      setFeedback(
        r.account.archivedAt
          ? "Archived; history preserved."
          : "Account restored.",
      );
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Could not update account.");
    }
  }
  return (
    <div
      className="prop-workspace prop-visual-detail prop-reference-detail"
      data-account-id={account.id}
      aria-busy={state.pending && !state.error}
    >
      {deleting && <DeleteAccountDialog account={metadata} onClose={() => setDeleting(false)} onDeleted={() => router.replace("/prop-accounts?archived=1")} />}
      <header className="page-header prop-reference-header">
        <div className="prop-reference-switcher">
          <Link
            href="/prop-accounts"
            className="prop-back"
            aria-label="Back to Prop Accounts"
          >
            <ArrowLeft size={17} />
          </Link>
          <span className="prop-account-switcher-label">Account</span>
          <h1 className="sr-only">{metadata.displayName}</h1>
          <select
            aria-label="Switch account"
            value={account.id}
            onChange={(e) => {
              if (ownedAccounts.some((a) => a.id === e.target.value))
                router.push(accountHref(e.target.value));
            }}
          >
            {ownedAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.displayName}
                {a.archivedAt ? " (archived)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="prop-actions">
          {progress && (
            <Button variant="outline" onClick={() => setTab("Rules")}>
              Edit rules
            </Button>
          )}
          <Button asChild>
            <Link href={`/imports?accounts=${account.id}`}>Import CSV</Link>
          </Button>
          <details className="prop-header-more">
            <summary>Manage</summary>
            <div className="prop-header-menu">
              <button onClick={() => setSettings(true)}>
                Account settings
              </button>
              <Link href={`/trade-view?${query}`}>
                Trade View - phase dates
              </Link>
              <Link
                href={`/calendar?${query}&month=${query.get("start")?.slice(0, 7) ?? ""}`}
              >
                Journal calendar
              </Link>
              <Link href={`/fees?accountId=${account.id}`}>
                Fees & net P&L
              </Link>
              {progress && !metadata.archivedAt && <button onClick={() => patch({ tab: "Rules", snapshot: "1" })}>Manual reconciliation</button>}
              <button onClick={state.refresh}>Refresh progress</button>
              <button onClick={() => void archive()}>
                {metadata.archivedAt ? "Restore account" : "Archive account"}
              </button>
              {metadata.archivedAt && <button className="negative" onClick={() => setDeleting(true)}>Delete permanently</button>}
            </div>
          </details>
        </div>
      </header>
      <div className="prop-reference-identity">
        <span
          className={`prop-reference-status ${(progress?.phase.status ?? metadata.status).toLowerCase()}`}
        >
          {progress?.phase.status ?? metadata.status}
        </span>
        <span className="prop-reference-stage">
          {progress?.tracking?.rules.stage ?? metadata.stage}
        </span>
        <strong>
          {metadata.firm ?? "Personal"}
          {progress?.tracking?.rules.product
            ? ` / ${progress.tracking.rules.product}`
            : metadata.programName
              ? ` / ${metadata.programName}`
              : ""}
        </strong>
        <span>{journalMoney(metadata.nominalSize)} nominal</span>
        {progress?.tracking && (
          <span className="badge violet-badge">
            {progress.tracking.rules.drawdown.mode}
          </span>
        )}
      </div>
      {feedback && (
        <p role="status" className="prop-local-note">
          {feedback}
        </p>
      )}
      {state.pending && data && !state.error && <LoadingIndicator label="Updating" />}
      {state.error && (
        <p role="alert" className="form-error">
          {state.error} <button onClick={state.refresh}>Retry</button>
        </p>
      )}
      {(!data || !item) && !state.error ? (
        <LoadingState variant="account" label="Loading account progress…" />
      ) : data && item ? (
        <>
          <div className="prop-detail-toolbar">
            {item.phases.length > 1 ? (
              <label>
                {item && item.phases.length > 1
                  ? "Tracking phase"
                  : "Current phase"}
                <select
                  aria-label="Tracking period"
                  value={progress?.phase.id ?? ""}
                  onChange={(e) => {
                    patch({
                      phase: e.target.value,
                      month: null,
                      day: null,
                      from: null,
                      through: null,
                      range: null,
                      snapshot: null,
                    });
                    setFeedback("");
                  }}
                >
                  {item?.phases.map((p) => (
                    <option key={p.phase.id} value={p.phase.id}>
                      {p.phase.label} · {p.phase.kind} · {p.phase.status}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span className="prop-reference-current-phase">
                {progress?.phase.label ?? "Not configured"}
              </span>
            )}
          </div>
          {metadata.archivedAt && (
            <p className="prop-local-note">
              Archived history is readable. Restore the account to change
              configuration or add observations.
            </p>
          )}
          {!progress ? (
            <section className="prop-setup">
              <h2>Choose your account plan</h2>
              {!!item.activity.count && (
                <p>
                  Imported account {item.activity.basis} P&L:{" "}
                  <strong>
                    {journalMoney(
                      item.activity.net ?? item.activity.gross,
                      true,
                    )}
                  </strong>
                  . This activity is not yet assigned to a configured tracking
                  phase.
                </p>
              )}
              <p>
                {item?.activity.count ?? 0} existing source records are ready to
                reuse. No tracking phase or rules have been saved; no reupload
                is needed.
              </p>
              {!metadata.archivedAt && (
                <Button onClick={() => setSetupOpen(true)}>Finish setup</Button>
              )}
            </section>
          ) : (
            <>
              <nav className="prop-tabs" aria-label="Account detail sections">
                {(["Overview", "Rules", "Payouts", "History"] as const).map(
                  (t) => (
                    <button
                      aria-pressed={tab === t}
                      onClick={() => setTab(t)}
                      key={t}
                    >
                      {t}
                    </button>
                  ),
                )}
              </nav>
              {tab === "Overview" && (
                <>
                  {!metadata.archivedAt && item.phases.length === 1 &&
                    progress.phase.kind === "Evaluation" && !progress.phase.previousId &&
                    !progress.phase.endAt && item.activity.firstEntry &&
                    item.activity.firstEntry < progress.phase.startAt && (
                      <PhaseStartCorrection key={data.asOf} account={metadata} progress={progress}
                        firstEntry={item.activity.firstEntry} count={item.activity.count} onSaved={saved} />
                    )}
                  <TrackingOverview
                    key={progress.phase.id} progress={progress} timezone={data.timezone}
                    payouts={data.payouts} latestImport={item.latestImport}
                    readOnly={!!metadata.archivedAt} onRules={() => setTab("Rules")}
                  />

                </>
              )}
              {tab === "Rules" && (
                <>
                  {!metadata.archivedAt && (
                    <div className="prop-editor-stack">
                      <details
                        open={search.get("snapshot") === "1" ? true : undefined}
                      >
                        <summary id="firm-dashboard">
                          Optional manual reconciliation
                        </summary>
                        {progress.tracking ? (
                          <TrackingSnapshotForm
                            key={data.asOf}
                            account={metadata}
                            phaseId={progress.phase.id}
                            onSaved={saved}
                          />
                        ) : (
                          <SnapshotForm
                            key={data.asOf}
                            account={metadata}
                            progress={progress}
                            onSaved={saved}
                          />
                        )}
                      </details>
                      <details id="phase-baseline">
                        <summary>
                          Confirm phase baseline / imported history
                        </summary>
                        <BaselineCorrection
                          account={metadata}
                          progress={progress}
                          onSaved={saved}
                        />
                      </details>
                      {!progress.phase.endAt && (
                        <details>
                          <summary>
                            Mark passed, failed, paused or closed
                          </summary>
                          <StatusForm
                            key={data.asOf}
                            account={metadata}
                            progress={progress}
                            onSaved={saved}
                          />
                        </details>
                      )}
                      <details>
                        <summary>Start funded phase / record a reset</summary>
                        <PhaseForm
                          key={data.asOf}
                          account={metadata}
                          previous={progress}
                          accounts={ownedAccounts}
                          onSaved={saved}
                        />
                      </details>
                    </div>
                  )}
                  {metadata.archivedAt ? (
                    <p className="prop-setup">
                      Restore this account to configure rules. Saved versions
                      remain visible in History.
                    </p>
                  ) : (
                    <>
                      <TrackingSetup
                        key={data.asOf + progress.phase.id}
                        account={metadata}
                        progress={progress}
                        onSaved={saved}
                      />
                      {!progress.tracking && (
                        <details>
                          <summary>Existing custom rule editor / copy</summary>
                          <RulesForm
                            key={
                              data.asOf +
                              progress.phase.id +
                              JSON.stringify(copiedRules)
                            }
                            account={metadata}
                            progress={progress}
                            draft={copiedRules}
                            draftEffective={copiedEffective}
                            onSaved={(result) => {
                              setCopiedRules(null);
                              setCopiedEffective(null);
                              saved(result);
                            }}
                          />
                          <details className="prop-editor-stack">
                            <summary>
                              Copy configuration from an owned account
                            </summary>
                            <CopyRulesForm
                              key={data.asOf}
                              account={metadata}
                              progress={progress}
                              sources={data.copySources}
                              onCopied={(rules, effectiveLocal) => {
                                setCopiedRules(rules);
                                setCopiedEffective(effectiveLocal);
                                setFeedback(
                                  "Configuration loaded into Rules. Confirm target day settings and high-water mark, then save a new version.",
                                );
                              }}
                              onSaved={saved}
                            />
                          </details>
                        </details>
                      )}
                    </>
                  )}
                </>
              )}
              {tab === "Payouts" &&
                (progress.phase.kind === "Funded" ? (
                  <PayoutLog
                    accountId={metadata.id}
                    phaseId={progress.phase.id}
                    timezone={metadata.reportingTimezone}
                    readOnly={!!metadata.archivedAt}
                    rows={data.payouts}
                    audit={data.payoutAudit}
                    onSaved={saved}
                  />
                ) : (
                  <p className="prop-setup">
                    Payouts belong to a separate Sim Funded or Live phase. Start
                    that phase with its own balance and rules after recording
                    the firm?s decision.
                  </p>
                ))}
              {tab === "History" && (
                <div className="prop-history">
                  <section className="panel">
                    <header className="panel-header">
                      <h2>Phase period</h2>
                    </header>
                    <p>
                      {progress.phase.startAt} →{" "}
                      {progress.phase.endAt ?? "Open"} · Starting balance{" "}
                      {journalMoney(progress.phase.baseline)} ·{" "}
                      {progress.phase.historyConfirmed
                        ? "History confirmed"
                        : "History unconfirmed"}
                    </p>
                    <p>{progress.phase.note}</p>
                    <p>
                      Sources spanning the phase cutoff: {progress.ambiguous}{" "}
                      excluded. Trade View links use enclosing journal dates;
                      prop calculations use the exact timestamps above.
                    </p>
                    {progress.phase.previousId && (
                      <p>
                        Previous phase reference: {progress.phase.previousId}
                      </p>
                    )}
                  </section>
                  <section className="panel">
                    <header className="panel-header">
                      <h2>Immutable rule versions</h2>
                    </header>
                    {progress.periods.map((p) => (
                      <details key={p.id}>
                        <summary>
                          {p.effectiveAt} · {p.rules.basis} · {p.state}
                        </summary>
                        <p>
                          Version ends {p.endAt}. Phase-to-date profit{" "}
                          {journalMoney(p.total, true)}; qualifying days{" "}
                          {p.qualifying ?? "unconfirmed"}.
                        </p>
                        <dl>
                          {Object.entries(p.rules).map(([k, v]) => (
                            <div key={k}>
                              <dt>
                                {k
                                  .replace(/([a-z])([A-Z])/g, "$1 $2")
                                  .replace(/^./, (c) => c.toUpperCase())}
                              </dt>
                              <dd>
                                {v === null ? "Not configured" : String(v)}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </details>
                    ))}
                    {!progress.periods.length && (
                      <p>
                        No rules configured. Use the Rules tab to add your
                        custom requirements.
                      </p>
                    )}
                  </section>
                  <section className="panel">
                    <header className="panel-header">
                      <h2>Manual snapshot history</h2>
                    </header>
                    {progress.snapshots.map((s) => (
                      <article key={s.id}>
                        <strong>
                          {journalTimestamp(s.asOf, data.timezone)}
                        </strong>
                        <p>
                          Manually recorded · balance {journalMoney(s.balance)}{" "}
                          · threshold {journalMoney(s.threshold)} · qualifying
                          days {s.qualifyingDays ?? "not entered"}
                        </p>
                        <p>{s.note}</p>
                      </article>
                    ))}
                    {!progress.snapshots.length && (
                      <p>
                        Record an observation from Overview when your prop
                        dashboard has a balance or threshold to preserve.
                      </p>
                    )}
                  </section>
                  <section className="panel">
                    <header className="panel-header">
                      <h2>Dated phase events</h2>
                    </header>
                    {data.events
                      .filter((e) => e.phaseId === progress.phase.id)
                      .map((e) => (
                        <article key={e.id}>
                          <strong>{e.kind}</strong>
                          <p>
                            {e.at} · {e.note}
                          </p>
                        </article>
                      ))}
                  </section>
                </div>
              )}
            </>
          )}
        </>
      ) : null}
      {setupOpen && (
        <AccountSetupDialog
          account={metadata}
          item={item}
          onClose={() => setSetupOpen(false)}
          onSaved={(a) => {
            setAccount(a);
            setSetupOpen(false);
            state.refresh();
            router.refresh();
            setFeedback("Account and tracking saved.");
          }}
        />
      )}
      {settings && (
        <AccountForm
          account={metadata}
          tracked={!!item?.phases.length}
          onClose={() => setSettings(false)}
          onSaved={(a) => {
            setAccount(a);
            setSettings(false);
            state.refresh();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
export function PropAccountDetail(props: {
  account: TradingAccount;
  ownedAccounts: TradingAccount[];
}) {
  return <AccountDetailContent key={props.account.id} {...props} />;
}
import type { PhaseProgress } from "@/lib/props/model";
function BaselineCorrection({
  account,
  progress,
  onSaved,
}: {
  account: TradingAccount;
  progress: PhaseProgress;
  onSaved: (r: { phaseId: string; accountId: string }) => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="prop-form"
      aria-label="Confirm phase baseline"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const f = new FormData(e.currentTarget);
        try {
          onSaved(
            await requestJson("/api/prop-progress", {
              method: "POST",
              body: JSON.stringify({
                action: "baseline",
                accountId: account.id,
                phaseId: progress.phase.id,
                baseline: f.get("baseline"),
                historyConfirmed: f.get("historyConfirmed") === "on",
                note: f.get("note"),
              }),
            }),
          );
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not save.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy}>
        <legend>
          Observed balance immediately before {progress.phase.startAt}
        </legend>
        <label>
          Observed phase starting balance (USD)
          <input name="baseline" defaultValue={progress.phase.baseline ?? ""} />
        </label>
        <label className="prop-check">
          <input
            type="checkbox"
            name="historyConfirmed"
            defaultChecked={progress.phase.historyConfirmed}
          />
          I confirm imported realized history from the exact cutoff is complete.
        </label>
        <label>
          Correction / confirmation note
          <input name="note" />
        </label>
        <p className="prop-local-note">
          This explicitly confirms or corrects the original cutoff’s baseline.
          Its prior value is retained in the event history. A recent snapshot is
          not substituted, and the cutoff never moves, so earlier trades are not
          counted twice.
        </p>
        <Button type="submit">Save baseline confirmation</Button>
      </fieldset>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </form>
  );
}
