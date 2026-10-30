"use client";
import { LoadingSpinner } from "@/components/ui/loading";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { requestJson } from "@/lib/client-api";
import { localInstant } from "@/lib/props/validation";
import { wallInput } from "@/lib/props/model";
import type { Payout, PayoutFields } from "@/lib/props/tracking-rules";
import type { PropData } from "@/lib/props/service";
import { journalMoney } from "@/lib/journal/calculations";
import { journalTimestamp } from "@/lib/timezones";
export function PayoutLog({
  accountId,
  phaseId,
  timezone,
  rows,
  audit,
  onSaved,
  readOnly = false,
}: {
  readOnly?: boolean;
  accountId: string;
  phaseId: string;
  timezone: string;
  rows: Payout[];
  audit: PropData["payoutAudit"];
  onSaved: (r: { accountId: string; phaseId: string }) => void;
}) {
  const [editing, setEditing] = useState<Payout | null>(null),
    [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [newId, setNewId] = useState(() => crypto.randomUUID());
  const list = rows
    .filter((p) => p.phaseId === phaseId)
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  const time = (
    label: string,
    name: string,
    at: string | null | undefined,
    required = false,
  ) => (
    <label>
      {label} · {timezone}
      <input
        aria-label={label}
        type="datetime-local"
        step="1"
        name={name}
        required={required}
        defaultValue={at ? wallInput(at, timezone, true) : ""}
      />
    </label>
  );
  const amount = (
    label: string,
    name: string,
    v: string | null | undefined,
    required = false,
  ) => (
    <label>
      {label}
      <input
        aria-label={label}
        name={name}
        inputMode="decimal"
        required={required}
        defaultValue={v ?? ""}
      />
    </label>
  );
  return (
    <section className="prop-form">
      <h2>Account payout log</h2>
      <p>
        Log firm events only. MSJournal does not submit payout requests.
        Requested funds are reserved in forecasts; only an explicit account
        deduction changes the ledger.
      </p>
      {!readOnly && (
        <Button
          onClick={() => {
            setEditing(null);
            setOpen(true);
            setNewId(crypto.randomUUID());
            setError("");
          }}
        >
          Record payout request
        </Button>
      )}
      {open && (
        <form
          key={editing?.id ?? newId}
          aria-label="Record payout events"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            try {
              const at = (key: string) =>
                f.get(key) ? localInstant(String(f.get(key)), timezone) : null;
              const fields: PayoutFields = {
                status: String(f.get("status")) as PayoutFields["status"],
                requestedAmount: String(f.get("requestedAmount")),
                requestedAt: at("requestedAt")!,
                approvedAmount: String(f.get("approvedAmount") ?? "") || null,
                approvedAt: at("approvedAt"),
                deductionAmount: String(f.get("deductionAmount") ?? "") || null,
                deductedAt: at("deductedAt"),
                receiptAmount: String(f.get("receiptAmount") ?? "") || null,
                paidAt: at("paidAt"),
                note: String(f.get("note") ?? ""),
              };
              onSaved(
                await requestJson("/api/prop-progress/payouts", {
                  method: "POST",
                  body: JSON.stringify({
                    accountId,
                    phaseId,
                    id: editing?.id ?? newId,
                    revision: editing?.revision ?? 0,
                    fields,
                  }),
                }),
              );
              setOpen(false);
            } catch (err) {
              setError(
                err instanceof Error ? err.message : "Could not save payout.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy}>
            <div className="prop-form-grid">
              <label>
                Status
                <select
                  name="status"
                  defaultValue={editing?.status ?? "Requested"}
                >
                  {["Requested", "Approved", "Paid", "Denied", "Cancelled"].map(
                    (v) => (
                      <option key={v}>{v}</option>
                    ),
                  )}
                </select>
              </label>
              {amount(
                "Requested amount",
                "requestedAmount",
                editing?.requestedAmount,
                true,
              )}
              {time(
                "Requested timestamp",
                "requestedAt",
                editing?.requestedAt ?? new Date().toISOString(),
                true,
              )}
              {amount(
                "Approved amount",
                "approvedAmount",
                editing?.approvedAmount,
              )}
              {time("Approved timestamp", "approvedAt", editing?.approvedAt)}
              {amount(
                "Actual account deduction",
                "deductionAmount",
                editing?.deductionAmount,
              )}
              {time(
                "Actual deduction timestamp",
                "deductedAt",
                editing?.deductedAt,
              )}
              {amount(
                "Actual trader receipt",
                "receiptAmount",
                editing?.receiptAmount,
              )}
              {time("Payment timestamp", "paidAt", editing?.paidAt)}
              <label>
                Note / correction explanation
                <textarea
                  name="note"
                  defaultValue={editing?.note ?? ""}
                  maxLength={1000}
                />
              </label>
            </div>
            <p className="small muted">
              Marking Paid does not deduct the account again. Editing a
              deduction replaces its single linked ledger adjustment and
              preserves the prior revision.
            </p>
            <Button disabled={busy} aria-busy={busy}>
              {busy ? <><LoadingSpinner />Saving</> : "Save payout events"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancel editing
            </Button>
          </fieldset>
        </form>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="prop-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Requested</th>
              <th>Status</th>
              <th>Requested amount</th>
              <th>Approved</th>
              <th>Actual deduction</th>
              <th>Trader receipt</th>
              <th>History</th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id}>
                <td>{journalTimestamp(p.requestedAt, timezone)}</td>
                <td>{p.status}</td>
                <td>{journalMoney(p.requestedAmount)}</td>
                <td>
                  {p.approvedAmount === null
                    ? "Not recorded"
                    : journalMoney(p.approvedAmount)}
                </td>
                <td>
                  {p.deductionAmount === null
                    ? "Not recorded"
                    : journalMoney(p.deductionAmount)}
                </td>
                <td>
                  {p.receiptAmount === null
                    ? "Not recorded"
                    : journalMoney(p.receiptAmount)}
                </td>
                <td>
                  {!readOnly && (
                    <button
                      onClick={() => {
                        setEditing(p);
                        setOpen(true);
                        setError("");
                      }}
                    >
                      Edit / correct · revision {p.revision}
                    </button>
                  )}
                  <details>
                    <summary>Audit history</summary>
                    {audit
                      .filter((a) => a.payoutId === p.id)
                      .map((a) => (
                        <p key={a.id}>
                          Revision {a.revision} ·{" "}
                          {journalTimestamp(a.at, timezone)} · {a.after.status}{" "}
                          · deduction{" "}
                          {a.after.deductionAmount === null
                            ? "not recorded"
                            : journalMoney(a.after.deductionAmount)}{" "}
                          · receipt{" "}
                          {a.after.receiptAmount === null
                            ? "not recorded"
                            : journalMoney(a.after.receiptAmount)}
                        </p>
                      ))}
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && (
          <p className="prop-setup">
            No payout events recorded for this phase.
          </p>
        )}
      </div>
    </section>
  );
}
