"use client";
import { useCallback, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  useCalendarCache,
  usePrivateRequest,
} from "@/components/calendar/cache-provider";
import { useWritingGuard } from "@/components/daily/writing-guard";
import { requestJson } from "@/lib/client-api";
import { todayIn } from "@/lib/calendar/model";
import { journalMoney } from "@/lib/journal/calculations";
import { journalTimestamp } from "@/lib/timezones";
import type { FeeQuote } from "@/lib/fees/model";
import type { FeesData } from "@/lib/fees/service";
import { FeeSummary } from "./summary";
export function FeeTotals({ accountId }: { accountId: string }) {
  const { timezone } = useCalendarCache(),
    today = todayIn(timezone);
  const [scope, setScope] = useState({
    accountId,
    start: today.slice(0, 7) + "-01",
    end: today,
    id: undefined as string | undefined,
  });
  const [total, setTotal] = useState(""),
    [note, setNote] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [replace, setReplace] = useState(false),
    [quote, setQuote] = useState<FeeQuote | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const state = usePrivateRequest<FeesData>(
    new URLSearchParams({
      accountId,
      start: scope.start,
      end: scope.end,
      ...(scope.id && { id: scope.id }),
    }).toString(),
    "/api/fees",
  );
  const dirty = useCallback(
    () => !!total.trim() || !!note.trim(),
    [total, note],
  );
  useWritingGuard(dirty);
  function invalidate() {
    setQuote(null);
    setReplace(false);
    setError("");
    setMessage("");
  }
  async function review(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setQuote(null);
    try {
      const result = await requestJson<FeeQuote>("/api/fees", {
        method: "POST",
        body: JSON.stringify({ scope, total, note }),
      });
      setQuote(result);
      setReplace(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not review fee total.");
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!quote) return;
    setBusy(true);
    setError("");
    try {
      await requestJson("/api/fees", {
        method: "PUT",
        body: JSON.stringify({
          scope,
          total,
          note,
          fingerprint: quote.fingerprint,
          replace,
          confirmed: true,
        }),
      });
      setQuote(null);
      setTotal("");
      setNote("");
      setConfirmed(false);
      setMessage(
        "Fee total saved. Open the net dashboard below to see P&L after these fees.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save fee total.");
      setQuote(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="import-card fee-totals">
      <header>
        <h2>Actual fee totals</h2>
        <p className="muted">
          Enter the trading fees from your broker report for the same account
          and closed records. Per-record amounts are quantity-weighted
          allocations. Deposits, withdrawals and subscription costs stay
          separate.
        </p>
      </header>
      <form onSubmit={review}>
        <fieldset disabled={busy}>
          <div className="fee-range">
            <label>
              From
              <input
                type="date"
                required
                value={scope.start}
                disabled={!!scope.id}
                onChange={(e) => {
                  setScope({ ...scope, start: e.target.value });
                  setConfirmed(false);
                  invalidate();
                }}
              />
            </label>
            <label>
              To
              <input
                type="date"
                required
                min={scope.start}
                value={scope.end}
                disabled={!!scope.id}
                onChange={(e) => {
                  setScope({ ...scope, end: e.target.value });
                  setConfirmed(false);
                  invalidate();
                }}
              />
            </label>
            {scope.id && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setScope({ ...scope, id: undefined });
                  setTotal("");
                  setNote("");
                  setConfirmed(false);
                  invalidate();
                }}
              >
                Choose another range
              </Button>
            )}
          </div>
          {state.data && (
            <p className="muted">
              {state.data.count} Performance records · gross{" "}
              {journalMoney(state.data.gross, true)} · fees {journalMoney(state.data.feeTotal ?? null)} · net {journalMoney(state.data.net ?? null, true)} · fees available for{" "}
              {state.data.covered}/{state.data.count} records · {timezone}.{" "}
              {scope.id
                ? "Editing this total’s original records."
                : "Select the report’s local exit-date range. All contracts in this account are included."}
            </p>
          )}
          <label>
            Trading fees & commissions (USD)
            <input
              required
              inputMode="decimal"
              placeholder="For example, 12.48"
              value={total}
              onChange={(e) => {
                setTotal(e.target.value);
                invalidate();
              }}
            />
          </label>
          <label>
            Report reference or note (optional)
            <textarea
              maxLength={500}
              rows={2}
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                invalidate();
              }}
            />
          </label>
          <label className="import-confirm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I confirm this total applies to the selected closed Performance
            records and excludes unrelated fees or open positions.
          </label>
          <Button
            disabled={busy || !confirmed || !total.trim() || !state.data?.count}
          >
            {busy ? "Working…" : "Review fee total"}
          </Button>
        </fieldset>
      </form>
      {quote && (
        <div>
          <FeeSummary quote={quote} />
          {quote.replaceRequired && (
            <label className="import-confirm">
              <input
                type="checkbox"
                disabled={busy}
                checked={replace}
                onChange={(e) => setReplace(e.target.checked)}
              />
              Replace the existing fees shown above. Preserve previous totals in
              history.
            </label>
          )}
          <Button
            disabled={busy || !confirmed || (quote.replaceRequired && !replace)}
            onClick={() => void save()}
          >
            {busy ? "Saving…" : "Save fee total"}
          </Button>
        </div>
      )}
      {(error || state.error) && (
        <p role="alert" className="form-error">
          {error || state.error}
        </p>
      )}
      {message && (
        <p role="status" className="positive">
          {message}
          {" "}<Link href={`/?${new URLSearchParams({ accounts: accountId, archived: "1", start: scope.start, end: scope.end, basis: "net", outcomeBasis: "portions" })}`}>View net P&L on dashboard →</Link>
        </p>
      )}
      {state.pending && (
        <p className="muted" role="status">
          Refreshing fees…
        </p>
      )}
      <h3>Fee history</h3>
      <p className="muted">
        Latest 100 totals. Replaced totals remain here for reference.
        “Allocated” in Trade View and exports identifies the per-record fee
        source.
      </p>
      {!state.data?.history.length ? (
        <p className="muted">No fee totals recorded yet.</p>
      ) : (
        <div className="fee-history">
          {state.data.history.map((r) => (
            <article key={r.id}>
              <div>
                <strong>{journalMoney(r.total)}</strong>
                <span>
                  {r.active ? "Current" : "Replaced"} · {r.start} – {r.end} ·{" "}
                  {r.timezone}
                </span>
                <small>Saved {journalTimestamp(r.createdAt, timezone)}</small>
                {r.note && <p>{r.note}</p>}
              </div>
              <div>
                <span>Gross {journalMoney(r.gross, true)} · Net {journalMoney(r.net ?? null, true)}</span>
                {r.active && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy || dirty()}
                    onClick={() => {
                      setScope({
                        accountId,
                        start: r.start,
                        end: r.end,
                        id: r.id,
                      });
                      setTotal(r.total);
                      setNote(r.note);
                      setConfirmed(false);
                      invalidate();
                    }}
                  >
                    Edit total
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="muted">
        Need estimated automatic fees for future imports?{" "}
        <Link href={`/prop-accounts/${accountId}/fees`}>
          Account fee settings
        </Link>
        .
      </p>
    </section>
  );
}
