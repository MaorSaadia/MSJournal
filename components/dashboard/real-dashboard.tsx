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
import { DashboardFilters } from "./filters";
import { ModeControl } from "./mode-control";
import { Panel, Empty, Help } from "./panel";
import { TradingCalendar } from "./calendar";
export function RealDashboard({
  accounts,
  selectedIds,
  displayTimezone,
  initialMonth,
}: {
  accounts: TradingAccount[];
  selectedIds: string[];
  displayTimezone: string;
  initialMonth: string;
}) {
  const router = useRouter(),
    search = useSearchParams(),
    month = initialMonth;
  const [tradeFilters, setFilters] = useState<Filters>({
    accounts: selectedIds,
    start: `${month}-01`,
    end: format(endOfMonth(dayDate(`${month}-01`)), "yyyy-MM-dd"),
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
  const selectable = accounts.map((a) => ({
    id: a.id,
    name: a.displayName,
    firm: a.firm ?? "Personal",
    stage: a.stage,
  }));
  function updateFilters(next: Filters) {
    setFilters(next);
    if (next.accounts.join(",") !== filters.accounts.join(",")) {
      const query = new URLSearchParams({ accounts: next.accounts.join(",") });
      router.replace(`/?${query}`, { scroll: false });
    }
  }
  const message = accounts.length
    ? filters.accounts.length
      ? "No trades imported yet."
      : "Select an account to review its future performance."
    : "Add your first account.";
  const placeholder = <Empty text={message} />;
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
          accounts={selectable}
          demo={false}
        />
      </header>
      <div className="dashboard-intro">
        <ModeControl mode="real" />
        <span className="private-indicator">
          <ShieldCheck size={12} />
          Private · USD
        </span>
      </div>
      <div className="real-empty-banner">
        <div className="dialog-symbol">
          <WalletCards size={20} />
        </div>
        <div>
          <strong>
            {accounts.length
              ? "No trades imported yet"
              : "Add your first account"}
          </strong>
          <p>
            {accounts.length
              ? "Import Tradovate source reports to prepare for trade reconstruction. Performance and current balances remain unavailable until journal trades are reconstructed."
              : "Create a trading account to begin. You can also review the fictional dashboard in Demo mode."}
          </p>
        </div>
        {accounts.length ? (
          <Link href="/imports" className="back-link">
            Import source records
          </Link>
        ) : (
          <Link href="/prop-accounts" className="back-link">
            <Plus size={14} />
            Add Account
          </Link>
        )}
      </div>
      <div className="metric-grid">
        {[
          "Net P&L",
          "Trade win %",
          "Profit factor",
          "Day win %",
          "Average win/loss ratio",
        ].map((label) => (
          <section className="metric-card" key={label}>
            <div className="metric-label">
              {label}
              <Help
                label={label}
                text="Unavailable until real closed trades are imported. Demo results are never attached to your accounts."
              />
            </div>
            <div className="metric-body">
              <strong className="metric-value">—</strong>
            </div>
            <p className="metric-foot">No trades imported yet</p>
          </section>
        ))}
      </div>
      <div className="analysis-grid">
        <Panel
          title="Performance profile"
          help="No scoring methodology is implemented for real accounts."
        >
          {placeholder}
        </Panel>
        <Panel
          title="Activity tracker"
          help="Real trading activity will appear after importing closed trades."
        >
          {placeholder}
        </Panel>
        <Panel
          title="Daily net cumulative P&L"
          help="Unavailable until real trades are imported."
        >
          {placeholder}
        </Panel>
        <Panel title="Net daily P&L">{placeholder}</Panel>
        <Panel title="Recent trades">{placeholder}</Panel>
        <Panel
          title={
            filters.accounts.length > 1
              ? "Combined account balance"
              : "Account balance"
          }
          help="A nominal account size or explicitly entered opening baseline is not a verified current balance. Account balances remain unavailable until supporting real trading records are imported."
          action={<span className="panel-value">—</span>}
        >
          <Empty text="Current balance unavailable. Entered baselines are not verified balances." />
        </Panel>
      </div>
      <div className="section-divider">
        <span>THE DAILY PICTURE</span>
      </div>
      <div className="lower-grid">
        <TradingCalendar
          trades={[]}
          filters={filters}
          accounts={[]}
          initialMonth={month}
          demo={false}
        />
        <div className="lower-stack">
          <Panel
            title="Closed-trade drawdown"
            help="Uses closed-trade results, not a prop firm's intraday trailing drawdown."
          >
            {placeholder}
          </Panel>
          <Panel
            title="Trade time performance"
            help={`Default entry-time display: ${displayTimezone}. No completed real trades are available yet.`}
          >
            {placeholder}
            <p className="panel-note">Entry time · {displayTimezone}</p>
          </Panel>
        </div>
      </div>
    </motion.div>
  );
}
