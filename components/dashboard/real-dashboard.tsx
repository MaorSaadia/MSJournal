"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import { ShieldCheck, Plus, WalletCards } from "lucide-react";
import { endOfMonth, format } from "date-fns";
import { dayDate } from "@/lib/dates";
import type { Filters } from "@/lib/types";
import type { TradingAccount } from "@/lib/accounts/types";
import { authorizedSelection } from "@/lib/accounts/types";
import type { JournalData } from "@/lib/journal/service";
import {
  localDay,
  realizedPerformance,
  journalMoney,
} from "@/lib/journal/calculations";
import { D, portionExit } from "@/lib/journal/processing";
import { journalTimestamp } from "@/lib/timezones";
import { DashboardFilters } from "./filters";
import { ModeControl } from "./mode-control";
import { Panel, Empty, Help } from "./panel";
import { FinancialChart } from "./charts";
export function RealDashboard({
  accounts,
  selectedIds,
  displayTimezone,
  initialMonth,
  data,
}: {
  accounts: TradingAccount[];
  selectedIds: string[];
  displayTimezone: string;
  initialMonth: string;
  data: JournalData;
}) {
  const router = useRouter(),
    search = useSearchParams();
  const available = data.portions
    .filter((p) => selectedIds.includes(p.tradingAccountId))
    .map((p) => localDay(portionExit(p), displayTimezone))
    .sort();
  const [tradeFilters, setFilters] = useState<Filters>({
    accounts: selectedIds,
    start: available[0] ?? `${initialMonth}-01`,
    end:
      available.at(-1) ??
      format(endOfMonth(dayDate(`${initialMonth}-01`)), "yyyy-MM-dd"),
    symbol: "all",
    direction: "all",
  });
  const filters = {
    ...tradeFilters,
    accounts: authorizedSelection(
      accounts,
      search.has("accounts") ? search.get("accounts")! : undefined,
    ),
  };
  const result = realizedPerformance(
    data.portions,
    data.fees,
    filters,
    displayTimezone,
  );
  const included = new Set(result.selected.map((p) => p.id));
  const recent = data.records
    .filter((r) => r.sourceIds.some((id) => included.has(id)))
    .sort((a, b) => b.exitAt.localeCompare(a.exitAt));
  const daily = result.days.map((d) => ({
    date: d.date,
    value: new D(d.gross).toNumber(),
  }));
  const cumulative = [
    { date: filters.start, value: 0, opening: true },
    ...result.days.map((d) => ({
      date: d.date,
      value: new D(d.cumulative).toNumber(),
    })),
  ];
  const hasData = result.selected.length > 0;
  const pending =
    data.unprocessedAccounts.some((id) => filters.accounts.includes(id)) ||
    data.states.some(
      (s) => filters.accounts.includes(s.accountId) && s.status === "Failed",
    );
  const message = !accounts.length
    ? "Add your first account."
    : !filters.accounts.length
      ? "Select an account."
      : data.sourceCount
        ? "No published portions in this selection. Change filters or process existing imports."
        : "No Performance records imported yet.";
  const placeholder = <Empty text={message} />;
  function updateFilters(next: Filters) {
    setFilters(next);
    if (next.accounts.join(",") !== filters.accounts.join(",")) {
      router.replace(
        `/?${new URLSearchParams({ accounts: next.accounts.join(",") })}`,
        { scroll: false },
      );
    }
  }
  const completeHelp =
    "Complete flat-to-flat trade coverage is 0%. Performance portions can omit open position history. Trade win rate, profit factor and average win/loss remain unavailable; portions are not counted as complete trades.";
  return (
    <motion.div
      className="dashboard"
      initial={{ opacity: 0, y: 6 }}
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
          onChange={updateFilters}
          accounts={accounts.map((a) => ({
            id: a.id,
            name: a.displayName,
            firm: a.firm ?? "Personal",
            stage: a.stage,
          }))}
          demo={false}
          symbols={[
            ...new Set(
              data.portions
                .filter((p) =>
                  accounts.some((a) => a.id === p.tradingAccountId),
                )
                .map((p) => p.symbol),
            ),
          ].sort()}
          timezone={displayTimezone}
        />
      </header>
      <div className="dashboard-intro">
        <ModeControl mode="real" />
        <span className="private-indicator">
          <ShieldCheck size={12} />
          Private · USD · {displayTimezone}
        </span>
      </div>
      <div className="real-empty-banner">
        <div className="dialog-symbol">
          <WalletCards size={20} />
        </div>
        <div>
          <strong>
            {hasData
              ? "Realized matched-portion data"
              : accounts.length
                ? "Your private journal"
                : "Add your first account"}
          </strong>
          <p>
            {hasData
              ? `${result.selected.length} portions · Imported realized range ${available[0] ?? "—"} – ${available.at(-1) ?? "—"}. Gross P&L is authoritative; complete-position coverage is unverified. ${pending ? "Processing incomplete: published results may exclude newly imported data." : ""}`
              : message}
          </p>
          {hasData && (
            <p>
              {result.net === null
                ? `Net unavailable: fees known for ${result.feeCoverage}/${result.selected.length} selected portions.`
                : `${result.estimated ? "Estimated net P&L" : "Net with entered fees"}: ${journalMoney(result.net, true)} · Fees ${journalMoney(result.feeAmount)}.`}
            </p>
          )}
        </div>
        <Link
          className="back-link"
          href={accounts.length ? "/trade-view" : "/prop-accounts"}
        >
          {accounts.length ? (
            "Inspect / process journal"
          ) : (
            <>
              <Plus size={14} />
              Add Account
            </>
          )}
        </Link>
      </div>
      <div className="metric-grid">
        {[
          {
            label: "Gross P&L",
            value: hasData ? journalMoney(result.gross, true) : "—",
            foot: hasData
              ? `${result.selected.length} matched portions · not a trade count`
              : message,
            help: "Sum of reported gross P&L, allocated by each portion’s actual exit date. Unknown fees are not treated as zero. Account, date, exact contract and direction filters apply.",
          },
          {
            label: "Trade win % · gross",
            value: "—",
            foot: "Complete-trade coverage unverified",
            help:
              completeHelp +
              " A future win-rate denominator includes winning, losing and breakeven complete trades.",
          },
          {
            label: "Profit factor · gross",
            value: "—",
            foot: "Complete-trade coverage unverified",
            help: completeHelp,
          },
          {
            label: "Day win % · gross",
            value: hasData
              ? `${new D(result.days.filter((d) => new D(d.gross).gt(0)).length).div(result.days.length).times(100).toFixed(1)}%`
              : "—",
            foot: hasData
              ? `${result.days.filter((d) => new D(d.gross).gt(0)).length} profitable / ${result.days.length} realized days`
              : message,
            help: "Profitable realized days divided by all days with matched exits, including losing and breakeven days. Based on gross P&L and journal display timezone; incomplete exports may omit results.",
          },
          {
            label: "Average win/loss · gross",
            value: "—",
            foot: "Complete-trade coverage unverified",
            help: completeHelp,
          },
        ].map((card) => (
          <section className="metric-card" key={card.label}>
            <div className="metric-label">
              {card.label}
              <Help label={card.label} text={card.help} />
            </div>
            <div className="metric-body">
              <strong
                className={`metric-value ${card.label === "Gross P&L" && hasData ? (new D(result.gross).lt(0) ? "negative" : "positive") : ""}`}
              >
                {card.value}
              </strong>
            </div>
            <p className="metric-foot">{card.foot}</p>
          </section>
        ))}
      </div>
      <div className="analysis-grid">
        <Panel
          title="Performance profile"
          help="No scoring methodology or complete-position coverage is available."
        >
          <Empty text="Performance scoring is unavailable." />
        </Panel>
        <Panel
          title="Activity tracker"
          help="Complete trades cannot be inferred from portion counts."
        >
          <Empty text="Complete-trade activity awaits verified position history." />
        </Panel>
        <Panel
          title="Cumulative realized gross P&L"
          help={`Starts at zero for the selected period. Each portion is realized on its own exit date in ${displayTimezone}; no fees deducted.`}
        >
          <FinancialChart
            data={hasData ? cumulative : []}
            kind="cumulative"
            empty={!hasData}
          />
        </Panel>
        <Panel
          title="Daily realized gross P&L"
          help={`Portion exit dates in ${displayTimezone}, not a group’s final exit date.`}
        >
          <FinancialChart data={daily} kind="daily" empty={!hasData} />
        </Panel>
        <Panel
          title="Recent journal records"
          help="Shared-fill groups and matched portions. Displayed P&L includes selected portions only."
        >
          <div className="recent-table-scroll">
            <table className="recent-table">
              <thead>
                <tr>
                  <th>Final exit</th>
                  <th>Contract / status</th>
                  <th>Selected gross</th>
                </tr>
              </thead>
              <tbody>
                {recent.slice(0, 25).map((r) => {
                  const gross = result.selected
                    .filter((p) => r.sourceIds.includes(p.id))
                    .reduce((n, p) => n.plus(p.grossPnl), new D(0));
                  return (
                    <tr key={r.id}>
                      <td>{journalTimestamp(r.exitAt, displayTimezone)}</td>
                      <td>
                        <Link
                          className="journal-record-link"
                          href={`/trade-view/${r.id}`}
                        >
                          {r.symbol}
                        </Link>
                        <small>{r.status}</small>
                      </td>
                      <td
                        className={
                          gross.lt(0)
                            ? "negative"
                            : gross.gt(0)
                              ? "positive"
                              : ""
                        }
                      >
                        {journalMoney(gross.toFixed(), true)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!recent.length && placeholder}
          </div>
        </Panel>
        <Panel
          title={
            filters.accounts.length > 1
              ? "Combined account balance"
              : "Account balance"
          }
          help="Nominal size or opening balance alone cannot establish a current balance. Complete trading and cash-movement history are required."
          action={<span className="panel-value">—</span>}
        >
          <Empty text="Current balance unavailable. Entered baselines are not verified balances." />
        </Panel>
      </div>
      <div className="section-divider">
        <span>THE DAILY PICTURE</span>
      </div>
      <div className="lower-grid">
        <Panel
          title="Monthly trading calendar"
          help="The full real-data calendar is reserved for Day 5."
        >
          <div className="real-calendar-placeholder">
            <Empty text="Real-data calendar arrives in Day 5. Daily realized results are available above and in Trade View." />
          </div>
        </Panel>
        <div className="lower-stack">
          <Panel
            title="Closed-trade drawdown"
            help="Matched portions are not verified complete trades. Intraday or prop trailing drawdown cannot be inferred."
          >
            <Empty text="Unavailable without verified complete-trade history." />
          </Panel>
          <Panel
            title="Trade time performance"
            help={`Complete trades and their entry times are not verified. Display timezone: ${displayTimezone}.`}
          >
            <Empty text="Complete-trade entry-time performance is unavailable." />
            <p className="panel-note">Entry time · {displayTimezone}</p>
          </Panel>
        </div>
      </div>
    </motion.div>
  );
}
