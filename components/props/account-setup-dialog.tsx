"use client";
import { firmRuleSites } from "@/lib/props/setup-model";
import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Search, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/components/ui/confirm-action";
import { requestJson, RequestError } from "@/lib/client-api";
import type { TradingAccount } from "@/lib/accounts/types";
import type { AccountFormValues } from "@/lib/accounts/validation";
import type { PropData } from "@/lib/props/service";
import {
  customTrackingRules,
  type TrackingRules,
} from "@/lib/props/tracking-rules";
import { propPresets as bundledPresets, type PropPreset } from "@/lib/props/presets";
import { firmTiles, firmKey } from "@/lib/props/setup-model";
import { wallInput } from "@/lib/props/model";
import { journalMoney } from "@/lib/journal/calculations";
import { TrackingRuleEditor } from "./tracking-editor";

const models = [
  {
    name: "End-of-day trailing",
    label: "End-of-day trailing",
    description: "Threshold updates from the applicable session closing high.",
  },
  {
    name: "Intraday trailing",
    label: "Intraday trailing",
    description: "Threshold follows the applicable intraday high.",
  },
  {
    name: "Static",
    label: "Static loss limit",
    description: "Threshold stays fixed unless a configured event changes it.",
  },
] as const;
const money = (v: string | null) =>
  v === null
    ? "Needs confirmation"
    : /^-?\d+(?:\.\d+)?$/.test(v)
      ? journalMoney(v)
      : "Enter a valid amount";
function changedFields(
  before: unknown,
  after: unknown,
  path = "",
): { path: string; before: unknown; after: unknown }[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (
    before &&
    after &&
    typeof before === "object" &&
    typeof after === "object" &&
    !Array.isArray(before) &&
    !Array.isArray(after)
  )
    return [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .filter((k) => k !== "preset" && k !== "manualConfirmed")
      .flatMap((k) =>
        changedFields(
          (before as Record<string, unknown>)[k],
          (after as Record<string, unknown>)[k],
          path ? `${path} / ${k}` : k,
        ),
      );
  return [{ path, before, after }];
}
export function AccountSetupDialog({
  account,
  item,
  initialFirm,
  initialFirmName,
  onClose,
  onSaved,
}: {
  account?: TradingAccount;
  item?: PropData["accounts"][number];
  initialFirm?: TrackingRules["firm"];
  initialFirmName?: string;
  onClose: () => void;
  onSaved: (a: TradingAccount) => void;
}) {
  const [propPresets, setPresets] = useState<PropPreset[]>(bundledPresets);
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    requestJson<{ presets: PropPreset[] }>("/api/prop-presets", { signal: controller.signal })
      .then(({ presets }) => {
        if (!controller.signal.aborted) {
          setPresets(presets);
          setCatalogLoading(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setCatalogError(true);
          setCatalogLoading(false);
        }
      });
    return () => controller.abort();
  }, [catalogAttempt]);
  const phase = item?.phases.at(-1) ?? null;
  const initialPreset =
    !account && initialFirm
      ? propPresets.find((p) => p.rules.firm === initialFirm && !p.legacy)
      : undefined;
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      dialogRef.current?.style.setProperty(
        "--prop-viewport-height",
        `${viewport?.height ?? innerHeight}px`,
      );
      dialogRef.current?.style.setProperty(
        "--prop-viewport-center",
        `${(viewport?.offsetTop ?? 0) + (viewport?.height ?? innerHeight) / 2}px`,
      );
    };
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
    };
  }, []);
  const [step, setStep] = useState(0),
    [query, setQuery] = useState(""),
    [older, setOlder] = useState(false);
  const [rules, setRules] = useState<TrackingRules>(() =>
    phase?.tracking?.rules
      ? structuredClone(phase.tracking.rules)
      : initialPreset
        ? structuredClone(initialPreset.rules)
        : {
            ...customTrackingRules(),
            firm: initialFirm ?? (account ? firmKey(account.firm) : "Apex"),
            size: account?.nominalSize ?? "50000",
            platform: account?.platform ?? "Unknown",
            stage: account?.stage === "Funded" ? "Sim Funded" : "Evaluation",
          },
  );
  const [selected, setSelected] = useState<string | null>(
      phase?.tracking?.rules.preset?.id ?? initialPreset?.id ?? null,
    ),
    [custom, setCustom] = useState(
      initialFirm === "Custom" ||
        (!!phase?.tracking &&
          (!phase.tracking.rules.preset ||
            phase.tracking.rules.preset.customized)),
    ),
    [editingRules, setEditingRules] = useState(
      initialFirm === "Custom" ||
        (!!phase?.tracking &&
          (!phase.tracking.rules.preset ||
            phase.tracking.rules.preset.customized)),
    );
  const [name, setName] = useState(
      account?.displayName ??
        (initialPreset
          ? `${initialFirmName ?? initialPreset.rules.firm} ${Number(initialPreset.rules.size) / 1000}K ${initialPreset.rules.product} ${initialPreset.rules.stage}`
          : ""),
    ),
    [nameEdited, setNameEdited] = useState(!!account);
  const [customFirmName, setCustomFirmName] = useState(
    account?.firm ?? initialFirmName ?? "Custom prop firm",
  );
  const [platform, setPlatform] = useState(
    account?.platform ?? initialPreset?.rules.platform ?? "Unknown",
  );
  // Keep import metadata intact without exposing it in the simplified setup.
  const broker = account?.brokerIdentifier ?? "";
  const zone = account?.reportingTimezone ?? "Asia/Jerusalem";
  const initialDate =
    phase?.phase.startAt ??
    item?.activity.firstEntry ??
    (account?.startDate
      ? `${account.startDate}T00:00:00Z`
      : new Date().toISOString());
  const start = wallInput(initialDate, zone, true);
  const balance = phase?.phase.baseline ?? account?.openingBalance ?? rules.ledgerStart ?? "";
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [dirty, setDirty] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  const preset = propPresets.find((p) => p.id === selected);
  const available = propPresets.filter(
    (p) => p.rules.firm === rules.firm && (older || !p.legacy),
  );
  const products = [...new Set(available.map((p) => p.rules.product))];
  const stages = [
    ...new Set(
      available
        .filter((p) => p.rules.product === rules.product)
        .map((p) => p.rules.stage),
    ),
  ];
  const choices = available.filter(
    (p) => p.rules.product === rules.product && p.rules.stage === rules.stage,
  );
  const sizes = [...new Set(choices.map((p) => p.rules.size))].sort(
    (a, b) => Number(a) - Number(b),
  );
  const pick = (p: PropPreset) => {
    setSelected(p.id);
    setRules(structuredClone(p.rules));
    setCustom(!!account && account.platform !== p.rules.platform);
    setEditingRules(false);
    setDirty(true);
    if (!account) setPlatform(p.rules.platform);
    if (!nameEdited)
      setName(
        `${p.rules.firm} ${Number(p.rules.size) / 1000}K ${p.rules.product} ${p.rules.stage}`,
      );
  };
  const changeRules = (next: TrackingRules) => {
    setRules(next);
    setCustom(true);
    setDirty(true);
  };
  async function close() {
    if (busy) return;
    if (
      !dirty ||
      saved ||
      (await confirmAction("Your unsaved setup selections will be discarded.", {
        title: "Leave account setup?",
        confirmLabel: "Discard setup",
        destructive: true,
      }))
    )
      onClose();
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      const next = structuredClone(rules);
      next.platform = platform;
      if (custom && next.preset) next.preset.customized = true;
      const firm = firmTiles.find((f) => f.id === next.firm)!;
      const identity: AccountFormValues = {
        displayName: name,
        programName: next.product,
        startDate: account?.startDate ?? "",
        firmChoice:
          next.firm === "Custom"
            ? "Other"
            : (firm.name as AccountFormValues["firmChoice"]),
        customFirm: next.firm === "Custom" ? customFirmName : "",
        platform,
        brokerIdentifier: broker,
        stage: next.stage === "Evaluation" ? "Evaluation" : "Funded",
        status: account?.status ?? "Active",
        nominalSize: next.size,
        openingBalance: account?.openingBalance ?? "",
        openingBalanceDate: account?.openingBalanceDate ?? "",
        currency: "USD",
        reportingTimezone: zone,
        notes: account?.notes ?? "",
      };
      const response = await requestJson<{ account: TradingAccount }>(
        "/api/prop-progress/setup",
        {
          method: "POST",
          body: JSON.stringify({
            requestId,
            accountId: account?.id ?? null,
            phaseId: phase?.phase.id ?? null,
            account: identity,
            rules: next,
            origin: "start",
            automaticStart: !phase,
            startLocal: start,
            snapshotLocal: null,
            baseline: balance,
            historyConfirmed: phase?.phase.historyConfirmed ?? false,
            opening: {},
            confirmActivity: next.manualConfirmed,
          }),
        },
      );
      setSaved(true);
      setDirty(false);
      onSaved(response.account);
    } catch (e) {
      setError(
        e instanceof RequestError && e.issues?.length
          ? e.issues
              .map(
                (i) =>
                  `${String(i.path.at(-1) ?? "Setting").replace(/([a-z])([A-Z])/g, "$1 $2")}: ${i.message}`,
              )
              .join("; ")
          : e instanceof Error
            ? e.message
            : "Setup could not be saved. Your selections are preserved.",
      );
    } finally {
      setBusy(false);
    }
  }
  const changed = preset
    ? Object.keys(rules).filter(
        (k) =>
          k !== "preset" &&
          JSON.stringify(rules[k as keyof TrackingRules]) !==
            JSON.stringify(preset.rules[k as keyof TrackingRules]),
      )
    : [];
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) void close();
      }}
    >
      <DialogContent
        ref={dialogRef}
        className="prop-setup-dialog"
        showCloseButton={false}
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          void close();
        }}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <header className="prop-setup-heading">
          <div>
            <DialogTitle>
              {account ? "Finish account setup" : "Add prop firm account"}
            </DialogTitle>
            <DialogDescription>
              Select your plan, review its rules, and link your journal
              activity.
            </DialogDescription>
          </div>
          <Button
            variant="ghost"
            aria-label="Close account setup"
            onClick={() => void close()}
          >
            Close
          </Button>
        </header>
        <ol className="prop-setup-steps">
          {["Choose account", "Review & save"].map((s, i) => (
            <li key={s} aria-current={i === step ? "step" : undefined}>
              <span>{i < step ? <Check size={13} /> : i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
        <div className="prop-setup-body" onChange={() => setDirty(true)}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.18 }}
            >
              {step === 0 && catalogLoading && <p className="small muted" role="status">Loading current account options...</p>}
              {step === 0 && catalogError && (
                <div className="prop-catalog-error" role="status">
                  <p>Could not load current account options. Retry before choosing a plan.</p>
                  <Button variant="outline" onClick={() => {
                    setCatalogError(false);
                    setCatalogLoading(true);
                    setCatalogAttempt((attempt) => attempt + 1);
                  }}>Retry account options</Button>
                </div>
              )}
              {step === 0 && !catalogLoading && !catalogError && (
                <>
                  {initialFirmName ? (
                    <div className="prop-setup-firm-context">
                      <span className="prop-firm-monogram">
                        {firmTiles.find((f) => f.id === initialFirm)
                          ?.initials ?? "+"}
                      </span>
                      <div>
                        <span className="small muted">
                          Adding an account to
                        </span>
                        <strong>{initialFirmName}</strong>
                      </div>
                    </div>
                  ) : (
                    <>
                      <label className="prop-firm-search">
                        <Search size={16} />
                        <input
                          aria-label="Search prop firms"
                          placeholder="Search prop firms"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                        />
                      </label>
                      <div className="prop-firm-tiles">
                        {firmTiles
                          .filter((f) =>
                            f.name.toLowerCase().includes(query.toLowerCase()),
                          )
                          .map((f) => (
                            <motion.button
                              key={f.id}
                              whileTap={{ scale: 0.99 }}
                              className={rules.firm === f.id ? "selected" : ""}
                              aria-pressed={rules.firm === f.id}
                              onClick={() => {
                                const first = propPresets.find(
                                  (p) => p.rules.firm === f.id && !p.legacy,
                                );
                                if (first) pick(first);
                                else {
                                  setRules({
                                    ...customTrackingRules(),
                                    firm: f.id,
                                    platform: "Unknown",
                                  });
                                  setSelected(null);
                                  setCustom(true);
                                  setEditingRules(true);
                                  setPlatform(account?.platform ?? "Unknown");
                                }
                                setDirty(true);
                              }}
                            >
                              <span className="prop-firm-monogram">
                                {f.initials}
                              </span>
                              {f.name}
                              {rules.firm === f.id && <Check size={14} />}
                            </motion.button>
                          ))}
                      </div>
                    </>
                  )}
                  {rules.firm !== "Custom" &&
                    (!custom || selected !== null) && (
                      <>
                        <label className="prop-check">
                          <input
                            type="checkbox"
                            checked={older}
                            onChange={(e) => setOlder(e.target.checked)}
                          />
                          Existing / older accounts
                        </label>
                        <div
                          className="prop-product-options"
                          aria-label="Account products"
                        >
                          {products.map((product) => (
                            <button
                              key={product}
                              aria-pressed={rules.product === product}
                              onClick={() =>
                                pick(
                                  available.find(
                                    (p) => p.rules.product === product,
                                  )!,
                                )
                              }
                            >
                              {product}
                            </button>
                          ))}
                        </div>
                        <label>
                          Account stage
                          <select
                            aria-label="Account stage"
                            value={rules.stage}
                            onChange={(e) =>
                              pick(
                                available.find(
                                  (p) =>
                                    p.rules.product === rules.product &&
                                    p.rules.stage === e.target.value,
                                )!,
                              )
                            }
                          >
                            {stages.map((s) => (
                              <option key={s}>{s}</option>
                            ))}
                          </select>
                        </label>
                        <div className="prop-size-grid">
                          {sizes.map((size) => {
                            const p = choices.find(
                              (p) => p.rules.size === size,
                            )!;
                            return (
                              <motion.button
                                key={size}
                                className={
                                  rules.size === size ? "selected" : ""
                                }
                                aria-pressed={rules.size === size}
                                onClick={() => pick(p)}
                                transition={{ duration: 0.18 }}
                              >
                                <strong>
                                  {journalMoney(size)}
                                  {rules.size === size && <Check size={16} />}
                                </strong>
                                <span>
                                  {p.rules.evaluation.target !== null
                                    ? `Target ${money(p.rules.evaluation.target)}`
                                    : p.rules.stage}
                                </span>
                                <span>
                                  Drawdown {money(p.rules.drawdown.distance)}
                                </span>
                                <small>
                                  {p.rules.drawdown.mode}
                                  {p.rules.consistency.percent
                                    ? ` / ${p.rules.consistency.percent}% consistency`
                                    : p.rules.payout.requiredDays
                                      ? ` / ${p.rules.payout.requiredDays} qualifying days`
                                      : ""}
                                </small>
                              </motion.button>
                            );
                          })}
                        </div>
                        {choices.filter((p) => p.rules.size === rules.size)
                          .length > 1 && (
                          <label>
                            Purchased option / payout path
                            <select
                              aria-label="Purchased option"
                              value={selected ?? ""}
                              onChange={(e) =>
                                pick(
                                  propPresets.find(
                                    (p) => p.id === e.target.value,
                                  )!,
                                )
                              }
                            >
                              {choices
                                .filter((p) => p.rules.size === rules.size)
                                .map((p) => (
                                  <option value={p.id} key={p.id}>
                                    {p.rules.options.join(" / ") || "Standard"}
                                  </option>
                                ))}
                            </select>
                          </label>
                        )}
                      </>
                    )}
                  <Button
                    variant="outline"
                    className="prop-custom-account-option"
                    aria-pressed={custom && selected === null}
                    onClick={() => {
                      if (custom && selected === null) return;
                      setSelected(null);
                      setCustom(true);
                      setEditingRules(true);
                      const next = customTrackingRules();
                      Object.assign(next, {
                        firm: rules.firm,
                        platform,
                        size: rules.size,
                        stage: rules.stage,
                      });
                      setRules(next);
                      setDirty(true);
                                        if (!nameEdited) setName("");
                    }}
                  >
                    <Plus size={18} />
                    <span>
                      <strong>Custom account</strong>
                      <small>
                        Enter any account size and your own rules for this firm.
                      </small>
                    </span>
                    {custom && selected === null && <Check size={16} />}
                  </Button>
                  {custom && selected === null && available.length > 0 && (
                    <Button variant="ghost" onClick={() => pick(available[0])}>
                      Use firm presets
                    </Button>
                  )}
                  <div className="prop-account-name">
                    <label>
                      Account label
                      <input
                        aria-label="Account label"
                        maxLength={100}
                        value={name}
                        onChange={(e) => {
                          setName(e.target.value);
                          setNameEdited(true);
                        }}
                      />
                    </label>
                  </div>
                  {(rules.firm === "Custom" ||
                    (custom && selected === null)) && (
                    <div className="prop-form-grid">
                      <label>
                        Custom product
                        <input
                          aria-label="Custom product"
                          value={rules.product}
                          onChange={(e) =>
                            changeRules({ ...rules, product: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        Custom account size
                        <input
                          aria-label="Custom account size"
                          inputMode="decimal"
                          placeholder="For example, 150000"
                          value={rules.size}
                          onChange={(e) =>
                            changeRules({ ...rules, size: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        Account stage
                        <select
                          aria-label="Account stage"
                          value={rules.stage}
                          onChange={(e) =>
                            changeRules({
                              ...rules,
                              stage: e.target.value as TrackingRules["stage"],
                            })
                          }
                        >
                          {["Evaluation", "Sim Funded", "Live"].map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}
                  {rules.firm === "Custom" && (
                    <label>
                      Custom firm name
                      <input
                        aria-label="Custom firm name"
                        value={customFirmName}
                        readOnly={!!initialFirmName}
                        onChange={(e) => setCustomFirmName(e.target.value)}
                      />
                    </label>
                  )}
                </>
              )}
              {step === 1 && (
                <>
                  <div className="prop-rules-heading">
                    <div>
                      <h3>
                        {rules.product} / {rules.stage}
                      </h3>
                      <p className="small muted">
                        {custom
                          ? "Custom configuration"
                          : `Preset checked ${rules.preset?.verifiedOn ?? "Needs confirmation"}`}{" "}
                        / {money(rules.size)}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setCustom(true);
                        setEditingRules(true);
                      }}
                    >
                      Customize rules
                    </Button>
                  </div>
                  <div className="prop-drawdown-options">
                    {models.map((m) => (
                      <button
                        key={m.name}
                        disabled={
                          !custom && m.name !== preset?.rules.drawdown.mode
                        }
                        aria-pressed={rules.drawdown.mode === m.name}
                        onClick={() =>
                          changeRules({
                            ...rules,
                            drawdown: { ...rules.drawdown, mode: m.name },
                          })
                        }
                      >
                        <strong>
                          {m.label}
                          {rules.drawdown.mode === m.name && (
                            <Check size={14} />
                          )}
                        </strong>
                        <small>{m.description}</small>
                      </button>
                    ))}
                  </div>
                  <p className="small muted">
                    Threshold updates and breach enforcement are separate. EOD
                    rules may still breach intraday; CSVs do not contain
                    unrealized highs.
                  </p>
                  <dl className="prop-rule-review">
                    <div>
                      <dt>Profit target</dt>
                      <dd>
                        {rules.stage === "Evaluation"
                          ? money(rules.evaluation.target)
                          : "Not required"}
                      </dd>
                    </div>
                    <div>
                      <dt>Loss distance / lock</dt>
                      <dd>
                        {money(rules.drawdown.distance)} /{" "}
                        {rules.drawdown.cap === null
                          ? "No confirmed cap"
                          : money(rules.drawdown.cap)}
                      </dd>
                    </div>
                    <div>
                      <dt>Daily loss</dt>
                      <dd>
                        {rules.daily.mode === "disabled"
                          ? "Not applicable in saved plan"
                          : `${money(rules.daily.amount)} / ${rules.daily.effect}`}
                      </dd>
                    </div>
                    <div>
                      <dt>
                        {rules.stage === "Evaluation"
                          ? "Trading days"
                          : "Payout days"}
                      </dt>
                      <dd>
                        {rules.stage === "Evaluation"
                          ? (rules.evaluation.tradingDays ??
                            "Needs confirmation")
                          : (rules.payout.requiredDays ?? "Needs confirmation")}
                      </dd>
                    </div>
                    <div>
                      <dt>Consistency</dt>
                      <dd>
                        {rules.consistency.percent === null
                          ? rules.consistency.status === "disabled"
                            ? "Not required"
                            : "Unknown / needs confirmation"
                          : `${rules.consistency.percent}% / ${rules.consistency.comparison} / ${rules.consistency.period}`}
                      </dd>
                    </div>
                    {rules.payout.enabled && (
                      <div>
                        <dt>Payout minimum / cap / split</dt>
                        <dd>
                          {money(rules.payout.minimum)} /{" "}
                          {rules.payout.caps.join(", ") || "Needs confirmation"}{" "}
                          / {rules.payout.split}%
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt>Firm session</dt>
                      <dd>
                        {rules.session.timezone} / {rules.session.reset} to{" "}
                        {rules.session.close}
                      </dd>
                    </div>
                  </dl>
                  {rules.preset?.gaps.length && (
                    <details className="prop-plan-gaps">
                      <summary>
                        Items to confirm ({rules.preset.gaps.length})
                      </summary>
                      <ul>
                        {rules.preset.gaps.map((g) => (
                          <li key={g}>{g}</li>
                        ))}
                      </ul>
                      {rules.preset.sources.map((u, i) => (
                        <a href={u} target="_blank" rel="noreferrer" key={u}>
                          Source {i + 1}{" "}
                        </a>
                      ))}
                    </details>
                  )}
                  {editingRules && (
                    <>
                      <p className="small muted">
                        Custom fields:{" "}
                        {changed.join(", ") || "None changed yet"}. Older saved
                        versions remain intact.
                      </p>
                      {preset && (
                        <Button
                          variant="outline"
                          onClick={() => {
                            setRules(structuredClone(preset.rules));
                            setPlatform(preset.rules.platform);
                            setCustom(false);
                            setEditingRules(false);
                          }}
                        >
                          Reset to selected preset
                        </Button>
                      )}
                      {preset && (
                        <details className="prop-plan-gaps">
                          <summary>Changed values</summary>
                          <dl className="prop-rule-review">
                            {changedFields(preset.rules, {
                              ...rules,
                              platform,
                            }).map((d) => (
                              <div key={d.path}>
                                <dt>
                                  {d.path.replace(/([a-z])([A-Z])/g, "$1 $2")}
                                </dt>
                                <dd>
                                  {d.before == null
                                    ? "Not configured"
                                    : JSON.stringify(d.before)}{" "}
                                  {"\u2192"}{" "}
                                  {d.after == null
                                    ? "Not configured"
                                    : JSON.stringify(d.after)}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </details>
                      )}
                      <TrackingRuleEditor
                        key={selected ?? "custom"}
                        value={rules}
                        onChange={changeRules}
                      />
                    </>
                  )}
                  <section className="prop-setup-preview">
                    <h3>Ready to track</h3>
                    <p>{phase ? "Your existing phase dates, balance and history will be preserved." : "Your tracking date will come from the earliest trade in your imported Performance.csv. Upload it after saving, or reuse activity already imported to this account."}</p>
                    <p>Starting balance: {money(balance || null)}. This comes from your account rules; Performance.csv supplies trading activity, not the opening balance. You can adjust the balance in account details.</p>
                    <p className="prop-firm-rules-note">
                      Before confirming, check all rules on your prop firm&apos;s official website for changes. Your purchased account agreement takes priority over these presets.{" "}
                      {firmRuleSites[rules.firm] && <a href={firmRuleSites[rules.firm]} target="_blank" rel="noreferrer">Check official rules</a>}
                    </p>
                  </section>
                  {!editingRules && (
                    <label className="prop-check">
                      <input
                        type="checkbox"
                        checked={rules.manualConfirmed}
                        onChange={(e) =>
                          setRules({
                            ...rules,
                            manualConfirmed: e.target.checked,
                            session: {
                              ...rules.session,
                              confirmed: e.target.checked,
                            },
                          })
                        }
                      />
                      I reviewed the applicable rules, session settings and
                      listed gaps against my agreement. Unconfirmed inputs will
                      limit progress.
                    </label>
                  )}
                </>
              )}
            </motion.div>
          </AnimatePresence>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
        </div>
        <footer className="prop-setup-actions">
          <Button variant="ghost" disabled={busy} onClick={() => void close()}>
            Cancel
          </Button>
          <span>{step + 1} of 2</span>
          <Button
            variant="outline"
            disabled={step === 0 || busy}
            onClick={() => {
              setStep(step - 1);
              setError("");
            }}
          >
            Back
          </Button>
          {step === 0 ? (
            <Button
              disabled={
                catalogLoading || catalogError || !name || (!selected && !custom && rules.firm !== "Custom")
              }
              onClick={() => {
                if (
                  !/^\d{1,16}(?:\.\d{1,2})?$/.test(rules.size) ||
                  Number(rules.size) <= 0 ||
                  !name.trim()
                ) {
                  setError(
                    "Enter an account label and positive account size.",
                  );
                  return;
                }
                setStep(step + 1);
                setError("");
              }}
            >
              Continue
            </Button>
          ) : (
            <Button
              disabled={busy || !rules.manualConfirmed}
              onClick={() => void save()}
            >
              {saved ? <Check size={15} /> : null}
              {busy ? "Saving..." : "Save account & tracking"}
            </Button>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}
