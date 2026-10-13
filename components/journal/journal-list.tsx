"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TradeCsvExport } from "@/components/exports/download-controls";
import {
  useCalendarCache,
  usePrivateRequest,
} from "@/components/calendar/cache-provider";
import { ProcessButton } from "./actions";
import { Help } from "@/components/dashboard/panel";
import {
  viewSchema,
  type TradeViewData,
  type ViewRecord,
} from "@/lib/journal/view-model";
import { D } from "@/lib/journal/processing";
import { journalMoney } from "@/lib/journal/calculations";
import { journalTimestamp } from "@/lib/timezones";

import type { StrategyList } from "@/components/strategies/index";
import { emotions, stages, mistakes } from "@/lib/reviews/model";
const columns = [
  ["exit", "Close time"],
  ["account", "Account"],
  ["symbol", "Contract"],
  ["direction", "Direction"],
  ["quantity", "Closed qty"],
  ["entryPrice", "Entry price"],
  ["exitPrice", "Exit price"],
  ["duration", "Duration"],
  ["gross", "Gross P&L"],
  ["fees", "Fees"],
  ["net", "Net P&L"],
  ["entry", "Entry time"],
  ["type", "Record type"],
  ["status", "Grouping status"],
  ["feeKind", "Fee source"],
  ["imported", "Imported"],
  ["reviewStatus", "Review status"],
  ["strategyName", "Strategy"],
] as const;
const defaults = columns.slice(0, 11).map((c) => c[0]) as string[];
const chipLabels: Record<string, string> = {
  strategy: "Strategy",
  weekday: "Local exit weekday",
  hour: "Local entry hour",
  holding: "Holding duration",
  mistakes: "Any selected mistake",
  reviewMissing: "Not recorded",
  outcomeBasis: "Statistics basis",
  review: "Review",
  mistake: "Mistake",
  emotion: "Emotion",
  emotionStage: "Emotion stage",
  adherence: "Plan adherence",
  accounts: "Accounts",
  archived: "Archived accounts",
  start: "From",
  end: "Through",
  search: "Search",
  symbol: "Contract",
  root: "Product",
  direction: "Direction",
  outcome: "Outcome",
  type: "Record type",
  status: "Grouping",
  min: "Minimum P&L",
  max: "Maximum P&L",
  dateBasis: "Date basis",
  basis: "P&L basis",
};
const chipValues: Record<string, string> = {
  activity: "Realized activity in range",
  closed: "Closed in range",
  net: "Net",
  gross: "Gross",
  trade: "Complete trades",
  portion: "Closed portions",
  matched: "Matched portions",
  review: "Needs review",
  profit: "Profitable",
  loss: "Losing",
  zero: "Breakeven",
  long: "Long",
  short: "Short",
  unknown: "Unknown",
};
const subscribe = (fn: () => void) => {
  window.addEventListener("msjournal:table-preferences", fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener("msjournal:table-preferences", fn);
    window.removeEventListener("storage", fn);
  };
};
function useTablePreferences(userId: string) {
  const key = `msjournal:table:${userId}`;
  const raw = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    () => null,
  );
  let visible = defaults,
    density = "comfortable";
  try {
    const stored = JSON.parse(raw ?? "null");
    if (
      Array.isArray(stored?.visible) &&
      stored.visible.length &&
      stored.visible.every((v: string) => columns.some((c) => c[0] === v))
    )
      visible = stored.visible;
    if (stored?.density === "compact") density = "compact";
  } catch {}
  const save = (v: string[], d: string) => {
    try {
      localStorage.setItem(key, JSON.stringify({ visible: v, density: d }));
      window.dispatchEvent(new Event("msjournal:table-preferences"));
    } catch {}
  };
  return { visible, density, save };
}
function Search({
  value,
  change,
}: {
  value: string;
  change: (value: string) => void;
}) {
  const [text, setText] = useState(value),
    latest = useRef(change);
  useEffect(() => {
    latest.current = change;
  }, [change]);
  useEffect(() => {
    if (text === value) return;
    const timer = setTimeout(() => latest.current(text), 300);
    return () => clearTimeout(timer);
  }, [text, value]);
  return (
    <label className="field-label tv-search">
      Search
      <input
        aria-label="Search contract or account"
        placeholder="Contract or account name"
        value={text}
        maxLength={100}
        onChange={(e) => setText(e.target.value)}
      />
      <span className="sr-only">
        Searches contracts and account display names.
      </span>
    </label>
  );
}
export function JournalList() {
  const search = useSearchParams(),
    router = useRouter(),
    { userId, timezone, rememberTrades, scrollPositions } = useCalendarCache();
  const query = search.toString(),
    parsed = viewSchema.safeParse(Object.fromEntries(search)),
    q = parsed.success ? parsed.data : viewSchema.parse({});
  const state = usePrivateRequest<TradeViewData>(query, "/api/journal"),
    data = state.data;
  const strategyOptions = usePrivateRequest<StrategyList>(
    q.mode === "real" ? "archived=all" : null,
    "/api/strategies",
  );
  const prefs = useTablePreferences(userId);
  const restored = useRef<string | null>(null);
  const href = `/trade-view${query ? "?" + query : ""}`,
    scrollKey = `${userId}:${timezone}:${href}`;
  useEffect(() => {
    rememberTrades(href);
  }, [href, rememberTrades]);
  useEffect(() => {
    if (!data || restored.current === scrollKey) return;
    restored.current = scrollKey;
    const position = scrollPositions.get(scrollKey);
    if (position !== undefined) {
      const frame = requestAnimationFrame(() =>
        window.scrollTo(0, Number(position)),
      );
      return () => cancelAnimationFrame(frame);
    }
  }, [scrollKey, data, scrollPositions]);
  function update(key: string, value: string) {
    const next = new URLSearchParams(query);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    if (key === "archived") next.delete("accounts");
    window.history.pushState(null, "", `/trade-view?${next}`);
  }
  function clear() {
    window.history.pushState(
      null,
      "",
      `/trade-view${q.mode === "demo" ? "?mode=demo" : ""}`,
    );
  }
  function detailHref(id: string) {
    return `/trade-view/${id}?${new URLSearchParams({ ...Object.fromEntries(search), from: href })}`;
  }
  function rememberPosition() {
    if (scrollPositions.size >= 24)
      scrollPositions.delete(scrollPositions.keys().next().value!);
    scrollPositions.set(scrollKey, window.scrollY);
  }
  const control = (key: string, label: string, choices: [string, string][]) => (
    <label className="field-label" key={key}>
      {label}
      <select
        value={search.get(key) ?? choices[0][0]}
        onChange={(e) => update(key, e.target.value)}
      >
        {choices.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
  const cell = (r: ViewRecord, key: string) => {
    if (key === "strategyName")
      return r.strategyId ? (
        <Link
          href={`/strategies/${r.strategyId}`}
          onClick={(e) => e.stopPropagation()}
        >
          {r.strategyName}
        </Link>
      ) : (
        "Unassigned"
      );
    const value = r[key as keyof ViewRecord];
    if (value === null) return "—";
    if (["gross", "fees", "net"].includes(key))
      return journalMoney(value as string | null, key !== "fees");
    if (["entry", "exit", "imported"].includes(key))
      return journalTimestamp(value as string | null, timezone);
    if (key === "duration")
      return value === null
        ? "—"
        : `${new D(value as string).div(60).toDecimalPlaces(1)}m`;
    if (["entryPrice", "exitPrice", "quantity"].includes(key))
      return value === null
        ? "—"
        : new D(value as string).toDecimalPlaces(8).toFixed();
    if (key === "type") return r.type === "trade" ? "Trade" : "Closed portion";
    if (key === "direction")
      return <span className={`tv-badge ${r.direction}`}>{r.direction}</span>;
    return (value as string) ?? "—";
  };
  const summary = data?.summary;
  return (
    <div
      className={`accounts-page journal-page trade-view tv-${prefs.density}`}
    >
      {q.dashboardFrom && (
        <Link href={q.dashboardFrom} prefetch={false} className="back-link">
          ← Back to dashboard
        </Link>
      )}
      {q.reportFrom && (
        <Link href={q.reportFrom} prefetch={false} className="back-link">
          ← Back to Reports
        </Link>
      )}
      <header className="page-header">
        <div>
          <div className="breadcrumb">Workspace / Trade View</div>
          <h1>
            Trade View<span className="title-dot">.</span>
          </h1>
          <p className="muted">
            Your trading history, in focus.
            {q.mode === "demo" && <span className="tv-badge">Demo data</span>}
          </p>
        </div>
        <div className="export-actions">
          <TradeCsvExport query={query} disabled={!parsed.success || !data} />
          <Button asChild variant="outline">
            <Link href="/imports">Import trades</Link>
          </Button>
        </div>
      </header>
      <div className="tv-summary" aria-live="polite" aria-busy={!data}>
        {summary ? (
          <>
            <div>
              <small>
                {q.dateBasis === "activity" ? "P&L in range · " : ""}
                {q.basis === "gross"
                  ? "Gross P&L"
                  : summary.estimated
                    ? "Estimated net P&L"
                    : "Net P&L"}{" "}
                · USD
              </small>
              <strong>
                {journalMoney(
                  q.basis === "gross" ? summary.gross : summary.net,
                  true,
                )}
              </strong>
            </div>
            <div>
              <small>Complete trades</small>
              <strong>{summary.trades}</strong>
            </div>
            {summary.portions > 0 && (
              <div title="Reported closed portions and shared-fill groups do not establish complete flat-to-flat trades.">
                <small>Closed-portion records</small>
                <strong>{summary.portions}</strong>
              </div>
            )}
            {summary.winRate !== null && (
              <div>
                <small>Trade win rate</small>
                <strong>{summary.winRate}%</strong>
              </div>
            )}
            {summary.net === null && (
              <p className="small muted">
                Incomplete fee coverage ({summary.covered}/{summary.count}{" "}
                records). Gross {journalMoney(summary.gross, true)} remains
                available.
              </p>
            )}
          </>
        ) : (
          <span className="muted">Loading filtered summary…</span>
        )}
      </div>
      <div className="tv-toolbar">
        <Search
          key={q.search}
          value={q.search}
          change={(v) => update("search", v)}
        />
        {q.outcomeBasis === "portions" && data?.summary.statistics && (
          <p className="dashboard-scope-note">
            {data.summary.statistics.count} closed portions ·{" "}
            {data.summary.statistics.winRate === null
              ? "Unavailable"
              : `${data.summary.statistics.winRate}%`}{" "}
            winning portions · profit factor · portions:{" "}
            {data.summary.statistics.profitFactor ??
              data.summary.statistics.profitFactorNote.replaceAll(
                "trades",
                "portions",
              )}{" "}
            · average winning/losing portion:{" "}
            {journalMoney(data.summary.statistics.averageWin, true)} /{" "}
            {journalMoney(data.summary.statistics.averageLoss, true)}
          </p>
        )}
        {q.mode === "real" &&
          control("strategy", "Strategy", [
            ["", "All strategies"],
            ["unassigned", "Unassigned"],
            ...(strategyOptions.data?.strategies.map(
              (s) =>
                [s.id, s.name + (s.archived ? " (archived)" : "")] as [
                  string,
                  string,
                ],
            ) ?? []),
          ])}
        <details className="tv-menu">
          <summary>
            Accounts
            {q.accounts !== undefined
              ? ` (${q.accounts.split(",").filter(Boolean).length})`
              : ""}
          </summary>
          <div>
            <label>
              <input
                type="checkbox"
                checked={q.archived === "1"}
                onChange={(e) =>
                  update("archived", e.target.checked ? "1" : "0")
                }
              />{" "}
              Include archived accounts
            </label>
            <button onClick={() => update("accounts", "")}>
              All available accounts
            </button>
            {data?.accounts
              .filter((a) => q.archived === "1" || !a.archived)
              .map((a) => (
                <label key={a.id}>
                  <input
                    type="checkbox"
                    checked={
                      q.accounts === undefined ||
                      q.accounts.split(",").includes(a.id)
                    }
                    onChange={(e) => {
                      const ids =
                        q.accounts === undefined
                          ? data.accounts
                              .filter((a) => q.archived === "1" || !a.archived)
                              .map((a) => a.id)
                          : q.accounts.split(",").filter(Boolean);
                      const next = new URLSearchParams(query);
                      next.set(
                        "accounts",
                        (e.target.checked
                          ? [...ids, a.id]
                          : ids.filter((id) => id !== a.id)
                        ).join(","),
                      );
                      next.delete("page");
                      window.history.pushState(null, "", `/trade-view?${next}`);
                    }}
                  />
                  {a.name}
                  {a.archived ? " · Archived" : ""}
                </label>
              ))}
          </div>
        </details>
        <label className="field-label">
          From
          <input
            type="date"
            value={q.start ?? ""}
            max={q.end}
            onChange={(e) => update("start", e.target.value)}
          />
        </label>
        <label className="field-label">
          Through
          <input
            type="date"
            value={q.end ?? ""}
            min={q.start}
            onChange={(e) => update("end", e.target.value)}
          />
        </label>
        <div
          className="tv-date-basis"
          title={`Dates use ${timezone}. Closed in range uses the full result at final close. Realized activity includes only portions exiting in range.`}
        >
          <Help
            label="Date basis"
            text={`Dates use ${timezone}. Closed in range includes the full result at final close. Realized activity includes only portions exiting in range.`}
          />
          {control("dateBasis", "Date basis", [
            ["closed", "Closed in range"],
            ["activity", "Realized activity in range"],
          ])}
        </div>
        {control("outcomeBasis", "Statistics basis", [
          ["portions", "Closed portions"],
          ["complete", "Complete trades"],
        ])}
        {control("basis", "P&L basis", [
          ["gross", "Gross"],
          ["net", "Net"],
        ])}
        <details className="tv-menu">
          <summary>More filters</summary>
          <div className="tv-advanced">
            <label className="field-label">
              Exact contract
              <input
                value={q.symbol ?? ""}
                maxLength={80}
                onChange={(e) => update("symbol", e.target.value)}
                placeholder="e.g. MNQH6"
              />
            </label>
            <label className="field-label">
              Product / root
              <input
                value={q.root ?? ""}
                maxLength={20}
                onChange={(e) => update("root", e.target.value.toUpperCase())}
                placeholder="e.g. MNQ"
              />
            </label>
            {control("direction", "Direction", [
              ["all", "All directions"],
              ["long", "Long"],
              ["short", "Short"],
              ["unknown", "Unknown"],
            ])}
            {control("outcome", "Outcome", [
              ["all", "All outcomes"],
              ["profit", "Profitable"],
              ["loss", "Losing"],
              ["zero", "Breakeven"],
            ])}
            {control("type", "Record type", [
              ["all", "All records"],
              ["trade", "Complete trades"],
              ["portion", "Closed portions"],
            ])}
            {control("status", "Grouping status", [
              ["all", "All statuses"],
              ["matched", "Matched portions"],
              ["review", "Needs review"],
            ])}
            {control("review", "Review status", [
              ["all", "All reviews"],
              ["unreviewed", "Unreviewed"],
              ["draft", "Draft"],
              ["reviewed", "Reviewed"],
              ["notes", "Has notes"],
              ["screenshots", "Has screenshots"],
            ])}
            {control("mistake", "Mistake tag", [
              ["", "Any mistake"],
              ...mistakes.map(([id, name]) => [id, name] as [string, string]),
              ...(data?.tags ?? []).map(
                (t) =>
                  [t.id, t.name + (t.archived ? " · Archived" : "")] as [
                    string,
                    string,
                  ],
              ),
            ])}
            {control(
              "emotionStage",
              "Emotion stage",
              stages.map((s) => [s, s]),
            )}
            {control("emotion", "Emotion", [
              ["", "Any emotion"],
              ...emotions.map((e) => [e, e] as [string, string]),
            ])}
            {control("adherence", "Plan adherence", [
              ["", "Any plan adherence"],
              ["followed", "Followed my plan"],
              ["partly", "Partly followed my plan"],
              ["not-followed", "Did not follow my plan"],
            ])}
            <label className="field-label">
              Minimum P&L
              <input
                inputMode="decimal"
                value={q.min ?? ""}
                onChange={(e) => update("min", e.target.value)}
              />
            </label>
            <label className="field-label">
              Maximum P&L
              <input
                inputMode="decimal"
                value={q.max ?? ""}
                onChange={(e) => update("max", e.target.value)}
              />
            </label>
          </div>
        </details>
        <details className="tv-menu">
          <summary>Columns & density</summary>
          <div>
            {columns.map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  disabled={
                    prefs.visible.length === 1 && prefs.visible.includes(key)
                  }
                  checked={prefs.visible.includes(key)}
                  onChange={(e) =>
                    prefs.save(
                      e.target.checked
                        ? [...prefs.visible, key]
                        : prefs.visible.filter((v) => v !== key),
                      prefs.density,
                    )
                  }
                />
                {label}
              </label>
            ))}
            <label className="field-label">
              Density
              <select
                value={prefs.density}
                onChange={(e) => prefs.save(prefs.visible, e.target.value)}
              >
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
              </select>
            </label>
            <button onClick={() => prefs.save(defaults, "comfortable")}>
              Reset to defaults
            </button>
          </div>
        </details>
      </div>
      {!!data?.recoveryCount && (
        <p className="review-setup">
          <Link href="/trade-view/review-recovery">
            {data.recoveryCount} review(s) need reassignment after processing →
          </Link>
        </p>
      )}
      <div className="tv-chips">
        {[...search.entries()]
          .filter(
            ([key, value]) =>
              [
                "accounts",
                "archived",
                "start",
                "end",
                "search",
                "symbol",
                "root",
                "direction",
                "outcome",
                "type",
                "status",
                "review",
                "mistake",
                "emotion",
                "emotionStage",
                "adherence",
                "min",
                "max",
                "dateBasis",
                "basis",
                "strategy",
              ].includes(key) &&
              value !== "all" &&
              !(key === "archived" && value === "0"),
          )
          .map(([key, value]) => (
            <button
              key={key}
              onClick={() => update(key, "")}
              aria-label={`Remove ${chipLabels[key]} filter`}
            >
              {chipLabels[key]}:{" "}
              {key === "accounts"
                ? value
                    .split(",")
                    .filter(Boolean)
                    .map(
                      (id) =>
                        data?.accounts.find((a) => a.id === id)?.name ??
                        "Account",
                    )
                    .join(", ") || "None"
                : key === "archived"
                  ? "Included"
                  : key === "mistake"
                    ? (mistakes.find(([id]) => id === value)?.[1] ??
                      data?.tags?.find((t) => t.id === value)?.name ??
                      "Mistake tag")
                    : (chipValues[value] ?? value)}{" "}
              ×
            </button>
          ))}
        <button onClick={clear}>Clear all</button>
      </div>
      {!parsed.success && (
        <p role="alert">
          Check filter values and date order, or{" "}
          <button onClick={clear}>clear all filters</button>.
        </p>
      )}
      {state.error && (
        <p role="alert" className="tv-error">
          {data
            ? "Saved results are shown. Refresh failed. "
            : "Could not load trading history. "}
          {state.error} <button onClick={state.refresh}>Retry</button>
        </p>
      )}
      {!!data?.strategyRecoveryCount && (
        <p className="small muted">
          <Link href="/trade-view/review-recovery">
            {data.strategyRecoveryCount} strategy assignments need recovery
          </Link>
        </p>
      )}
      {data?.pending && (
        <p role="status" className="small muted">
          Processing is pending or needs retry. Published results may be
          incomplete.
        </p>
      )}
      {state.pending && data && (
        <p role="status" className="small muted">
          Refreshing…
        </p>
      )}
      <div className="tv-table-wrap" aria-busy={!data}>
        <table className="import-table tv-table">
          <caption className="sr-only">
            Trading history. USD amounts, times in {timezone}. Duration is the
            supported reported interval, not verified full-position duration.
          </caption>
          <thead>
            <tr>
              {columns
                .filter(([key]) => prefs.visible.includes(key))
                .map(([key, label]) => {
                  const sortable = [
                    "exit",
                    "entry",
                    "duration",
                    "quantity",
                    "gross",
                    "fees",
                    "net",
                    "account",
                    "symbol",
                  ].includes(key);
                  return (
                    <th
                      key={key}
                      aria-sort={
                        sortable
                          ? q.sort === key
                            ? q.order === "asc"
                              ? "ascending"
                              : "descending"
                            : "none"
                          : undefined
                      }
                      className={
                        [
                          "quantity",
                          "entryPrice",
                          "exitPrice",
                          "duration",
                          "gross",
                          "fees",
                          "net",
                        ].includes(key)
                          ? "tv-number"
                          : ""
                      }
                    >
                      {sortable ? (
                        <button
                          onClick={() => {
                            const next = new URLSearchParams(query);
                            next.set("sort", key);
                            next.set(
                              "order",
                              q.sort === key && q.order === "desc"
                                ? "asc"
                                : "desc",
                            );
                            next.delete("page");
                            window.history.pushState(
                              null,
                              "",
                              `/trade-view?${next}`,
                            );
                          }}
                        >
                          {q.dateBasis === "activity" &&
                          ["gross", "net"].includes(key)
                            ? `${label} in range`
                            : label}
                          {q.sort === key
                            ? q.order === "desc"
                              ? " ↓"
                              : " ↑"
                            : ""}
                        </button>
                      ) : (
                        label
                      )}
                    </th>
                  );
                })}
              <th>
                <span className="sr-only">Details</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data
              ? data.rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("a,button")) return;
                      rememberPosition();
                      router.push(detailHref(r.id), { scroll: true });
                    }}
                  >
                    {columns
                      .filter(([key]) => prefs.visible.includes(key))
                      .map(([key]) => (
                        <td
                          key={key}
                          className={`${["quantity", "entryPrice", "exitPrice", "duration", "gross", "fees", "net"].includes(key) ? "tv-number" : ""} ${["gross", "net"].includes(key) && r[key] !== null ? (new D(r[key]!).lt(0) ? "negative" : new D(r[key]!).gt(0) ? "positive" : "") : ""}`}
                          title={
                            key === "net" && r.estimated
                              ? "Estimated net P&L"
                              : key === "quantity"
                                ? "Total closed quantity; maximum simultaneous position size unknown"
                                : undefined
                          }
                        >
                          {key === "reviewStatus" ? (
                            <span
                              className={`review-status ${r.reviewStatus ?? "unreviewed"}`}
                            >
                              {r.reviewStatus ?? "unreviewed"}
                            </span>
                          ) : (
                            cell(r, key)
                          )}
                          {key === "symbol" && <ReviewMarks record={r} />}
                          {key === "symbol" && (
                            <small className="tv-outcome">
                              {(q.basis === "gross" ? r.gross : r.net) === null
                                ? "Net unknown"
                                : new D(
                                      (q.basis === "gross" ? r.gross : r.net)!,
                                    ).gt(0)
                                  ? "Profit"
                                  : new D(
                                        (q.basis === "gross"
                                          ? r.gross
                                          : r.net)!,
                                      ).lt(0)
                                    ? "Loss"
                                    : "Breakeven"}
                            </small>
                          )}
                          {key === "symbol" && r.partial && (
                            <small>Partial contribution</small>
                          )}
                        </td>
                      ))}
                    <td>
                      <Link
                        prefetch={false}
                        href={detailHref(r.id)}
                        onClick={rememberPosition}
                        aria-label={`Open ${r.symbol} record`}
                      >
                        Open →
                      </Link>
                    </td>
                  </tr>
                ))
              : Array.from({ length: 10 }, (_, i) => (
                  <tr key={i}>
                    {prefs.visible.map((key) => (
                      <td key={key}>
                        <span className="tv-skeleton" />
                      </td>
                    ))}
                    <td>
                      <span className="tv-skeleton" />
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      <div className="tv-mobile">
        {data?.rows.map((r) => (
          <Link
            key={r.id}
            prefetch={false}
            href={detailHref(r.id)}
            onClick={rememberPosition}
          >
            <div>
              <strong>{r.symbol}</strong>
              <ReviewMarks record={r} />
              <span>
                {journalMoney(q.basis === "gross" ? r.gross : r.net, true)}
              </span>
            </div>
            <small>
              {r.account} · {r.direction} ·{" "}
              {r.type === "trade" ? "Trade" : "Closed portion"}
            </small>
            <small>
              {journalTimestamp(r.exit, timezone)}
              {r.partial ? " · Partial contribution" : ""}
              {r.estimated ? " · Estimated net" : ""}
            </small>
          </Link>
        ))}
      </div>
      {data && !data.rows.length && (
        <div className="tv-empty">
          <h2>
            {data.sourceCount === 0
              ? "No imported records"
              : data.pending
                ? "Records await processing"
                : "No matching records"}
          </h2>
          <p className="muted">
            {data.sourceCount === 0
              ? "Import a Performance report to begin."
              : data.pending
                ? "Use the processing controls below."
                : "Try a wider range or clear your filters."}
          </p>
          {data.sourceCount === 0 ? (
            <Link href="/imports">Import a report →</Link>
          ) : (
            <button onClick={clear}>Clear all filters</button>
          )}
        </div>
      )}
      <nav className="import-pagination" aria-label="Trading history pages">
        <Button
          variant="outline"
          disabled={!data || data.page <= 1}
          onClick={() => update("page", String(data!.page - 1))}
        >
          Previous
        </Button>
        <span>
          {data
            ? `${data.summary.count} records · Page ${data.page} of ${data.pages}`
            : "Loading records…"}
        </span>
        <label className="field-label">
          <span className="sr-only">Page size</span>
          <select
            aria-label="Page size"
            value={q.size}
            onChange={(e) => update("size", e.target.value)}
          >
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="outline"
          disabled={!data || data.page >= data.pages}
          onClick={() => update("page", String(data!.page + 1))}
        >
          Next
        </Button>
        <button onClick={state.refresh}>Refresh</button>
      </nav>
      {q.mode === "real" && (
        <details className="journal-processing">
          <summary>Process existing imports / retry</summary>
          {data?.accounts.map((a) => (
            <div className="journal-process-row" key={a.id}>
              <strong>
                {a.name}
                {a.archived ? " · Archived" : ""}
              </strong>
              <ProcessButton accountId={a.id} />
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

function ReviewMarks({ record }: { record: ViewRecord }) {
  return (
    <span className="review-marks">
      {record.hasNotes && (
        <span title="Has trade notes" aria-label="Has trade notes">
          ✎
        </span>
      )}
      {!!record.imageCount && (
        <span
          title={`${record.imageCount} screenshot(s)`}
          aria-label="Has screenshots"
        >
          ▧
        </span>
      )}
    </span>
  );
}
