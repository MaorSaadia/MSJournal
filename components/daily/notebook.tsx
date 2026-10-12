"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { usePrivateRequest } from "@/components/calendar/cache-provider";
import { requestJson } from "@/lib/client-api";
import { todayIn } from "@/lib/calendar/model";
import type { DailyFields } from "@/lib/daily/model";
import { useWritingGuard } from "./writing-guard";
type Template = { revision: number; items: DailyFields["checklist"] };
function ChecklistDefaults() {
  const [saved, setSaved] = useState<Template | null>(null),
    [items, setItems] = useState<Template["items"]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const dirty = useCallback(
    () => !!saved && JSON.stringify(items) !== JSON.stringify(saved.items),
    [saved, items],
  );
  useWritingGuard(dirty);
  async function load() {
    try {
      const value = await requestJson<Template>("/api/daily/template");
      setSaved(value);
      setItems(value.items);
      setError("");
      setMessage("");
    } catch {
      setError("Could not load checklist defaults. Retry.");
    }
  }
  useEffect(() => {
    let active = true;
    void requestJson<Template>("/api/daily/template")
      .then((value) => {
        if (active) {
          setSaved(value);
          setItems(value.items);
        }
      })
      .catch(() => {
        if (active) setError("Could not load checklist defaults. Retry.");
      });
    return () => {
      active = false;
    };
  }, []);
  async function save() {
    if (!saved) return;
    setBusy(true);
    setError("");
    try {
      const value = await requestJson<Template>("/api/daily/template", {
        method: "POST",
        body: JSON.stringify({ revision: saved.revision, items }),
      });
      setSaved(value);
      setItems(value.items);
      setMessage("Defaults saved. Existing entries keep their checklist.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Save failed; your edits are kept.",
      );
    } finally {
      setBusy(false);
    }
  }
  function move(index: number, step: number) {
    const copy = [...items];
    [copy[index], copy[index + step]] = [copy[index + step], copy[index]];
    setItems(copy);
  }
  return (
    <section className="daily-panel">
      <h2>Default personal checklist</h2>
      <p className="muted">
        Used for new entries. Historical checklist text and completion stay
        unchanged.
      </p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!saved ? (
        <button onClick={() => void load()}>Load defaults</button>
      ) : (
        <fieldset disabled={busy}>
          {items.map((item, index) => (
            <div className="daily-template-item" key={item.id}>
              <input
                aria-label={`Default checklist item ${index + 1}`}
                value={item.text}
                maxLength={200}
                onChange={(e) =>
                  setItems(
                    items.map((i) =>
                      i.id === item.id ? { ...i, text: e.target.value } : i,
                    ),
                  )
                }
              />
              <button
                aria-label={`Move item ${index + 1} up`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                ↑
              </button>
              <button
                aria-label={`Move item ${index + 1} down`}
                disabled={index === items.length - 1}
                onClick={() => move(index, 1)}
              >
                ↓
              </button>
              <button
                aria-label={`Remove item ${index + 1}`}
                onClick={() => setItems(items.filter((i) => i.id !== item.id))}
              >
                Remove
              </button>
            </div>
          ))}
          <div className="daily-actions">
            <button
              disabled={items.length >= 20}
              onClick={() =>
                setItems([
                  ...items,
                  { id: crypto.randomUUID(), text: "", checked: false },
                ])
              }
            >
              Add checklist item
            </button>
            <button disabled={!dirty()} onClick={() => void save()}>
              {busy ? "Saving…" : "Save checklist defaults"}
            </button>
            <button
              onClick={() => {
                if (
                  !dirty() ||
                  window.confirm(
                    "Discard your unsaved checklist changes and load current defaults?",
                  )
                )
                  void load();
              }}
            >
              Reload defaults
            </button>
          </div>
        </fieldset>
      )}
    </section>
  );
}
type NotebookData = {
  userId: string;
  timezone: string;
  page: number;
  total: number;
  entries: {
    date: string;
    timezone: string;
    status: string;
    excerpt: string;
    mood: string | null;
    completed: number;
    checklistCount: number;
  }[];
};
export function Notebook() {
  const search = useSearchParams(),
    page = Math.max(1, Number(search.get("page")) || 1);
  const query = new URLSearchParams({
    q: search.get("q") ?? "",
    status: search.get("status") ?? "all",
    page: String(page),
    ...(search.get("start") ? { start: search.get("start")! } : {}),
    ...(search.get("end") ? { end: search.get("end")! } : {}),
  }).toString();
  const state = usePrivateRequest<NotebookData>(query, "/api/daily"),
    data = state.data;
  const [showDefaults, setShowDefaults] = useState(
    search.get("defaults") === "1",
  );
  const href = (value: number) => {
    const params = new URLSearchParams(search.toString());
    params.set("page", String(value));
    return `/notebook?${params}`;
  };
  return (
    <div className="daily-workspace notebook-workspace">
      <header className="page-header">
        <div>
          <span className="eyebrow">YOUR DAILY WRITING</span>
          <h1>Notebook</h1>
          <p className="muted">
            Preparation, observations and reflection, across your accounts.
          </p>
        </div>
        <div className="daily-actions">
          <Link className="button-primary" href="/day-view">
            Start today&apos;s entry
          </Link>
          <button onClick={() => setShowDefaults(true)}>
            Edit checklist defaults
          </button>
        </div>
      </header>
      {showDefaults && <ChecklistDefaults />}
      <form
        className="daily-panel notebook-filters"
        onSubmit={(event) => {
          event.preventDefault();
          const params = new URLSearchParams();
          new FormData(event.currentTarget).forEach((value, key) => {
            if (value) params.set(key, String(value));
          });
          window.history.pushState(null, "", `/notebook?${params}`);
        }}
      >
        <label>
          Search writing
          <input
            name="q"
            aria-label="Search daily writing"
            defaultValue={search.get("q") ?? ""}
            maxLength={200}
          />
        </label>
        <label>
          From
          <input
            name="start"
            aria-label="Notebook start date"
            type="date"
            defaultValue={search.get("start") ?? ""}
          />
        </label>
        <label>
          To
          <input
            name="end"
            aria-label="Notebook end date"
            type="date"
            defaultValue={search.get("end") ?? ""}
          />
        </label>
        <label>
          Status
          <select
            name="status"
            aria-label="Notebook status"
            defaultValue={search.get("status") ?? "all"}
          >
            <option value="all">All entries</option>
            <option value="draft">Draft</option>
            <option value="reviewed">Reviewed</option>
          </select>
        </label>
        <button type="submit">Search</button>
      </form>
      {state.error ? (
        <div role="alert">
          {state.error}
          <button onClick={state.refresh}>Retry Notebook</button>
        </div>
      ) : !data ? (
        <p role="status">Loading entries…</p>
      ) : (
        <>
          <p className="muted">
            {data.total} matching {data.total === 1 ? "entry" : "entries"}
          </p>
          {data.entries.length === 0 ? (
            <section className="daily-panel">
              <h2>
                {data.total
                  ? "No entries on this page"
                  : "A little preparation for your next session"}
              </h2>
              <p>
                {data.total
                  ? "Return to an earlier page."
                  : "Start a daily entry, or adjust the search to revisit your writing."}
              </p>
              <Link href={`/day-view?date=${todayIn(data.timezone)}`}>
                Start today&apos;s entry →
              </Link>
            </section>
          ) : (
            <div className="notebook-list">
              {data.entries.map((entry) => (
                <Link
                  className="daily-panel notebook-entry"
                  href={`/day-view?date=${entry.date}&from=${encodeURIComponent(`/notebook?${search}`)}`}
                  key={entry.date}
                >
                  <div className="daily-actions">
                    <strong>{entry.date}</strong>
                    <span className="badge">
                      {entry.status === "reviewed" ? "Reviewed" : "Draft"}
                    </span>
                  </div>
                  <p>
                    {entry.excerpt || "Checklist or daily reflection saved."}
                  </p>
                  <small>
                    {entry.timezone} · {entry.completed} of{" "}
                    {entry.checklistCount} completed
                    {entry.mood ? ` · ${entry.mood}` : ""}
                  </small>
                </Link>
              ))}
            </div>
          )}
          <nav className="daily-navigation" aria-label="Notebook pages">
            {page > 1 && <Link href={href(page - 1)}>← Previous page</Link>}
            <span>
              Page {page} of {Math.max(1, Math.ceil(data.total / 20))}
            </span>
            {page * 20 < data.total && (
              <Link href={href(page + 1)}>Next page →</Link>
            )}
          </nav>
        </>
      )}
    </div>
  );
}
