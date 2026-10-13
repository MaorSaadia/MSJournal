"use client";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { usePrivateRequest } from "@/components/calendar/cache-provider";
import { requestJson } from "@/lib/client-api";
import { emptyPlaybook, type StrategyData } from "@/lib/strategies/model";
import { journalTimestamp } from "@/lib/timezones";
export type StrategyList = {
  userId: string;
  timezone: string;
  strategies: {
    id: string;
    name: string;
    description: string;
    color: string | null;
    revision: number;
    archived: boolean;
    updatedAt: string;
    linked: number;
    unresolved: number;
  }[];
};
export function StrategyIndex() {
  const search = useSearchParams(),
    router = useRouter(),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const query = new URLSearchParams({
      search: search.get("search") ?? "",
      archived: search.get("archived") ?? "active",
    }).toString(),
    state = usePrivateRequest<StrategyList>(query, "/api/strategies");
  async function create() {
    setError("");
    setBusy(true);
    try {
      const data = await requestJson<StrategyData>("/api/strategies", {
        method: "POST",
        body: JSON.stringify({
          revision: 0,
          fields: { ...emptyPlaybook(), name },
        }),
      });
      router.push(`/strategies/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create strategy.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="playbook-workspace">
      <header className="page-header">
        <div>
          <span className="eyebrow">PERSONAL SETUPS</span>
          <h1>Strategies</h1>
          <p className="muted">
            One named setup, with its instructions and examples.
          </p>
        </div>
        <Link href="/trade-view/review-recovery">Assignment recovery</Link>
      </header>
      <div className="playbook-toolbar">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const p = new URLSearchParams();
            new FormData(e.currentTarget).forEach((v, k) =>
              p.set(k, String(v)),
            );
            window.history.pushState(null, "", `/strategies?${p}`);
          }}
        >
          <input
            aria-label="Search strategies"
            name="search"
            placeholder="Search by name"
            defaultValue={search.get("search") ?? ""}
          />
          <select
            aria-label="Strategy archive filter"
            name="archived"
            defaultValue={search.get("archived") ?? "active"}
          >
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="all">All strategies</option>
          </select>
          <button>Search</button>
        </form>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <input
            aria-label="New strategy name"
            placeholder="Name your setup"
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button disabled={busy || !name.trim()}>Create strategy</button>
        </form>
      </div>
      {error && <p role="alert">{error}</p>}
      {state.error ? (
        <p role="alert">
          {state.error}
          <button onClick={state.refresh}>Retry</button>
        </p>
      ) : !state.data ? (
        <p role="status">Loading strategies…</p>
      ) : !state.data.strategies.length ? (
        <section className="playbook-card">
          <h2>Your playbook starts with one setup</h2>
          <p>
            Create a named strategy above, or change the search/filter. Only its
            name is required.
          </p>
        </section>
      ) : (
        <div className="playbook-grid">
          {state.data.strategies.map((s) => (
            <article
              className={`playbook-card accent-${s.color ?? "violet"}`}
              key={s.id}
            >
              <h2>{s.name}</h2>
              <p>{s.description || "Add instructions in your playbook."}</p>
              <p className="muted">
                {s.linked} resolved linked journal records
                {s.unresolved ? ` · ${s.unresolved} need recovery` : ""} ·{" "}
                {s.archived ? "Archived" : "Active"}
              </p>
              <small>
                Updated {journalTimestamp(s.updatedAt, state.data!.timezone)} ·
                revision {s.revision}
              </small>
              <div className="playbook-actions">
                <Link href={`/strategies/${s.id}`}>Open playbook</Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
