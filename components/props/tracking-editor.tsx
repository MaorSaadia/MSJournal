"use client";
import type { TrackingRules } from "@/lib/props/tracking-rules";

export function TrackingRuleEditor({
  value,
  onChange,
}: {
  value: TrackingRules;
  onChange: (r: TrackingRules) => void;
}) {
  const change = (path: string, next: unknown) => {
    const draft = structuredClone(value);
    const keys = path.split(".");
    let object = draft as unknown as Record<string, unknown>;
    for (const key of keys.slice(0, -1))
      object = object[key] as Record<string, unknown>;
    object[keys.at(-1)!] = next;
    if (path === "consistency.status" && next !== "enabled")
      draft.consistency.percent = null;
    if (path === "consistency.percent")
      draft.consistency.status = next === null ? "unknown" : "enabled";
    if (path !== "manualConfirmed") draft.manualConfirmed = false;
    if (draft.preset) draft.preset.customized = true;
    onChange(draft);
  };
  const get = (path: string): unknown =>
    path
      .split(".")
      .reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], value);
  const field = (
    label: string,
    path: string,
    kind: "money" | "count" | "text" = "money",
  ) => (
    <label key={path}>
      {label}
      <input
        aria-label={label}
        value={String(get(path) ?? "")}
        inputMode={kind === "text" ? undefined : "decimal"}
        onChange={(e) =>
          change(
            path,
            kind === "text"
              ? path === "evaluation.expiry" && e.target.value === ""
                ? null
                : e.target.value
              : e.target.value === ""
                ? null
                : kind === "count"
                  ? Number(e.target.value)
                  : e.target.value,
          )
        }
      />
    </label>
  );
  const select = (label: string, path: string, options: string[]) => (
    <label key={path}>
      {label}
      <select
        value={String(get(path) ?? "")}
        aria-label={label}
        onChange={(e) => change(path, e.target.value || null)}
      >
        {options.map((v) => (
          <option value={v} key={v}>
            {v || "Not configured"}
          </option>
        ))}
      </select>
    </label>
  );
  const check = (label: string, path: string) => (
    <label className="daily-check" key={path}>
      <input
        type="checkbox"
        checked={Boolean(get(path))}
        onChange={(e) => change(path, e.target.checked)}
      />
      {label}
    </label>
  );
  return (
    <div className="prop-editor-stack">
      <p className="prop-local-note">
        Changing rules here changes journal tracking only. It does not change
        your firm account. Blank amounts are unconfigured; zero is explicit.
      </p>
      <div className="prop-form-grid">
        {field("Actual phase initial ledger balance", "ledgerStart")}
        {field("Profit target", "evaluation.target")}
        {check(
          "Adjust target for the consistency requirement",
          "evaluation.targetAdjustsForConsistency",
        )}
        {field("Required trading days", "evaluation.tradingDays", "count")}
        {select("Drawdown model", "drawdown.mode", [
          "Static",
          "End-of-day trailing",
          "Intraday trailing",
        ])}
        {field("Drawdown distance", "drawdown.distance")}
        {field(
          "Initial / confirmed loss threshold",
          "drawdown.initialThreshold",
        )}
        {field("Confirmed high-water mark", "drawdown.highWater")}
      </div>
      <details>
        <summary>Advanced drawdown, daily loss and session rules</summary>
        <div className="prop-form-grid">
          {field("Threshold cap (blank = no configured cap)", "drawdown.cap")}
          {select("High-water mark basis", "drawdown.basis", [
            "balance",
            "equity",
          ])}
          {select("Breach observation basis", "drawdown.breachBasis", [
            "balance",
            "equity",
          ])}
          {select("Threshold breach comparison", "drawdown.comparison", [
            "touch",
            "below",
          ])}
          {select("EOD threshold activation", "drawdown.activation", [
            "immediate",
            "nextSession",
          ])}
          {select("Lock trigger", "drawdown.lockTrigger", [
            "cap",
            "payout",
            "manual",
          ])}
          {check("Trailing has already locked (confirmed)", "drawdown.locked")}
          {check(
            "Explicit threshold correction for this rule version",
            "drawdown.allowCorrection",
          )}
          {select("Payout-triggered threshold event", "drawdown.payoutEvent", [
            "",
            "requested",
            "approved",
            "deducted",
            "paid",
          ])}
          {field("Payout-triggered threshold", "drawdown.payoutThreshold")}
          {select("Daily loss mode", "daily.mode", [
            "disabled",
            "fixed",
            "tiers",
          ])}
          {value.daily.mode !== "disabled" && (
            <>
              {field("Daily loss amount", "daily.amount")}
              {select("Daily loss basis", "daily.basis", ["balance", "equity"])}
              {select("Daily loss effect", "daily.effect", ["pause", "breach"])}
              {select("Daily loss comparison", "daily.comparison", [
                "touch",
                "below",
              ])}
            </>
          )}
          {field("Firm session timezone", "session.timezone", "text")}
          {field("Firm session reset (HH:mm[:ss])", "session.reset", "text")}
          {field("Firm session close (HH:mm[:ss])", "session.close", "text")}
          {check(
            "I confirmed the firm's session boundary and DST timezone",
            "session.confirmed",
          )}
          {field(
            "Evaluation expiry UTC (optional ISO timestamp)",
            "evaluation.expiry",
            "text",
          )}
          {field(
            "Activation deadline after passing (calendar days)",
            "evaluation.activationDays",
            "count",
          )}
        </div>
      </details>
      <details>
        <summary>Position limits, scaling and consistency</summary>
        <div className="prop-form-grid">
          {field("Maximum minis", "positions.minis", "count")}
          {field("Maximum micros", "positions.micros", "count")}
          {field("Micros per mini", "positions.microPerMini", "count")}
          {select("Scaling activation", "positions.activation", [
            "nextSession",
            "immediate",
          ])}
          <label className="form-wide">
            Scaling tiers: profit, minis, micros, optional daily loss (one tier
            per line)
            <textarea
              defaultValue={value.positions.tiers
                .map((t) =>
                  [t.profit, t.minis, t.micros, t.dailyLoss ?? ""].join(","),
                )
                .join("\n")}
              onChange={(e) =>
                change(
                  "positions.tiers",
                  e.target.value
                    .split("\n")
                    .filter(Boolean)
                    .map((line) => {
                      const [profit, minis, micros, dailyLoss] = line
                        .split(",")
                        .map((v) => v.trim());
                      return {
                        profit,
                        minis: Number(minis),
                        micros: Number(micros),
                        dailyLoss: dailyLoss || null,
                      };
                    }),
                )
              }
            />
          </label>
          <label className="form-wide">
            Product-specific micros per mini (e.g. MES=10, one per line)
            <textarea
              defaultValue={Object.entries(value.positions.equivalences)
                .map(([s, n]) => `${s}=${n}`)
                .join("\n")}
              onChange={(e) =>
                change(
                  "positions.equivalences",
                  Object.fromEntries(
                    e.target.value
                      .split("\n")
                      .filter(Boolean)
                      .map((line) => {
                        const [s, n] = line.split("=");
                        return [s, Number(n)];
                      }),
                  ),
                )
              }
            />
          </label>
          <label>
            Consistency rule status
            <select
              aria-label="Consistency rule status"
              value={
                value.consistency.status ??
                (value.consistency.percent !== null ? "enabled" : "unknown")
              }
              onChange={(e) => change("consistency.status", e.target.value)}
            >
              <option value="unknown">Unknown / needs confirmation</option>
              <option value="disabled">Disabled / not applicable</option>
              <option value="enabled">Enabled</option>
            </select>
          </label>
          {field("Consistency maximum (%)", "consistency.percent")}
          {select("Consistency comparison", "consistency.comparison", [
            "inclusive",
            "strict",
          ])}
          {select("Consistency denominator", "consistency.denominator", [
            "netProfit",
            "positiveDays",
          ])}
          {select("Consistency assessed period", "consistency.period", [
            "phase",
            "cycle",
          ])}
          {select("Best-day assessed period", "consistency.bestScope", [
            "",
            "period",
            "phase",
          ])}
          {select("Percentage rounding", "consistency.rounding", [
            "exact",
            "floor",
            "halfUp",
          ])}
          {field("Percentage rounding digits", "consistency.digits", "count")}
        </div>
        <p className="small muted">
          Concurrent exposure is not verifiable from this import. Position
          limits are information, not automatic enforcement.
        </p>
      </details>
      <details>
        <summary>Payout rules and cycle resets</summary>
        {check("Track payouts for this stage", "payout.enabled")}
        {value.payout.enabled && (
          <div className="prop-form-grid">
            {field("Minimum payout request", "payout.minimum")}
            {field("Maximum number of payouts", "payout.maxPayouts", "count")}
            <label>
              Payout caps by payout number (comma separated; blank = no
              configured cap)
              <input
                value={value.payout.caps.join(",")}
                onChange={(e) =>
                  change(
                    "payout.caps",
                    e.target.value
                      ? e.target.value.split(",").map((v) => v.trim())
                      : [],
                  )
                }
              />
            </label>
            {field(
              "Minimum balance to submit",
              "payout.minimumBalanceToSubmit",
            )}
            {field(
              "Minimum balance after deduction",
              "payout.minimumBalanceAfter",
            )}
            {field(
              "Protected buffer above loss threshold",
              "payout.protectedBuffer",
            )}
            {field("Maximum percentage of profit", "payout.profitPercent")}
            {select("Percentage cap profit basis", "payout.percentBasis", [
              "cycleProfit",
              "ledgerProfit",
            ])}
            {field("Trader profit split (%)", "payout.split")}
            {field(
              "Payout qualifying days required",
              "payout.requiredDays",
              "count",
            )}
            {field(
              "Minimum net profit per qualifying day",
              "payout.dailyProfit",
            )}
            {field(
              "Minimum net profit this cycle",
              "payout.minimumCycleProfit",
            )}
            {select("Required-day basis", "payout.dayBasis", [
              "qualifying",
              "trading",
            ])}
            {check(
              "Exclude reset session from required days",
              "payout.excludeResetSession",
            )}
            {field(
              "Minimum cycle profit after first payout",
              "payout.minimumProfitAfterFirst",
            )}
            {select(
              "Payout balance-buffer observation",
              "payout.bufferObservation",
              ["", "current", "sessionClose"],
            )}
            {field("Daily eligible profit cap", "payout.dailyProfitCap")}
            {field("Waiting time in hours", "payout.waitHours", "count")}
            {select("Waiting time starts at", "payout.waitFrom", [
              "firstTrade",
              "cycleStart",
              "lastPaid",
            ])}
            {select("Reset payout cycle on", "payout.resetEvent", [
              "",
              "requested",
              "approved",
              "deducted",
              "paid",
            ])}
          </div>
        )}
      </details>
      <details>
        <summary>Purchased options and manual restrictions</summary>
        <label>
          Purchased options (one per line)
          <textarea
            defaultValue={value.options.join("\n")}
            onChange={(e) =>
              change("options", e.target.value.split("\n").filter(Boolean))
            }
          />
        </label>
        <label>
          Restrictions / checks (one per line)
          <textarea
            defaultValue={value.restrictions.join("\n")}
            onChange={(e) =>
              change("restrictions", e.target.value.split("\n").filter(Boolean))
            }
          />
        </label>
      </details>
      {check(
        "I reviewed and explicitly confirmed the custom or unresolved rules against my agreement",
        "manualConfirmed",
      )}
    </div>
  );
}
