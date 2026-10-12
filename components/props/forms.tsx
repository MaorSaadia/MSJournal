"use client";
import { useState } from "react";
import { RequestError, requestJson } from "@/lib/client-api";
import {
  emptyRules,
  type RuleInput,
  type PropRules,
} from "@/lib/props/validation";
import { wallInput } from "@/lib/props/model";
import type { TradingAccount } from "@/lib/accounts/types";
import type { PhaseProgress } from "@/lib/props/model";
import type { PropData } from "@/lib/props/service";
import { Button } from "@/components/ui/button";
type Saved = (result: {
  phaseId: string;
  accountId: string;
  rules?: PropRules;
  effectiveLocal?: string;
}) => void;
function Field({
  label,
  name,
  value = "",
  type = "text",
  hint,
}: {
  label: string;
  name: string;
  value?: string;
  type?: string;
  hint?: string;
}) {
  return (
    <label>
      {label}
      <input name={name} type={type} defaultValue={value} />
      {hint && <small>{hint}</small>}
    </label>
  );
}
function useSave(onSaved: Saved) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const save = async (body: unknown) => {
    setBusy(true);
    setError("");
    try {
      onSaved(
        await requestJson<{
          phaseId: string;
          accountId: string;
          rules?: PropRules;
          effectiveLocal?: string;
        }>("/api/prop-progress", {
          method: "POST",
          body: JSON.stringify(body),
        }),
      );
    } catch (e) {
      setError(
        e instanceof RequestError && e.issues?.length
          ? e.issues.map((i) => i.message).join(" ")
          : e instanceof Error
            ? e.message
            : "Could not save.",
      );
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, save };
}
export function PhaseForm({
  account,
  previous,
  accounts,
  onSaved,
}: {
  account: TradingAccount;
  previous: PhaseProgress | null;
  accounts: TradingAccount[];
  onSaved: Saved;
}) {
  const { busy, error, save } = useSave(onSaved);
  const [targetId, setTargetId] = useState(account.id);
  const target = accounts.find((a) => a.id === targetId) ?? account;
  const [baseline, setBaseline] = useState(
    previous ? "" : (account.openingBalance ?? ""),
  );
  const start = previous
    ? wallInput(new Date().toISOString(), account.reportingTimezone)
    : `${account.startDate ?? account.openingBalanceDate ?? new Intl.DateTimeFormat("en-CA", { timeZone: account.reportingTimezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())}T00:00`;
  return (
    <form
      className="prop-form"
      aria-label="Tracking phase"
      onSubmit={(e) => {
        e.preventDefault();
        const values = new FormData(e.currentTarget);
        void save({
          action: "phase",
          accountId: values.get("accountId"),
          previousId: previous?.phase.id ?? null,
          kind: values.get("kind"),
          label: values.get("label"),
          startLocal: values.get("startLocal"),
          baseline: values.get("baseline"),
          historyConfirmed: values.get("historyConfirmed") === "on",
          note: values.get("note"),
        });
      }}
    >
      <fieldset disabled={busy}>
        <legend>
          {previous
            ? "Start a funded phase or reset"
            : "Start tracking this account"}
        </legend>
        <div className="prop-form-grid">
          <label>
            Linked trading account
            <select
              name="accountId"
              value={targetId}
              onChange={(e) => {
                setTargetId(e.target.value);
                setBaseline("");
              }}
            >
              {accounts
                .filter((a) => !a.archivedAt)
                .map((a) => (
                  <option value={a.id} key={a.id}>
                    {a.displayName} ·{" "}
                    {a.brokerIdentifier ?? "identifier not set"}
                  </option>
                ))}
            </select>
            <small>
              If a new broker identifier was issued, create its account first
              and link it here. Cutoff time is interpreted in the selected
              account’s reporting timezone.
            </small>
          </label>
          <label>
            Phase
            <select
              name="kind"
              defaultValue={
                account.stage === "Funded" ? "Funded" : "Evaluation"
              }
            >
              <option>Evaluation</option>
              <option>Funded</option>
            </select>
          </label>
          <Field
            label="Phase / reset name"
            name="label"
            value={
              previous
                ? `${account.displayName} · next period`
                : (account.programName ?? account.displayName)
            }
          />
          <Field
            label={`Tracking cutoff · ${target.reportingTimezone}`}
            name="startLocal"
            value={start}
            type="datetime-local"
            hint="Balance is observed immediately before this timestamp. Earlier exits are excluded; positions spanning the cutoff need review."
          />
          <label>
            Observed starting balance (USD) · optional
            <input
              name="baseline"
              value={baseline}
              onChange={(e) => setBaseline(e.target.value)}
            />
            <small>
              Nominal size is never used. Confirm any prefilled journal baseline
              matches this exact cutoff.
            </small>
          </label>
          <Field label="History note" name="note" />
        </div>
        <label className="prop-check">
          <input name="historyConfirmed" type="checkbox" />I confirm imported
          realized history from this cutoff is complete for tracking.
        </label>
        <p className="prop-local-note">
          A reset closes the previous open period without deleting trades,
          reviews or snapshots. New rules are configured separately. No fees or
          expenses are added.
        </p>
        <Button type="submit">
          {busy ? "Saving…" : "Save tracking phase"}
        </Button>
      </fieldset>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </form>
  );
}
export function RulesForm({
  account,
  progress,
  draft,
  draftEffective,
  onSaved,
}: {
  account: TradingAccount;
  progress: PhaseProgress;
  draft?: PropRules | null;
  draftEffective?: string | null;
  onSaved: Saved;
}) {
  const { busy, error, save } = useSave(onSaved),
    last = progress.periods.at(-1);
  const values: RuleInput = {
    ...emptyRules,
    ...(draft || last
      ? Object.fromEntries(
          Object.entries(draft ?? last!.rules).map(([k, v]) => [
            k,
            v === null ? "" : typeof v === "number" ? String(v) : v,
          ]),
        )
      : {}),
    daySettingsConfirmed: false,
    startingHighWater: "",
  } as RuleInput;
  const [mode, setMode] = useState(values.drawdownMode),
    [qualification, setQualification] = useState(values.qualification);
  return (
    <form
      className="prop-form"
      aria-label="Custom prop rules"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget),
          rules: Record<string, unknown> = {};
        for (const key of Object.keys(emptyRules))
          rules[key] =
            key === "daySettingsConfirmed"
              ? f.get(key) === "on"
              : String(f.get(key) ?? "");
        void save({
          action: "rules",
          accountId: account.id,
          phaseId: progress.phase.id,
          effectiveLocal: f.get("effectiveLocal"),
          rules,
        });
      }}
    >
      <fieldset disabled={busy}>
        <legend>Editable custom rules</legend>
        <p className="prop-local-note">
          Blank means not configured; zero is an explicit limit. Firm selection
          applies no rules. Each version governs its dated rule period. Profit
          and qualifying-day progress remain phase-to-date; earlier rules remain
          in History.
        </p>
        <div className="prop-form-grid">
          <Field
            label={`Effective timestamp · ${account.reportingTimezone}`}
            name="effectiveLocal"
            type="datetime-local"
            value={
              draftEffective ??
              wallInput(
                last ? new Date().toISOString() : progress.phase.startAt,
                account.reportingTimezone,
              )
            }
          />
          <label>
            P&L basis
            <select name="basis" defaultValue={values.basis}>
              <option value="gross">Gross</option>
              <option value="net">Net · requires fees</option>
            </select>
          </label>
          <Field
            label="Profit target (USD)"
            name="profitTarget"
            value={values.profitTarget}
          />
          <Field
            label="Minimum qualifying days"
            name="minimumDays"
            value={values.minimumDays}
          />
          <label>
            Day qualification
            <select
              name="qualification"
              value={qualification}
              onChange={(e) =>
                setQualification(e.target.value as RuleInput["qualification"])
              }
            >
              <option value="activity">Imported realized activity</option>
              <option value="pnl">Daily realized P&L ≥ threshold</option>
            </select>
          </label>
          <Field
            label="Qualifying-day threshold (USD)"
            name="dayThreshold"
            value={values.dayThreshold}
            hint={
              qualification === "pnl"
                ? "Required, including zero if intended."
                : "Unused with activity qualification."
            }
          />
          <Field
            label="Daily realized loss limit (USD)"
            name="dailyLoss"
            value={values.dailyLoss}
          />
          <Field
            label="Maximum contracts · reference only"
            name="maximumContracts"
            value={values.maximumContracts}
          />
        </div>
        <h3>Rule days</h3>
        <p className="prop-local-note">
          Independent of the journal display timezone. These editable example
          defaults are not firm policy; confirm your program’s boundaries.
        </p>
        <div className="prop-form-grid">
          <Field
            label="IANA rule timezone"
            name="timezone"
            value={values.timezone}
          />
          <Field
            label="Local daily reset"
            name="resetTime"
            type="time"
            value={values.resetTime}
          />
          <label>
            Trading-day date label
            <select name="dayLabel" defaultValue={values.dayLabel}>
              <option value="start">Session start date</option>
              <option value="end">Session end date</option>
            </select>
          </label>
          <label className="prop-check">
            <input
              type="checkbox"
              name="daySettingsConfirmed"
              defaultChecked={values.daySettingsConfirmed}
            />
            I confirm this rule timezone, reset time and date-label convention.
          </label>
        </div>
        <h3>Drawdown</h3>
        <div className="prop-form-grid">
          <label>
            Mode
            <select
              name="drawdownMode"
              value={mode}
              onChange={(e) =>
                setMode(e.target.value as RuleInput["drawdownMode"])
              }
            >
              <option>Static</option>
              <option>End-of-day trailing</option>
              <option>Intraday trailing</option>
            </select>
          </label>
          {mode === "Static" ? (
            <Field
              label="Static minimum balance (USD)"
              name="staticFloor"
              value={values.staticFloor}
            />
          ) : (
            <>
              <Field
                label="Trailing distance (USD)"
                name="trailingDistance"
                value={values.trailingDistance}
              />
              <Field
                label="Starting high-water mark (USD)"
                name="startingHighWater"
                value={values.startingHighWater}
                hint="As of this rule version; confirm when copying configuration."
              />
              <Field
                label="Trailing-floor cap (USD)"
                name="floorCap"
                value={values.floorCap}
              />
            </>
          )}
        </div>
        <p className="prop-local-note">
          End-of-day floor updates at the next configured reset after a
          completed rule day; the current unfinished day cannot advance it.
          Intraday equity trailing requires manual dashboard snapshots.
          Cash-adjustment effects on trailing floors are not guessed.
        </p>
        <h3>Consistency & provenance</h3>
        <div className="prop-form-grid">
          <Field
            label="Best-day consistency percentage"
            name="consistencyPercent"
            value={values.consistencyPercent}
          />
          <label>
            Threshold comparison
            <select
              name="consistencyComparison"
              defaultValue={values.consistencyComparison}
            >
              <option value="inclusive">Inclusive · ≤</option>
              <option value="strict">Strict · &lt;</option>
            </select>
          </label>
          <Field
            label="Optional rule source URL"
            name="sourceUrl"
            value={values.sourceUrl}
            type="url"
          />
          <label>
            Rule notes
            <textarea name="notes" defaultValue={values.notes} rows={3} />
          </label>
        </div>
        <p className="prop-local-note">
          Formula: largest positive qualifying-day P&L / phase-to-date P&L,
          evaluated only for a positive total. The denominator includes
          losing/nonqualifying days. This custom formula does not represent
          every firm’s policy.
        </p>
        <Button type="submit">{busy ? "Saving…" : "Save rule version"}</Button>
      </fieldset>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
export function SnapshotForm({
  account,
  progress,
  onSaved,
}: {
  account: TradingAccount;
  progress: PhaseProgress;
  onSaved: Saved;
}) {
  const { busy, error, save } = useSave(onSaved);
  return (
    <form
      className="prop-form"
      aria-label="Manual prop dashboard snapshot"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void save({
          action: "snapshot",
          accountId: account.id,
          phaseId: progress.phase.id,
          asOfLocal: f.get("asOfLocal"),
          balance: f.get("balance"),
          threshold: f.get("threshold"),
          qualifyingDays: f.get("qualifyingDays"),
          note: f.get("note"),
        });
      }}
    >
      <fieldset disabled={busy}>
        <legend>Manually recorded from prop dashboard</legend>
        <div className="prop-form-grid">
          <Field
            label={`As-of timestamp · ${account.reportingTimezone}`}
            name="asOfLocal"
            type="datetime-local"
            value={wallInput(
              new Date().toISOString(),
              account.reportingTimezone,
            )}
          />
          <Field label="Observed balance (USD)" name="balance" />
          <Field
            label="Observed liquidation threshold (USD) · optional"
            name="threshold"
          />
          <Field
            label="Observed qualifying days · optional"
            name="qualifyingDays"
          />
          <Field label="Snapshot note" name="note" />
        </div>
        <p className="prop-local-note">
          A snapshot changes no trading results, cash ledger or baseline. Its
          threshold applies only to this dated observation; later closes do not
          imply a new official threshold or earlier compliance.
        </p>
        <Button type="submit">{busy ? "Saving…" : "Save snapshot"}</Button>
      </fieldset>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </form>
  );
}
export function StatusForm({
  account,
  progress,
  onSaved,
}: {
  account: TradingAccount;
  progress: PhaseProgress;
  onSaved: Saved;
}) {
  const { busy, error, save } = useSave(onSaved);
  return (
    <form
      className="prop-form"
      aria-label="Dated account status"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void save({
          action: "status",
          accountId: account.id,
          phaseId: progress.phase.id,
          status: f.get("status"),
          atLocal: f.get("atLocal"),
          note: f.get("note"),
        });
      }}
    >
      <fieldset disabled={busy}>
        <legend>Explicit account status</legend>
        <div className="prop-form-grid">
          <label>
            Status
            <select name="status" defaultValue={progress.phase.status}>
              {["Active", "Passed", "Failed", "Paused", "Closed"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <Field
            label={`Status timestamp · ${account.reportingTimezone}`}
            name="atLocal"
            type="datetime-local"
            value={wallInput(
              new Date().toISOString(),
              account.reportingTimezone,
            )}
          />
          <Field label="Status note" name="note" />
        </div>
        <p className="prop-local-note">
          Passed, Failed and Closed end this period. Target progress never
          changes status automatically. An ended period cannot be reopened;
          create a reset or new phase instead.
        </p>
        <Button type="submit">{busy ? "Saving…" : "Record status"}</Button>
      </fieldset>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </form>
  );
}
export function CopyRulesForm({
  account,
  progress,
  sources,
  onCopied,
  onSaved,
}: {
  account: TradingAccount;
  progress: PhaseProgress;
  sources: PropData["copySources"];
  onCopied: (rules: PropRules, effectiveLocal: string) => void;
  onSaved: Saved;
}) {
  const { busy, error, save } = useSave((result) => {
    if (result.rules)
      onCopied(
        result.rules,
        result.effectiveLocal ??
          wallInput(progress.phase.startAt, account.reportingTimezone),
      );
    else onSaved(result);
  });
  return (
    <form
      className="prop-form"
      aria-label="Copy owned configuration"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void save({
          action: "copy",
          accountId: account.id,
          phaseId: progress.phase.id,
          sourceRuleId: f.get("sourceRuleId"),
          effectiveLocal: f.get("effectiveLocal"),
          confirmCopy: f.get("confirmCopy") === "on",
        });
      }}
    >
      <fieldset disabled={busy || !sources.length}>
        <legend>Copy your configuration</legend>
        <div className="prop-form-grid">
          <label>
            Owned rule version
            <select name="sourceRuleId">
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <Field
            label={`New effective timestamp · ${account.reportingTimezone}`}
            name="effectiveLocal"
            type="datetime-local"
            value={wallInput(
              new Date().toISOString(),
              account.reportingTimezone,
            )}
          />
        </div>
        <label className="prop-check">
          <input type="checkbox" name="confirmCopy" required />
          Copy these custom reference values. I will reconfirm the target’s day
          boundaries and starting high-water mark.
        </label>
        <Button type="submit">
          {busy ? "Saving…" : "Load copied configuration"}
        </Button>
      </fieldset>
      {!sources.length && (
        <p className="prop-local-note">Save a custom rule version first.</p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </form>
  );
}
