"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import {
  Plus,
  Search,
  WalletCards,
  Pencil,
  Archive,
  ArchiveRestore,
  LoaderCircle,
} from "lucide-react";
import type { TradingAccount } from "@/lib/accounts/types";
import { STAGES, STATUSES } from "@/lib/accounts/validation";
import { requestJson } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { AccountForm } from "./account-form";
import { usePrivateRequest } from "@/components/calendar/cache-provider";
import type { PropData } from "@/lib/props/service";
import { PropSummary } from "@/components/props/progress";
export function decimalUSD(value: string) {
  const [whole, fraction = "00"] = value.split(".");
  return `${whole.startsWith("-") ? "-" : ""}$${whole.replace(/^-/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction.padEnd(2, "0")}`;
}
export function AccountsPage({
  initialAccounts,
}: {
  initialAccounts: TradingAccount[];
}) {
  const router = useRouter();
  const progress = usePrivateRequest<PropData>("", "/api/prop-progress");
  const [accounts, setAccounts] = useState(initialAccounts),
    [search, setSearch] = useState(""),
    [firm, setFirm] = useState("all"),
    [stage, setStage] = useState("all"),
    [status, setStatus] = useState("all"),
    [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState<TradingAccount | "new" | null>(null),
    [confirm, setConfirm] = useState<TradingAccount | null>(null),
    [busy, setBusy] = useState<string | null>(null),
    [feedback, setFeedback] = useState(""),
    [error, setError] = useState("");
  const firmChoices = [
    ...new Set(accounts.map((a) => a.firm ?? "Personal")),
  ].sort();
  const visible = accounts.filter(
    (a) =>
      !!a.archivedAt === archived &&
      (firm === "all" || (a.firm ?? "Personal") === firm) &&
      (stage === "all" || a.stage === stage) &&
      (status === "all" || a.status === status) &&
      `${a.displayName} ${a.brokerIdentifier ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const update = (account: TradingAccount) => {
    setAccounts((prev) =>
      prev.some((a) => a.id === account.id)
        ? prev.map((a) => (a.id === account.id ? account : a))
        : [account, ...prev],
    );
    router.refresh();
  };
  async function archive(account: TradingAccount, value: boolean) {
    setBusy(account.id);
    setError("");
    setFeedback("");
    try {
      const result = await requestJson<{ account: TradingAccount }>(
        `/api/trading-accounts/${account.id}`,
        { method: "PATCH", body: JSON.stringify({ archived: value }) },
      );
      update(result.account);
      setConfirm(null);
      setFeedback(`${account.displayName} ${value ? "archived" : "restored"}.`);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to update account.",
      );
    } finally {
      setBusy(null);
    }
  }
  return (
    <motion.div
      className="accounts-page"
      initial={false}
      animate={{ opacity: 1, y: 0 }}
    >
      <header className="page-header">
        <div>
          <div className="breadcrumb">Workspace / My accounts</div>
          <h1>
            Prop Accounts<span className="title-dot">.</span>
          </h1>
          <p className="page-description">
            Manage your evaluation, funded, and personal trading accounts.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing("new");
            setFeedback("");
            setError("");
          }}
        >
          <Plus size={16} />
          Add Account
        </Button>
      </header>
      <div className="account-toolbar">
        <div className="account-tabs" aria-label="Account archive view">
          <button
            aria-pressed={!archived}
            className={!archived ? "selected" : ""}
            onClick={() => setArchived(false)}
          >
            Active <span>{accounts.filter((a) => !a.archivedAt).length}</span>
          </button>
          <button
            aria-pressed={archived}
            className={archived ? "selected" : ""}
            onClick={() => setArchived(true)}
          >
            Archived <span>{accounts.filter((a) => a.archivedAt).length}</span>
          </button>
        </div>
        <label className="account-search">
          <Search size={15} />
          <input
            aria-label="Search accounts"
            placeholder="Name or broker identifier"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          aria-label="Filter firm"
          value={firm}
          onChange={(e) => setFirm(e.target.value)}
        >
          <option value="all">All firms</option>
          {firmChoices.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
        <select
          aria-label="Filter stage"
          value={stage}
          onChange={(e) => setStage(e.target.value)}
        >
          <option value="all">All stages</option>
          {STAGES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select
          aria-label="Filter status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      {feedback && (
        <p className="success-notice" role="status">
          {feedback}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {progress.error && (
        <p role="alert" className="form-error">
          Prop progress unavailable. {progress.error}{" "}
          <button onClick={progress.refresh}>Retry</button>
        </p>
      )}
      {visible.length ? (
        <div className="managed-account-grid">
          {visible.map((account) => (
            <article className="managed-account-card" key={account.id}>
              <header>
                <span className="account-glyph">{account.displayName[0]}</span>
                <div>
                  <h2>
                    <Link href={`/prop-accounts/${account.id}`}>
                      {account.displayName}
                    </Link>
                  </h2>
                  <p>{account.firm ?? "Personal account"}</p>
                </div>
                <span
                  className={`stage-badge ${account.stage === "Funded" ? "funded" : ""}`}
                >
                  {account.stage}
                </span>
              </header>
              <dl>
                <div>
                  <dt>Status</dt>
                  <dd>{account.status}</dd>
                </div>
                <div>
                  <dt>Platform</dt>
                  <dd>{account.platform}</dd>
                </div>
                <div>
                  <dt>Nominal size</dt>
                  <dd>
                    {decimalUSD(account.nominalSize)} <small>USD</small>
                  </dd>
                </div>
                <div>
                  <dt>Broker identifier</dt>
                  <dd
                    className="broker-identifier"
                    title={account.brokerIdentifier ?? "Not mapped"}
                  >
                    {account.brokerIdentifier ?? "Not mapped"}
                  </dd>
                </div>
                <div className="form-wide">
                  <dt>Reporting timezone</dt>
                  <dd>{account.reportingTimezone}</dd>
                </div>
              </dl>
              {progress.data && (
                <PropSummary
                  progress={
                    progress.data.accounts
                      .find((a) => a.account.id === account.id)
                      ?.phases.at(-1) ?? null
                  }
                  timezone={progress.data.timezone}
                />
              )}
              <p className="prop-card-freshness">
                Latest import:{" "}
                {progress.data?.accounts
                  .find((a) => a.account.id === account.id)
                  ?.latestImport?.slice(0, 10) ?? "None"}{" "}
                · Last activity:{" "}
                {progress.data?.accounts
                  .find((a) => a.account.id === account.id)
                  ?.latestActivity?.slice(0, 10) ?? "None"}
              </p>
              {!account.brokerIdentifier && (
                <p className="mapping-note">
                  Map a broker identifier before future imports.
                </p>
              )}
              {account.openingBalance !== null && (
                <p className="baseline-note">
                  Entered baseline: {decimalUSD(account.openingBalance)} ·{" "}
                  {account.openingBalanceDate}. Journal baseline; prop phase
                  baseline is configured separately.
                </p>
              )}
              <footer>
                <Button asChild variant="outline">
                  <Link href={`/prop-accounts/${account.id}`}>Overview</Link>
                </Button>
                {account.archivedAt ? (
                  <Button
                    variant="outline"
                    disabled={busy === account.id}
                    onClick={() => archive(account, false)}
                  >
                    {busy === account.id ? (
                      <LoaderCircle size={14} className="pending-spinner" />
                    ) : (
                      <ArchiveRestore size={14} />
                    )}
                    Restore
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditing(account);
                        setFeedback("");
                        setError("");
                      }}
                    >
                      <Pencil size={14} />
                      Edit
                    </Button>
                    <Button asChild variant="outline">
                      <Link href={`/prop-accounts/${account.id}/fees`}>
                        Fees
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={busy === account.id}
                      onClick={() => {
                        setConfirm(account);
                        setError("");
                      }}
                    >
                      <Archive size={14} />
                      Archive
                    </Button>
                  </>
                )}
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <div className="accounts-empty panel">
          <div className="dialog-symbol">
            <WalletCards size={25} />
          </div>
          <h2>
            {accounts.length === 0
              ? "Add your first account"
              : archived
                ? "No archived accounts match"
                : "No active accounts match"}
          </h2>
          <p>
            {accounts.length === 0
              ? "Create an account, configure its tracking phase and custom rules, then import Performance.csv."
              : "Adjust your search or filters to find an account."}
          </p>
          {accounts.length === 0 && (
            <Button onClick={() => setEditing("new")}>
              <Plus size={15} />
              Add Account
            </Button>
          )}
        </div>
      )}
      <p className="account-page-note">
        Nominal sizes and entered baselines are not verified balances. Archiving
        preserves records and reserves broker identifiers.
      </p>
      {editing && (
        <AccountForm
          key={editing === "new" ? "new" : editing.id}
          account={editing === "new" ? undefined : editing}
          tracked={
            editing !== "new" &&
            !!progress.data?.accounts.find((a) => a.account.id === editing.id)
              ?.phases.length
          }
          onClose={() => setEditing(null)}
          onSaved={(account) => {
            update(account);
            setEditing(null);
            setFeedback(`${account.displayName} saved.`);
          }}
        />
      )}
      <Dialog
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirm(null);
        }}
      >
        <DialogContent
          onEscapeKeyDown={(e) => {
            if (busy) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (busy) e.preventDefault();
          }}
        >
          <DialogTitle>Archive {confirm?.displayName}?</DialogTitle>
          <DialogDescription>
            The account is preserved for history and can be restored. It will be
            removed from selectable dashboard accounts; its broker identifier
            stays reserved.
          </DialogDescription>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="account-form-actions">
            <Button
              variant="outline"
              disabled={!!busy}
              onClick={() => setConfirm(null)}
            >
              Cancel
            </Button>
            <Button
              disabled={!!busy}
              onClick={() => {
                if (confirm) void archive(confirm, true);
              }}
            >
              {busy ? (
                <LoaderCircle size={15} className="pending-spinner" />
              ) : (
                <Archive size={15} />
              )}
              Archive account
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
