"use client";
import { LoadingSpinner } from "@/components/ui/loading";
import { confirmAction } from "@/components/ui/confirm-action";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { requestJson } from "@/lib/client-api";
import { ReviewSaveController } from "@/lib/reviews/save-controller";
import {
  emotions,
  emotionNameSchema,
  emotionOptions,
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
import { MobileSaveBar } from "@/components/ui/mobile-save-bar";
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
        dir="auto"
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
        ? "review"
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
  const [mediaBusy, setMediaBusy] = useState(false);
  const [noteTab, setNoteTab] =
    useState<(typeof noteFields)[number][0]>("entryRationale");
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
  function toggle(stage: (typeof stages)[number], emotion: string) {
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
      {!demo && tab === "review" && (
        <MobileSaveBar
          pending={state.state === "saving"}
          status={
            state.state === "saving"
              ? "Saving..."
              : state.error
                ? "Save error"
                : state.dirty
                  ? "Unsaved changes"
                  : "Saved"
          }
          label="Save trade review"
          disabled={
            !state.dirty ||
            state.state === "saving" ||
            state.state === "conflict"
          }
          save={() => void controller.save()}
        />
      )}
      <div className="review-tabs" role="tablist" aria-label="Record sections">
        {["overview", "review"].map((value, i) => (
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
                const choices = ["overview", "review"],
                  next =
                    e.key === "Home" ? 0 : e.key === "End" ? 1 : (i + 1) % 2;
                setTab(choices[next]);
                document.getElementById(`record-tab-${choices[next]}`)?.focus();
              }
            }}
          >
            {value === "overview" ? "Overview" : "Review"}
          </button>
        ))}
      </div>
      {tab !== "overview" && (
        <div className="review-financial-summary">
          {summary}
          <span className={`review-status ${status}`}>{status}</span>
        </div>
      )}
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
            <strong>Trade review</strong>
            <p className="muted small">
              A sentence is enough. Every field is optional.
              {demo ? " Fictional demo review · read-only." : ""}
            </p>
          </div>
          <div className="review-save-actions">
            <span
              role="status"
              aria-live="polite"
              className={`review-save-status ${state.state === "saving" ? "is-saving" : ""}`}
            >
              {!demo && state.state === "saving" && (
                <LoadingSpinner size={14} />
              )}
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
                    mediaBusy ||
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
        <div className="review-layout">
          <aside className="review-assessment" aria-label="Trade assessment">
            {!demo && <RecordStrategy recordId={recordId} />}
            <div className="review-structured">
              <section>
                <h3>Emotions</h3>
                {stages.map((stage) => (
                  <fieldset key={stage}>
                    <legend>
                      {stage[0].toUpperCase() + stage.slice(1)} the trade
                    </legend>
                    <div className="review-chips">
                      {emotionOptions([
                        ...emotions,
                        ...state.draft.fields.emotions[stage],
                        ...stages.flatMap(
                          (s) => state.draft.fields.emotions[s],
                        ),
                        ...(state.data.emotionChoices ?? []),
                      ]).map((emotion) => (
                        <button
                          type="button"
                          key={emotion}
                          aria-pressed={state.draft.fields.emotions[
                            stage
                          ].includes(emotion)}
                          disabled={
                            demo ||
                            mediaBusy ||
                            (!state.draft.fields.emotions[stage].includes(
                              emotion,
                            ) &&
                              state.draft.fields.emotions[stage].length >= 30)
                          }
                          onClick={() => toggle(stage, emotion)}
                        >
                          {emotion}
                        </button>
                      ))}
                    </div>
                    <CustomEmotion
                      stage={stage}
                      disabled={demo || mediaBusy}
                      selected={state.draft.fields.emotions[stage]}
                      onAdd={(emotion) => {
                        const label =
                          emotionOptions([
                            ...emotions,
                            ...(state.data.emotionChoices ?? []),
                            ...stages.flatMap(
                              (s) => state.draft.fields.emotions[s],
                            ),
                          ]).find(
                            (value) =>
                              value.toLowerCase() === emotion.toLowerCase(),
                          ) ?? emotion;
                        edit({
                          ...state.draft.fields,
                          emotions: {
                            ...state.draft.fields.emotions,
                            [stage]: emotionOptions([
                              ...state.draft.fields.emotions[stage],
                              label,
                            ]),
                          },
                        });
                      }}
                    />
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
                        !t.archived ||
                        state.draft.fields.mistakes.includes(t.id),
                    ),
                  ].map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      aria-pressed={state.draft.fields.mistakes.includes(
                        tag.id,
                      )}
                      disabled={demo || mediaBusy}
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
                    disabled={demo || mediaBusy}
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
          </aside>
          <div className="review-visual-main">
            <Screenshots
              layout="workspace"
              onBusyChange={setMediaBusy}
              recordId={recordId}
              data={state.data}
              blocked={state.dirty || state.state === "saving"}
              demo={demo}
              changed={(data) => controller.accept(data)}
            />
            <section
              className="review-trade-notes"
              aria-labelledby="trade-notes-title"
            >
              <header>
                <h2 id="trade-notes-title">Trade notes</h2>
                <p className="small muted">
                  Your observations, decisions and lessons. Changes save
                  automatically.
                </p>
              </header>
              <div
                role="tablist"
                aria-label="Trade note sections"
                className="review-note-tabs"
              >
                {noteFields.map(([key, label], index) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    id={`note-tab-${key}`}
                    aria-controls={`note-panel-${key}`}
                    aria-selected={noteTab === key}
                    tabIndex={noteTab === key ? 0 : -1}
                    onClick={() => setNoteTab(key)}
                    onKeyDown={(event) => {
                      if (
                        !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                          event.key,
                        )
                      )
                        return;
                      event.preventDefault();
                      const next =
                        event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? noteFields.length - 1
                            : (index +
                                (event.key === "ArrowRight"
                                  ? 1
                                  : noteFields.length - 1)) %
                              noteFields.length;
                      setNoteTab(noteFields[next][0]);
                      document
                        .getElementById(`note-tab-${noteFields[next][0]}`)
                        ?.focus();
                    }}
                  >
                    {label}
                    {state.draft.fields[key].trim() && (
                      <span className="review-note-dot" aria-hidden="true" />
                    )}
                  </button>
                ))}
              </div>
              {noteFields.map(([key, label, placeholder]) => (
                <div
                  key={key}
                  role="tabpanel"
                  id={`note-panel-${key}`}
                  aria-labelledby={`note-tab-${key}`}
                  hidden={noteTab !== key}
                >
                  <Note
                    label={label}
                    placeholder={placeholder}
                    value={state.draft.fields[key]}
                    disabled={demo || mediaBusy}
                    onChange={(value) =>
                      edit({ ...state.draft.fields, [key]: value })
                    }
                  />
                </div>
              ))}
            </section>
          </div>
        </div>
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
function CustomEmotion({
  stage,
  selected,
  disabled,
  onAdd,
}: {
  stage: string;
  selected: string[];
  disabled: boolean;
  onAdd: (value: string) => void;
}) {
  const [name, setName] = useState(""),
    [error, setError] = useState("");
  return (
    <form
      className="review-custom-emotion"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = emotionNameSchema.safeParse(name);
        if (!parsed.success) {
          setError(parsed.error.issues[0].message);
          return;
        }
        if (
          selected.length >= 30 &&
          !selected.some(
            (value) => value.toLowerCase() === parsed.data.toLowerCase(),
          )
        ) {
          setError("Choose up to 30 emotions per stage.");
          return;
        }
        onAdd(parsed.data);
        setName("");
        setError("");
      }}
    >
      <label className="sr-only" htmlFor={`custom-emotion-${stage}`}>
        Custom emotion {stage} the trade
      </label>
      <div>
        <input
          id={`custom-emotion-${stage}`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Add your own emotion"
          maxLength={60}
          disabled={disabled}
        />
        <Button
          type="submit"
          variant="outline"
          size="sm"
          disabled={disabled || !name.trim()}
          aria-label={`Add emotion ${stage} the trade`}
        >
          Add
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
    </form>
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
        <Button disabled={busy} aria-busy={busy}>
          {selected ? "Save / restore tag" : "Create tag"}
        </Button>
        {selected && (
          <>
            <Button
              variant="outline"
              type="button"
              disabled={busy}
              aria-busy={busy}
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
