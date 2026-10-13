"use client";
import { confirmAction } from "@/components/ui/confirm-action";
import { useCallback, useState } from "react";
import { Sparkles, Plus, Check, BookOpen, ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { requestJson } from "@/lib/client-api";
import { usePrivateRequest } from "@/components/calendar/cache-provider";
import { useWritingGuard } from "@/components/daily/writing-guard";
import {
  emptyPlaybook,
  playbookSchema,
  type Playbook,
  type StrategyData,
} from "@/lib/strategies/model";
import {
  starterTemplates,
  confirmationChoices,
} from "@/lib/strategies/templates";
import type {
  TemplateList,
  PersonalTemplate,
} from "@/lib/strategies/template-service";
export type BuilderOptions = {
  purpose: "strategy" | "template";
  template?: PersonalTemplate;
  seed?: Playbook;
};
const copy = (fields: Playbook) => ({
  ...fields,
  checklist: fields.checklist.map((item) => ({
    ...item,
    id: crypto.randomUUID(),
  })),
});
export function StrategyBuilder({
  options,
  close,
  created,
  saved,
}: {
  options: BuilderOptions;
  close: () => void;
  created: (id: string) => void;
  saved: () => void;
}) {
  const [initial] = useState(
    () =>
      options.template?.fields ??
      (options.seed ? copy(options.seed) : emptyPlaybook()),
  );
  const [fields, setFields] = useState<Playbook>(initial),
    [baseline, setBaseline] = useState(JSON.stringify(initial)),
    [mode, setMode] = useState<"template" | "custom">(
      options.template || options.purpose === "template"
        ? "custom"
        : "template",
    ),
    [library, setLibrary] = useState("ready"),
    [selected, setSelected] = useState<string | null>(
      options.purpose === "strategy" && options.seed ? "personal" : null,
    ),
    [custom, setCustom] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const mine = usePrivateRequest<TemplateList>("", "/api/strategies/templates");
  const dirty = useCallback(
    () => JSON.stringify(fields) !== baseline || !!custom.trim(),
    [fields, baseline, custom],
  );
  useWritingGuard(dirty);
  async function confirmDiscard() {
    return (
      !dirty() ||
      (await confirmAction("Discard your unsaved strategy/template changes?"))
    );
  }
  async function choose(id: string, source: Playbook) {
    if (!(await confirmDiscard())) return;
    const value = copy(source);
    setFields(value);
    setBaseline(JSON.stringify(value));
    setSelected(id);
    setCustom("");
    setError("");
  }
  async function customMode() {
    if (mode === "custom") return;
    if (!(await confirmDiscard())) return;
    const value = emptyPlaybook();
    setFields(value);
    setBaseline(JSON.stringify(value));
    setSelected(null);
    setMode("custom");
    setCustom("");
    setError("");
  }
  function update<K extends keyof Playbook>(key: K, value: Playbook[K]) {
    setFields({ ...fields, [key]: value });
    setError("");
  }
  function toggle(text: string) {
    const exists = fields.checklist.some((item) => item.text === text);
    update(
      "checklist",
      exists
        ? fields.checklist.filter((item) => item.text !== text)
        : [...fields.checklist, { id: crypto.randomUUID(), text }],
    );
  }
  function addCustom() {
    const text = custom.trim();
    if (!text || fields.checklist.length >= 30) return;
    if (!fields.checklist.some((item) => item.text === text)) {
      update("checklist", [
        ...fields.checklist,
        { id: crypto.randomUUID(), text },
      ]);
    }
    setCustom("");
  }
  async function save() {
    if (custom.trim()) {
      setError(
        "Add the pending custom confirmation or clear it before saving.",
      );
      return;
    }
    const checked = playbookSchema.safeParse(fields);
    if (!checked.success) {
      setError(
        checked.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join(" · "),
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (options.purpose === "template") {
        await requestJson("/api/strategies/templates", {
          method: "POST",
          body: JSON.stringify({
            id: options.template?.id,
            revision: options.template?.revision ?? 0,
            fields: checked.data,
          }),
        });
        saved();
      } else {
        const data = await requestJson<StrategyData>("/api/strategies", {
          method: "POST",
          body: JSON.stringify({ revision: 0, fields: checked.data }),
        });
        created(data.id);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save. Your input is kept.",
      );
    } finally {
      setBusy(false);
    }
  }
  const color = fields.color ?? "emerald",
    readyToEdit = mode === "custom" || selected !== null;
  return (
    <Dialog
      open
      onOpenChange={async (open) => {
        if (!open && !busy && (await confirmDiscard())) close();
      }}
    >
      <DialogContent className="strategy-builder playbook-workspace">
        <DialogTitle>
          {options.template
            ? "Edit your template"
            : options.purpose === "template"
              ? "Create a personal template"
              : "Build your strategy"}
        </DialogTitle>
        <DialogDescription>
          Start with a ready structure or build your own. Customize it to match
          how you trade.
        </DialogDescription>
        <fieldset disabled={busy}>
          <div className="builder-paths">
            <button
              aria-pressed={mode === "template"}
              onClick={() => setMode("template")}
            >
              <span className="builder-path-icon">
                <Sparkles size={18} />
              </span>
              <strong>Use a template</strong>
              <span>Pick a structure, then make it yours.</span>
            </button>
            <button aria-pressed={mode === "custom"} onClick={customMode}>
              <span className="builder-path-icon">
                <Plus size={18} />
              </span>
              <strong>Create your own</strong>
              <span>Start with your name, rules and confirmations.</span>
            </button>
          </div>
          {mode === "template" && selected === null && (
            <section className="builder-library">
              <div className="builder-section-heading">
                <div>
                  <span className="eyebrow">TEMPLATE LIBRARY</span>
                  <h3>Choose your starting point</h3>
                </div>
                <div className="builder-library-tabs">
                  <button
                    aria-pressed={library === "ready"}
                    onClick={() => setLibrary("ready")}
                  >
                    Ready templates
                  </button>
                  <button
                    aria-pressed={library === "mine"}
                    onClick={() => setLibrary("mine")}
                  >
                    My templates
                  </button>
                </div>
              </div>
              <p className="muted">
                Editable starting structures. Define your own confirmation and
                risk rules before using them.
              </p>
              {library === "ready" ? (
                ["ICT models", "Price action & indicators"].map((category) => (
                  <div key={category}>
                    <h4 className="builder-category">{category}</h4>
                    <div className="builder-template-grid">
                      {starterTemplates
                        .filter((t) => t.category === category)
                        .map((t) => (
                          <button
                            key={t.id}
                            aria-label={`Use ${t.name} template`}
                            aria-pressed={selected === t.id}
                            className={`builder-template accent-${t.fields.color}`}
                            onClick={() => choose(t.id, t.fields)}
                          >
                            <span className="builder-template-heading">
                              <i>{t.initials}</i>
                              <strong>{t.name}</strong>
                              {selected === t.id && <Check size={16} />}
                            </span>
                            <span>{t.description}</span>
                          </button>
                        ))}
                    </div>
                  </div>
                ))
              ) : mine.error ? (
                <p role="alert">
                  {mine.error}
                  <button onClick={mine.refresh}>Retry templates</button>
                </p>
              ) : !mine.data ? (
                <p role="status">Loading your templates…</p>
              ) : mine.data.templates.length ? (
                <div className="builder-template-grid">
                  {mine.data.templates.map((t) => (
                    <button
                      key={t.id}
                      aria-label={`Use ${t.fields.name} template`}
                      aria-pressed={selected === t.id}
                      className="builder-template"
                      onClick={() => choose(t.id, t.fields)}
                    >
                      <span className="builder-template-heading">
                        <i>
                          <BookOpen size={18} />
                        </i>
                        <strong>{t.fields.name}</strong>
                        {selected === t.id && <Check size={16} />}
                      </span>
                      <span>
                        {t.fields.description ||
                          `${t.fields.checklist.length} confirmations · your private template`}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p>
                  You haven’t saved a template yet. Create one from My
                  templates, or save a playbook as a template.
                </p>
              )}
            </section>
          )}
          {mode === "template" && selected !== null && (
            <div className="builder-selected-template">
              <Sparkles size={16} />
              <span>Template loaded. Customize the structure below.</span>
              <button onClick={() => setSelected(null)}>
                Choose another template
              </button>
            </div>
          )}
          {readyToEdit && (
            <div className="builder-customize">
              <section className="builder-identity">
                <span className="eyebrow">IDENTITY</span>
                <h3>Make it yours</h3>
                <label>
                  {options.purpose === "template"
                    ? "Template name"
                    : "Strategy name"}
                  <input
                    aria-label={
                      options.purpose === "template"
                        ? "Template name"
                        : "New strategy name"
                    }
                    maxLength={100}
                    placeholder="For example: My morning setup"
                    value={fields.name}
                    onChange={(e) => update("name", e.target.value)}
                  />
                </label>
                <label>
                  Description
                  <textarea
                    aria-label="Strategy description"
                    rows={3}
                    maxLength={500}
                    value={fields.description}
                    onChange={(e) => update("description", e.target.value)}
                    placeholder="What makes this setup worth watching?"
                  />
                </label>
                <label>Accent color</label>
                <div
                  className="builder-colors"
                  role="group"
                  aria-label="Accent color"
                >
                  {["emerald", "violet", "blue", "amber", "rose"].map((c) => (
                    <button
                      className={`color-${c}`}
                      key={c}
                      type="button"
                      aria-label={`${c} accent`}
                      aria-pressed={color === c}
                      onClick={() => update("color", c as Playbook["color"])}
                    >
                      {color === c && <Check size={14} />}
                    </button>
                  ))}
                </div>
              </section>
              <aside className={`builder-preview accent-${color}`}>
                <span className="eyebrow">LIVE PREVIEW</span>
                <h3>{fields.name || "Your new strategy"}</h3>
                <p>
                  {fields.description ||
                    "A clear name, a few confirmations, and your execution plan."}
                </p>
                <div className="builder-preview-stats">
                  <span>
                    <strong>{fields.checklist.length}</strong>Confirmations
                  </span>
                  <span>
                    <strong>
                      {
                        [
                          fields.entry,
                          fields.invalidation,
                          fields.stop,
                          fields.exit,
                        ].filter((v) => v.trim()).length
                      }
                    </strong>
                    Core rules filled
                  </span>
                </div>
                <ul>
                  {fields.checklist.slice(0, 5).map((item) => (
                    <li key={item.id}>
                      <Check size={12} />
                      {item.text}
                    </li>
                  ))}
                </ul>
              </aside>
              <section className="builder-confirmations">
                <span className="eyebrow">CONFIRMATIONS</span>
                <h3>What do you look for before entry?</h3>
                <p className="muted">
                  Choose a starting prompt or add your own. You assess these on
                  each assigned record.
                </p>
                <div className="builder-chips">
                  {confirmationChoices.map((text) => (
                    <button
                      key={text}
                      aria-pressed={fields.checklist.some(
                        (i) => i.text === text,
                      )}
                      disabled={
                        fields.checklist.length >= 30 &&
                        !fields.checklist.some((i) => i.text === text)
                      }
                      onClick={() => toggle(text)}
                    >
                      {text}
                    </button>
                  ))}
                </div>
                <div className="builder-add-confirmation">
                  <input
                    aria-label="Custom confirmation"
                    maxLength={300}
                    placeholder="Add your own confirmation"
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCustom();
                      }
                    }}
                  />
                  <button
                    disabled={!custom.trim() || fields.checklist.length >= 30}
                    onClick={addCustom}
                  >
                    Add
                  </button>
                </div>
                <div className="builder-checklist">
                  {fields.checklist.map((item, index) => (
                    <div key={item.id}>
                      <input
                        aria-label={`Confirmation ${index + 1}`}
                        value={item.text}
                        maxLength={300}
                        onChange={(e) =>
                          update(
                            "checklist",
                            fields.checklist.map((i) =>
                              i.id === item.id
                                ? { ...i, text: e.target.value }
                                : i,
                            ),
                          )
                        }
                      />
                      <button
                        aria-label={`Move confirmation ${index + 1} up`}
                        disabled={index === 0}
                        onClick={() => {
                          const copy = [...fields.checklist];
                          [copy[index - 1], copy[index]] = [
                            copy[index],
                            copy[index - 1],
                          ];
                          update("checklist", copy);
                        }}
                      >
                        ↑
                      </button>
                      <button
                        aria-label={`Move confirmation ${index + 1} down`}
                        disabled={index === fields.checklist.length - 1}
                        onClick={() => {
                          const copy = [...fields.checklist];
                          [copy[index + 1], copy[index]] = [
                            copy[index],
                            copy[index + 1],
                          ];
                          update("checklist", copy);
                        }}
                      >
                        ↓
                      </button>
                      <button
                        aria-label={`Remove confirmation ${index + 1}`}
                        onClick={() =>
                          update(
                            "checklist",
                            fields.checklist.filter((i) => i.id !== item.id),
                          )
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </section>
              <section className="builder-rules">
                <details>
                  <summary>
                    Entry and risk rules <span>Optional</span>
                  </summary>
                  <div className="builder-rules-grid">
                    {[
                      ["entry", "Entry conditions"],
                      ["invalidation", "When the idea is invalid"],
                      ["stop", "Stop-placement approach"],
                      ["exit", "Target and exit approach"],
                    ].map(([key, label]) => (
                      <label key={key}>
                        {label}
                        <textarea
                          aria-label={`Builder ${label}`}
                          rows={3}
                          maxLength={5000}
                          value={fields[key as "entry"]}
                          onChange={(e) =>
                            update(key as "entry", e.target.value)
                          }
                        />
                      </label>
                    ))}
                  </div>
                </details>
                <details>
                  <summary>
                    Context and extra notes <span>Optional</span>
                  </summary>
                  {[
                    ["instruments", "Instruments or markets"],
                    ["timeframes", "Preferred timeframes"],
                    ["window", "Preferred trading window"],
                    ["context", "Market context"],
                    ["management", "Management rules"],
                    ["avoid", "Conditions to avoid"],
                    ["mistakes", "Common mistakes"],
                  ].map(([key, label]) => (
                    <label key={key}>
                      {label}
                      <textarea
                        rows={2}
                        maxLength={5000}
                        value={fields[key as "entry"]}
                        onChange={(e) => update(key as "entry", e.target.value)}
                      />
                    </label>
                  ))}
                </details>
              </section>
            </div>
          )}
        </fieldset>
        {error && (
          <p role="alert" className="builder-error">
            {error} Your input is kept.
          </p>
        )}
        <footer className="builder-footer">
          <span className="muted">
            Only a name is required. Everything stays editable.
          </span>
          <div>
            <button
              disabled={busy}
              onClick={async () => {
                if (await confirmDiscard()) close();
              }}
            >
              Cancel
            </button>
            <button
              className="builder-primary"
              disabled={busy || !readyToEdit || !fields.name.trim()}
              onClick={() => void save()}
            >
              {busy
                ? "Saving…"
                : options.purpose === "template"
                  ? "Save template"
                  : "Create strategy"}
              <ArrowRight size={15} />
            </button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
