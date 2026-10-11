"use client";
import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ShieldCheck } from "lucide-react";
import type { Filters } from "@/lib/types";
import type { TradingAccount } from "@/lib/accounts/types";
import { authorizedSelection } from "@/lib/accounts/types";
import type { DashboardData } from "@/lib/dashboard/service";
import { dashboardSchema } from "@/lib/dashboard/model";
import { journalMoney } from "@/lib/journal/calculations";
import { journalTimestamp } from "@/lib/timezones";
import { DashboardFilters } from "./filters";
import { ModeControl } from "./mode-control";
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
  const search = useSearchParams(),
    router = useRouter(),
    reduced = useReducedMotion(),
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
    basis: search.get("basis") ?? search.get("calBasis") ?? "gross",
    outcomeBasis: search.get("outcomeBasis") ?? "portions",
    ...(search.get("symbol") && search.get("symbol") !== "all"
      ? { symbol: search.get("symbol") }
      : {}),
    direction: search.get("direction") ?? "all",
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
    unit = complete ? "trade" : "portion",
    outcomes = data?.outcomes,
    dayStats = data?.realizedSummary;
  const statisticsHelp =
    "Closed portions count each matched exit portion once, including breakevens. Several portions may belong to one position. Complete trades require verified flat-to-flat coverage. Daily realized P&L always follows local exit dates.";
  const number = (value: string | null | undefined, suffix = "") =>
    value == null ? "Unavailable" : value + suffix;
  const dayHref = (date: string) =>
    `/trade-view?${new URLSearchParams({ accounts: ids.join(","), archived: q.archived, start: date, end: date, dateBasis: "activity", basis, outcomeBasis: "portions", dashboardFrom: href, ...(q.symbol ? { symbol: q.symbol } : {}), direction: q.direction })}`;
  const detailHref = (id: string) =>
    `/trade-view/${id}?${new URLSearchParams({ from: href, accounts: ids.join(","), archived: q.archived, start: q.start, end: q.end, dateBasis: "activity", basis, outcomeBasis: q.outcomeBasis, ...(q.symbol ? { symbol: q.symbol } : {}), direction: q.direction })}`;
  const inspect = (target: string) => {
    save();
    router.push(target);
  };
  const note = (text: string) =>
    complete
      ? text
      : text
          .replaceAll("complete trades", "closed portions")
          .replaceAll("trades", "portions");
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
      initial={reduced ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <header className="page-header">
        <div>
          <div className="breadcrumb">Workspace / Overview</div>
          <h1>
            Dashboard<span className="title-dot">.</span>
          </h1>
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
        <ModeControl mode="real" />
        <span className="private-indicator">
          <ShieldCheck size={12} />
          Private · USD · {displayTimezone}
        </span>
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
        <label className="dashboard-archived">
          <input
            type="checkbox"
            checked={q.archived === "1"}
            onChange={(e) =>
              update({
                archived: e.target.checked ? "1" : "0",
                accounts: undefined,
              })
            }
          />
          Include archived
        </label>
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
            <Link
              href={`/reports?${new URLSearchParams({ start: q.start, end: q.end, accounts: ids.join(","), archived: q.archived, basis, analysis: complete ? "complete" : "portions", ...(q.symbol ? { symbol: q.symbol } : {}), direction: q.direction })}`}
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
          <div className="metric-grid">
            {[
              {
                label: `Realized ${basis} P&L`,
                value: journalMoney(dayStats?.total ?? null, true),
                foot: `${data.days.length} active days · local exit dates`,
              },
              {
                label: complete ? "Winning trades" : "Winning portions",
                value: number(outcomes?.winRate, "%"),
                foot: `${outcomes?.wins ?? 0} winning / ${outcomes?.count ?? 0} ${complete ? "complete trades" : "closed portions"} · ${outcomes?.zeros ?? 0} breakeven`,
              },
              {
                label: `Profit factor · ${complete ? "trades" : "portions"}`,
                value:
                  outcomes?.profitFactor ??
                  note(outcomes?.profitFactorNote ?? "No matching results"),
                foot: `${basis} positive P&L / absolute negative P&L`,
              },
              {
                label: "Winning days",
                value: number(dayStats?.winRate, "%"),
                foot: `${dayStats?.wins ?? 0} profitable / ${data.days.length} active days`,
              },
            ].map((card) => (
              <section className="metric-card" key={card.label}>
                <div className="metric-label">
                  {card.label}
                  <Help label={card.label} text={statisticsHelp} />
                </div>
                <div className="metric-body">
                  <strong className="metric-value">{card.value}</strong>
                </div>
                <p className="metric-foot">{card.foot}</p>
              </section>
            ))}
            <section className="metric-card average-portions">
              <div className="metric-label">
                Average winning/losing {unit}
                <Help
                  label={`Average ${unit}`}
                  text={`Arithmetic averages of positive and negative ${basis} results. Breakevens remain in the winning percentage denominator.`}
                />
              </div>
              <div className="comparison-values">
                <strong className="positive">
                  {journalMoney(outcomes?.averageWin ?? null, true)}
                </strong>
                <strong className="negative">
                  {journalMoney(outcomes?.averageLoss ?? null, true)}
                </strong>
              </div>
              <p className="metric-foot">
                {outcomes?.averageWin && outcomes.averageLoss
                  ? `${outcomes.averageRatio} : 1 · win/loss ratio`
                  : `${basis} · averages shown separately`}
              </p>
            </section>
          </div>
          {complete && data.completeCount === 0 && (
            <p className="dashboard-scope-note">
              Performance matching does not verify complete positions.{" "}
              <button onClick={() => update({ outcomeBasis: "portions" })}>
                Use closed-portion statistics
              </button>
            </p>
          )}
          <div className="analysis-grid">
            <Panel
              title="Performance profile"
              help="Raw MSJournal measures, without a score. Review coverage describes recordkeeping, not trading quality."
            >
              <dl className="performance-measures">
                {[
                  [
                    "Winning days",
                    number(dayStats?.winRate, "%"),
                    `${data.days.length} active days`,
                  ],
                  [
                    complete ? "Winning trades" : "Winning portions",
                    number(outcomes?.winRate, "%"),
                    `${outcomes?.count ?? 0} ${complete ? "trades" : "portions"}`,
                  ],
                  [
                    complete ? "Profit factor" : "Profit factor · portions",
                    outcomes?.profitFactor ??
                      note(outcomes?.profitFactorNote ?? "No results"),
                    basis,
                  ],
                  [
                    "Average win/loss ratio",
                    outcomes?.averageWin && outcomes.averageLoss
                      ? outcomes.averageRatio + " : 1"
                      : "Unavailable",
                    `${outcomes?.wins ?? 0} wins · ${outcomes?.losses ?? 0} losses`,
                  ],
                  [
                    "Review completion",
                    data.reviewCoverage.percent === null
                      ? "Not recorded"
                      : data.reviewCoverage.percent + "%",
                    `${data.reviewCoverage.reviewed} / ${data.reviewCoverage.total} contributing records reviewed`,
                  ],
                ].map(([label, value, sample]) => (
                  <div key={label}>
                    <dt>
                      {label}
                      <small>{sample}</small>
                    </dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
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
              title={`Cumulative realized ${basis} P&L`}
              help="Starts at zero for this selected range; P&L is not account balance."
            >
              {data.days.length ? (
                <ReportChart
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
              title={`Daily realized ${basis} P&L`}
              help={`Matched exits in ${displayTimezone}, including breakeven activity.`}
            >
              {data.days.length ? (
                <ReportChart
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
              title="Recent journal records"
              help="Selected-period contributions inside published shared-fill groups; counts of groups differ from counts of exit portions."
            >
              <div className="recent-table-scroll">
                <table className="recent-table">
                  <thead>
                    <tr>
                      <th>Final exit</th>
                      <th>Contract / status</th>
                      <th>Selected {basis}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((r) => (
                      <tr key={r.id}>
                        <td>{journalTimestamp(r.exit, displayTimezone)}</td>
                        <td>
                          <Link href={detailHref(r.id)} onClick={save}>
                            {r.symbol}
                          </Link>
                          <small>{r.status}</small>
                        </td>
                        <td>{journalMoney(r.value, true)}</td>
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
              title="Journal balance estimate"
              help="Baseline plus subsequent realized P&L less known/estimated fees, plus dated cash adjustments. Includes every instrument and direction in each account; incomplete imports are not broker balances."
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
                    · {data.balances.covered}/{data.balances.selected} account
                    baselines cover the range start
                    {data.balances.combined.missingFees
                      ? ` · ${data.balances.combined.missingFees} portions have unknown fees`
                      : ""}
                    {data.balances.combined.estimated
                      ? " · includes estimated fees"
                      : ""}
                    . All instruments; cash changes stay separate from P&L.
                  </p>
                  <BalanceChart
                    points={data.balances.combined.points}
                    entering={data.balances.combined.entering}
                    start={q.start}
                  />
                </>
              ) : (
                <p className="dashboard-action-state">
                  Set a starting balance for each selected account, on or before
                  the tracking range starts.
                </p>
              )}
              {data.balances.accounts.map((a) => (
                <BalanceSetup account={a} end={q.end} key={a.id} />
              ))}
              {!data.balances.accounts.length && (
                <p className="panel-note">
                  <Link href="/prop-accounts">Add or select an account →</Link>
                </p>
              )}
            </Panel>
          </div>
          <div className="section-divider">
            <span>THE DAILY PICTURE</span>
          </div>
          <div className="lower-grid">
            <TradingCalendar
              compact
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
                update({ archived: include ? "1" : "0", accounts: undefined })
              }
            />
            <div className="lower-stack">
              <Panel
                title="End-of-day realized drawdown"
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
                title={
                  complete
                    ? "Complete-trade entry time"
                    : "Entry time by closed portion"
                }
                help={`Known local entry times in ${displayTimezone}. Short portions open with the earlier sell; long portions with the earlier buy. Several points may belong to one position.`}
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
                <p className="panel-note">
                  {data.excludedEntry} unknown entries excluded ·{" "}
                  {data.timePoints.length}/{data.timeCount} supported points
                  shown
                  {!complete
                    ? " · several points may belong to one position"
                    : ""}{" "}
                  · {basis}
                </p>
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
