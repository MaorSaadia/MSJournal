"use client";
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { FlaskConical, WalletCards } from "lucide-react";
import type { Account, CashMovement, Trade, Filters } from "@/lib/types";
import { initialFilters } from "@/data/demo";
import {
  balanceSeries,
  cumulativeSeries,
  dailyResults,
  drawdownSeries,
  filterTrades,
  metrics,
  money,
  netCents,
} from "@/lib/calculations";
import { DISPLAY_TIMEZONES, timestampLabel } from "@/lib/dates";
import { DashboardFilters } from "./filters";
import { MetricCards } from "./metrics";
import { FinancialChart, ProfileChart, TimeChart, TimeData } from "./charts";
import { Panel, Empty } from "./panel";
import { Heatmap } from "./heatmap";
import { TradingCalendar } from "@/components/calendar/trading-calendar";
import { ModeControl } from "./mode-control";
function RecentTrades({ trades }: { trades: Trade[] }) {
  if (!trades.length) return <Empty />;
  return (
    <div className="recent-table-scroll">
      <table className="recent-table">
        <caption className="sr-only">
          Closed demo trades, most recent first. Close times in Asia/Jerusalem.
        </caption>
        <thead>
          <tr>
            <th>
              Close date <span className="table-tz">(Jerusalem)</span>
            </th>
            <th>Symbol</th>
            <th>Net P&L</th>
          </tr>
        </thead>
        <tbody>
          {[...trades].reverse().map((t) => (
            <tr key={t.id}>
              <td>{timestampLabel(t.closeAt)}</td>
              <td>
                <span className="symbol-badge">{t.symbol}</span>
                <span className="trade-direction">{t.direction}</span>
              </td>
              <td
                className={
                  netCents(t) > 0
                    ? "positive"
                    : netCents(t) < 0
                      ? "negative"
                      : ""
                }
              >
                {money(netCents(t), true)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function Dashboard({
  accounts,
  trades,
  cashMovements,
  displayTimezone = "Asia/Jerusalem",
}: {
  accounts: Account[];
  trades: Trade[];
  cashMovements: CashMovement[];
  displayTimezone?: string;
}) {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [timezone, setTimezone] = useState<string>(displayTimezone);
  const selected = useMemo(
    () => filterTrades(trades, filters),
    [trades, filters],
  );
  const stats = metrics(selected);
  const daily = dailyResults(selected);
  const cumulative = cumulativeSeries(selected, filters.start, filters.end);
  const balance = balanceSeries(accounts, trades, cashMovements, filters);
  const drawdown = drawdownSeries(selected, filters.start);
  const maxDrawdown = Math.min(...drawdown.map((d) => d.value));
  const endBalance = balance.at(-1)?.value;
  return (
    <motion.div
      className="dashboard"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
    >
      <header className="page-header">
        <div>
          <div className="breadcrumb">
            Workspace <span>/</span> Overview
          </div>
          <h1>
            Dashboard<span className="title-dot">.</span>
          </h1>
        </div>
        <DashboardFilters
          filters={filters}
          onChange={setFilters}
          accounts={accounts}
        />
      </header>
      <div className="dashboard-intro">
        <ModeControl mode="demo" />
        <span className="demo-indicator">
          <FlaskConical size={12} />
          Demo data<span className="demo-period"> · Jan–Mar 2026</span>
        </span>
      </div>
      <MetricCards stats={stats} />
      <div className="analysis-grid">
        <Panel
          title="Performance profile"
          help="These are explicitly illustrative demo values out of 100. They are independent of trade filters. A scoring methodology has not been implemented; no composite score is calculated."
          action={<span className="badge violet-badge">Illustrative</span>}
        >
          <ProfileChart />
        </Panel>
        <Panel
          title="Activity tracker"
          help="Cell intensity is the number of closed demo trades on each Asia/Jerusalem close date. All active filters apply. This is trading activity, not a discipline score."
        >
          <Heatmap trades={selected} filters={filters} />
        </Panel>
        <Panel
          title="Daily net cumulative P&L"
          help="Selected-period net P&L starts at zero. The opening zero point appears before the first day's result. Commissions and fees are included; cash movements are excluded."
          action={
            <span
              className={`panel-value ${stats.netCents > 0 ? "positive" : stats.netCents < 0 ? "negative" : ""}`}
            >
              {money(stats.netCents, true)}
            </span>
          }
        >
          <FinancialChart
            data={cumulative}
            kind="cumulative"
            empty={!selected.length}
          />
        </Panel>
        <Panel
          title="Net daily P&L"
          help="Net results grouped by close date in Asia/Jerusalem. All trade filters apply."
        >
          <FinancialChart
            data={daily.map((d) => ({ date: d.date, value: d.netCents / 100 }))}
            kind="daily"
            empty={!selected.length}
          />
        </Panel>
        <Panel
          title="Recent trades"
          help="Completed demo trades only, sorted by close time. This does not track live open positions."
          action={<span className="muted small">{stats.count} closed</span>}
        >
          <RecentTrades trades={selected} />
        </Panel>
        <Panel
          title={
            filters.accounts.length > 1
              ? "Combined account balance"
              : "Account balance"
          }
          help="Fictional starting balances + all prior net trading results + explicit cash movements. Account and date filters apply. Symbol and direction filters do not change balance. Opening balance is preserved across date selections."
          action={
            <span className="panel-value violet">
              {endBalance === undefined ? "—" : money(endBalance * 100)}
            </span>
          }
        >
          <FinancialChart data={balance} kind="balance" />
          <p className="balance-scope">
            All symbols & directions · cash movements included
          </p>
        </Panel>
      </div>
      <div className="section-divider">
        <span>THE DAILY PICTURE</span>
        <span>Small details. Better decisions.</span>
      </div>
      <div className="lower-grid">
        <TradingCalendar
          compact
          mode="demo"
          initialMonth="2026-03"
          timezone={displayTimezone}
          filters={filters}
          accounts={accounts.map((a) => ({
            id: a.id,
            name: a.name,
            archived: false,
          }))}
          onAccountsChange={(ids) => setFilters({ ...filters, accounts: ids })}
        />
        <div className="lower-stack">
          <Panel
            title="Closed-trade drawdown"
            help="Calculated from the running peak of cumulative net P&L after each closed trade, beginning at zero. Uses only the selected period. Excludes unrealized P&L and is not a prop firm's intraday trailing drawdown."
            action={
              <span className="negative panel-value">
                {selected.length ? money(maxDrawdown * 100) : "—"}
              </span>
            }
          >
            <FinancialChart
              data={drawdown}
              kind="drawdown"
              empty={!selected.length}
            />
            <p className="panel-note">
              Selected period · closed trades only · no unrealized P&L
            </p>
          </Panel>
          <Panel
            title="Trade time performance"
            help="Entry time versus completed-trade net P&L. Change the display timezone here; close-date grouping elsewhere remains Asia/Jerusalem."
          >
            <div className="time-chart-toolbar">
              <label>
                <span className="sr-only">Entry time display timezone</span>
                <select
                  aria-label="Entry time display timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                >
                  {[...new Set([...DISPLAY_TIMEZONES, displayTimezone])].map(
                    (t) => (
                      <option key={t}>{t}</option>
                    ),
                  )}
                </select>
              </label>
              <div className="chart-legend">
                <span>
                  <i className="positive-dot" />
                  Win
                </span>
                <span>
                  <i className="negative-dot" />
                  Loss
                </span>
                <span>
                  <i className="neutral-dot" />
                  Flat
                </span>
              </div>
            </div>
            <TimeChart
              trades={selected}
              accounts={accounts}
              timezone={timezone}
            />
            <TimeData
              trades={selected}
              accounts={accounts}
              timezone={timezone}
            />
            <p className="panel-note">
              Entry time ({timezone}) · net P&L in USD
            </p>
          </Panel>
        </div>
      </div>
      <section className="prop-overview">
        <header>
          <div>
            <WalletCards size={17} />
            <h2>Your prop accounts</h2>
            <span className="badge">Fictional</span>
          </div>
          <p>Illustrative balances only · no firm targets or limits</p>
        </header>
        <div className="prop-grid">
          {accounts.map((a) => {
            const ownBalance =
              balanceSeries([a], trades, cashMovements, {
                ...filters,
                accounts: [a.id],
              }).at(-1)?.value ?? 0;
            return (
              <article
                key={a.id}
                className={
                  !filters.accounts.includes(a.id) ? "unselected-account" : ""
                }
              >
                <div className="prop-account-top">
                  <span className="account-glyph">{a.name[0]}</span>
                  <div>
                    <h3>{a.name}</h3>
                    <p>{a.firm}</p>
                  </div>
                  <span
                    className={`stage-badge ${a.stage === "Funded" ? "funded" : ""}`}
                  >
                    {a.stage}
                  </span>
                </div>
                <div className="prop-balance">
                  <span>Illustrative balance</span>
                  <strong>{money(ownBalance * 100)}</strong>
                </div>
                <p className="prop-start">
                  Starting balance {money(a.startingBalanceCents)} · cash{" "}
                  {money(
                    cashMovements
                      .filter(
                        (c) => c.accountId === a.id && c.date <= filters.end,
                      )
                      .reduce((s, c) => s + c.amountCents, 0),
                    true,
                  )}
                </p>
              </article>
            );
          })}
        </div>
      </section>
      <div className="demo-footnote">
        <FlaskConical size={14} />
        <p>
          All trades, accounts, and balances are fictional. USD · daily grouping
          in Asia/Jerusalem.
        </p>
      </div>
    </motion.div>
  );
}
