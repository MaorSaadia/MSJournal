"use client";
import { useWorkspaceSearch } from "@/components/calendar/cache-provider";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import { ShieldCheck } from "lucide-react";
import {
  RealMetricCards,
  PerformanceProfile,
  profileConvention,
} from "./performance";
import type { Filters } from "@/lib/types";
import type { TradingAccount } from "@/lib/accounts/types";
import { authorizedSelection } from "@/lib/accounts/types";
import type { DashboardData } from "@/lib/dashboard/service";
import { dashboardSchema } from "@/lib/dashboard/model";
import { journalMoney } from "@/lib/journal/calculations";
import { journalTimestamp } from "@/lib/timezones";
import { DashboardFilters } from "./filters";
import { Panel, Help } from "./panel";
import { RealActivity } from "./activity";
import { BalanceChart, PortionTimeChart } from "./real-charts";
import { BalanceSetup } from "./balance-setup";
import { ReportChart } from "@/components/reports/charts";
import { TradingCalendar } from "@/components/calendar/trading-calendar";
import {
  useCalendarCache,
  usePrivateRequest,
} from "@/components/calendar/cache-provider";
type Account = Pick<
  TradingAccount,
  "id" | "displayName" | "firm" | "stage" | "archivedAt"
>;
export function RealDashboard({
  accounts,
  displayTimezone,
  initialMonth,
  initialRange,
  initialSymbols,
}: {
  accounts: Account[];
  displayTimezone: string;
  initialMonth: string;
  initialRange: { start: string; end: string };
  initialSymbols: string[];
}) {
  const search = useWorkspaceSearch(),
    router = useRouter(),
    { userId, scrollPositions } = useCalendarCache();
  const ids = authorizedSelection(
    accounts,
    search.get("accounts") ?? undefined,
    search.get("archived") === "1",
  );
  const parsed = dashboardSchema.safeParse({
    start: search.get("start") ?? initialRange.start,
    end: search.get("end") ?? initialRange.end,
    accounts: ids.sort().join(","),
    archived: search.get("archived") ?? "0",
    basis: search.get("basis") ?? search.get("calBasis") ?? "net",
    outcomeBasis: search.get("outcomeBasis") ?? "portions",
    ...(search.get("symbol") && search.get("symbol") !== "all"
      ? { symbol: search.get("symbol") }
      : {}),
    direction: ["long", "short"].includes(search.get("direction") ?? "")
      ? search.get("direction")
      : "all",
  });
  const q = parsed.success
    ? parsed.data
    : dashboardSchema.parse({ ...initialRange });
  const query = new URLSearchParams(
    Object.entries(q)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  ).toString();
  const state = usePrivateRequest<DashboardData>(
      parsed.success ? query : null,
      "/api/dashboard",
    ),
    data = state.data;
  const href = `/?${search}`,
    scrollKey = `${userId}:${displayTimezone}:${href}`,
    restored = useRef<string | null>(null);
  useEffect(() => {
    if (!data || restored.current === scrollKey) return;
    restored.current = scrollKey;
    const position = scrollPositions.get(scrollKey);
    if (position !== undefined) {
      const frame = requestAnimationFrame(() => window.scrollTo(0, position));
      return () => cancelAnimationFrame(frame);
    }
  }, [data, scrollKey, scrollPositions]);
  function save() {
    if (scrollPositions.size >= 24)
      scrollPositions.delete(scrollPositions.keys().next().value!);
    scrollPositions.set(scrollKey, window.scrollY);
  }
  function update(values: Record<string, string | undefined>) {
    const next = new URLSearchParams(search);
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) next.delete(key);
      else next.set(key, value);
    }
    window.history.pushState(null, "", `/?${next}`);
  }
  const filters: Filters = {
    accounts: ids,
    start: q.start,
    end: q.end,
    symbol: q.symbol ?? "all",
    direction: q.direction,
  };
  const changeFilters = (next: Filters) =>
    update({
      accounts: next.accounts.join(","),
      start: next.start,
      end: next.end,
      symbol: next.symbol === "all" ? undefined : next.symbol,
      direction: next.direction,
      calDay: undefined,
    });
  const basis = data?.basis ?? q.basis,
    complete = q.outcomeBasis === "complete",
    outcomes = data?.outcomes,
    dayStats = data?.realizedSummary;
  const statisticsHelp =
    "Closed portions count each matched exit portion once, including breakevens. Several portions may belong to one position. Complete trades require verified flat-to-flat coverage. Daily realized P&L always follows local exit dates.";

  const dayHref = (date: string) =>
    `/trade-view?${new URLSearchParams({ accounts: ids.join(","), archived: q.archived, start: date, end: date, dateBasis: "activity", basis: q.basis, outcomeBasis: "portions", dashboardFrom: href, ...(q.symbol ? { symbol: q.symbol } : {}), direction: q.direction })}`;
  const detailHref = (id: string) =>
    `/trade-view/${id}?${new URLSearchParams({ from: href, accounts: ids.join(","), archived: q.archived, start: q.start, end: q.end, dateBasis: "activity", basis: q.basis, outcomeBasis: q.outcomeBasis, ...(q.symbol ? { symbol: q.symbol } : {}), direction: q.direction })}`;
  const inspect = (target: string) => {
    save();
    router.push(target);
  };
  const opening = {
    key: "opening",
    label: `${q.start} · Start`,
    count: 0,
    total: "0",
    average: null,
    winRate: null,
    href: "",
    cumulative: "0",
    drawdown: "0",
  };
  return (
    <motion.div
      className="dashboard dashboard-connected"
      initial={false}
      animate={{ opacity: 1, y: 0 }}
    >
      <header className="page-header">
        <div>
          <h1>Dashboard</h1>
        </div>
        <DashboardFilters
          filters={filters}
          onChange={changeFilters}
          accounts={accounts
            .filter((a) => q.archived === "1" || !a.archivedAt)
            .map((a) => ({
              id: a.id,
              name: a.displayName,
              firm: a.firm ?? "Personal",
              stage: a.stage,
            }))}
          demo={false}
          symbols={initialSymbols}
          timezone={displayTimezone}
        />
      </header>
      <div className="dashboard-intro">
        <label className="dashboard-basis-label">
          Statistics
          <select
            aria-label="Statistics basis"
            value={q.outcomeBasis}
            onChange={(e) => update({ outcomeBasis: e.target.value })}
          >
            <option value="portions">Closed portions</option>
            <option value="complete">Complete trades</option>
          </select>
        </label>
        <Help label="Statistics basis" text={statisticsHelp} />
        <label className="dashboard-basis-label">
          P&L
          <select
            aria-label="Dashboard P&L basis"
            value={q.basis}
            onChange={(e) => update({ basis: e.target.value })}
          >
            <option value="gross">Gross</option>
            <option value="net">Net</option>
          </select>
        </label>
        <details className="dashboard-settings">
          <summary>Settings</summary>
          <div>
            {" "}
            <span className="private-indicator">
              <ShieldCheck size={12} />
              Private · USD · {displayTimezone}
            </span>
            <label className="dashboard-archived">
              <input
                type="checkbox"
                checked={q.archived === "1"}
                onChange={(e) =>
                  update({
                    archived: e.target.checked ? "1" : "0",
                    accounts: ids
                      .filter((id) =>
                        accounts.some(
                          (a) =>
                            a.id === id && (e.target.checked || !a.archivedAt),
                        ),
                      )
                      .join(","),
                  })
                }
              />
              Include archived
            </label>
          </div>
        </details>
      </div>
      {!parsed.success && (
        <p role="alert">
          Choose valid local dates and a range of at most 10 years.
        </p>
      )}
      {state.error && (
        <p role="alert" className="dashboard-fetch-note">
          Dashboard could not refresh. {state.error}{" "}
          <button onClick={state.refresh}>Try again</button>
        </p>
      )}
      {!data ? (
        <div className="dashboard-loading" role="status">
          Loading journal measures…
        </div>
      ) : (
        <>
          <div className="dashboard-scope-note">
            <details className="dashboard-coverage">
              <summary>
                {complete ? "Complete trades" : "Closed portions"} · {basis}
                {data.requestedBasis !== basis
                  ? " · gross fallback"
                  : ""} · {data.portionCount} portions
              </summary>{" "}
              <span>
                {data.portionCount} closed portions · {data.completeCount}{" "}
                verified complete trades · {basis}
                {basis === "net" && outcomes?.estimated
                  ? " (estimated fees)"
                  : ""}
                {data.requestedBasis !== basis
                  ? " used because fees are incomplete"
                  : ""}
              </span>
            </details>
            <Link
              href={`/reports?${new URLSearchParams({ start: q.start, end: q.end, accounts: ids.join(","), archived: q.archived, basis: q.basis, analysis: complete ? "complete" : "portions", ...(q.symbol ? { symbol: q.symbol } : {}), direction: q.direction })}`}
              onClick={save}
            >
              Inspect in Reports →
            </Link>
          </div>
          {data.pending && (
            <p className="dashboard-fetch-note">
              Some imports await processing.{" "}
              <Link href="/trade-view">Process in Trade View →</Link>
            </p>
          )}
          <RealMetricCards data={data} complete={complete} />
          {basis === "gross" &&
            data.netPnl != null &&
            data.feeTotal != null && (
              <p className="dashboard-scope-note">
                Viewing gross P&L before fees. Saved fees:{" "}
                {journalMoney(data.feeTotal)} · Net P&L:{" "}
                {journalMoney(data.netPnl, true)}.{" "}
                <button
                  onClick={() => update({ basis: "net", calBasis: "net" })}
                >
                  Show net P&L →
                </button>
              </p>
            )}
          {basis === "net" && data.allocatedFees > 0 && (
            <p className="dashboard-scope-note">
              Fees for {data.allocatedFees} records are allocated from entered
              broker-report totals. Full report totals reconcile; individual
              records and partial selections use quantity-weighted allocations.{" "}
              <Link
                href={`/fees${ids.length === 1 ? `?accountId=${ids[0]}` : ""}`}
              >
                Manage fees →
              </Link>
            </p>
          )}
          {complete && data.completeCount === 0 && (
            <p className="dashboard-scope-note">
              Performance matching does not verify complete positions.{" "}
              <button onClick={() => update({ outcomeBasis: "portions" })}>
                Use closed-portion statistics
              </button>
            </p>
          )}
          <div className="analysis-grid">
            <Panel title="Performance profile" help={profileConvention}>
              <PerformanceProfile data={data} complete={complete} />
            </Panel>
            <Panel
              title="Activity tracker"
              help="Imported realized exits, using the same daily aggregation as the calendar. The statistics selector does not change daily activity."
            >
              <RealActivity
                data={data}
                start={q.start}
                end={q.end}
                dayHref={dayHref}
                onInspect={save}
              />
            </Panel>
            <Panel
              title="Cumulative P&L"
              help="Starts at zero for this selected range; P&L is not account balance."
            >
              {data.days.length ? (
                <ReportChart
                  dashboard
                  rows={[
                    opening,
                    ...data.days.map((d) => ({ ...d, href: dayHref(d.date) })),
                  ]}
                  basis={`${basis} · closed portions`}
                  field="cumulative"
                  line
                  onInspect={inspect}
                />
              ) : (
                <p className="dashboard-action-state">
                  No imported realized activity matches these filters.{" "}
                  <Link href="/imports">Import Performance.csv</Link> or select
                  a wider range.
                </p>
              )}
            </Panel>
            <Panel
              title="Daily P&L"
              help={`Matched exits in ${displayTimezone}, including breakeven activity.`}
            >
              {data.days.length ? (
                <ReportChart
                  dashboard
                  rows={data.days.map((d) => ({ ...d, href: dayHref(d.date) }))}
                  basis={`${basis} · closed portions`}
                  onInspect={inspect}
                />
              ) : (
                <p className="dashboard-action-state">
                  No matching exit portions. Select an account and date range
                  with imported activity.
                </p>
              )}
            </Panel>
            <Panel
              title="Recent records"
              action={
                <Link
                  href={dayHref(q.start).replace(
                    `end=${q.start}`,
                    `end=${q.end}`,
                  )}
                  onClick={save}
                >
                  View all
                </Link>
              }
              help="Selected-period contributions inside published shared-fill groups; counts of groups differ from counts of exit portions."
            >
              <div className="recent-table-scroll">
                <table className="recent-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Symbol</th>
                      <th>P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.slice(0, 8).map((r) => (
                      <tr key={r.id}>
                        <td title={journalTimestamp(r.exit, displayTimezone)}>
                          {new Intl.DateTimeFormat("en-US", {
                            timeZone: displayTimezone,
                            month: "2-digit",
                            day: "2-digit",
                            year: "numeric",
                          }).format(new Date(r.exit))}
                        </td>
                        <td>
                          <Link href={detailHref(r.id)} onClick={save}>
                            {r.symbol}
                          </Link>
                          <span
                            className="record-kind"
                            title={r.status}
                            aria-label={r.status}
                          >
                            ·
                          </span>
                        </td>
                        <td
                          className={
                            Number(r.value) > 0
                              ? "positive"
                              : Number(r.value) < 0
                                ? "negative"
                                : ""
                          }
                        >
                          {journalMoney(r.value, true)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data.recent.length && (
                  <p className="dashboard-action-state">
                    No published records contribute to this selection.
                  </p>
                )}
              </div>
            </Panel>
            <Panel
              title="Account balance"
              className="dashboard-balance-panel"
              help={`Automatic starting balance from account settings plus subsequent realized P&L less known/estimated fees and dated cash adjustments. Manually entered balances take priority. Includes every instrument and direction in each account; incomplete imports are not broker balances. ${data.balances.covered}/${data.balances.selected} account balances are included where supported. ${data.balances.combined?.missingFees ?? 0} portions have unknown fees. Cash movements stay separate from P&L.`}
              action={
                data.balances.combined ? (
                  <span className="panel-value">
                    {journalMoney(data.balances.combined.ending)}
                  </span>
                ) : undefined
              }
            >
              {data.balances.combined ? (
                <>
                  <p className="panel-note">
                    {data.balances.combined.missingFees
                      ? "Balance before unrecorded fees"
                      : data.balances.combined.estimated
                        ? "Estimated balance"
                        : "Journal balance estimate"}{" "}
                    · {data.balances.covered}/{data.balances.selected} accounts
                  </p>
                  <BalanceChart
                    points={data.balances.combined.points}
                    entering={data.balances.combined.entering}
                    start={q.start}
                    adjustments={data.balances.accounts.flatMap(
                      (a) => a.adjustments,
                    )}
                    timezone={displayTimezone}
                  />
                </>
              ) : (
                <p className="dashboard-action-state">
                  Select an account with a configured balance or account size.
                </p>
              )}
              <details className="balance-management">
                <summary>
                  {data.balances.combined
                    ? "Balance settings & adjustments"
                    : "Balance settings"}
                </summary>
                {data.balances.accounts.map((a) => (
                  <BalanceSetup account={a} end={q.end} key={a.id} />
                ))}
              </details>
              {!data.balances.accounts.length && (
                <p className="panel-note">
                  <Link href="/prop-accounts">Add or select an account →</Link>
                </p>
              )}
            </Panel>
          </div>

          <div className="lower-grid">
            <TradingCalendar
              compact
              defaultBasis={q.basis}
              accounts={accounts.map((a) => ({
                id: a.id,
                name: a.displayName,
                archived: !!a.archivedAt,
              }))}
              filters={filters}
              initialMonth={initialMonth}
              timezone={displayTimezone}
              includeArchived={q.archived === "1"}
              onArchivedChange={(include) =>
                update({
                  archived: include ? "1" : "0",
                  accounts: ids
                    .filter((id) =>
                      accounts.some(
                        (a) => a.id === id && (include || !a.archivedAt),
                      ),
                    )
                    .join(","),
                })
              }
            />
            <div className="lower-stack">
              <Panel
                title="Realized drawdown"
                help="Cumulative daily P&L minus its running peak, including the initial zero. Resets at the selected range start; this is not intraday or prop-firm trailing drawdown."
                action={
                  <span className="panel-value">
                    {journalMoney(dayStats?.maxDrawdown ?? null)}
                  </span>
                }
              >
                <p className="panel-note">
                  Maximum monetary magnitude · {basis} · selected range
                </p>
                {data.days.length ? (
                  <ReportChart
                    dashboard
                    rows={[
                      opening,
                      ...data.days.map((d) => ({
                        ...d,
                        href: dayHref(d.date),
                      })),
                    ]}
                    basis={`${basis} · closed portions`}
                    field="drawdown"
                    line
                    onInspect={inspect}
                  />
                ) : (
                  <p className="dashboard-action-state">
                    No realized exits in this range. Select dates with imported
                    activity.
                  </p>
                )}
              </Panel>
              <Panel
                title="Entry time performance"
                help={`Known local entry times in ${displayTimezone}. ${data.timePoints.length}/${data.timeCount} supported points; ${data.excludedEntry} unknown entries excluded. Short portions open with the earlier sell; long portions with the earlier buy. Several points may belong to one position. ${basis}.`}
              >
                {data.timePoints.length ? (
                  <>
                    <PortionTimeChart
                      data={data}
                      onInspect={(id) => inspect(detailHref(id))}
                    />
                    <details className="time-points-table">
                      <summary>Exact points and records</summary>
                      <table className="recent-table">
                        <thead>
                          <tr>
                            <th>Entry · {displayTimezone}</th>
                            <th>Contract / direction</th>
                            <th>{basis} · USD</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.timePoints.map((p) => (
                            <tr key={p.id}>
                              <td>
                                {journalTimestamp(p.entry, displayTimezone)}
                              </td>
                              <td>
                                <Link
                                  href={detailHref(p.recordId)}
                                  onClick={save}
                                >
                                  {p.symbol} · {p.direction}
                                </Link>
                              </td>
                              <td>{journalMoney(p.value, true)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </details>
                  </>
                ) : (
                  <p className="dashboard-action-state">
                    {complete
                      ? "Complete-trade entry times are not verified. Choose closed portions to inspect supported entries."
                      : "No reliable entry times in this selection. Equal timestamps or conflicting fill metadata are excluded."}
                  </p>
                )}
              </Panel>
            </div>
          </div>
          <p className="panel-note">
            Calendar counts are closed exit portions. Complete-trade outcomes,
            when supported, use final-close dates; daily realized results follow
            each exit.{" "}
            <button onClick={state.refresh}>Refresh dashboard</button>
          </p>
        </>
      )}
    </motion.div>
  );
}
