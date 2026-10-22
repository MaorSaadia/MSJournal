"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Plus, Search, WalletCards, Archive, LoaderCircle, Trash2 } from "lucide-react";
import type { TradingAccount } from "@/lib/accounts/types";
import { STAGES, STATUSES } from "@/lib/accounts/validation";
import { requestJson } from "@/lib/client-api";
import { confirmAction } from "@/components/ui/confirm-action";
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
import { AccountSetupDialog } from "@/components/props/account-setup-dialog";
import { AddFirmDialog } from "@/components/props/add-firm-dialog";
import { PropAccountCard } from "@/components/props/account-card";
import { firmKey, firmTiles } from "@/lib/props/setup-model";
import type { TrackingRules } from "@/lib/props/tracking-rules";
export function decimalUSD(value: string) {
  const [whole, fraction = "00"] = value.split(".");
  return `${whole.startsWith("-") ? "-" : ""}$${whole.replace(/^-/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction.padEnd(2, "0")}`;
}
export function AccountsPage({
  initialAccounts,
  initialFirms = [],
}: {
  initialAccounts: TradingAccount[];
  initialFirms?: string[];
}) {
  const router = useRouter();
  const progress = usePrivateRequest<PropData>("", "/api/prop-progress");
  const filters = useSearchParams();
  const [accounts, setAccounts] = useState(initialAccounts);
  const [savedFirms, setSavedFirms] = useState(initialFirms);
  const [addingFirm, setAddingFirm] = useState(false);
  const [setupFirmName, setSetupFirmName] = useState<string>();
  const search = filters.get("search") ?? "",
    firm = filters.get("firm") ?? "all",
    stage = filters.get("stage") ?? "all",
    status = filters.get("status") ?? "all",
    archived = filters.get("archived") === "1";
  const setFilter = (key: string, value: string) => {
    const p = new URLSearchParams(filters.toString());
    if (!value || value === "all") p.delete(key);
    else p.set(key, value);
    window.history.replaceState(
      null,
      "",
      `/prop-accounts${p.size ? `?${p}` : ""}`,
    );
  };
  const setSearch = (v: string) => setFilter("search", v),
    setFirm = (v: string) => setFilter("firm", v),
    setStage = (v: string) => setFilter("stage", v),
    setStatus = (v: string) => setFilter("status", v),
    setArchived = (v: boolean) => setFilter("archived", v ? "1" : "");
  const [setup, setSetup] = useState<TradingAccount | "new" | null>(null),
    [setupFirm, setSetupFirm] = useState<TrackingRules["firm"] | undefined>(
      undefined,
    ),
    [collapsed, setCollapsed] = useState<string[]>([]);
  const [editing, setEditing] = useState<TradingAccount | "new" | null>(null),
    [confirm, setConfirm] = useState<TradingAccount | null>(null),
    [busy, setBusy] = useState<string | null>(null),
    [feedback, setFeedback] = useState(""),
    [error, setError] = useState("");
  const firmChoices = [
    ...new Set([...savedFirms, ...accounts.map((a) => a.firm ?? "Personal")]),
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
  const groups = [
    ...new Set([
      ...visible.map((a) => a.firm ?? "Personal accounts"),
      ...(!archived && !search && stage === "all" && status === "all"
        ? savedFirms.filter((name) => firm === "all" || name === firm)
        : []),
    ]),
  ];
  const activeAccounts = accounts.filter((a) => !a.archivedAt);
  const totalFirms = new Set([
    ...savedFirms,
    ...accounts.filter((a) => a.firm).map((a) => a.firm!),
  ]).size;
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
  async function removeFirm(name: string) {
    if (busy) return;
    const accepted = await confirmAction(
      `Delete the empty ${name} firm group? You can add it again later.`,
      { title: "Delete firm?", confirmLabel: "Delete firm", destructive: true },
    );
    if (!accepted) return;
    setBusy(`firm:${name}`);
    setError("");
    setFeedback("");
    try {
      const result = await requestJson<{ firms: string[] }>("/api/prop-firms", {
        method: "DELETE", body: JSON.stringify({ name }),
      });
      setSavedFirms(result.firms);
      setCollapsed((previous) => previous.filter((firm) => firm !== name));
      setFeedback(`${name} removed.`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete this firm.");
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
            Track your account rules and progress across all firms.
          </p>
        </div>
        <Button
          onClick={() => {
            setAddingFirm(true);
            setFeedback("");
            setError("");
          }}
        >
          <Plus size={16} />
          Add Firm
        </Button>
      </header>
      <div className="prop-account-totals" aria-label="Account summary">
        {[
          [totalFirms, totalFirms === 1 ? "Firm" : "Firms", ""],
          [
            activeAccounts.filter((a) => a.status === "Active").length,
            "Active accounts",
            "",
          ],
          [
            activeAccounts.filter((a) => a.status === "Passed").length,
            "Passed",
            "positive",
          ],
          [
            activeAccounts.filter((a) => a.status === "Failed").length,
            "Failed",
            "negative",
          ],
        ].map(([value, label, tone]) => (
          <div key={label}>
            <strong className={String(tone)}>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
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
      {groups.length ? (
        <div className="prop-firm-groups">
          {groups.map((group) => {
            const entries = visible.filter(
                (a) => (a.firm ?? "Personal accounts") === group,
              ),
              closed = collapsed.includes(group),
              firm = firmTiles.find((f) => f.id === firmKey(group));
            return (
              <section key={group} className="prop-firm-group">
                <header>
                  <span className="prop-firm-monogram">
                    {firm?.initials ?? group.slice(0, 2)}
                  </span>
                  <div>
                    <h2>{group}</h2>
                    <p>
                      {entries.length} accounts /{" "}
                      {entries.filter((a) => a.status === "Active").length}{" "}
                      active
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (group === "Personal accounts") {
                        setEditing("new");
                        return;
                      }
                      setSetup("new");
                      setSetupFirm(firmKey(group));
                      setSetupFirmName(group);
                    }}
                  >
                    + Add account
                  </Button>
                  {savedFirms.includes(group) && !accounts.some((a) => a.firm === group) && (
                    <Button
                      variant="ghost"
                      className="prop-delete-firm"
                      aria-label={`Delete ${group} firm`}
                      title="Delete empty firm"
                      disabled={busy !== null}
                      onClick={() => void removeFirm(group)}
                    >
                      {busy === `firm:${group}` ? <LoaderCircle size={16} className="animate-spin" /> : <Trash2 size={16} />}
                    </Button>
                  )}
                  <button
                    className="prop-group-toggle"
                    aria-expanded={!closed}
                    aria-label={`Toggle ${group}`}
                    onClick={() =>
                      setCollapsed(
                        closed
                          ? collapsed.filter((g) => g !== group)
                          : [...collapsed, group],
                      )
                    }
                  >
                    {closed ? "+" : "-"}
                  </button>
                </header>
                <AnimatePresence initial={false}>
                  {!closed && (
                    <motion.div
                      key="accounts"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="prop-group-card-grid">
                        {!entries.length && (
                          <div className="prop-firm-empty">
                            <WalletCards size={23} />
                            <div>
                              <h3>Your first account starts here</h3>
                              <p>
                                Add an evaluation or funded account to start
                                tracking {group}.
                              </p>
                            </div>
                          </div>
                        )}
                        {entries.map((account) => (
                          <PropAccountCard
                            key={account.id}
                            account={account}
                            item={progress.data?.accounts.find(
                              (a) => a.account.id === account.id,
                            )}
                            busy={busy === account.id}
                            onSetup={() => setSetup(account)}
                            onEdit={() => setEditing(account)}
                            onArchive={() => {
                              if (account.archivedAt)
                                void archive(account, false);
                              else {
                                setConfirm(account);
                                setError("");
                              }
                            }}
                          />
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="accounts-empty">
          <WalletCards size={28} />
          <h2>
            {accounts.length
              ? "No accounts match"
              : "Your next phase starts here"}
          </h2>
          <p>
            {accounts.length
              ? "Adjust your filters to find an account."
              : "Add your first firm, then keep all of its accounts in one place."}
          </p>
          {!accounts.length && (
            <Button onClick={() => setAddingFirm(true)}>
              <Plus size={16} />
              Add your first firm
            </Button>
          )}
        </div>
      )}
      {addingFirm && (
        <AddFirmDialog
          existing={firmChoices}
          onClose={() => setAddingFirm(false)}
          onSaved={(names, added) => {
            setSavedFirms(names);
            setAddingFirm(false);
            setCollapsed((prev) => prev.filter((name) => name !== added));
            window.history.replaceState(null, "", "/prop-accounts");
            setFeedback(`${added} added. Add its first account below.`);
            router.refresh();
          }}
        />
      )}
      {setup && (
        <AccountSetupDialog
          key={setup === "new" ? `new-${setupFirm}` : setup.id}
          account={setup === "new" ? undefined : setup}
          item={
            setup === "new"
              ? undefined
              : progress.data?.accounts.find((a) => a.account.id === setup.id)
          }
          initialFirm={setup === "new" ? setupFirm : undefined}
          initialFirmName={setup === "new" ? setupFirmName : undefined}
          onClose={() => setSetup(null)}
          onSaved={(account) => {
            update(account);
            progress.refresh();
            setSetup(null);
            setFeedback(`${account.displayName} and tracking saved.`);
          }}
        />
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
