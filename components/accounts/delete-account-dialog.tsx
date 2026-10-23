"use client";
import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { TradingAccount } from "@/lib/accounts/types";
import type { AccountDeletionPreview } from "@/lib/accounts/deletion";
import { requestJson } from "@/lib/client-api";

export function DeleteAccountDialog({ account, onClose, onDeleted }: {
  account: TradingAccount; onClose: () => void; onDeleted: () => void;
}) {
  const [data, setData] = useState<AccountDeletionPreview | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const guard = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    requestJson<AccountDeletionPreview>(`/api/trading-accounts/${account.id}/deletion`, { signal: controller.signal })
      .then((value) => { if (!controller.signal.aborted) setData(value); })
      .catch((e) => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Could not load the deletion summary."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [account.id, reload]);
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !guard.current) onClose(); }}>
      <DialogContent className="account-delete-dialog"
        onEscapeKeyDown={(e) => { if (busy) e.preventDefault(); }}
        onPointerDownOutside={(e) => { if (busy) e.preventDefault(); }}>
        <DialogTitle>Delete {data?.accountName ?? account.displayName} permanently?</DialogTitle>
        <DialogDescription>
          This cannot be undone. Imported trades, account reviews and screenshots, fee settings, balances, phases and payout history will be removed.
          Personal daily journal entries and shared strategies stay; links to deleted trades become unavailable. The broker identifier is released.
        </DialogDescription>
        {loading && <p role="status">Loading deletion summary...</p>}
        {data && (
          <dl className="account-delete-summary">
            {[
              ["Import batches", data.counts.imports], ["Source records", data.counts.sourceRecords],
              ["Journal records", data.counts.journalRecords], ["Trade reviews", data.counts.reviews],
              ["Screenshots", data.counts.screenshots], ["Phases", data.counts.phases], ["Payouts", data.counts.payouts],
            ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>
        )}
        <form onSubmit={async (event) => {
          event.preventDefault();
          if (!data || name !== data.accountName || guard.current) return;
          guard.current = true; setBusy(true); setError("");
          try {
            await requestJson(`/api/trading-accounts/${account.id}`, {
              method: "DELETE", body: JSON.stringify({ accountName: name,
                fingerprint: data.fingerprint, filesVersion: data.filesVersion, confirmed: true }),
            });
            onDeleted();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not delete the account.");
            setData(null);
            window.dispatchEvent(new CustomEvent("msjournal:data-updated", { detail: { url: "/api/trading-accounts" } }));
          } finally { guard.current = false; setBusy(false); }
        }}>
          {data && <label className="field-label">
            Type {data.accountName} to confirm
            <input autoComplete="off" value={name} disabled={busy} onChange={(event) => setName(event.target.value)} aria-label="Account name to confirm deletion" />
          </label>}
          <p className="small muted">Consider downloading your data backup first. If screenshot removal is interrupted, the account remains archived; refresh the summary and retry to finish.</p>
          {error && <p role="alert" className="form-error">{error}</p>}
          <div className="account-form-actions">
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
            {!loading && !data && <Button type="button" variant="outline" onClick={() => { setLoading(true); setError(""); setReload((value) => value + 1); }}>Refresh summary</Button>}
            <Button variant="destructive" disabled={busy || loading || !data || name !== data.accountName}>
              <Trash2 size={15} />{busy ? "Deleting..." : "Delete permanently"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
