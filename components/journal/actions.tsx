"use client";
import { LoadingSpinner } from "@/components/ui/loading";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { requestJson } from "@/lib/client-api";
export function ProcessButton({
  accountId,
  label = "Process / retry",
}: {
  accountId: string;
  label?: string;
}) {
  const router = useRouter(),
    guard = useRef(false);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  async function run() {
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await requestJson<{ records: number; portions: number }>(
        "/api/journal/process",
        { method: "POST", body: JSON.stringify({ accountId }) },
      );
      setMessage(
        `Processed ${result.portions} portions into ${result.records} journal records.`,
      );
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Processing failed. Source data was retained.",
      );
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="journal-action">
      <Button onClick={run} disabled={busy} aria-busy={busy}>
        {busy ? "Processing…" : label}
      </Button>
      {message && (
        <p className="small positive" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="small negative" role="alert">
          {error} Source data is retained; retry when the connection is
          available.
        </p>
      )}
    </div>
  );
}
export function ManualFeeForm({
  recordId,
  amount,
}: {
  recordId: string;
  amount: string | null;
}) {
  const router = useRouter(),
    guard = useRef(false);
  const [value, setValue] = useState(amount ?? ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function save(clear = false) {
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    setError("");
    try {
      await requestJson("/api/journal/fees", {
        method: "PATCH",
        body: JSON.stringify({ recordId, total: clear ? null : value }),
      });
      setMessage(
        clear
          ? "Manual fees cleared; configured estimates or unknown fees restored."
          : "Manual total saved. Zero is an explicit fee value.",
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save fees.");
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  return (
    <form
      className="journal-fee-form"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label className="field-label">
        Manual total fees (USD)
        <input
          aria-label="Manual total fees"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          required
          pattern="[0-9]+(\.[0-9]{1,8})?"
        />
      </label>
      <p className="small muted">
        Overrides the total for these portions. Enter 0 deliberately; leave
        unknown fees unset. The total is allocated to source portions by
        quantity and survives reprocessing.
      </p>
      <div className="journal-buttons">
        <Button disabled={busy} aria-busy={busy}>{busy ? <><LoadingSpinner />Saving</> : "Save manual fees"}</Button>
        <Button
          variant="outline"
          type="button"
          disabled={busy} aria-busy={busy}
          onClick={() => void save(true)}
        >
          Clear manual override
        </Button>
      </div>
      {error && (
        <p role="alert" className="negative">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="positive">
          {message}
        </p>
      )}
    </form>
  );
}
