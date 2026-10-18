"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { requestJson, RequestError } from "@/lib/client-api";
import { propPresets, toLegacyRules } from "@/lib/props/presets";
import {
  customTrackingRules,
  snapshotDetailsSchema,
  trackingRulesSchema,
  type SnapshotDetails,
} from "@/lib/props/tracking-rules";
import { rulesSchema } from "@/lib/props/validation";
import type { TradingAccount } from "@/lib/accounts/types";
import type { PhaseProgress } from "@/lib/props/model";
import { wallInput } from "@/lib/props/model";
import { TrackingRuleEditor } from "./tracking-editor";

export function OpeningDetails({
  value,
  onChange,
}: {
  value: SnapshotDetails;
  onChange: (v: SnapshotDetails) => void;
}) {
  const money = (
    label: string,
    key: "phaseProfit" | "cycleProfit" | "bestDay" | "highWater",
  ) => (
    <label key={key}>
      {label}
      <input
        aria-label={label}
        value={value[key] ?? ""}
        onChange={(e) => onChange({ ...value, [key]: e.target.value || null })}
      />
    </label>
  );
  const count = (
    label: string,
    key: "qualifyingDays" | "tradingDays" | "cycleNumber" | "payoutNumber",
  ) => (
    <label key={key}>
      {label}
      <input
        aria-label={label}
        type="number"
        min={key === "cycleNumber" || key === "payoutNumber" ? 1 : 0}
        value={value[key] ?? ""}
        onChange={(e) =>
          onChange({
            ...value,
            [key]: e.target.value === "" ? null : Number(e.target.value),
          })
        }
      />
    </label>
  );
  return (
    <>
      <div className="prop-form-grid">
        {money("Confirmed high-water mark at snapshot", "highWater")}
        {money("Opening phase net profit", "phaseProfit")}
        {money("Opening cycle net profit", "cycleProfit")}
        {money("Opening best-day net profit", "bestDay")}
        {count("Current payout cycle number", "cycleNumber")}
        {count("Next payout number", "payoutNumber")}
        {count("Opening qualifying days", "qualifyingDays")}
        {count("Opening trading days", "tradingDays")}
        <label>
          Cycle started UTC (optional ISO timestamp)
          <input
            value={value.cycleStartedAt ?? ""}
            onChange={(e) =>
              onChange({ ...value, cycleStartedAt: e.target.value || null })
            }
          />
        </label>
      </div>
      <label>
        Imported activity confirmed complete through UTC (optional ISO
        timestamp)
        <input
          value={value.coverageThrough ?? ""}
          onChange={(e) =>
            onChange({ ...value, coverageThrough: e.target.value || null })
          }
        />
      </label>
      <label className="daily-check">
        <input
          type="checkbox"
          checked={value.locked}
          onChange={(e) => onChange({ ...value, locked: e.target.checked })}
        />
        Trailing is confirmed locked
      </label>
      <label className="daily-check">
        <input
          type="checkbox"
          checked={value.eodBufferConfirmed ?? false}
          onChange={(e) =>
            onChange({ ...value, eodBufferConfirmed: e.target.checked })
          }
        />
        Firm confirmed the required EOD payout buffer was met (if applicable)
      </label>
      <label className="daily-check">
        <input
          type="checkbox"
          checked={value.openingConfirmed}
          onChange={(e) =>
            onChange({ ...value, openingConfirmed: e.target.checked })
          }
        />
        I confirmed these opening values and the exact cutoff
      </label>
      <details>
        <summary>
          Dated daily opening details (avoid overlapping qualifying days)
        </summary>
        <p className="small muted">
          For a partial session, enter the current session’s opening P&L too.
          When used, supply the complete opening cycle day list; it replaces
          aggregate day counts and best day. Format: YYYY-MM-DD, net profit,
          qualifying true/false. These are firm session dates.
        </p>
        <textarea
          aria-label="Dated daily opening details"
          defaultValue={value.daily
            .map((d) => `${d.date},${d.profit},${d.qualifying}`)
            .join("\n")}
          onChange={(e) =>
            onChange({
              ...value,
              daily: e.target.value
                .split("\n")
                .filter(Boolean)
                .map((line) => {
                  const [date, profit, qualifying] = line
                    .split(",")
                    .map((v) => v.trim());
                  return { date, profit, qualifying: qualifying === "true" };
                }),
            })
          }
        />
      </details>
    </>
  );
}
export function TrackingSetup({
  account,
  progress,
  onSaved,
}: {
  account: TradingAccount;
  progress: PhaseProgress | null;
  onSaved: (r: { accountId: string; phaseId: string }) => void;
}) {
  const previous = progress?.current?.rules;
  const [rules, setRules] = useState(() => {
    if (previous?.tracking) return structuredClone(previous.tracking);
    const r = customTrackingRules();
    r.stage =
      (progress?.phase.kind ?? account.stage) === "Funded"
        ? "Sim Funded"
        : "Evaluation";
    r.size = account.nominalSize;
    r.platform = account.platform;
    if (previous) {
      r.drawdown.mode = previous.drawdownMode;
      r.drawdown.initialThreshold = previous.staticFloor;
      r.drawdown.distance = previous.trailingDistance;
      r.drawdown.cap = previous.floorCap;
      r.drawdown.highWater = previous.startingHighWater;
      r.evaluation.target = previous.profitTarget;
      r.evaluation.tradingDays = previous.minimumDays;
      r.consistency.percent = previous.consistencyPercent;
      r.consistency.comparison = previous.consistencyComparison;
      r.session.timezone = previous.timezone;
      r.session.reset = previous.resetTime;
      r.session.confirmed = previous.daySettingsConfirmed;
      r.daily.amount = previous.dailyLoss;
      r.daily.mode = previous.dailyLoss === null ? "disabled" : "fixed";
      r.positions.minis = previous.maximumContracts;
    }
    return r;
  });
  const [step, setStep] = useState(0),
    [selection, setSelection] = useState("custom"),
    [mode, setMode] = useState(progress ? "correction" : "new"),
    [origin, setOrigin] = useState("start");
  const [start, setStart] = useState(
    wallInput(
      progress
        ? new Date().toISOString()
        : `${account.startDate ?? new Date().toISOString().slice(0, 10)}T00:00:00Z`,
      account.reportingTimezone,
    ),
  );
  const [baseline, setBaseline] = useState(
      progress ? "" : (account.openingBalance ?? ""),
    ),
    [history, setHistory] = useState(false),
    [opening, setOpening] = useState(snapshotDetailsSchema.parse({}));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const steps = [
    "Account",
    "Product",
    "Rules review",
    "Starting point",
    "Summary",
  ];

  const choose = (id: string) => {
    setSelection(id);
    const p = propPresets.find((p) => p.id === id);
    if (p) {
      setRules(structuredClone(p.rules));
      if (!progress || mode === "new") setBaseline(p.ledger ?? "");
    } else {
      const next = customTrackingRules();
      Object.assign(next, {
        firm: rules.firm,
        stage: rules.stage,
        size: rules.size,
        platform: rules.platform,
      });
      setRules(next);
    }
  };
  const changes = previous?.tracking
    ? Object.keys(rules).filter(
        (k) =>
          JSON.stringify(rules[k as keyof typeof rules]) !==
          JSON.stringify(previous.tracking![k as keyof typeof rules]),
      )
    : Object.keys(rules);
  async function save() {
    setBusy(true);
    setError("");
    try {
      const tracking = trackingRulesSchema.parse(rules),
        input = toLegacyRules(tracking);
      rulesSchema.parse(input);
      if (mode === "new" && baseline === "")
        throw new Error(
          "Enter the actual starting ledger balance; nominal size is separate.",
        );
      const snapshot =
        origin === "snapshot"
          ? snapshotDetailsSchema.parse(opening)
          : undefined;
      const body =
        progress && mode === "correction"
          ? {
              action: "rules",
              accountId: account.id,
              phaseId: progress.phase.id,
              effectiveLocal: start,
              rules: input,
              ...(snapshot
                ? { openingSnapshot: snapshot, snapshotBalance: baseline }
                : {}),
            }
          : {
              action: "phase",
              accountId: account.id,
              previousId: progress?.phase.id ?? null,
              kind: rules.stage === "Evaluation" ? "Evaluation" : "Funded",
              label: `${rules.product} · ${rules.stage}`,
              startLocal: start,
              baseline,
              historyConfirmed: origin === "start" && history,
              note:
                origin === "snapshot"
                  ? "Partial history; confirmed dashboard anchor."
                  : "Phase starting point confirmed by user.",
              initialRules: input,
              ...(snapshot ? { openingSnapshot: snapshot } : {}),
            };
      onSaved(
        await requestJson("/api/prop-progress", {
          method: "POST",
          body: JSON.stringify(body),
        }),
      );
    } catch (e) {
      setError(
        e instanceof RequestError && e.issues?.length
          ? e.issues.map((i) => `${i.path}: ${i.message}`).join(" ")
          : e instanceof Error
            ? e.message
            : "Could not save.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="prop-form day14-setup"
      aria-label="Configure progress tracking"
    >
      <h2>Configure progress tracking</h2>
      <p className="small muted">
        Journal tracking only. No broker connection or live risk enforcement.
      </p>
      <ol className="day14-steps">
        {steps.map((name, i) => (
          <li key={name} aria-current={step === i ? "step" : undefined}>
            {i + 1}. {name}
          </li>
        ))}
      </ol>
      <fieldset disabled={busy}>
        {step === 0 && (
          <>
            <p>
              <strong>{account.displayName}</strong> ·{" "}
              {account.firm ?? "Custom"} · {account.platform}
            </p>
            <p>
              Account identity and optional broker mapping remain in{" "}
              <Link href={`/prop-accounts/${account.id}`}>
                account settings
              </Link>
              . Performance.csv can be imported into this selected account
              without a broker identifier.
            </p>
            {progress && (
              <label>
                Apply this configuration as
                <select
                  value={mode}
                  onChange={(e) => {
                    setMode(e.target.value);
                    setBaseline("");
                  }}
                >
                  <option value="correction">
                    A dated correction in the current phase
                  </option>
                  <option value="new">
                    A new phase / reset (preserve the old phase)
                  </option>
                </select>
              </label>
            )}
            <p className="prop-local-note">
              A new funded phase needs its own starting balance. Evaluation
              profits are never carried over automatically. To use a new broker
              account, create it in Account settings, then use the existing
              phase-transition action.
            </p>
          </>
        )}
        {step === 1 && (
          <>
            <div className="prop-form-grid">
              <label>
                Prop firm
                <select
                  value={rules.firm}
                  onChange={(e) => {
                    const next = customTrackingRules();
                    next.firm = e.target.value as typeof rules.firm;
                    setRules(next);
                    setSelection("custom");
                  }}
                >
                  {[
                    "Apex",
                    "MyFundedFutures",
                    "Lucid",
                    "Take Profit Trader",
                    "Custom",
                  ].map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </label>
              <label>
                Exact product and rule version
                <select
                  aria-label="Prop product preset"
                  value={selection}
                  onChange={(e) => choose(e.target.value)}
                >
                  <option value="custom">Custom / unsupported version</option>
                  {propPresets
                    .filter((p) => p.rules.firm === rules.firm)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label} · {p.rules.preset?.version}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Product name
                <input
                  value={rules.product}
                  onChange={(e) =>
                    setRules({
                      ...rules,
                      product: e.target.value,
                      manualConfirmed: false,
                      preset: rules.preset
                        ? { ...rules.preset, customized: true }
                        : null,
                    })
                  }
                />
              </label>
              <label>
                Stage
                <select
                  value={rules.stage}
                  onChange={(e) =>
                    setRules({
                      ...rules,
                      stage: e.target.value as typeof rules.stage,
                      manualConfirmed: false,
                      preset: rules.preset
                        ? { ...rules.preset, customized: true }
                        : null,
                    })
                  }
                >
                  {["Evaluation", "Sim Funded", "Live"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label>
                Nominal account size
                <input
                  value={rules.size}
                  onChange={(e) => {
                    setSelection("custom");
                    setRules({
                      ...rules,
                      size: e.target.value,
                      preset: null,
                      manualConfirmed: false,
                    });
                  }}
                />
              </label>
              <label>
                Platform (actual account)
                <input
                  value={rules.platform}
                  onChange={(e) => {
                    setSelection("custom");
                    setRules({
                      ...rules,
                      platform: e.target.value,
                      preset: null,
                      manualConfirmed: false,
                    });
                  }}
                />
              </label>
            </div>
            <p className="small muted">
              Preset coverage is limited to the exact listed sizes/stages. A
              different size or platform requires Custom configuration.
            </p>
            {rules.firm === "Lucid" && rules.product === "Daily" && (
              <label>
                Purchased evaluation drawdown
                <select
                  value={
                    rules.stage === "Evaluation"
                      ? rules.drawdown.mode
                      : "Intraday trailing"
                  }
                  disabled={rules.stage !== "Evaluation"}
                  onChange={(e) =>
                    setRules({
                      ...rules,
                      manualConfirmed: false,
                      options: [
                        ...rules.options.filter(
                          (v) => !v.startsWith("Evaluation drawdown:"),
                        ),
                        `Evaluation drawdown: ${e.target.value}`,
                      ],
                      drawdown: {
                        ...rules.drawdown,
                        mode: e.target.value as typeof rules.drawdown.mode,
                      },
                    })
                  }
                >
                  <option>End-of-day trailing</option>
                  <option>Intraday trailing</option>
                </select>
              </label>
            )}
            {((rules.firm === "Lucid" &&
              (rules.product === "Daily" || rules.product === "Flex")) ||
              (rules.firm === "MyFundedFutures" &&
                rules.product === "Flex")) && (
              <label className="daily-check">
                <input
                  type="checkbox"
                  checked={rules.daily.mode !== "disabled"}
                  onChange={(e) =>
                    setRules({
                      ...rules,
                      manualConfirmed: false,
                      options: [
                        ...rules.options.filter(
                          (v) => !v.startsWith("Purchased DLL:"),
                        ),
                        `Purchased DLL: ${e.target.checked ? "ON" : "OFF"}`,
                      ],
                      daily: {
                        ...rules.daily,
                        mode: e.target.checked ? "fixed" : "disabled",
                        amount: e.target.checked
                          ? rules.firm === "MyFundedFutures"
                            ? "1000"
                            : rules.product === "Daily"
                              ? "1200"
                              : null
                          : null,
                      },
                    })
                  }
                />
                Purchased DLL add-on (confirm amount in Rules)
              </label>
            )}
            {rules.preset && (
              <div className="prop-local-note">
                <strong>
                  {rules.preset.customized
                    ? "Customized"
                    : "Verified parameters · account confirmation required"}
                </strong>
                <p>
                  Checked {rules.preset.verifiedOn}. Effective date:{" "}
                  {rules.preset.effectiveDate ?? "Not documented"}.
                </p>
                <ul>
                  {rules.preset.gaps.map((g) => (
                    <li key={g}>{g}</li>
                  ))}
                </ul>
                {rules.preset.sources.map((u, i) => (
                  <a href={u} target="_blank" rel="noreferrer" key={u}>
                    Official source {i + 1} ↗{" "}
                  </a>
                ))}
              </div>
            )}
          </>
        )}
        {step === 2 && <TrackingRuleEditor value={rules} onChange={setRules} />}
        {step === 3 && (
          <>
            <div className="prop-form-grid">
              <label>
                Tracking starting point
                <select
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                >
                  <option value="start">From account / phase start</option>
                  <option value="snapshot">
                    From current firm dashboard snapshot
                  </option>
                </select>
              </label>
              <label>
                {mode === "correction"
                  ? "Rule effective timestamp"
                  : "Phase start / snapshot timestamp"}{" "}
                · {account.reportingTimezone}
                <input
                  type="datetime-local"
                  step="1"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </label>
              <label>
                Actual{" "}
                {origin === "snapshot"
                  ? "confirmed dashboard"
                  : "initial ledger"}{" "}
                balance (not nominal size)
                <input
                  aria-label="Actual tracking balance"
                  value={baseline}
                  onChange={(e) => setBaseline(e.target.value)}
                />
              </label>
            </div>
            {origin === "start" ? (
              <label className="daily-check">
                <input
                  type="checkbox"
                  checked={history}
                  onChange={(e) => setHistory(e.target.checked)}
                />
                I confirmed complete phase activity and source coverage
              </label>
            ) : (
              <>
                <OpeningDetails value={opening} onChange={setOpening} />
                <p className="prop-local-note">
                  The snapshot includes activity through its exact timestamp.
                  Only later activity is added. Partial history cannot prove
                  earlier compliance. Set the confirmed threshold in Rules.
                </p>
              </>
            )}
          </>
        )}
        {step === 4 && (
          <>
            <h3>
              {rules.product} · {rules.stage} · {rules.size}
            </h3>
            <p>
              {mode === "correction"
                ? "Add a new dated rule version to the current phase; earlier versions remain in History."
                : "Create a distinct phase; preserve previous rules, imports and journal associations."}
            </p>
            <p>
              Effective {start} · {account.reportingTimezone}.{" "}
              {origin === "snapshot"
                ? "Partial-history snapshot anchor"
                : "Recorded phase baseline"}
              .
            </p>
            <p>
              Changed rule groups: {changes.join(", ") || "None"}. Existing
              activity is reused by account and exclusive phase dates, without
              reassignment.
            </p>
            <details>
              <summary>Review exact saved rules / changes</summary>
              <div className="prop-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Rule group</th>
                      <th>Before</th>
                      <th>After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changes.map((k) => (
                      <tr key={k}>
                        <th>{k}</th>
                        <td>
                          <pre>
                            {JSON.stringify(
                              previous?.tracking?.[k as keyof typeof rules] ??
                                null,
                              null,
                              2,
                            )}
                          </pre>
                        </td>
                        <td>
                          <pre>
                            {JSON.stringify(
                              rules[k as keyof typeof rules],
                              null,
                              2,
                            )}
                          </pre>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
            <p className="prop-local-note">
              MSJournal records these rules only. Confirm any actual product
              change with your firm. Selecting a preset never updates another
              account or older snapshot.
            </p>
          </>
        )}
      </fieldset>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="prop-actions">
        <Button
          variant="outline"
          disabled={step === 0 || busy}
          onClick={() => setStep(step - 1)}
        >
          Previous
        </Button>
        {step < 4 ? (
          <Button
            onClick={() => {
              setError("");
              setStep(step + 1);
            }}
          >
            Continue
          </Button>
        ) : (
          <Button disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Save tracking configuration"}
          </Button>
        )}
      </div>
    </section>
  );
}
