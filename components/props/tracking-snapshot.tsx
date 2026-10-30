"use client";
import { LoadingSpinner } from "@/components/ui/loading";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { requestJson } from "@/lib/client-api";
import { snapshotDetailsSchema } from "@/lib/props/tracking-rules";
import { wallInput } from "@/lib/props/model";
import type { TradingAccount } from "@/lib/accounts/types";
import { OpeningDetails } from "./tracking-setup";
export function TrackingSnapshotForm({
  account,
  phaseId,
  onSaved,
}: {
  account: TradingAccount;
  phaseId: string;
  onSaved: (r: { accountId: string; phaseId: string }) => void;
}) {
  const [details, setDetails] = useState(snapshotDetailsSchema.parse({})),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="prop-form"
      aria-label="Update from firm dashboard"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setError("");
        try {
          onSaved(
            await requestJson("/api/prop-progress", {
              method: "POST",
              body: JSON.stringify({
                action: "snapshot",
                accountId: account.id,
                phaseId,
                asOfLocal: f.get("asOf"),
                balance: f.get("balance"),
                threshold: f.get("threshold"),
                qualifyingDays: details.qualifyingDays?.toString() ?? "",
                note: f.get("note"),
                details,
              }),
            }),
          );
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Could not save snapshot.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="small muted">
        Record exact values from the firm’s dashboard. This becomes a new
        balance anchor, never a second deposit. Values at or before its
        timestamp are not added again.
      </p>
      <fieldset disabled={busy}>
        <div className="prop-form-grid">
          <label>
            Snapshot timestamp · {account.reportingTimezone}
            <input
              name="asOf"
              required
              type="datetime-local"
              step="1"
              defaultValue={wallInput(
                new Date().toISOString(),
                account.reportingTimezone,
              )}
            />
          </label>
          <label>
            Confirmed balance
            <input
              aria-label="Confirmed dashboard balance"
              name="balance"
              required
              inputMode="decimal"
            />
          </label>
          <label>
            Confirmed loss threshold
            <input name="threshold" inputMode="decimal" />
          </label>
          <label>
            Snapshot note
            <input name="note" maxLength={1000} />
          </label>
        </div>
        <OpeningDetails value={details} onChange={setDetails} />
        <label className="daily-check">
          <input
            type="checkbox"
            checked={details.thresholdCorrection}
            onChange={(e) =>
              setDetails({ ...details, thresholdCorrection: e.target.checked })
            }
          />
          Explicit correction / documented threshold transition (explain in
          note)
        </label>
        <Button disabled={busy} aria-busy={busy}>
          {busy ? <><LoadingSpinner />Saving</> : "Save dashboard snapshot"}
        </Button>
      </fieldset>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
