"use client";
import { confirmAction } from "@/components/ui/confirm-action";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SaveController } from "@/lib/reviews/save-controller";
import { requestJson } from "@/lib/client-api";
import { useWritingGuard } from "@/components/daily/writing-guard";
import { Screenshots } from "@/components/reviews/screenshots";
import {
  playbookSchema,
  playbookNotes,
  exampleTypes,
  type Playbook,
  type StrategyData,
} from "@/lib/strategies/model";
import { StrategyBuilder, type BuilderOptions } from "./builder";
import { StrategyResults } from "./results";
export function PlaybookEditor({ initial }: { initial: StrategyData }) {
  const router = useRouter(),
    [controller] = useState(
      () =>
        new SaveController<Playbook, StrategyData>(
          initial,
          (draft, revision) => {
            const fields = playbookSchema.parse(draft.fields);
            return requestJson<StrategyData>("/api/strategies", {
              method: "POST",
              body: JSON.stringify({ id: initial.id, revision, fields }),
            });
          },
        ),
    );
  const [templateBuilder, setTemplateBuilder] = useState<BuilderOptions | null>(
    null,
  );
  const [templateNotice, setTemplateNotice] = useState("");
  const state = useSyncExternalStore(
      controller.subscribe,
      controller.read,
      controller.read,
    ),
    fields = state.draft.fields,
    [tab, setTab] = useState("instructions"),
    [error, setError] = useState(""),
    [comparison, setComparison] = useState<StrategyData | null>(null),
    [busy, setBusy] = useState(false);
  const dirty = useCallback(() => controller.read().dirty, [controller]);
  useWritingGuard(dirty);
  useEffect(() => {
    let active = true;
    void requestJson<StrategyData>(`/api/strategies?id=${initial.id}`)
      .then((data) => {
        if (
          active &&
          !controller.read().dirty &&
          controller.read().state !== "saving"
        )
          controller.accept(data);
      })
      .catch(() => {
        if (active)
          setError("Could not refresh this playbook. Your writing is kept.");
      });
    return () => {
      active = false;
    };
  }, [controller, initial.id]);
  useEffect(() => {
    if (!state.dirty || state.state === "conflict" || state.state === "error")
      return;
    const timer = setTimeout(() => void controller.save(), 900);
    return () => clearTimeout(timer);
  }, [controller, state.draft, state.dirty, state.state]);
  function edit<K extends keyof Playbook>(key: K, value: Playbook[K]) {
    controller.edit({
      status: "draft",
      fields: { ...controller.read().draft.fields, [key]: value },
    });
  }
  async function action(action: "archive" | "restore" | "duplicate") {
    if (state.dirty) {
      setError(
        "Save your writing before changing archive state or duplicating.",
      );
      return;
    }
    if (
      action === "archive" &&
      !(await confirmAction(
        "Archive this strategy? Historical assignments and daily plans remain available.",
      ))
    )
      return;
    setBusy(true);
    setError("");
    try {
      const data = await requestJson<StrategyData>("/api/strategies", {
        method: "POST",
        body: JSON.stringify({
          id: initial.id,
          revision: state.data.revision,
          action,
        }),
      });
      if (action === "duplicate") router.push(`/strategies/${data.id}`);
      else controller.accept(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }
  const note = (key: (typeof playbookNotes)[number][0], label: string) => (
    <label className="playbook-note" key={key}>
      {label}
      <textarea
        aria-label={label}
        maxLength={5000}
        value={fields[key]}
        onChange={(e) => edit(key, e.target.value)}
      />
    </label>
  );
  const stateLabel =
    state.state === "saving"
      ? "Saving…"
      : state.state === "error"
        ? "Save error"
        : state.state === "conflict"
          ? "Conflicting edits"
          : state.dirty
            ? "Unsaved changes"
            : "Saved";
  return (
    <div className="playbook-workspace">
      <header className="page-header">
        <div>
          <Link href="/strategies">Back to Strategies</Link>
          <h1>{state.data.fields.name}</h1>
          <p className="muted">
            Revision {state.data.revision} ·{" "}
            {state.data.archived ? "Archived" : "Active"} · {state.data.linked}{" "}
            resolved linked records
          </p>
        </div>
        <div className="playbook-actions">
          <span role="status">{stateLabel}</span>
          <button
            disabled={
              !state.dirty ||
              state.state === "saving" ||
              state.state === "conflict"
            }
            onClick={() => void controller.save()}
          >
            Save now
          </button>
          <button
            disabled={busy || state.dirty}
            onClick={() =>
              void action(state.data.archived ? "restore" : "archive")
            }
          >
            {state.data.archived ? "Restore strategy" : "Archive strategy"}
          </button>
          <button
            disabled={busy || state.dirty || state.state === "saving"}
            onClick={() =>
              setTemplateBuilder({
                purpose: "template",
                seed: state.data.fields,
              })
            }
          >
            Save as template
          </button>
          <button
            disabled={busy || state.dirty}
            onClick={() => void action("duplicate")}
          >
            Duplicate text/checklist
          </button>
        </div>
      </header>
      {(error || state.error) && (
        <p role="alert">{state.error ?? error} Your unsaved writing is kept.</p>
      )}
      {state.state === "conflict" && (
        <button
          onClick={async () => {
            try {
              setComparison(
                await requestJson<StrategyData>(
                  `/api/strategies?id=${initial.id}`,
                ),
              );
            } catch {
              setError("Could not compare the saved version.");
            }
          }}
        >
          Compare saved version
        </button>
      )}
      {comparison && (
        <section className="playbook-card">
          <h2>Saved revision {comparison.revision}</h2>
          <pre>{JSON.stringify(comparison.fields, null, 2)}</pre>
          <button
            onClick={async () => {
              if (
                await confirmAction(
                  "Discard unsaved writing and use this saved version?",
                )
              ) {
                controller.useLatest(comparison);
                setComparison(null);
              }
            }}
          >
            Use saved version
          </button>
          <button
            onClick={async () => {
              if (
                await confirmAction(
                  "Replace this saved version with your writing?",
                )
              ) {
                void controller.resolveWithMine(comparison);
                setComparison(null);
              }
            }}
          >
            Save my version instead
          </button>
        </section>
      )}
      {templateNotice && <p role="status">{templateNotice}</p>}
      <nav className="playbook-tabs" aria-label="Playbook sections">
        {[
          ["instructions", "Instructions"],
          ["examples", "Examples"],
          ["results", "Results"],
        ].map(([value, label]) => (
          <button
            key={value}
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === "instructions" && (
        <section className="playbook-card">
          <fieldset disabled={state.data.archived || busy}>
            <div className="playbook-form-row">
              <label>
                Name
                <input
                  aria-label="Strategy name"
                  value={fields.name}
                  maxLength={100}
                  onChange={(e) => edit("name", e.target.value)}
                />
              </label>
              <label>
                Accent color
                <select
                  aria-label="Strategy accent color"
                  value={fields.color ?? ""}
                  onChange={(e) =>
                    edit("color", (e.target.value || null) as Playbook["color"])
                  }
                >
                  <option value="">Default</option>
                  {["emerald", "violet", "blue", "amber", "rose"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="playbook-note">
              Short description
              <textarea
                aria-label="Short description"
                maxLength={500}
                value={fields.description}
                onChange={(e) => edit("description", e.target.value)}
              />
            </label>
            <details>
              <summary>Markets, timeframes and trading window</summary>
              {playbookNotes
                .slice(0, 3)
                .map(([key, label]) => note(key, label))}
            </details>
            <div className="playbook-writing-grid">
              {playbookNotes
                .filter(([key]) =>
                  ["context", "entry", "invalidation"].includes(key),
                )
                .map(([key, label]) => note(key, label))}
            </div>
            <details>
              <summary>Risk, management and extra notes</summary>
              <div className="playbook-writing-grid">
                {playbookNotes
                  .filter(([key]) =>
                    [
                      "stop",
                      "exit",
                      "management",
                      "avoid",
                      "mistakes",
                    ].includes(key),
                  )
                  .map(([key, label]) => note(key, label))}
              </div>
            </details>
            <h2>Setup checklist</h2>
            <p className="muted">
              Assignments snapshot these instructions and start with Not
              assessed. Answers reflect your assessment.
            </p>
            {fields.checklist.map((item, index) => (
              <div className="playbook-checklist-item" key={item.id}>
                <input
                  aria-label={`Setup checklist item ${index + 1}`}
                  maxLength={300}
                  value={item.text}
                  onChange={(e) =>
                    edit(
                      "checklist",
                      fields.checklist.map((i) =>
                        i.id === item.id ? { ...i, text: e.target.value } : i,
                      ),
                    )
                  }
                />
                <button
                  aria-label={`Move checklist item ${index + 1} up`}
                  disabled={index === 0}
                  onClick={() => {
                    const copy = [...fields.checklist];
                    [copy[index - 1], copy[index]] = [
                      copy[index],
                      copy[index - 1],
                    ];
                    edit("checklist", copy);
                  }}
                >
                  ↑
                </button>
                <button
                  aria-label={`Move checklist item ${index + 1} down`}
                  disabled={index === fields.checklist.length - 1}
                  onClick={() => {
                    const copy = [...fields.checklist];
                    [copy[index + 1], copy[index]] = [
                      copy[index],
                      copy[index + 1],
                    ];
                    edit("checklist", copy);
                  }}
                >
                  ↓
                </button>
                <button
                  onClick={() =>
                    edit(
                      "checklist",
                      fields.checklist.filter((i) => i.id !== item.id),
                    )
                  }
                >
                  Remove item
                </button>
              </div>
            ))}
            <button
              disabled={fields.checklist.length >= 30}
              onClick={() =>
                edit("checklist", [
                  ...fields.checklist,
                  { id: crypto.randomUUID(), text: "" },
                ])
              }
            >
              Add checklist item
            </button>
          </fieldset>
        </section>
      )}
      {tab === "examples" && (
        <section className="playbook-card">
          <Screenshots<StrategyData>
            recordId={initial.id}
            data={{ ...state.data, revision: state.data.galleryRevision }}
            blocked={
              state.dirty || state.state === "saving" || state.data.archived
            }
            demo={false}
            config={{
              endpoint: "/api/strategies/images",
              resourceEndpoint: "/api/strategies",
              ownerKey: "strategyId",
              uploadKey: "strategyId",
              kindChoices: exampleTypes,
              playbook: true,
            }}
            changed={(data) => controller.accept(data)}
          />
          <p className="muted">
            Examples are private illustrations and create no trades or P&L.
            Duplicating text/checklist does not copy images.
          </p>
        </section>
      )}
      {tab === "results" && <StrategyResults strategyId={initial.id} />}
      {templateBuilder && (
        <StrategyBuilder
          options={templateBuilder}
          close={() => setTemplateBuilder(null)}
          created={() => {}}
          saved={() => {
            setTemplateBuilder(null);
            setTemplateNotice(
              "Template saved. Find it in Strategies → My templates.",
            );
          }}
        />
      )}
    </div>
  );
}
