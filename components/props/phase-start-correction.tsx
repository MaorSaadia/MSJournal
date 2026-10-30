"use client";
import { LoadingSpinner } from "@/components/ui/loading";

import { useEffect, useState } from "react";
import type { TradingAccount } from "@/lib/accounts/types";
import type { PhaseProgress } from "@/lib/props/model";
import { wallInput } from "@/lib/props/model";
import { journalTimestamp } from "@/lib/timezones";
import { requestJson } from "@/lib/client-api";
import { Button } from "@/components/ui/button";

type Preview = { included: number; before: number; crossing: number; cutoff: string; pending: boolean };
export function PhaseStartCorrection({ account, progress, firstEntry, count, onSaved }: {
  account: TradingAccount;
  progress: PhaseProgress;
  firstEntry: string;
  count: number;
  onSaved: (result: { phaseId: string; accountId: string }) => void;
}) {
  const [start, setStart] = useState(wallInput(firstEntry, account.reportingTimezone, true));
  const [balance, setBalance] = useState(progress.phase.baseline ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const [history, setHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ key: string; data?: Preview; error?: string }>({ key: "" });
  const preview = { ...result, pending: result.key !== start };
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(start)) {
        setResult({ key: start, error: "Choose a valid start to preview activity." });
        return;
      }
      try {
        const data = await requestJson<Preview>(`/api/prop-progress/setup?${new URLSearchParams({ accountId: account.id, startLocal: start })}`, { signal: controller.signal });
        if (!controller.signal.aborted) setResult({ key: start, data });
      } catch (e) {
        if (!controller.signal.aborted) setResult({ key: start, error: e instanceof Error ? e.message : "Could not load the preview." });
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [start, account.id]);
  return (
    <section className="panel prop-start-repair">
      <h2>Imported trades fall before this evaluation</h2>
      <p className="small muted">
        This account has {count} imported source records. Tracking currently starts at{" "}
        {journalTimestamp(progress.phase.startAt, account.reportingTimezone)}. Earlier trades appear on the dashboard but are excluded from this phase.
      </p>
      <details>
        <summary>Review phase dates</summary>
        <form className="prop-form" onSubmit={async (event) => {
          event.preventDefault();
          if (busy || !confirmed || !preview.data || preview.pending) return;
          setBusy(true); setError("");
          try {
            const result = await requestJson<{ phaseId: string; accountId: string }>("/api/prop-progress", {
              method: "POST", body: JSON.stringify({
                action: "start-correction", accountId: account.id, phaseId: progress.phase.id,
                expectedStart: progress.phase.startAt, startLocal: start, baseline: balance,
                historyConfirmed: history, confirmRules: true,
              }),
            });
            onSaved(result);
          } catch (e) { setError(e instanceof Error ? e.message : "Could not correct the phase dates."); }
          finally { setBusy(false); }
        }}>
          <fieldset disabled={busy}>
            <label>
              Correct evaluation start ({account.reportingTimezone})
              <input type="datetime-local" step="1" required value={start} onChange={(e) => { setStart(e.target.value); setConfirmed(false); }} />
            </label>
            <label>
              Actual balance immediately before this start (USD)
              <input inputMode="decimal" required value={balance} onChange={(e) => { setBalance(e.target.value); setConfirmed(false); }} />
            </label>
            <p className="small muted" role="status">
              {preview.pending ? <><LoadingSpinner /> Loading activity preview</> : preview.error ?? (preview.data
                ? `${preview.data.included} source records fit this start; ${preview.data.before} earlier and ${preview.data.crossing} boundary-spanning records remain excluded. UTC cutoff: ${preview.data.cutoff}.`
                : "Choose a valid start to preview activity.")}
            </p>
            {preview.data?.pending && <p className="small muted">Some imports still need processing; they are not included in this preview.</p>}
            <label className="prop-check"><input type="checkbox" checked={history} onChange={(e) => setHistory(e.target.checked)} />I confirm imported history from this start is complete.</label>
            <label className="prop-check"><input type="checkbox" required checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />I reviewed this preview. The balance is correct before the selected start and the original phase rules apply from that time.</label>
            <p className="small muted">This corrects the first evaluation only. It preserves imports and prior rule versions, records an audit event, and recalculates progress. It does not create a reset or deposit.</p>
            <Button disabled={busy || !confirmed || !preview.data || preview.pending || !!preview.error}>{busy ? <><LoadingSpinner />Saving</> : "Correct evaluation start"}</Button>
          </fieldset>
          {error && <p role="alert" className="form-error">{error}</p>}
        </form>
      </details>
    </section>
  );
}
