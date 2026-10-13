"use client";
import { confirmAction } from "@/components/ui/confirm-action";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { SaveController } from "@/lib/reviews/save-controller";
import { requestJson } from "@/lib/client-api";
import {
  dailyFieldsSchema,
  type DailyData,
  type DailyFields,
} from "@/lib/daily/model";
import { PlannedStrategies } from "@/components/strategies/plans";
import { emotions } from "@/lib/reviews/model";
import {
  todayIn,
  shiftDay,
  type CalendarDetails,
  type CalendarAccount,
} from "@/lib/calendar/model";
import { journalMoney } from "@/lib/journal/calculations";
import { journalTimestamp } from "@/lib/timezones";
import { wallInput } from "@/lib/props/model";
import { usePrivateRequest } from "@/components/calendar/cache-provider";
import { useWritingGuard } from "./writing-guard";
import { MobileSaveBar } from "@/components/ui/mobile-save-bar";

function Note({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="daily-note">
      <span>
        {label}
        <small>{value.length}/5,000</small>
      </span>
      <textarea
        aria-label={label}
        maxLength={5000}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
export function DayWorkspace({
  initial,
  accounts,
}: {
  initial: DailyData;
  accounts: CalendarAccount[];
}) {
  const router = useRouter(),
    search = useSearchParams();
  const [controller] = useState(
    () =>
      new SaveController<DailyFields, DailyData>(initial, (draft, revision) => {
        const parsed = dailyFieldsSchema.safeParse(draft.fields);
        if (!parsed.success)
          throw new Error(
            parsed.error.issues
              .map((i) => `${i.path.join(".")}: ${i.message}`)
              .join(" · "),
          );
        return requestJson<DailyData>("/api/daily", {
          method: "POST",
          body: JSON.stringify({
            date: initial.date,
            timezone: initial.timezone,
            revision,
            ...draft,
          }),
        });
      }),
  );
  const state = useSyncExternalStore(
      controller.subscribe,
      controller.read,
      controller.read,
    ),
    fields = state.draft.fields;
  const dirty = useCallback(() => controller.read().dirty, [controller]);
  useWritingGuard(dirty);
  const [tab, setTab] = useState("preparation"),
    [comparison, setComparison] = useState<DailyData | null>(null),
    [refreshError, setRefreshError] = useState("");
  useEffect(() => {
    let active = true;
    void requestJson<DailyData>(`/api/daily?date=${initial.date}`)
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
          setRefreshError(
            "Could not refresh this day's writing. Your input is kept; retry before saving.",
          );
      });
    return () => {
      active = false;
    };
  }, [controller, initial.date]);
  useEffect(() => {
    if (!state.dirty || state.state === "conflict" || state.state === "error")
      return;
    const timer = setTimeout(() => void controller.save(), 900);
    return () => clearTimeout(timer);
  }, [controller, state.draft, state.dirty, state.state]);
  function edit<K extends keyof DailyFields>(key: K, value: DailyFields[K]) {
    controller.edit({
      fields: { ...controller.read().draft.fields, [key]: value },
      status: controller.read().draft.status,
    });
  }
  async function navigate(date: string) {
    if (
      dirty() &&
      !(await confirmAction(
        "Your latest writing is not saved. Leave and discard those changes?",
      ))
    )
      return;
    const next = new URLSearchParams(search.toString());
    next.set("date", date);
    router.push(`/day-view?${next}`);
  }
  const archived = search.get("archived") === "1",
    available = accounts.filter((a) => archived || !a.archived);
  const ids = search.has("accounts")
    ? search.get("accounts")!.split(",").filter(Boolean)
    : available.map((a) => a.id);
  const query = new URLSearchParams({
    date: initial.date,
    accounts: ids.join(","),
    archived: archived ? "1" : "0",
    ...(search.get("symbol") ? { symbol: search.get("symbol")! } : {}),
    ...(search.get("direction") ? { direction: search.get("direction")! } : {}),
  }).toString();
  const results = usePrivateRequest<{
      userId: string;
      timezone: string;
      results: CalendarDetails;
    }>(query, "/api/daily/results"),
    data = results.data?.results;
  const from = search.get("from"),
    returnHref =
      from &&
      (from.startsWith("/calendar") ||
        from.startsWith("/?") ||
        from.startsWith("/notebook")) &&
      !from.startsWith("//")
        ? from
        : "/notebook";
  const calendarTimezone = search.get("contextTimezone");
  function filters(key: string, value: string) {
    const next = new URLSearchParams(search.toString());
    next.set("date", initial.date);
    next.set(key, value);
    if (key === "archived") next.delete("accounts");
    window.history.replaceState(null, "", `/day-view?${next}`);
  }
  async function compare() {
    try {
      setRefreshError("");
      setComparison(
        await requestJson<DailyData>(`/api/daily?date=${initial.date}`),
      );
    } catch {
      setRefreshError(
        "Could not load the saved version. Your writing is kept.",
      );
    }
  }
  const note = (
    key: keyof Pick<
      DailyFields,
      | "focus"
      | "context"
      | "setups"
      | "stayOut"
      | "missedMove"
      | "stoppingRule"
      | "session"
      | "wentWell"
      | "departed"
      | "pressure"
      | "repeat"
      | "change"
    >,
    label: string,
    placeholder?: string,
  ) => (
    <Note
      key={key}
      label={label}
      value={fields[key]}
      onChange={(value) => edit(key, value)}
      placeholder={placeholder}
    />
  );
  const mood = (key: "mood" | "endMood", label: string) => (
    <label>
      {label}
      <select
        aria-label={label}
        value={fields[key] ?? ""}
        onChange={(e) =>
          edit(key, (e.target.value || null) as DailyFields[typeof key])
        }
      >
        <option value="">Not recorded</option>
        {emotions.map((e) => (
          <option key={e}>{e}</option>
        ))}
      </select>
    </label>
  );
  const savedStatus =
    state.state === "saving"
      ? "Saving…"
      : state.state === "saved"
        ? "Saved"
        : state.state === "error"
          ? "Save error"
          : state.state === "conflict"
            ? "Conflicting edits"
            : state.dirty
              ? "Unsaved changes"
              : state.data.id
                ? "Saved"
                : "Not saved yet";
  return (
    <div className="daily-workspace">
      <MobileSaveBar
        status={savedStatus}
        label="Save daily entry"
        disabled={
          !state.dirty || state.state === "saving" || state.state === "conflict"
        }
        save={() => void controller.save()}
      />
      <header className="page-header">
        <div>
          <span className="eyebrow">DAY VIEW · PERSONAL JOURNAL</span>
          <h1>{initial.date}</h1>
          <p className="muted">
            Notes apply across accounts · {initial.timezone}
          </p>
        </div>
        <div className="daily-actions">
          <span role="status">{savedStatus}</span>
          <button
            className="button-primary"
            onClick={() => void controller.save()}
            disabled={
              !state.dirty ||
              state.state === "saving" ||
              state.state === "conflict"
            }
          >
            Save now
          </button>
          <Link href={returnHref}>Back</Link>
          <Link href="/notebook">Notebook</Link>
        </div>
      </header>
      <div className="daily-navigation">
        <button
          aria-label="Previous day"
          onClick={() => navigate(shiftDay(initial.date, -1))}
        >
          ← Previous
        </button>
        <input
          aria-label="Journal date"
          type="date"
          value={initial.date}
          onChange={(e) => {
            if (e.target.value) navigate(e.target.value);
          }}
        />
        <button
          aria-label="Next day"
          onClick={() => navigate(shiftDay(initial.date, 1))}
        >
          Next →
        </button>
        <button onClick={() => navigate(todayIn(initial.preferenceTimezone))}>
          Today
        </button>
      </div>
      {(initial.timezone !== initial.preferenceTimezone ||
        (calendarTimezone && calendarTimezone !== initial.timezone)) && (
        <p className="daily-context">
          This entry retains {initial.timezone}. Current journal preference:{" "}
          {initial.preferenceTimezone}
          {calendarTimezone ? ` · Calendar link: ${calendarTimezone}` : ""}.
          Results and observation times below use the saved entry timezone.
        </p>
      )}
      {(state.error || refreshError) && (
        <p role="alert">
          {state.error || refreshError} Your unsaved writing is kept.
        </p>
      )}
      {(state.state === "conflict" || refreshError) && (
        <button onClick={() => void compare()}>Compare saved version</button>
      )}
      {comparison && (
        <section className="daily-panel daily-comparison">
          <h2>Saved version · revision {comparison.revision}</h2>
          <p>Your current writing remains in the editor below.</p>
          <details>
            <summary>Read the saved writing</summary>
            <pre>{JSON.stringify(comparison.fields, null, 2)}</pre>
          </details>
          <div className="daily-actions">
            <button
              onClick={async () => {
                if (
                  await confirmAction(
                    "Replace the editor with this saved version? Your unsaved changes will be discarded.",
                  )
                ) {
                  controller.useLatest(comparison);
                  setComparison(null);
                  setRefreshError("");
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
                  setRefreshError("");
                }
              }}
            >
              Save my version instead
            </button>
          </div>
        </section>
      )}
      <div className="daily-layout">
        <section className="daily-editor">
          <nav className="daily-tabs" aria-label="Daily sections">
            {[
              ["preparation", "Preparation"],
              ["session", "Session notes"],
              ["review", "Daily review"],
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
          {tab === "preparation" && (
            <div className="daily-panel">
              {note(
                "focus",
                "Today's focus",
                "One intention for this session.",
              )}
              <PlannedStrategies
                plans={fields.plannedStrategies ?? []}
                onChange={(plans) => edit("plannedStrategies", plans)}
              />
              {note("context", "Market context and levels to watch")}
              <details>
                <summary>Setups, conditions and missed moves</summary>
                {note("setups", "Setups I am willing to take")}
                {note("stayOut", "Conditions under which I will stay out")}
                {note("missedMove", "My response if I miss a move")}
              </details>
              <div className="daily-form-row">
                <label>
                  Readiness
                  <select
                    aria-label="Readiness"
                    value={fields.readiness ?? ""}
                    onChange={(e) =>
                      edit(
                        "readiness",
                        (e.target.value || null) as DailyFields["readiness"],
                      )
                    }
                  >
                    <option value="">Not recorded</option>
                    {["Ready", "Unsure", "Sitting out"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                {mood("mood", "Pre-session mood")}
              </div>
              <details>
                <summary>Personal session limits</summary>
                <p className="muted">
                  Planning notes, separate from prop rules. The journal does not
                  enforce these limits.
                </p>
                <div className="daily-form-row">
                  <label>
                    Maximum planned loss
                    <input
                      aria-label="Maximum planned loss"
                      inputMode="decimal"
                      value={fields.plannedLoss}
                      onChange={(e) => edit("plannedLoss", e.target.value)}
                    />
                  </label>
                  <label>
                    Planning currency
                    <select
                      aria-label="Planning currency"
                      value={fields.currency}
                      onChange={(e) =>
                        edit(
                          "currency",
                          e.target.value as DailyFields["currency"],
                        )
                      }
                    >
                      {["USD", "EUR", "GBP", "ILS"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Maximum planned trades
                    <input
                      aria-label="Maximum planned trades"
                      inputMode="numeric"
                      value={fields.plannedTrades}
                      onChange={(e) => edit("plannedTrades", e.target.value)}
                    />
                  </label>
                </div>
                {note("stoppingRule", "My stopping rule")}
              </details>
              <div className="daily-checklist">
                <div className="daily-actions">
                  <h2>Personal checklist</h2>
                  <span>
                    {fields.checklist.filter((i) => i.checked).length} of{" "}
                    {fields.checklist.length} completed
                  </span>
                </div>
                {fields.checklist.map((item) => (
                  <label key={item.id}>
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={(e) =>
                        edit(
                          "checklist",
                          fields.checklist.map((i) =>
                            i.id === item.id
                              ? { ...i, checked: e.target.checked }
                              : i,
                          ),
                        )
                      }
                    />
                    {item.text}
                  </label>
                ))}
                <Link href="/notebook?defaults=1">
                  Edit defaults for future entries
                </Link>
              </div>
            </div>
          )}
          {tab === "session" && (
            <div className="daily-panel">
              {note(
                "session",
                "Session notes",
                "Thoughts and decisions during the session.",
              )}
              <div className="daily-actions">
                <h2>Observations</h2>
                <button
                  disabled={fields.observations.length >= 100}
                  onClick={() =>
                    edit("observations", [
                      ...fields.observations,
                      {
                        id: crypto.randomUUID(),
                        eventLocal: `${initial.date}T${wallInput(new Date().toISOString(), initial.timezone).slice(11)}`,
                        happened: "",
                        response: "",
                        recordId: null,
                      },
                    ])
                  }
                >
                  Add observation
                </button>
              </div>
              {fields.observations.length === 0 && (
                <p className="muted">
                  Record a missed move or a decision to stay out without
                  creating a trade.
                </p>
              )}
              {fields.observations.map((observation, index) => {
                const meta = state.data.observations[observation.id];
                const update = (patch: Partial<typeof observation>) =>
                  edit(
                    "observations",
                    fields.observations.map((o) =>
                      o.id === observation.id ? { ...o, ...patch } : o,
                    ),
                  );
                return (
                  <article className="daily-observation" key={observation.id}>
                    <div className="daily-actions">
                      <h3>Observation {index + 1}</h3>
                      <button
                        onClick={async () => {
                          if (await confirmAction("Remove this observation?"))
                            edit(
                              "observations",
                              fields.observations.filter(
                                (o) => o.id !== observation.id,
                              ),
                            );
                        }}
                      >
                        Remove observation
                      </button>
                    </div>
                    <label>
                      Event time · {initial.timezone}
                      <input
                        aria-label={`Observation ${index + 1} event time`}
                        type="datetime-local"
                        value={observation.eventLocal}
                        onChange={(e) => update({ eventLocal: e.target.value })}
                      />
                    </label>
                    <Note
                      label={`Observation ${index + 1}: What happened`}
                      value={observation.happened}
                      placeholder="I missed the entry. What did I do next?"
                      onChange={(happened) => update({ happened })}
                    />
                    <Note
                      label={`Observation ${index + 1}: How I responded`}
                      value={observation.response}
                      onChange={(response) => update({ response })}
                    />
                    <label>
                      Linked trading record (optional)
                      <select
                        aria-label={`Observation ${index + 1} linked record`}
                        value={observation.recordId ?? ""}
                        onChange={(e) =>
                          update({ recordId: e.target.value || null })
                        }
                      >
                        <option value="">No linked record</option>
                        {observation.recordId &&
                          !data?.records.some(
                            (r) => r.id === observation.recordId,
                          ) && (
                            <option value={observation.recordId}>
                              Previously linked record ·{" "}
                              {meta?.linkStatus ?? "pending"}
                            </option>
                          )}
                        {data?.records.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.symbol} · {r.account} ·{" "}
                            {journalTimestamp(r.exitAt, initial.timezone)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {meta && (
                      <p className="muted">
                        Recorded event:{" "}
                        {journalTimestamp(meta.eventAt, initial.timezone)} ·
                        Created:{" "}
                        {journalTimestamp(meta.createdAt, initial.timezone)} ·
                        Updated:{" "}
                        {journalTimestamp(meta.updatedAt, initial.timezone)}
                        {meta.href ? (
                          <>
                            {" "}
                            ·{" "}
                            <Link href={meta.href}>
                              {meta.linkStatus === "changed"
                                ? "Regrouped record · open review"
                                : "Open trade review"}
                            </Link>
                          </>
                        ) : meta.linkStatus === "unavailable" ? (
                          " · Linked record unavailable; observation preserved."
                        ) : (
                          ""
                        )}
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          )}
          {tab === "review" && (
            <div className="daily-panel">
              <div className="daily-actions">
                <h2>
                  {state.draft.status === "reviewed"
                    ? "Day reviewed"
                    : "Daily reflection"}
                </h2>
                <button
                  onClick={() => {
                    controller.edit({
                      fields,
                      status:
                        state.draft.status === "reviewed"
                          ? "draft"
                          : "reviewed",
                    });
                    void controller.save();
                  }}
                >
                  {state.draft.status === "reviewed"
                    ? "Reopen daily review"
                    : "Mark day reviewed"}
                </button>
              </div>
              <p className="muted">
                Execution quality is your assessment. Daily review status does
                not complete trade reviews.
              </p>
              {note("wentWell", "What went well?")}
              {note("departed", "Where did I move away from my plan?")}
              {note(
                "pressure",
                "How did I handle missed moves, losses, or pressure?",
              )}
              {note("repeat", "What will I repeat?")}
              {note("change", "One change for the next session")}
              <div className="daily-form-row">
                <label>
                  Daily plan adherence
                  <select
                    aria-label="Daily plan adherence"
                    value={fields.adherence ?? ""}
                    onChange={(e) =>
                      edit(
                        "adherence",
                        (e.target.value || null) as DailyFields["adherence"],
                      )
                    }
                  >
                    <option value="">Not recorded</option>
                    <option value="followed">Followed</option>
                    <option value="partly">Partly followed</option>
                    <option value="not-followed">Did not follow</option>
                  </select>
                </label>
                {mood("endMood", "End-of-day mood")}
              </div>
              <label className="daily-check">
                <input
                  type="checkbox"
                  checked={fields.choseNotToTrade}
                  onChange={(e) => edit("choseNotToTrade", e.target.checked)}
                />
                Chose not to trade
              </label>
              <p className="muted">
                A personal statement, separate from imported activity.
              </p>
            </div>
          )}
        </section>
        <aside className="daily-results daily-panel">
          <div className="daily-actions">
            <h2>Current imported results</h2>
            <button onClick={results.refresh}>Refresh results</button>
          </div>
          <p className="muted">
            {initial.timezone} · USD · Results filters do not change your
            personal entry.
          </p>
          <label>
            Results account
            <select
              aria-label="Results account"
              value={
                ids.length === available.length
                  ? "all"
                  : ids.length === 1
                    ? ids[0]
                    : "selected"
              }
              onChange={(e) =>
                filters(
                  "accounts",
                  e.target.value === "all"
                    ? available.map((a) => a.id).join(",")
                    : e.target.value,
                )
              }
            >
              <option value="all">All available accounts</option>
              {ids.length > 1 && ids.length !== available.length && (
                <option value="selected" disabled>
                  Selected accounts
                </option>
              )}
              {available.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="daily-check">
            <input
              type="checkbox"
              checked={archived}
              onChange={(e) =>
                filters("archived", e.target.checked ? "1" : "0")
              }
            />
            Include archived accounts
          </label>
          {results.error ? (
            <p role="alert">{results.error}</p>
          ) : !data ? (
            <p role="status">Loading daily results…</p>
          ) : (
            <>
              <div className="daily-results-summary">
                <span>
                  Gross P&L
                  <strong>{journalMoney(data.day?.gross ?? "0", true)}</strong>
                </span>
                <span>
                  {data.day?.estimated ? "Estimated net P&L" : "Net P&L"}
                  <strong>
                    {data.day
                      ? journalMoney(data.day.net, true)
                      : "No activity"}
                  </strong>
                </span>
                <span>
                  Closed portions<strong>{data.day?.count ?? 0}</strong>
                </span>
              </div>
              {data.day && data.day.net === null && (
                <p className="muted">
                  Net unavailable: fees are not fully recorded.
                </p>
              )}
              {!data.records.length && (
                <p>
                  No imported realized activity. This does not establish whether
                  trading occurred.
                </p>
              )}
              {fields.choseNotToTrade && !!data.records.length && (
                <p className="daily-context">
                  You recorded “Chose not to trade”; imported realized activity
                  is also present. Both are preserved.
                </p>
              )}
              {data.records.map((record) => (
                <article key={record.id} className="daily-result-record">
                  <strong>
                    {record.symbol} · {record.account}
                  </strong>
                  <span>
                    {journalMoney(record.gross, true)} gross ·{" "}
                    {journalTimestamp(record.exitAt, initial.timezone)}
                  </span>
                  <small>
                    {record.partial
                      ? "Selected-day partial exits"
                      : "Selected-day realized exits"}{" "}
                    · {record.status}
                  </small>
                  {record.href && (
                    <div>
                      <Link
                        href={`${record.href}?from=${encodeURIComponent(`/day-view?${search}`)}`}
                      >
                        Trade details
                      </Link>{" "}
                      ·{" "}
                      <Link
                        href={`${record.href}?tab=review&from=${encodeURIComponent(`/day-view?${search}`)}`}
                      >
                        Review & screenshots
                      </Link>
                    </div>
                  )}
                </article>
              ))}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
