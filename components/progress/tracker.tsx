"use client";
import { LoadingIndicator, LoadingSpinner, LoadingState } from "@/components/ui/loading";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus, Info, Check, Minus, Circle, Target } from "lucide-react";
import { useReducedMotion } from "motion/react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  ResponsiveContainer,
} from "recharts";
import {
  useCalendarCache,
  usePrivateRequest,
} from "@/components/calendar/cache-provider";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/components/ui/confirm-action";
import { useWritingGuard } from "@/components/daily/writing-guard";
import { requestJson } from "@/lib/client-api";
import { todayIn, shiftDay } from "@/lib/calendar/model";
import { journalTimestamp } from "@/lib/timezones";
import {
  presetRange,
  rangeSchema,
  ratio,
  goalFields,
  goalTypes,
  type Goal,
  type GoalFields,
  type Checkin,
} from "@/lib/progress/model";
import type { ProgressData } from "@/lib/progress/service";

const percent = (done: number, total: number) =>
  total ? `${((done / total) * 100).toFixed(1)}%` : "No data";
const dayHref = (date: string) => `/day-view?date=${date}`;
function Explanation({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="progress-info"
          aria-label="Explain this metric"
        >
          <Info size={14} />
        </button>
      </TooltipTrigger>
      <TooltipContent className="progress-tooltip">{children}</TooltipContent>
    </Tooltip>
  );
}
function Metric({
  label,
  done,
  total,
  detail,
  help,
}: {
  label: string;
  done: number;
  total: number;
  detail: React.ReactNode;
  help: string;
}) {
  return (
    <article className="report-metric">
      <div className="progress-inline">
        <span>{label}</span>
        <Explanation>{help}</Explanation>
      </div>
      <strong>{percent(done, total)}</strong>
      <small>
        {done} / {total} {detail}
      </small>
    </article>
  );
}
function WeeklyTrend({
  weeks,
  kind,
}: {
  weeks: ProgressData["weeks"];
  kind: "preparation" | "reviews";
}) {
  const reduced = useReducedMotion();
  const points = weeks.map((w) => ({
    date: w.start,
    done: w[kind].done,
    total: w[kind].total,
    value: ratio(w[kind].done, w[kind].total),
  }));
  return (
    <div>
      <div
        className="progress-trend"
        role="img"
        aria-label={`${kind === "preparation" ? "Preparation" : "Trade review"} completion by week; exact counts below. Gaps mean no eligible data.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={points}
            margin={{ top: 12, right: 16, left: 0, bottom: 0 }}
          >
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="date"
              tickFormatter={(v: string) => v.slice(5)}
              minTickGap={28}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              width={42}
              domain={[0, 100]}
              ticks={[0, 50, 100]}
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <ChartTooltip
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as
                  (typeof points)[number] | undefined;
                return active && p ? (
                  <div className="chart-tooltip">
                    Week of {p.date}
                    <strong>{percent(p.done, p.total)}</strong>
                    <small>
                      {p.done} / {p.total}
                    </small>
                  </div>
                ) : null;
              }}
            />
            <Line
              type="linear"
              dataKey="value"
              stroke={
                kind === "preparation" ? "var(--primary)" : "var(--violet)"
              }
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls={false}
              isAnimationActive={!reduced}
              animationDuration={250}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="progress-exact">
        <summary>Weekly counts</summary>
        <ul>
          {points.map((p) => (
            <li key={p.date}>
              Week of {p.date}: {p.done} / {p.total} ·{" "}
              {percent(p.done, p.total)}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
function Heatmap({ data }: { data: ProgressData }) {
  const [mode, setMode] = useState<"preparation" | "dailyReviews" | "reviews">(
    "preparation",
  );
  const offset =
    (new Date(data.range.start + "T12:00:00Z").getUTCDay() -
      data.weekStartsOn +
      7) %
    7;
  return (
    <section className="report-card progress-heatmap">
      <header className="progress-section-header">
        <div>
          <h2>Weekly consistency</h2>
          <p className="muted">
            Saved preparation and reviews, one day at a time.
          </p>
        </div>
        <label>
          Show
          <select
            aria-label="Heatmap metric"
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
          >
            <option value="preparation">Preparation</option>
            <option value="dailyReviews">Daily review</option>
            <option value="reviews">Trade reviews</option>
          </select>
        </label>
      </header>
      <div className="progress-heat-scroll">
        <div className="progress-heat-grid">
          <div className="progress-heat-labels">
            {Array.from({ length: 7 }, (_, i) => (
              <span key={i}>
                {
                  ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
                    (i + data.weekStartsOn) % 7
                  ]
                }
              </span>
            ))}
          </div>
          <div
            className="progress-heat-days"
            style={{
              gridTemplateColumns: `repeat(${Math.ceil((offset + data.days.length) / 7)}, var(--progress-cell))`,
            }}
          >
            {Array.from({ length: offset }, (_, i) => (
              <span key={`gap-${i}`} />
            ))}
            {data.days.map((day) => {
              const metric = day[mode],
                done = metric.done,
                total = metric.total;
              const state =
                total === 0
                  ? "none"
                  : done === total
                    ? "complete"
                    : done > 0
                      ? "partial"
                      : "incomplete";
              const label =
                state === "none"
                  ? mode === "preparation"
                    ? "Not assessed: no applicable saved checklist"
                    : "No data / not applicable"
                  : state === "complete"
                    ? "Complete"
                    : state === "partial"
                      ? "Partial"
                      : "Not completed";
              const explanation = `${day.date}: ${label}. ${done} of ${total} ${mode === "preparation" ? "checklist items" : mode === "reviews" ? "eligible closed records reviewed" : "relevant days reviewed"}.`;
              return (
                <Tooltip key={day.date}>
                  <TooltipTrigger asChild>
                    <Link
                      href={dayHref(day.date)}
                      className={`progress-heat-cell ${state}`}
                      aria-label={explanation}
                    >
                      <span>{day.date.slice(8)}</span>
                      {state === "complete" ? (
                        <Check size={11} />
                      ) : state === "partial" ? (
                        <Circle size={9} />
                      ) : state === "incomplete" ? (
                        <Minus size={11} />
                      ) : (
                        <span className="progress-no-data">·</span>
                      )}
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent className="progress-tooltip">
                    {explanation}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>
      </div>
      <div className="progress-legend">
        <span className="complete">✓ Complete</span>
        <span className="partial">○ Partial</span>
        <span className="incomplete">− Not completed</span>
        <span>· No data / not applicable</span>
      </div>
    </section>
  );
}
function GoalEditor({
  goal,
  today,
  close,
}: {
  goal: Goal | null;
  today: string;
  close: () => void;
}) {
  const [initial] = useState<GoalFields>(() =>
    goal
      ? {
          name: goal.name,
          type: goal.type,
          start: goal.start,
          end: goal.end,
          target: goal.target,
          description: goal.description,
          archived: goal.archived,
        }
      : {
          name: "",
          type: "preparation",
          start: today,
          end: shiftDay(today, 29),
          target: 10,
          description: "",
          archived: false,
        },
  );
  const [fields, setFields] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const dirty = useCallback(
    () => JSON.stringify(fields) !== JSON.stringify(initial),
    [fields, initial],
  );
  useWritingGuard(dirty);
  async function dismiss() {
    if (
      !busy &&
      (!dirty() ||
        (await confirmAction("Discard your unsaved goal changes?", {
          title: "Discard changes?",
          confirmLabel: "Discard changes",
          destructive: true,
        })))
    )
      close();
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const parsed = goalFields.safeParse(fields);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      await requestJson("/api/progress", {
        method: "POST",
        body: JSON.stringify({
          ...(goal && { id: goal.id }),
          revision: goal?.revision ?? 0,
          fields: parsed.data,
        }),
      });
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save goal.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) void dismiss();
      }}
    >
      <DialogContent
        className="progress-editor"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogTitle>
          {goal ? "Edit process goal" : "New process goal"}
        </DialogTitle>
        <DialogDescription>
          Choose a process to practice. Goal windows are independent of the
          dashboard range.
        </DialogDescription>
        <form onSubmit={save}>
          <label>
            Name
            <input
              required
              maxLength={100}
              value={fields.name}
              onChange={(e) => setFields({ ...fields, name: e.target.value })}
            />
          </label>
          <label>
            Goal type
            <select
              disabled={!!goal}
              value={fields.type}
              onChange={(e) =>
                setFields({
                  ...fields,
                  type: e.target.value as GoalFields["type"],
                })
              }
            >
              {Object.entries(goalTypes).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="progress-two">
            <label>
              Start date
              <input
                type="date"
                required
                value={fields.start}
                onChange={(e) =>
                  setFields({ ...fields, start: e.target.value })
                }
              />
            </label>
            <label>
              End date
              <input
                type="date"
                required
                min={fields.start}
                value={fields.end}
                onChange={(e) => setFields({ ...fields, end: e.target.value })}
              />
            </label>
          </div>
          <label>
            Target count
            <input
              type="number"
              required
              min={1}
              max={100000}
              step={1}
              value={Number.isNaN(fields.target) ? "" : fields.target}
              onChange={(e) =>
                setFields({ ...fields, target: e.target.valueAsNumber })
              }
            />
          </label>
          <label>
            Description (optional)
            <textarea
              maxLength={500}
              rows={3}
              value={fields.description}
              onChange={(e) =>
                setFields({ ...fields, description: e.target.value })
              }
            />
          </label>
          {goal && (
            <label className="progress-inline">
              <input
                type="checkbox"
                checked={fields.archived}
                onChange={(e) =>
                  setFields({ ...fields, archived: e.target.checked })
                }
              />
              Archived
            </label>
          )}
          <p className="muted">
            Automatic progress describes entries and records within the goal
            window, even if you finish reviewing them later. Windows support up
            to 366 days.
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <footer>
            <Button
              type="button"
              variant="outline"
              disabled={busy} aria-busy={busy}
              onClick={() => void dismiss()}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy} aria-busy={busy}>
              {busy ? <><LoadingSpinner />Saving</> : "Save goal"}
            </Button>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}
function CheckinEditor({
  goal,
  checkins,
  today,
  close,
}: {
  goal: Goal;
  checkins: Checkin[];
  today: string;
  close: () => void;
}) {
  const [date, setDate] = useState(
    today < goal.start ? goal.start : today > goal.end ? goal.end : today,
  );
  const [snapshots] = useState(checkins);
  const existing = snapshots.find(
    (c) => c.goalId === goal.id && c.date === date,
  );
  const [state, setState] = useState<Checkin["state"]>(
      existing?.state ?? "not-assessed",
    ),
    [note, setNote] = useState(existing?.note ?? ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const dirty = useCallback(
    () =>
      state !== (existing?.state ?? "not-assessed") ||
      note !== (existing?.note ?? ""),
    [state, note, existing],
  );
  useWritingGuard(dirty);
  async function discard() {
    return (
      !dirty() ||
      (await confirmAction("Discard this unsaved habit check-in?", {
        title: "Discard changes?",
        confirmLabel: "Discard changes",
        destructive: true,
      }))
    );
  }
  async function changeDate(value: string) {
    if (busy || !(await discard())) return;
    const saved = snapshots.find(
      (c) => c.goalId === goal.id && c.date === value,
    );
    setDate(value);
    setState(saved?.state ?? "not-assessed");
    setNote(saved?.note ?? "");
    setError("");
  }
  async function dismiss() {
    if (!busy && (await discard())) close();
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await requestJson("/api/progress", {
        method: "PUT",
        body: JSON.stringify({
          goalId: goal.id,
          date,
          state,
          note,
          revision: existing?.revision ?? 0,
        }),
      });
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save check-in.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) void dismiss();
      }}
    >
      <DialogContent
        className="progress-editor"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogTitle>{goal.name}</DialogTitle>
        <DialogDescription>
          One check-in per date. Missing days stay Not assessed. Dates use your
          journal display timezone.
        </DialogDescription>
        <form onSubmit={save}>
          <label>
            Check-in date
            <input
              type="date"
              required
              min={goal.start}
              max={goal.end}
              value={date}
              onChange={(e) => void changeDate(e.target.value)}
            />
          </label>
          <label>
            Habit status
            <select
              value={state}
              onChange={(e) => setState(e.target.value as Checkin["state"])}
            >
              <option value="not-assessed">Not assessed</option>
              <option value="done" disabled={date > today}>
                Done
              </option>
              <option value="not-done">Not done</option>
            </select>
          </label>
          <label>
            Note (optional)
            <textarea
              rows={4}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          {existing && (
            <p className="muted">
              Last updated {journalTimestamp(existing.updatedAt, goal.timezone)}
              .
            </p>
          )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <footer>
            <Button
              type="button"
              variant="outline"
              disabled={busy} aria-busy={busy}
              onClick={() => void dismiss()}
            >
              Cancel
            </Button>
            <Button
              disabled={busy || !date || (state === "done" && date > today)}
            >
              {busy ? <><LoadingSpinner />Saving</> : "Save check-in"}
            </Button>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function ProgressTracker() {
  const search = useSearchParams(),
    { timezone, weekStartsOn, rememberProgress } = useCalendarCache();
  const today = todayIn(timezone),
    defaults = presetRange("month", today, weekStartsOn);
  const range = {
    start: search.get("start") ?? defaults.start,
    end: search.get("end") ?? defaults.end,
  };
  const valid = rangeSchema.safeParse(range),
    query = new URLSearchParams(range).toString();
  const state = usePrivateRequest<ProgressData>(
    valid.success ? query : null,
    "/api/progress",
  );
  const data = state.data;
  const [editing, setEditing] = useState<Goal | "new" | null>(null),
    [habit, setHabit] = useState<Goal | null>(null),
    [archived, setArchived] = useState(false);
  useEffect(() => {
    rememberProgress(`/progress-tracker?${search.toString()}`);
  }, [search, rememberProgress]);
  function setRange(next: { start: string; end: string }, preset?: string) {
    const p = new URLSearchParams(next);
    if (preset) p.set("preset", preset);
    window.history.pushState(null, "", `/progress-tracker?${p}`);
  }
  const tradeHref = (extra: Record<string, string> = {}) =>
    `/trade-view?${new URLSearchParams({ mode: "real", archived: "1", ...range, dateBasis: "closed", outcomeBasis: "portions", ...extra })}`;
  return (
    <div className="progress-workspace">
      <header className="page-header">
        <div>
          <span className="eyebrow">YOUR PROCESS, OVER TIME</span>
          <h1>Progress Tracker</h1>
          <p className="muted">
            Preparation, reflection and personal goals. Across all your
            accounts, including archived accounts · {timezone}.
          </p>
        </div>
        <Button onClick={() => setEditing("new")}>
          <Plus size={16} />
          New goal
        </Button>
      </header>
      <section
        className="report-toolbar progress-range"
        aria-label="Progress date range"
      >
        <div className="progress-presets">
          {[
            ["week", "This week"],
            ["month", "This month"],
            ["30", "Last 30 days"],
          ].map(([id, label]) => (
            <button
              key={id}
              aria-pressed={
                search.get("preset") === id ||
                (!search.has("start") && id === "month")
              }
              onClick={() => setRange(presetRange(id, today, weekStartsOn), id)}
            >
              {label}
            </button>
          ))}
        </div>
        <form
          key={query}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setRange(
              { start: String(f.get("start")), end: String(f.get("end")) },
              "custom",
            );
          }}
        >
          <label>
            From
            <input
              name="start"
              type="date"
              required
              defaultValue={range.start}
            />
          </label>
          <label>
            To
            <input name="end" type="date" required defaultValue={range.end} />
          </label>
          <Button type="submit" variant="outline">
            Apply range
          </Button>
        </form>
      </section>
      {!valid.success && (
        <p role="alert" className="form-error">
          Choose a valid range of 1–366 days.
        </p>
      )}
      {state.error && (
        <div role="alert" className="form-error">
          {state.error}
          <Button variant="outline" onClick={state.refresh}>
            Retry
          </Button>
        </div>
      )}
      {!data && valid.success && !state.error && (
        <LoadingState variant="progress" label="Loading progress…" />
      )}
      {data && (
        <>
          <div className="progress-status">
            {state.pending ? <LoadingIndicator label="Updating progress" /> : "Based on saved entries and reviews"}
          </div>
          <div className="progress-summary app-loading-reveal" aria-busy={state.pending && !state.error}>
            <Metric
              label="Preparation completion"
              done={data.summary.preparation.done}
              total={data.summary.preparation.total}
              detail={
                <>
                  items · {data.summary.preparation.days} days assessed.{" "}
                  {data.summary.preparation.missing} saved days without a
                  checklist; {data.summary.preparation.activityWithoutEntry}{" "}
                  active days without an entry.
                </>
              }
              help="Completed items / all items in nonempty saved daily checklist snapshots. Missing journals and empty checklists are not preparation failures."
            />
            <Metric
              label="Trade review coverage"
              done={data.summary.reviews.done}
              total={data.summary.reviews.total}
              detail={<>records explicitly reviewed.</>}
              help={`${data.recordBasis}, selected by final close date in your display timezone. One parent record per shared-fill group; underlying portions are never counted again. Notes alone do not mark a review complete.`}
            />
            <Metric
              label="Plan adherence"
              done={data.summary.adherence.followed}
              total={data.summary.adherence.assessed}
              detail={
                <>
                  assessed records fully followed ·{" "}
                  {data.summary.adherence.partly} partly followed ·{" "}
                  {data.summary.adherence.assessed} /{" "}
                  {data.summary.adherence.total} eligible assessed.
                </>
              }
              help="Fully followed / explicitly assessed trading records. Partly followed and Did not follow remain separate; unassessed records are excluded from this percentage and shown below."
            />
            <Metric
              label="Daily review coverage"
              done={data.summary.dailyReviews.done}
              total={data.summary.dailyReviews.total}
              detail={<>relevant days reviewed.</>}
              help="Explicitly completed daily reviews / distinct dates with realized activity or a saved journal entry. A documented no-trade day can count. Empty weekends do not count."
            />
          </div>
          {!data.summary.dailyReviews.total && !data.summary.reviews.total && (
            <section className="report-card report-empty">
              <Target size={24} />
              <h2>Build a picture of your process</h2>
              <p>
                Save preparation in Day View, review your trading records, or
                start a personal goal.
              </p>
              <div className="progress-inline">
                <Link href="/imports">Import trades</Link>
                <Link href={dayHref(today)}>Prepare today</Link>
                <Link href="/trade-view?mode=real">Review trades</Link>
                <button onClick={() => setEditing("new")}>Create a goal</button>
              </div>
            </section>
          )}
          <Heatmap data={data} />
          <div className="progress-two">
            <section className="report-card">
              <h2>Preparation trend</h2>
              <p className="muted">
                Completed items / applicable items per week.
              </p>
              <WeeklyTrend weeks={data.weeks} kind="preparation" />
            </section>
            <section className="report-card">
              <h2>Trade review trend</h2>
              <p className="muted">
                Explicitly reviewed / eligible closed records per week.
              </p>
              <WeeklyTrend weeks={data.weeks} kind="reviews" />
            </section>
          </div>
          <div className="progress-two">
            <section className="report-card">
              <h2>Plan adherence</h2>
              <p className="muted">
                {data.recordBasis} · {data.summary.adherence.assessed} /{" "}
                {data.summary.adherence.total} assessed.
              </p>
              <div className="progress-adherence">
                {(
                  [
                    ["followed", "Followed"],
                    ["partly", "Partly followed"],
                    ["not-followed", "Did not follow"],
                    ["unassessed", "Not assessed"],
                  ] as const
                ).map(([id, label]) => (
                  <div key={id}>
                    <span>{label}</span>
                    <strong>{data.summary.adherence[id]}</strong>
                    {id !== "unassessed" ? (
                      <Link
                        href={tradeHref({ adherence: id })}
                        aria-label={`View ${label.toLowerCase()} records`}
                      >
                        View records →
                      </Link>
                    ) : (
                      <Link href={tradeHref({ reviewMissing: "adherence" })}>
                        View records →
                      </Link>
                    )}
                  </div>
                ))}
              </div>
              <Link href={dayHref(today)}>Open Day View →</Link>
            </section>
            <section className="report-card">
              <h2>Recorded mistakes</h2>
              <p className="muted">
                Distinct tagged records. Shares use only reviewed records;
                missing tags do not prove no mistake occurred.
              </p>
              {!data.recordedMistakes.length ? (
                <p className="muted">
                  No recorded mistakes in this or the previous period.
                </p>
              ) : (
                <div className="progress-mistakes">
                  {data.recordedMistakes.map((m) => (
                    <article key={m.id}>
                      <Link href={tradeHref({ mistake: m.id })}>{m.name}</Link>
                      <strong>{m.count} records</strong>
                      <p>
                        {m.reviewed} / {m.denominator} reviewed records ·{" "}
                        {m.rate === null ? "No data" : `${m.rate.toFixed(1)}%`}
                      </p>
                      <small>
                        {m.change === null
                          ? "Comparison unavailable: both periods need reviewed records."
                          : `${m.change > 0 ? "+" : ""}${m.change.toFixed(1)} percentage points vs previous period (${m.previousReviewed} / ${m.previousDenominator} reviewed; ${m.reviewed} / ${m.denominator} now).`}
                      </small>
                    </article>
                  ))}
                </div>
              )}
              <p className="muted">
                Previous equal-length period: {data.previous.start} –{" "}
                {data.previous.end}.
              </p>
            </section>
          </div>
          <section className="report-card" id="goals">
            <header className="progress-section-header">
              <div>
                <h2>Personal goals</h2>
                <p className="muted">
                  Each goal uses its own dates, independently of the dashboard
                  range. Automatic counts reflect the entry or close date, even
                  when reviewed later.
                </p>
              </div>
              <label className="progress-inline">
                <input
                  type="checkbox"
                  checked={archived}
                  onChange={(e) => setArchived(e.target.checked)}
                />
                Show archived
              </label>
            </header>
            <div className="progress-goals">
              {data.goals
                .filter((g) => archived || !g.archived)
                .map((g) => (
                  <article
                    className={`progress-goal ${search.get("goal") === g.id ? "highlighted" : ""}`}
                    key={g.id}
                  >
                    <div className="progress-section-header">
                      <h3>{g.name}</h3>
                      <span className="badge">
                        {g.archived ? "Archived" : g.status}
                      </span>
                    </div>
                    <p className="muted">{goalTypes[g.type]}</p>
                    {g.description && <p>{g.description}</p>}
                    <strong>
                      {g.count} / {g.target}
                    </strong>
                    <progress
                      max={g.target}
                      value={Math.min(g.count, g.target)}
                      aria-label={`${g.name}: ${g.count} of ${g.target}`}
                    />
                    <p>
                      {g.start} – {g.end}
                    </p>
                    <small>
                      {g.status === "Active" || g.status === "Upcoming"
                        ? `${g.remaining} days ${g.status === "Upcoming" ? "in goal window" : "remaining, including today"}`
                        : g.status}
                    </small>
                    <div className="progress-inline">
                      <Button variant="outline" onClick={() => setEditing(g)}>
                        Edit{g.archived ? " / unarchive" : " / archive"}
                      </Button>
                      {g.type === "habit" && !g.archived && (
                        <Button onClick={() => setHabit(g)}>Check in</Button>
                      )}
                    </div>
                    {g.type === "habit" && (
                      <details>
                        <summary>
                          Saved check-ins (
                          {
                            data.checkins.filter((c) => c.goalId === g.id)
                              .length
                          }
                          )
                        </summary>
                        <ul>
                          {data.checkins
                            .filter((c) => c.goalId === g.id)
                            .sort((a, b) => b.date.localeCompare(a.date))
                            .map((c) => (
                              <li key={c.date}>
                                {c.date}:{" "}
                                {c.state === "done"
                                  ? "Done"
                                  : c.state === "not-done"
                                    ? "Not done"
                                    : "Not assessed"}
                                {c.note && <p>{c.note}</p>}
                              </li>
                            ))}
                        </ul>
                      </details>
                    )}
                  </article>
                ))}
            </div>
            {!data.goals.some((g) => archived || !g.archived) && (
              <p className="muted">
                No {archived ? "saved" : "active"} goals yet. Choose one process
                you want to practice.
              </p>
            )}
            <Button variant="outline" onClick={() => setEditing("new")}>
              <Plus size={16} />
              Create a goal
            </Button>
          </section>
          <section className="report-card">
            <h2>Recent activity</h2>
            <p className="muted">
              Latest saved updates to currently reviewed entries and habit
              check-ins associated with dates in this range. These are update
              times, not first-completion times.
            </p>
            {data.recent.length ? (
              <ul className="progress-recent">
                {data.recent.map((a) => (
                  <li key={a.id}>
                    <Link href={a.href}>
                      {a.label}
                      <small>For {a.date}</small>
                    </Link>
                    <time dateTime={a.at}>
                      {journalTimestamp(a.at, data.timezone)}
                    </time>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">
                No saved review or habit updates for this range.
              </p>
            )}
          </section>
        </>
      )}
      {editing !== null && (
        <GoalEditor
          goal={editing === "new" ? null : editing}
          today={today}
          close={() => setEditing(null)}
        />
      )}
      {habit && data && (
        <CheckinEditor
          goal={habit}
          checkins={data.checkins}
          today={today}
          close={() => setHabit(null)}
        />
      )}
    </div>
  );
}
