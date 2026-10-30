"use client";
import { confirmAction } from "@/components/ui/confirm-action";
import { useRef, useState } from "react";
import { requestJson } from "@/lib/client-api";
import { journalMoney } from "@/lib/journal/calculations";
import { journalTimestamp } from "@/lib/timezones";
import type { AccountBalance } from "@/lib/balances/model";
export function BalanceSetup({
  account,
  end,
}: {
  account: AccountBalance;
  end: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [kind, setKind] = useState("deposit");
  const requestId = useRef<string | null>(null);
  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await requestJson("/api/balances", {
        method: "POST",
        body: JSON.stringify({ accountId: account.id, ...body }),
      });
      setSaved(true);
      return true;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save balance setup.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="balance-account">
      <div className="balance-account-heading">
        <strong>{account.name}</strong>
        <span>
          {account.ending === null
            ? account.baseline === null
              ? "Starting balance needed"
              : "Baseline is after this range"
            : journalMoney(account.ending)}
        </span>
      </div>
      {account.ending !== null && (
        <p className="panel-note">
          {account.missingFees
            ? `Balance before unrecorded fees · ${account.missingFees} trades with unknown fees.`
            : "Journal balance estimate."}
          {account.estimated ? " Includes estimated fees." : ""}
        </p>
      )}
      {account.baselineSource && account.baselineSource !== "manual" && <p className="panel-note">Starting balance {journalMoney(account.baseline)} / automatic from {account.baselineSource === "phase" ? "Prop Accounts" : "account size"}.</p>}
      {account.baselineInstant && account.baselineSource === "manual" && (
        <p className="panel-note">
          Baseline {journalMoney(account.baseline)} immediately before{" "}
          {account.baselineDate} 00:00 · {account.timezone} (
          {account.baselineInstant}).
          {account.entering !== null
            ? ` Entering range: ${journalMoney(account.entering)}.`
            : " Baseline does not cover the range start."}
        </p>
      )}
      <details>
        <summary>
          {account.baseline === null
            ? "Set starting balance"
            : "Change starting balance"}
        </summary>
        <form
          aria-label={`Starting balance for ${account.name}`}
          key={`${account.baseline}:${account.baselineDate}`}
          onSubmit={async (e) => {
            e.preventDefault();
            const values = new FormData(e.currentTarget);
            await send({
              action: "baseline",
              amount: String(values.get("amount")),
              date: String(values.get("date")),
            });
          }}
        >
          <fieldset disabled={busy}>
            <label className="field-label">
              Starting balance · USD
              <input
                aria-label="Starting balance amount"
                name="amount"
                inputMode="decimal"
                required
                defaultValue={account.baseline ?? ""}
              />
            </label>
            <label className="field-label">
              Tracking starts on
              <input
                aria-label="Baseline date"
                name="date"
                type="date"
                required
                min="2000-01-01"
                max="2099-12-31"
                defaultValue={account.baselineDate ?? end}
              />
            </label>
            <p className="panel-note">
              Balance immediately before 00:00 on this date in{" "}
              {account.timezone}. Saving here overrides the automatic starting balance.
            </p>
            <button type="submit" className="balance-save">
              Save starting balance
            </button>
          </fieldset>
        </form>
      </details>
      {account.baseline !== null && (
        <details>
          <summary>Add balance adjustment</summary>
          <form
            aria-label={`Balance adjustment for ${account.name}`}
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget,
                values = new FormData(form);
              requestId.current ??= crypto.randomUUID();
              if (
                await send({
                  action: "adjustment",
                  id: requestId.current,
                  kind: values.get("kind"),
                  amount: String(values.get("amount")),
                  localTime: String(values.get("localTime")),
                  explanation: String(values.get("explanation") ?? ""),
                })
              ) {
                requestId.current = null;
                form.reset();
                setKind("deposit");
              }
            }}
          >
            <fieldset disabled={busy}>
              <label className="field-label">
                Movement
                <select
                  name="kind"
                  aria-label="Adjustment type"
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                >
                  <option value="deposit">Deposit</option>
                  <option value="withdrawal">Withdrawal</option>
                  <option value="other">Other adjustment</option>
                </select>
              </label>
              <label className="field-label">
                Amount · USD
                <input
                  name="amount"
                  aria-label="Adjustment amount"
                  inputMode="decimal"
                  required
                />
              </label>
              <label className="field-label">
                Effective local time
                <input
                  name="localTime"
                  aria-label="Adjustment local time"
                  type="datetime-local"
                  required
                  defaultValue={`${end}T12:00`}
                />
              </label>
              <label className="field-label">
                Explanation{kind === "other" ? " (required)" : " (optional)"}
                <input
                  name="explanation"
                  aria-label="Adjustment explanation"
                  maxLength={500}
                  required={kind === "other"}
                />
              </label>
              <p className="panel-note">
                {account.timezone} · recorded separately from trading P&L.
                Amounts before the baseline are not added again.
              </p>
              <button type="submit" className="balance-save">
                Save adjustment
              </button>
            </fieldset>
          </form>
        </details>
      )}
      {!!account.adjustments.length && (
        <details>
          <summary>Recent balance adjustments</summary>
          <ul className="balance-adjustments">
            {account.adjustments.map((a) => (
              <li key={a.id}>
                <span>
                  {journalTimestamp(a.effectiveAt, account.timezone)} · {a.kind}
                  <small>{a.explanation}</small>
                </span>
                <strong>{journalMoney(a.amount, true)}</strong>
                <button
                  disabled={busy} aria-busy={busy}
                  aria-label={`Remove ${a.kind} adjustment`}
                  onClick={async () => {
                    if (
                      await confirmAction(
                        "Remove this balance adjustment? Trading P&L stays unchanged.",
                      )
                    )
                      void send({ action: "remove", id: a.id });
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {error && <p role="alert">{error}</p>}
      {saved && (
        <p role="status" className="positive">
          Saved
        </p>
      )}
    </div>
  );
}
