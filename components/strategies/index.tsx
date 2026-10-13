"use client";
import { confirmAction } from "@/components/ui/confirm-action";
import { Plus, BookOpen, Sparkles } from "lucide-react";
import { StrategyBuilder, type BuilderOptions } from "./builder";
import type {
  TemplateList,
  PersonalTemplate,
} from "@/lib/strategies/template-service";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { usePrivateRequest } from "@/components/calendar/cache-provider";
import { requestJson } from "@/lib/client-api";
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
    [builder, setBuilder] = useState<BuilderOptions | null>(null),
    [view, setView] = useState("strategies"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const query = new URLSearchParams({
      search: search.get("search") ?? "",
      archived: search.get("archived") ?? "active",
    }).toString(),
    state = usePrivateRequest<StrategyList>(query, "/api/strategies");
  const templates = usePrivateRequest<TemplateList>(
    "",
    "/api/strategies/templates",
  );
  async function removeTemplate(template: PersonalTemplate) {
    if (
      !(await confirmAction(
        "Delete this reusable template? Strategies already created from it are kept.",
      ))
    )
      return;
    setBusy(true);
    setError("");
    try {
      await requestJson("/api/strategies/templates", {
        method: "DELETE",
        body: JSON.stringify({
          id: template.id,
          revision: template.revision,
          confirmed: true,
        }),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete template.");
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
            Your setups, rules and confirmations. Start with a template or make
            your own.
          </p>
        </div>
        <div className="playbook-actions">
          <Link href="/trade-view/review-recovery">Assignment recovery</Link>
          <button
            className="strategy-new-button"
            onClick={() => setBuilder({ purpose: "strategy" })}
          >
            <Plus size={16} />
            New strategy
          </button>
        </div>
      </header>
      <nav className="strategy-library-tabs" aria-label="Strategy library">
        <button
          aria-pressed={view === "strategies"}
          onClick={() => setView("strategies")}
        >
          My strategies
        </button>
        <button
          aria-pressed={view === "templates"}
          onClick={() => setView("templates")}
        >
          <BookOpen size={14} />
          My templates
        </button>
      </nav>
      {view === "strategies" && (
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
          <button
            className="template-library-link"
            onClick={() => setBuilder({ purpose: "strategy" })}
          >
            <Sparkles size={16} />
            Browse ready templates
          </button>
        </div>
      )}
      {view === "templates" && (
        <section>
          <div className="template-personal-header">
            <div>
              <h2>Reusable personal templates</h2>
              <p className="muted">
                Save your preferred structure once. Each strategy you create is
                an independent copy.
              </p>
            </div>
            <button onClick={() => setBuilder({ purpose: "template" })}>
              <Plus size={15} />
              New template
            </button>
          </div>
          {templates.error ? (
            <p role="alert">
              {templates.error}
              <button onClick={templates.refresh}>Retry templates</button>
            </p>
          ) : !templates.data ? (
            <p role="status">Loading templates...</p>
          ) : !templates.data.templates.length ? (
            <div className="playbook-card template-personal-empty">
              <BookOpen size={24} />
              <h3>Your own starting points</h3>
              <p>
                Create a personal template, or save an existing playbook as a
                template.
              </p>
              <button onClick={() => setBuilder({ purpose: "template" })}>
                Create my first template
              </button>
            </div>
          ) : (
            <div className="playbook-grid">
              {templates.data.templates.map((t) => (
                <article
                  className={`playbook-card accent-${t.fields.color ?? "violet"}`}
                  key={t.id}
                >
                  <h2>{t.fields.name}</h2>
                  <p>
                    {t.fields.description ||
                      "Your reusable strategy structure."}
                  </p>
                  <small>
                    {t.fields.checklist.length} confirmations · private template
                  </small>
                  <div className="playbook-actions">
                    <button
                      onClick={() =>
                        setBuilder({ purpose: "strategy", seed: t.fields })
                      }
                    >
                      Use template
                    </button>
                    <button
                      onClick={() =>
                        setBuilder({ purpose: "template", template: t })
                      }
                    >
                      Edit template
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => void removeTemplate(t)}
                    >
                      Delete template
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
      {error && <p role="alert">{error}</p>}
      {view === "strategies" &&
        (state.error ? (
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
              Pick a ready template or create your own setup. Only its name is
              required.
            </p>
            <button
              className="strategy-new-button"
              onClick={() => setBuilder({ purpose: "strategy" })}
            >
              <Plus size={16} />
              Create your first strategy
            </button>
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
                  {s.unresolved
                    ? ` · ${s.unresolved} need recovery`
                    : ""} · {s.archived ? "Archived" : "Active"}
                </p>
                <small>
                  Updated {journalTimestamp(s.updatedAt, state.data!.timezone)}{" "}
                  · revision {s.revision}
                </small>
                <div className="playbook-actions">
                  <Link href={`/strategies/${s.id}`}>Open playbook</Link>
                </div>
              </article>
            ))}
          </div>
        ))}
      {builder && (
        <StrategyBuilder
          options={builder}
          close={() => setBuilder(null)}
          created={(id) => {
            setBuilder(null);
            router.push(`/strategies/${id}`);
          }}
          saved={() => {
            setBuilder(null);
            setView("templates");
          }}
        />
      )}
    </div>
  );
}
