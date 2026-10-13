"use client";
import { confirmAction } from "@/components/ui/confirm-action";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { requestJson } from "@/lib/client-api";
import { ReviewSaveController } from "@/lib/reviews/save-controller";
import {
  emotions,
  stages,
  mistakes,
  noteFields,
  reviewState,
  type ReviewData,
  type ReviewFields,
  type ReviewTag,
} from "@/lib/reviews/model";
import { RecordStrategy } from "@/components/strategies/assignment";
import { useWritingGuard } from "@/components/daily/writing-guard";
import { Screenshots } from "./screenshots";

function Note({
  label,
  placeholder,
  value,
  onChange,
  disabled,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = `${Math.min(650, Math.max(115, ref.current.scrollHeight))}px`;
    }
  }, [value]);
  return (
    <label className="review-note">
      <span>
        {label}
        <small>{value.length}/5,000</small>
      </span>
      <textarea
        ref={ref}
        aria-label={label}
        value={value}
        maxLength={5000}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
export function RecordWorkspace({
  recordId,
  initial,
  children,
  summary,
  demo = false,
}: {
  recordId: string;
  initial: ReviewData;
  children: React.ReactNode;
  summary: React.ReactNode;
  demo?: boolean;
}) {
  const search = useSearchParams(),
    tabValue = search.get("tab"),
    tab =
      tabValue === "review" || tabValue === "screenshots"
        ? tabValue
        : "overview";
  const [controller] = useState(
    () =>
      new ReviewSaveController(initial, (draft, revision) =>
        requestJson<ReviewData>("/api/reviews", {
          method: "POST",
          body: JSON.stringify({ recordId, revision, ...draft }),
        }),
      ),
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.read,
    controller.read,
  );
  const [tags, setTags] = useState(initial.tags),
    [comparison, setComparison] = useState<ReviewData | null>(null),
    [compareError, setCompareError] = useState("");
  // Client route restoration may carry an older server snapshot. Re-read only on
  // mount and never replace input that became dirty while the request was pending.
  useEffect(() => {
    if (demo) return;
    let active = true;
    void requestJson<ReviewData>(`/api/reviews?recordId=${recordId}`)
      .then((data) => {
        if (
          !active ||
          controller.read().dirty ||
          controller.read().state === "saving"
        )
          return;
        if (controller.accept(data)) setTags(data.tags);
      })
      .catch(() => {
        if (active)
          setCompareError(
            "Could not refresh the saved review. Your input is kept; retry or reload before editing.",
          );
      });
    return () => {
      active = false;
    };
  }, [controller, demo, recordId]);
  useEffect(() => {
    if (
      demo ||
      !state.dirty ||
      state.state === "conflict" ||
      state.state === "error"
    )
      return;
    const timer = setTimeout(() => void controller.save(), 900);
    return () => clearTimeout(timer);
  }, [controller, demo, state.draft, state.dirty, state.state]);
  useWritingGuard(() => !demo && controller.read().dirty);
  function edit(fields: ReviewFields) {
    controller.edit({ fields, status: state.draft.status });
  }
  function toggle(
    stage: (typeof stages)[number],
    emotion: (typeof emotions)[number],
  ) {
    const values = state.draft.fields.emotions[stage];
    edit({
      ...state.draft.fields,
      emotions: {
        ...state.draft.fields.emotions,
        [stage]: values.includes(emotion)
          ? values.filter((v) => v !== emotion)
          : [...values, emotion],
      },
    });
  }
  function toggleMistake(id: string) {
    const values = state.draft.fields.mistakes;
    edit({
      ...state.draft.fields,
      mistakes: values.includes(id)
        ? values.filter((v) => v !== id)
        : [...values, id],
    });
  }
  function setTab(value: string) {
    const params = new URLSearchParams(window.location.search);
    if (value === "overview") params.delete("tab");
    else params.set("tab", value);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${params}`,
    );
  }
  async function compare() {
    try {
      setCompareError("");
      setComparison(
        await requestJson<ReviewData>(`/api/reviews?recordId=${recordId}`),
      );
    } catch (e) {
      setCompareError(
        e instanceof Error ? e.message : "Could not load saved review.",
      );
    }
  }
  const status = reviewState(
    state.draft.fields,
    state.draft.status,
    state.data.images.length,
  );
  return (
    <div className="review-workspace">
      <div className="review-tabs" role="tablist" aria-label="Record sections">
        {["overview", "review", "screenshots"].map((value, i) => (
          <button
            key={value}
            role="tab"
            id={`record-tab-${value}`}
            aria-controls={`record-panel-${value}`}
            aria-selected={tab === value}
            tabIndex={tab === value ? 0 : -1}
            onClick={() => setTab(value)}
            onKeyDown={(e) => {
              if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
                e.preventDefault();
                const choices = ["overview", "review", "screenshots"],
                  next =
                    e.key === "Home"
                      ? 0
                      : e.key === "End"
                        ? 2
                        : (i + (e.key === "ArrowRight" ? 1 : 2)) % 3;
                setTab(choices[next]);
                document.getElementById(`record-tab-${choices[next]}`)?.focus();
              }
            }}
          >
            {value === "overview"
              ? "Overview"
              : value === "review"
                ? "Review"
                : `Screenshots${state.data.images.length ? ` (${state.data.images.length})` : ""}`}
          </button>
        ))}
      </div>
      {tab !== "overview" && (
        <div className="review-financial-summary">
          {summary}
          <span className={`review-status ${status}`}>{status}</span>
        </div>
      )}
      {!demo && <RecordStrategy recordId={recordId} />}
      <div
        role="tabpanel"
        id="record-panel-overview"
        aria-labelledby="record-tab-overview"
        hidden={tab !== "overview"}
      >
        {children}
      </div>
      <section
        role="tabpanel"
        id="record-panel-review"
        aria-labelledby="record-tab-review"
        hidden={tab !== "review"}
      >
        <div className="review-save-bar">
          <div>
            <strong>A moment to reflect</strong>
            <p className="muted small">
              A sentence is enough. Every field is optional.
              {demo ? " Fictional demo review · read-only." : ""}
            </p>
          </div>
          <div className="review-save-actions">
            <span role="status" aria-live="polite">
              {demo
                ? "Demo data"
                : state.state === "saving"
                  ? "Saving…"
                  : state.state === "saved" && !state.dirty
                    ? "Saved"
                    : state.state === "error" || state.state === "conflict"
                      ? "Not saved"
                      : state.dirty
                        ? "Unsaved changes"
                        : ""}
            </span>
            {!demo && (
              <>
                <Button
                  variant="outline"
                  onClick={() => void controller.save()}
                  disabled={
                    !state.dirty ||
                    state.state === "saving" ||
                    state.state === "conflict"
                  }
                >
                  Save now
                </Button>
                <Button
                  onClick={() => {
                    controller.edit({
                      ...state.draft,
                      status:
                        state.draft.status === "reviewed"
                          ? "draft"
                          : "reviewed",
                    });
                    void controller.save();
                  }}
                  disabled={
                    state.state === "saving" || state.state === "conflict"
                  }
                >
                  {state.draft.status === "reviewed"
                    ? "Return to draft"
                    : "Mark reviewed"}
                </Button>
              </>
            )}
          </div>
        </div>
        {state.error && (
          <div className="review-error" role="alert">
            <p>{state.error}</p>
            {state.state === "conflict" ? (
              <button onClick={() => void compare()}>
                Compare saved version
              </button>
            ) : (
              <Button variant="outline" onClick={() => void controller.save()}>
                Retry save
              </Button>
            )}
          </div>
        )}
        {compareError && <p role="alert">{compareError}</p>}
        {comparison && (
          <div className="review-conflict">
            <h3>Latest saved review</h3>
            {noteFields.map(([key, label]) => (
              <div key={key}>
                <strong>{label}</strong>
                <p className="review-plain">{comparison.fields[key] || "—"}</p>
              </div>
            ))}
            <p>
              Saved status: {comparison.status} · Plan:{" "}
              {comparison.fields.adherence ?? "Unset"} · Emotions:{" "}
              {stages
                .map(
                  (s) =>
                    `${s}: ${comparison.fields.emotions[s].join(", ") || "unset"}`,
                )
                .join(" / ")}{" "}
              · Mistakes:{" "}
              {comparison.fields.mistakes
                .map(
                  (id) =>
                    mistakes.find(([key]) => key === id)?.[1] ??
                    comparison.tags.find((t) => t.id === id)?.name ??
                    "Archived tag",
                )
                .join(", ") || "unset"}
            </p>
            <Button
              variant="outline"
              onClick={async () => {
                if (
                  await confirmAction(
                    "Replace your unsaved changes with the saved review?",
                  )
                ) {
                  controller.useLatest(comparison);
                  setComparison(null);
                }
              }}
            >
              Use latest saved
            </Button>
            <Button
              onClick={async () => {
                if (
                  await confirmAction(
                    "Replace the displayed saved review with your current version?",
                  )
                ) {
                  void controller.resolveWithMine(comparison);
                  setComparison(null);
                }
              }}
            >
              Save my version instead
            </Button>
          </div>
        )}
        <div className="review-writing">
          {noteFields.map(([key, label, placeholder]) => (
            <Note
              key={key}
              label={label}
              placeholder={placeholder}
              value={state.draft.fields[key]}
              disabled={demo}
              onChange={(value) =>
                edit({ ...state.draft.fields, [key]: value })
              }
            />
          ))}
        </div>
        <div className="review-structured">
          <section>
            <h3>Emotions</h3>
            {stages.map((stage) => (
              <fieldset key={stage}>
                <legend>
                  {stage[0].toUpperCase() + stage.slice(1)} the trade
                </legend>
                <div className="review-chips">
                  {emotions.map((emotion) => (
                    <button
                      type="button"
                      key={emotion}
                      aria-pressed={state.draft.fields.emotions[stage].includes(
                        emotion,
                      )}
                      disabled={demo}
                      onClick={() => toggle(stage, emotion)}
                    >
                      {emotion}
                    </button>
                  ))}
                </div>
              </fieldset>
            ))}
          </section>
          <section>
            <h3>Mistakes</h3>
            <p className="small muted">
              Choose only what fits. An empty selection leaves mistakes
              unspecified.
            </p>
            <div className="review-chips">
              {[
                ...mistakes.map(([id, name]) => ({
                  id,
                  name,
                  archived: false,
                })),
                ...tags.filter(
                  (t) =>
                    !t.archived || state.draft.fields.mistakes.includes(t.id),
                ),
              ].map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  aria-pressed={state.draft.fields.mistakes.includes(tag.id)}
                  disabled={demo}
                  onClick={() => toggleMistake(tag.id)}
                >
                  {tag.name}
                  {tag.archived ? " · Archived" : ""}
                </button>
              ))}
            </div>
            {!demo && <TagManager tags={tags} changed={setTags} />}
            <label className="review-plan">
              Plan adherence
              <select
                aria-label="Plan adherence"
                value={state.draft.fields.adherence ?? ""}
                disabled={demo}
                onChange={(e) =>
                  edit({
                    ...state.draft.fields,
                    adherence: e.target.value
                      ? (e.target.value as ReviewFields["adherence"])
                      : null,
                  })
                }
              >
                <option value="">Not specified</option>
                <option value="followed">Followed my plan</option>
                <option value="partly">Partly followed my plan</option>
                <option value="not-followed">Did not follow my plan</option>
              </select>
            </label>
            <p className="small muted">
              Your assessment is independent of the result.
            </p>
          </section>
        </div>
      </section>
      <section
        role="tabpanel"
        id="record-panel-screenshots"
        aria-labelledby="record-tab-screenshots"
        hidden={tab !== "screenshots"}
      >
        <Screenshots
          recordId={recordId}
          data={state.data}
          blocked={state.dirty || state.state === "saving"}
          demo={demo}
          changed={(data) => controller.accept(data)}
        />
      </section>
      {!demo && (
        <p className="review-recovery-link small">
          <Link href="/trade-view/review-recovery">
            Find reviews awaiting reassignment →
          </Link>
        </p>
      )}
    </div>
  );
}
function TagManager({
  tags,
  changed,
}: {
  tags: ReviewTag[];
  changed: (tags: ReviewTag[]) => void;
}) {
  const [selected, setSelected] = useState<string>(""),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(archived = false) {
    setBusy(true);
    setError("");
    try {
      const tag = await requestJson<ReviewTag>("/api/reviews/tags", {
        method: "POST",
        body: JSON.stringify({
          ...(selected ? { id: selected } : {}),
          name,
          archived,
        }),
      });
      changed([...tags.filter((t) => t.id !== tag.id), tag]);
      setSelected("");
      setName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save tag.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="review-tag-manager">
      <summary>Manage my mistake tags</summary>
      <div className="review-tag-list">
        {tags.map((tag) => (
          <div key={tag.id}>
            <span>
              {tag.name}
              {tag.archived ? " · Archived" : ""}
            </span>
            <button
              type="button"
              onClick={() => {
                setSelected(tag.id);
                setName(tag.name);
              }}
            >
              Rename / {tag.archived ? "restore" : "archive"}
            </button>
          </div>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save(false);
        }}
      >
        <label>
          Tag name
          <input
            aria-label="Custom mistake tag name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            required
          />
        </label>
        <Button disabled={busy}>
          {selected ? "Save / restore tag" : "Create tag"}
        </Button>
        {selected && (
          <>
            <Button
              variant="outline"
              type="button"
              disabled={busy}
              onClick={() => void save(true)}
            >
              Archive tag
            </Button>
            <button
              type="button"
              onClick={() => {
                setSelected("");
                setName("");
              }}
            >
              Cancel
            </button>
          </>
        )}
      </form>
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
