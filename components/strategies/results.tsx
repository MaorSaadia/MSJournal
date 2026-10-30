"use client";
import { LoadingState } from "@/components/ui/loading";

import { useState } from "react";
import Link from "next/link";
import { usePrivateRequest } from "@/components/calendar/cache-provider";
import { journalMoney } from "@/lib/journal/calculations";
import { todayIn, shiftDay } from "@/lib/calendar/model";
import { useCalendarCache } from "@/components/calendar/cache-provider";
import type { ReportData } from "@/lib/reports/model";
export function StrategyComparison({
  data,
  complete = false,
  query = "",
}: {
  data: ReportData;
  complete?: boolean;
  query?: string;
}) {
  const rows =
    data.strategyGroups?.filter(
      (g) => g.summary.count > 0 || g.id === "unassigned",
    ) ?? [];
  return (
    <section className="report-card strategy-comparison">
      <h2>
        Strategy comparison · {complete ? "Complete trades" : "Closed portions"}
      </h2>
      <p className="muted">
        All revisions unless a revision filter is selected. User assignments,
        not backtesting. Sample size is shown; a small positive sample does not
        establish an edge.
      </p>
      {!!data.strategyUnresolved && (
        <p>
          <Link href="/trade-view/review-recovery">
            {data.strategyUnresolved} unresolved assignments across selected
            accounts need attention
          </Link>{" "}
          · excluded from these categories.
        </p>
      )}
      <div className="report-table-wrap">
        <table className="report-table">
          <thead>
            <tr>
              <th>Strategy</th>
              <th>{complete ? "Trades" : "Portions"}</th>
              <th>P&L · USD</th>
              <th>Average / {complete ? "trade" : "portion"}</th>
              <th>{complete ? "Win percentage" : "Winning portions %"}</th>
              <th>Profit factor</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.id}>
                <th>
                  {g.id === "unassigned" ? (
                    <Link href={`/trade-view?${query}&strategy=unassigned`}>
                      Unassigned
                    </Link>
                  ) : (
                    <Link href={`/strategies/${g.id}`}>{g.name}</Link>
                  )}
                </th>
                <td>{g.summary.count}</td>
                <td>
                  {journalMoney(g.summary.total, true)}
                  {g.summary.estimated ? " (estimated fees)" : ""}
                  {g.summary.covered < g.summary.count
                    ? " · incomplete fees"
                    : ""}
                </td>
                <td>{journalMoney(g.summary.average, true)}</td>
                <td>
                  {g.summary.winRate === null
                    ? "Unavailable"
                    : `${g.summary.winRate}%`}
                </td>
                <td>
                  {g.summary.profitFactor ??
                    (g.summary.count
                      ? g.summary.profitFactorNote.replaceAll(
                          "trades",
                          complete ? "trades" : "portions",
                        )
                      : "No sample")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
export function StrategyResults({ strategyId }: { strategyId: string }) {
  const {
      timezone,
      workspaceFilters: defaults,
      pageFilters,
      rememberPageFilters,
    } = useCalendarCache(),
    today = todayIn(timezone);
  const pagePath = `/strategies/${strategyId}`;
  const workspaceFilters = pageFilters[pagePath] ?? defaults;
  const rememberWorkspaceFilters = (values: typeof defaults) =>
    rememberPageFilters(pagePath, values);
  const [localFilters, setFilters] = useState({
    start: shiftDay(today, -89),
    end: today,
    accounts: "all",
    archived: "0",
    basis: "net",
    analysis: "portions",
    revision: "all",
  });
  const filters = {
    ...localFilters,
    accounts: workspaceFilters.accounts ?? "all",
    archived: workspaceFilters.archived ?? "0",
    basis: workspaceFilters.basis ?? "net",
  };
  const query = new URLSearchParams({
    start: filters.start,
    end: filters.end,
    mode: "real",
    tab: "overview",
    basis: filters.basis,
    analysis: filters.analysis,
    archived: filters.archived,
    strategy: strategyId,
    ...(filters.accounts !== "all" ? { accounts: filters.accounts } : {}),
    ...(filters.revision !== "all"
      ? { strategyRevision: filters.revision }
      : {}),
  }).toString();
  const state = usePrivateRequest<ReportData>(query, "/api/reports"),
    data = state.data,
    group = data?.strategyGroups?.find((g) => g.id === strategyId),
    summary = data?.summary;
  const update = (key: keyof typeof filters, value: string) => {
    if (key === "accounts" || key === "archived" || key === "basis") {
      rememberWorkspaceFilters({
        [key]: key === "accounts" && value === "all" ? undefined : value,
      });
    } else setFilters({ ...localFilters, [key]: value });
  };
  return (
    <section className="playbook-card">
      <h2>Assigned historical results</h2>
      <div className="playbook-results-filters">
        <label>
          From
          <input
            aria-label="Strategy results from"
            type="date"
            value={filters.start}
            onChange={(e) => update("start", e.target.value)}
          />
        </label>
        <label>
          Through
          <input
            aria-label="Strategy results through"
            type="date"
            value={filters.end}
            onChange={(e) => update("end", e.target.value)}
          />
        </label>
        <label>
          Account
          <select
            aria-label="Strategy results account"
            value={filters.accounts}
            onChange={(e) => update("accounts", e.target.value)}
          >
            <option value="all">All available accounts</option>
            {filters.accounts !== "all" &&
              !data?.accounts.some((a) => a.id === filters.accounts) && (
                <option value={filters.accounts}>
                  {filters.accounts
                    ? "Selected accounts"
                    : "No accounts selected"}
                </option>
              )}
            {data?.accounts
              .filter((a) => filters.archived === "1" || !a.archived)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          P&L basis
          <select
            aria-label="Strategy results basis"
            value={filters.basis}
            onChange={(e) => update("basis", e.target.value)}
          >
            <option value="gross">Gross</option>
            <option value="net">Net after recorded fees</option>
          </select>
        </label>
        <label>
          Analysis
          <select
            aria-label="Strategy results analysis"
            value={filters.analysis}
            onChange={(e) => update("analysis", e.target.value)}
          >
            <option value="portions">Closed portions</option>
            <option value="complete">Complete trades</option>
          </select>
        </label>
        <label>
          Playbook revision
          <select
            aria-label="Strategy results revision"
            value={filters.revision}
            onChange={(e) => update("revision", e.target.value)}
          >
            <option value="all">All revisions</option>
            {group?.revisions.map((r) => (
              <option key={r} value={r}>
                Revision {r}
              </option>
            ))}
          </select>
        </label>
        <label className="playbook-check">
          <input
            type="checkbox"
            checked={filters.archived === "1"}
            onChange={(e) =>
              rememberWorkspaceFilters({
                archived: e.target.checked ? "1" : "0",
                accounts:
                  workspaceFilters.accounts === undefined
                    ? undefined
                    : workspaceFilters.accounts
                        .split(",")
                        .filter((id) =>
                          data?.accounts.some(
                            (a) =>
                              a.id === id && (e.target.checked || !a.archived),
                          ),
                        )
                        .join(","),
              })
            }
          />
          Include archived accounts
        </label>
      </div>
      <p className="muted">
        {filters.analysis === "complete"
          ? "Complete trades use final-close dates; Performance-only matched records do not prove completed positions."
          : "Closed portions use each realized exit date. Parent records and constituent portions are not added to the same denominator."}{" "}
        {timezone} · USD ·{" "}
        {filters.revision === "all"
          ? "All revisions"
          : `Revision ${filters.revision}`}
        .
      </p>
      {data?.pending && (
        <p role="status" className="muted">
          Processing is pending. Published strategy results may be incomplete.
        </p>
      )}
      {state.error ? (
        <p role="alert">
          {state.error}
          <button onClick={state.refresh}>Retry results</button>
        </p>
      ) : !summary ? (
        <LoadingState variant="report" label="Loading strategy results…" />
      ) : (
        <>
          <div className="playbook-metrics">
            {[
              [
                filters.analysis === "complete"
                  ? "Included trades"
                  : "Included portions",
                String(summary.count),
              ],
              ["Total P&L", journalMoney(summary.total, true)],
              [
                filters.analysis === "complete"
                  ? "Win percentage"
                  : "Winning portions %",
                summary.winRate === null
                  ? "Unavailable"
                  : `${summary.winRate}%`,
              ],
              [
                `Average P&L / ${filters.analysis === "complete" ? "trade" : "portion"}`,
                journalMoney(summary.average, true),
              ],
              [
                "Profit factor",
                summary.profitFactor ??
                  (summary.count
                    ? summary.profitFactorNote.replaceAll(
                        "trades",
                        filters.analysis === "complete" ? "trades" : "portions",
                      )
                    : "No sample"),
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          {summary.covered < summary.count && (
            <p className="muted">
              Missing fees: {summary.covered} of {summary.count} values covered.
              Net outcomes remain incomplete.
            </p>
          )}
          {summary.estimated && (
            <p className="muted">
              Estimated fees are included; net results are estimates.
            </p>
          )}
          {!!data?.strategyUnresolved && (
            <p>
              <Link href="/trade-view/review-recovery">
                {data.strategyUnresolved} unresolved classifications across
                selected accounts
              </Link>{" "}
              · excluded from strategy totals.
            </p>
          )}
          <p className="muted">
            Results describe your assignments, not automated setup detection or
            backtesting. Sample size alone does not prove an edge.
          </p>
          <h3>Linked journal records in this result</h3>
          {group?.records.length ? (
            group.records.map((r) => (
              <p key={r.id}>
                <Link
                  href={`/trade-view/${r.id}?from=${encodeURIComponent(`/strategies/${strategyId}`)}`}
                >
                  {r.symbol} ·{" "}
                  {r.type === "trade"
                    ? "Complete trade"
                    : "Matched record / closed portions"}
                </Link>
              </p>
            ))
          ) : (
            <p>No supported records in this selection.</p>
          )}
        </>
      )}
    </section>
  );
}
