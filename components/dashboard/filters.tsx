"use client";
import { useState } from "react";
import {
  SlidersHorizontal,
  CalendarDays,
  ChevronDown,
  WalletCards,
  RotateCcw,
} from "lucide-react";
import type { Filters, Account } from "@/lib/types";
import { initialFilters, DEMO_PERIOD } from "@/data/demo";
import { dateLabel } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
export function DashboardFilters({
  filters,
  onChange,
  accounts,
  demo = true,
  symbols = ["ES", "NQ", "MES", "MNQ"],
  timezone = "Asia/Jerusalem",
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  accounts: (Pick<Account, "id" | "name" | "firm"> & {
    stage: "Evaluation" | "Funded" | "Personal";
  })[];
  demo?: boolean;
  symbols?: string[];
  timezone?: string;
}) {
  const [dateOpen, setDateOpen] = useState(false);
  const [start, setStart] = useState(filters.start),
    [end, setEnd] = useState(filters.end);
  const extraCount =
    Number(filters.symbol !== "all") + Number(filters.direction !== "all");
  const accountLabel =
    accounts.length === 0
      ? "No accounts"
      : filters.accounts.length === accounts.length
        ? "All accounts"
        : filters.accounts.length === 1
          ? accounts.find((a) => a.id === filters.accounts[0])?.name
          : `${filters.accounts.length} accounts`;
  return (
    <div className="dashboard-controls">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="filter-trigger">
            <SlidersHorizontal size={14} />
            Filters
            {extraCount > 0 && (
              <span className="filter-count">{extraCount}</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="filters-popover" align="end">
          <strong>Trade filters</strong>
          <p className="small muted">
            Applies to performance, not account balance.
          </p>
          <label className="field-label">
            Symbol
            <select
              aria-label="Symbol"
              value={filters.symbol}
              onChange={(e) => onChange({ ...filters, symbol: e.target.value })}
            >
              <option value="all">All symbols</option>
              {symbols.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Direction
            <select
              aria-label="Direction"
              value={filters.direction}
              onChange={(e) =>
                onChange({
                  ...filters,
                  direction: e.target.value as Filters["direction"],
                })
              }
            >
              <option value="all">Long & short</option>
              <option value="long">Long</option>
              <option value="short">Short</option>
              {!demo && <option value="unknown">Unknown direction</option>}
            </select>
          </label>
          <Button
            variant="ghost"
            onClick={() =>
              onChange({ ...filters, symbol: "all", direction: "all" })
            }
          >
            <RotateCcw size={13} />
            Reset trade filters
          </Button>
        </PopoverContent>
      </Popover>
      <Popover
        open={dateOpen}
        onOpenChange={(open) => {
          setDateOpen(open);
          if (open) {
            setStart(filters.start);
            setEnd(filters.end);
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="date-trigger"
            aria-label="Select date range"
          >
            <CalendarDays size={14} />
            <span>
              {dateLabel(filters.start)} —{" "}
              {dateLabel(filters.end, "MMM d, yyyy")}
            </span>
            <ChevronDown size={13} />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="date-popover" align="end">
          <strong>Date range</strong>
          <p className="small muted">
            {demo ? "Close dates" : "Portion realized exit dates"} · {timezone}
          </p>
          {demo && (
            <div className="date-presets">
              <Button
                variant="outline"
                onClick={() => {
                  onChange({
                    ...filters,
                    start: initialFilters.start,
                    end: initialFilters.end,
                  });
                  setDateOpen(false);
                }}
              >
                March demo
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  onChange({ ...filters, ...DEMO_PERIOD });
                  setDateOpen(false);
                }}
              >
                All demo dates
              </Button>
            </div>
          )}
          <label className="field-label">
            From
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              max={end}
            />
          </label>
          <label className="field-label">
            To
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              min={start}
            />
          </label>
          {start && end && start > end && (
            <p className="small negative">End date must be after start date.</p>
          )}
          <Button
            disabled={
              !start ||
              !end ||
              start > end ||
              Number(end.slice(0, 4)) - Number(start.slice(0, 4)) > 2
            }
            onClick={() => {
              onChange({ ...filters, start, end });
              setDateOpen(false);
            }}
          >
            Apply range
          </Button>
          <p className="small muted">Range limited to 2 years per selection.</p>
        </PopoverContent>
      </Popover>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="account-trigger"
            disabled={accounts.length === 0}
          >
            <WalletCards size={15} />
            {accountLabel}
            <ChevronDown size={13} />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="accounts-popover" align="end">
          <strong>Accounts</strong>
          <div className="account-selection-actions">
            <button
              onClick={() =>
                onChange({ ...filters, accounts: accounts.map((a) => a.id) })
              }
            >
              Select all
            </button>
            <button onClick={() => onChange({ ...filters, accounts: [] })}>
              Clear
            </button>
          </div>
          {accounts.map((a) => (
            <label key={a.id} className="account-option">
              <input
                type="checkbox"
                checked={filters.accounts.includes(a.id)}
                onChange={(e) =>
                  onChange({
                    ...filters,
                    accounts: e.target.checked
                      ? [...filters.accounts, a.id]
                      : filters.accounts.filter((id) => id !== a.id),
                  })
                }
              />
              <span>
                <strong>{a.name}</strong>
                <small>
                  {a.firm} · {a.stage}
                </small>
              </span>
            </label>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}
