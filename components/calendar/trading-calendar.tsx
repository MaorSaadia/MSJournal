"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import {
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Help } from "@/components/dashboard/panel";
import {
  useCalendarCache,
  useCalendarRequest,
  usePrivateRequest,
} from "./cache-provider";
import { CalendarGrid, CalendarSkeleton } from "./calendar-grid";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { journalMoney } from "@/lib/journal/calculations";
import { journalTimestamp } from "@/lib/timezones";
import { D } from "@/lib/journal/processing";
import {
  monthSchema,
  daySchema,
  shiftMonth,
  shiftDay,
  todayIn,
  type CalendarMonth,
  type CalendarDetails,
  type CalendarAccount,
} from "@/lib/calendar/model";
import type { Filters } from "@/lib/types";

function tone(value: string | null) {
  return value === null
    ? ""
    : new D(value).gt(0)
      ? "positive"
      : new D(value).lt(0)
        ? "negative"
        : "";
}
function dateLabel(day: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "full",
    timeZone: "UTC",
  }).format(new Date(day + "T12:00:00Z"));
}
function monthLabel(month: string) {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(month + "-01T12:00:00Z"));
}
export function TradingCalendar({
  accounts,
  mode = "real",
  initialMonth,
  timezone,
  compact = false,
  filters,
  onArchivedChange,
  includeArchived = false,
}: {
  accounts: CalendarAccount[];
  mode?: "real" | "demo";
  initialMonth: string;
  timezone: string;
  compact?: boolean;
  filters?: Filters;
  onAccountsChange?: (ids: string[]) => void;
  onArchivedChange?: (include: boolean) => void;
  includeArchived?: boolean;
}) {
  const search = useSearchParams(),
    pathname = usePathname();
  const monthKey = compact ? "calMonth" : "month",
    basisKey = "basis",
    dayKey = compact ? "calDay" : "day";
  const rawMonth = search.get(monthKey),
    month = monthSchema.safeParse(rawMonth).success ? rawMonth! : initialMonth;
  const archived = compact ? includeArchived : search.get("archived") === "1";
  const available = accounts.filter((a) => archived || !a.archived);
  const ids = compact
    ? filters!.accounts
    : search.has("accounts")
      ? search.get("accounts")!.split(",").filter(Boolean)
      : available.map((a) => a.id);
  const requestedBasis =
    (search.get(basisKey) ?? (compact ? search.get("calBasis") : null)) ===
    "net"
      ? "net"
      : "gross";
  const dayValue = search.get(dayKey),
    selectedDay =
      daySchema.safeParse(dayValue).success && dayValue!.startsWith(month)
        ? dayValue
        : null;
  const [monthDirection, setMonthDirection] = useState(1);
  const [pickerYear, setPickerYear] = useState(month.slice(0, 4));
  const { remember, weekStartsOn } = useCalendarCache();
  const view: "auto" | "grid" | "agenda" = compact
    ? "grid"
    : search.get("view") === "agenda"
      ? "agenda"
      : search.get("view") === "grid"
        ? "grid"
        : "auto";
  useEffect(() => {
    if (!compact) remember(`${pathname}?${search}`);
  }, [compact, pathname, search, remember]);
  const focusReturn = useRef<HTMLButtonElement | null>(null),
    lastScope = useRef("");
  const query = new URLSearchParams({
    month,
    mode,
    accounts: [...ids].sort().join(","),
    archived: archived ? "1" : "0",
    basis: requestedBasis,
    ...(filters
      ? {
          start: filters.start,
          end: filters.end,
          symbol: filters.symbol,
          direction: filters.direction,
        }
      : {}),
  }).toString();
  const state = useCalendarRequest<CalendarMonth>(query),
    data = state.data;
  const reviewIndicators = usePrivateRequest<
    import("@/lib/reviews/indicators").ReviewIndicators
  >(query, "/api/reviews/indicators");
  const dailyIndicators = usePrivateRequest<{
    userId: string;
    timezone: string;
    days: Record<string, string>;
  }>(
    mode === "real" ? new URLSearchParams({ month }).toString() : null,
    "/api/daily/indicators",
  );
  const refresh = state.refresh;
  const details = useCalendarRequest<CalendarDetails>(
    selectedDay ? query + `&day=${selectedDay}` : null,
  );
  function update(values: Record<string, string | null>, push = true) {
    if (values[monthKey] && values[monthKey] !== month)
      setMonthDirection(values[monthKey]! > month ? 1 : -1);
    const next = new URLSearchParams(search.toString());
    Object.entries(values).forEach(([key, value]) =>
      value === null ? next.delete(key) : next.set(key, value),
    );
    const url = `${pathname}?${next}`;
    if (push) window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  }
  // A new account/filter scope deliberately closes details; month/day navigation keeps its own URL.
  const scope = JSON.stringify({ ids, archived, filters, mode });
  useEffect(() => {
    if (lastScope.current && lastScope.current !== scope && selectedDay) {
      const next = new URLSearchParams(search.toString());
      next.delete(dayKey);
      window.history.replaceState(null, "", `${pathname}?${next}`);
    }
    lastScope.current = scope;
  }, [scope, selectedDay, search, dayKey, pathname]);
  const countLabel = "Trades";
  const basis = data?.basis ?? requestedBasis;
  const basisLabel =
    basis === "gross"
      ? "Gross P&L"
      : data?.estimated
        ? "Estimated net P&L"
        : "Net P&L";
  const scopeLabel =
    ids.length === available.length
      ? `All ${archived ? "active and archived" : "unarchived"} accounts`
      : ids.length === 1
        ? (available.find((a) => a.id === ids[0])?.name ?? "1 account")
        : `${ids.length} accounts selected`;
  const byDate = new Map(data?.days.map((d) => [d.date, d]));
  const chooseDay = (
    day: string,
    event?: React.MouseEvent<HTMLButtonElement>,
  ) => {
    if (event) focusReturn.current = event.currentTarget;
    update({ [dayKey]: day, [monthKey]: day.slice(0, 7) });
  };
  const dayButton = (date: string, agenda = false) => {
    const d = byDate.get(date),
      inMonth = date.startsWith(month),
      inRange = !filters || (date >= filters.start && date <= filters.end);
    const value = d ? (basis === "gross" ? d.gross : d.net) : null,
      winRate = d
        ? basis === "gross"
          ? d.grossStatistics.winRate
          : d.netStatistics.winRate
        : null,
      winPercent = winRate === null ? null : `${winRate}%`,
      outcome = d
        ? value === null
          ? "Net unavailable"
          : new D(value).isZero()
            ? "Breakeven"
            : new D(value).gt(0)
              ? "Profit"
              : "Loss"
        : "No realized activity";
    return (
      <button
        type="button"
        key={date}
        disabled={!inMonth}
        onClick={(e) => chooseDay(date, e)}
        className={`calendar-day ${d ? (new D(value ?? 0).gt(0) ? "winning-day" : new D(value ?? 0).lt(0) ? "losing-day" : "flat-day") : ""} ${!inMonth ? "outside-month" : ""} ${!inRange ? "outside-range" : ""} ${date === data?.today ? "calendar-today" : ""} ${date === selectedDay ? "calendar-selected" : ""}`}
        aria-label={`${dateLabel(date)}, ${!inMonth ? "adjacent month, not included" : !inRange ? "outside selected date range" : d ? `${outcome}, ${journalMoney(value, true)}, ${d.count} ${countLabel}` : "no imported realized activity"}${inMonth ? ". View day details" : ""}`}
        aria-pressed={date === selectedDay}
      >
        <span className="day-number">
          {agenda ? dateLabel(date) : Number(date.slice(-2))}
          {date === data?.today && (
            <i className="calendar-today-dot" aria-label="Today" />
          )}
          {inMonth && dailyIndicators.data?.days[date] && (
            <span
              className="calendar-daily-note"
              aria-label={`Daily journal ${dailyIndicators.data.days[date]}`}
              title={`Personal daily journal: ${dailyIndicators.data.days[date]}`}
            >
              D
            </span>
          )}
          {inMonth && !!reviewIndicators.data?.days[date] && (
            <span
              className="calendar-review-dot"
              title="Trade reviews saved"
              aria-label="Trade reviews saved"
            >
              ✎
            </span>
          )}
        </span>
        {inMonth && d && (
          <>
            <strong>{journalMoney(value, true)}</strong>
            <span className="calendar-day-count">
              <span
                title={
                  mode === "demo"
                    ? "Complete closed demo trades."
                    : "Each grouped journal record counts as one trade per active day. Related partial exits are combined; complete position coverage depends on the imported history."
                }
              >
                {d.count}{" "}
                {d.count === 1 ? "trade" : "trades"}
              </span>
            </span>
            <span
              className="calendar-day-win-rate"
              aria-label={`Trade win percentage: ${winPercent ?? "unavailable"}, ${basis === "gross" ? "before fees" : "after fees"}. Breakeven results are included in the total.`}
              title={`Winning trades active this day / all trades active this day, ${basis === "gross" ? "before" : "after"} fees. Breakeven results count in the total.`}
            >
              {winPercent ?? "—"}
            </span>
          </>
        )}
      </button>
    );
  };
  return (
    <section
      className={`panel calendar-panel trading-calendar calendar-refined ${compact ? "calendar-compact" : "calendar-full"}`}
      aria-label="Trading calendar"
    >
      <header className="calendar-toolbar">
        <div className="month-controls">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous month"
            disabled={month === "1900-01"}
            onClick={() =>
              update({ [monthKey]: shiftMonth(month, -1), [dayKey]: null })
            }
          >
            <ChevronLeft size={14} />
          </Button>
          <Popover
            onOpenChange={(open) => {
              if (open) setPickerYear(month.slice(0, 4));
            }}
          >
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                className="calendar-month-title"
                aria-label="Choose month and year"
              >
                <h3>{monthLabel(month)}</h3>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="calendar-month-picker" align="start">
              <strong>Choose month and year</strong>
              <label>
                Month
                <select
                  aria-label="Calendar month"
                  value={month.slice(5)}
                  onChange={(e) =>
                    update({
                      [monthKey]: month.slice(0, 4) + "-" + e.target.value,
                      [dayKey]: null,
                    })
                  }
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i} value={String(i + 1).padStart(2, "0")}>
                      {new Intl.DateTimeFormat("en", {
                        month: "long",
                        timeZone: "UTC",
                      }).format(new Date(Date.UTC(2026, i, 1)))}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Year
                <input
                  type="number"
                  aria-label="Calendar year"
                  min={1900}
                  max={9998}
                  value={pickerYear}
                  onChange={(e) => {
                    setPickerYear(e.target.value);
                    const year = Number(e.target.value);
                    if (Number.isInteger(year) && year >= 1900 && year <= 9998)
                      update({
                        [monthKey]: `${year}-${month.slice(5)}`,
                        [dayKey]: null,
                      });
                  }}
                />
              </label>
            </PopoverContent>
          </Popover>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next month"
            disabled={month === "9998-12"}
            onClick={() =>
              update({ [monthKey]: shiftMonth(month, 1), [dayKey]: null })
            }
          >
            <ChevronRight size={14} />
          </Button>
          <Button
            variant="outline"
            className="this-month"
            onClick={() =>
              update({
                [monthKey]: todayIn(data?.timezone ?? timezone).slice(0, 7),
                [dayKey]: null,
              })
            }
          >
            This month
          </Button>
        </div>
        <div className="calendar-header-right">
          <div className="calendar-monthly-stats" aria-label="Monthly summary">
            <span>Monthly stats</span>
            <strong
              className={`calendar-pnl-badge ${data ? tone(data.summary.total) : ""}`}
            >
              {data ? journalMoney(data.summary.total, true) : "—"}
            </strong>
            <span className="calendar-days-badge">
              {data ? data.summary.activeDays : "—"} days
            </span>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Calendar settings"
              >
                <SlidersHorizontal size={15} />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="calendar-settings" align="end">
              <strong>Filters & display</strong>
              {!compact ? (
                <fieldset className="calendar-account-options">
                  <legend>Accounts</legend>
                  <div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => update({ accounts: null, [dayKey]: null })}
                    >
                      Select all
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => update({ accounts: "", [dayKey]: null })}
                    >
                      Clear selection
                    </Button>
                  </div>
                  {available.length ? (
                    available.map((a) => (
                      <label key={a.id}>
                        <input
                          type="checkbox"
                          checked={ids.includes(a.id)}
                          onChange={(e) =>
                            update({
                              accounts: (e.target.checked
                                ? [...ids, a.id]
                                : ids.filter((id) => id !== a.id)
                              ).join(","),
                              [dayKey]: null,
                            })
                          }
                        />
                        {a.name}
                        {a.archived ? " (archived)" : ""}
                      </label>
                    ))
                  ) : (
                    <p>
                      No accounts.{" "}
                      <Link href="/prop-accounts">Add your first account</Link>.
                    </p>
                  )}
                </fieldset>
              ) : (
                <p className="calendar-settings-note">
                  Account, date, symbol and direction follow the dashboard
                  filters.
                </p>
              )}
              {mode === "real" && (
                <label className="calendar-archived">
                  <input
                    type="checkbox"
                    checked={archived}
                    onChange={(e) =>
                      onArchivedChange
                        ? onArchivedChange(e.target.checked)
                        : update({
                            archived: e.target.checked ? "1" : null,
                            accounts: null,
                            [dayKey]: null,
                          })
                    }
                  />
                  Include archived accounts
                </label>
              )}
              <label className="calendar-basis-label">
                P&L basis
                <select
                  aria-label="Calendar P&L basis"
                  value={basis}
                  onChange={(e) =>
                    update({ [basisKey]: e.target.value, [dayKey]: null })
                  }
                >
                  <option value="gross">Gross P&L</option>
                  <option value="net" disabled={!data?.netAvailable}>
                    {data?.estimated ? "Estimated net P&L" : "Net P&L"}
                  </option>
                </select>
              </label>
              {!data?.netAvailable && (
                <p className="calendar-settings-note">
                  A complete net result requires known fees for every record in
                  this month and selection. Gross remains available; unknown
                  fees are not zero.
                </p>
              )}
              <Link href="/settings">
                Journal timezone · {data?.timezone ?? timezone}
              </Link>
              <Link href="/settings">
                Week starts · {weekStartsOn === 1 ? "Monday" : "Sunday"}
              </Link>
            </PopoverContent>
          </Popover>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Refresh calendar"
            onClick={() => refresh()}
          >
            <RefreshCw
              size={14}
              className={state.pending && data ? "calendar-refreshing" : ""}
            />
          </Button>
        </div>
      </header>
      <div className="calendar-context">
        <span className="calendar-account-scope">{scopeLabel}</span>
        <span className="calendar-basis-badge">
          {basisLabel}
          <Help
            label="Calendar P&L basis"
            text={
              !data?.netAvailable
                ? "Fees are incomplete or there is no activity for this selection. Gross P&L is available; net requires every included record’s fees. Missing fees are never treated as zero."
                : data.estimated
                  ? "Net P&L subtracts known fees. Some fees are configured estimates."
                  : "Net P&L subtracts known fees; gross P&L excludes fees."
            }
          />
        </span>
        <span className="calendar-timezone">
          {data?.timezone ?? timezone} · USD
        </span>
        {state.pending && data && (
          <span className="calendar-background-status" role="status">
            Updating…
          </span>
        )}
        {!compact && (
          <div
            className="calendar-view-switch"
            role="group"
            aria-label="Calendar layout"
          >
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={view !== "agenda"}
              onClick={() => update({ view: "grid" })}
            >
              Grid
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={view === "agenda"}
              onClick={() => update({ view: "agenda" })}
            >
              Agenda
            </Button>
          </div>
        )}
      </div>
      {state.error && (
        <div
          className={data ? "calendar-stale-notice" : "calendar-request-error"}
          role="alert"
        >
          <strong>
            {data
              ? "Showing saved results; they may be stale."
              : "Calendar could not be loaded."}
          </strong>
          <span>{state.error}</span>
          <Button variant="ghost" size="sm" onClick={() => refresh()}>
            {data ? "Retry" : "Try again"}
          </Button>
        </div>
      )}
      <motion.div
        key={month}
        initial={{ opacity: 0, x: monthDirection * 6 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.16 }}
      >
        {data ? (
          <>
            {(data.processing.unpublished > 0 ||
              data.processing.failed ||
              data.processing.outdated) && (
              <p className="calendar-status" role="status">
                {data.processing.failed
                  ? "Processing failed for a selected account. Results may be incomplete."
                  : data.processing.outdated
                    ? "Some imported results need reprocessing."
                    : "Some imported results have not been processed yet."}{" "}
                <Link href="/trade-view">Review processing</Link>.
              </p>
            )}
            <CalendarGrid
              data={data}
              view={view}
              dayButton={dayButton}
              compact={compact}
              fullHref={`/calendar?${new URLSearchParams({ month, mode, accounts: ids.join(","), basis, archived: archived ? "1" : "0" })}`}
            />
            {!data.summary.activeDays && (
              <p className="calendar-empty-note">
                {!ids.length
                  ? "Select an account to view results."
                  : mode === "demo"
                    ? "No matching demo activity. Fictional trades cover January–March 2026."
                    : "No imported realized records for this month and account selection. CSV coverage may be incomplete."}
              </p>
            )}
          </>
        ) : !state.error ? (
          <CalendarSkeleton month={month} weekStartsOn={weekStartsOn} />
        ) : null}
      </motion.div>

      <Dialog
        open={!!selectedDay}
        onOpenChange={(open) => {
          if (!open) update({ [dayKey]: null }, false);
        }}
      >
        <DialogContent
          className="calendar-day-drawer"
          style={{ translate: "none" }}
          onCloseAutoFocus={(event) => {
            // An exiting drawer can finish after another day was opened.
            // Never move focus behind that new modal.
            if (new URL(window.location.href).searchParams.has(dayKey)) {
              event.preventDefault();
              return;
            }
            if (focusReturn.current?.isConnected) {
              event.preventDefault();
              focusReturn.current.focus();
            }
          }}
        >
          <DialogTitle>
            {selectedDay ? dateLabel(selectedDay) : "Day details"}
          </DialogTitle>
          <DialogDescription>
            {details.data?.timezone ?? data?.timezone ?? timezone} ·{" "}
            {mode === "demo"
              ? "Read-only demo"
              : "Imported realized contributions"}
          </DialogDescription>
          {mode === "real" && selectedDay && (
            <Link
              href={`/day-view?${new URLSearchParams({ date: selectedDay, accounts: ids.join(","), archived: archived ? "1" : "0", contextTimezone: timezone, ...(filters?.symbol && filters.symbol !== "all" ? { symbol: filters.symbol } : {}), ...(filters?.direction ? { direction: filters.direction } : {}), from: `${pathname}?${search}` })}`}
            >
              Open daily journal
            </Link>
          )}
          <div className="calendar-day-navigation">
            <Button
              variant="outline"
              aria-label="Previous day"
              onClick={() => chooseDay(shiftDay(selectedDay!, -1))}
            >
              <ChevronLeft size={15} />
              Previous day
            </Button>
            <Button
              variant="outline"
              aria-label="Next day"
              onClick={() => chooseDay(shiftDay(selectedDay!, 1))}
            >
              Next day
              <ChevronRight size={15} />
            </Button>
          </div>
          {details.error ? (
            <div role="alert">
              <p>{details.error}</p>
              <Button onClick={() => refresh()}>Retry day details</Button>
            </div>
          ) : !details.data ? (
            <p role="status">Loading day details…</p>
          ) : (
            <>
              <p className="calendar-detail-scope">
                Accounts:{" "}
                {details.data.accounts
                  .map((a) => a.name + (a.archived ? " (archived)" : ""))
                  .join(", ") || "None selected"}
              </p>
              <div className="calendar-day-totals">
                <div>
                  <span>Gross P&L</span>
                  <strong>
                    {journalMoney(details.data.day?.gross ?? "0", true)}
                  </strong>
                </div>
                <div>
                  <span>Fees</span>
                  <strong>
                    {journalMoney(details.data.day?.feeAmount ?? null)}
                  </strong>
                </div>
                <div>
                  <span>
                    {details.data.day?.estimated
                      ? "Estimated net P&L"
                      : "Net P&L"}
                  </span>
                  <strong>
                    {journalMoney(details.data.day?.net ?? null, true)}
                  </strong>
                </div>
                <div>
                  <span>{countLabel}</span>
                  <strong>{details.data.day?.count ?? 0}</strong>
                </div>
              </div>
              {mode === "real" && (
                <h3 className="calendar-closed-heading">Trades active this day</h3>
              )}
              <Link
                className="back-link"
                href={`/trade-view?${new URLSearchParams({ mode, accounts: ids.join(","), archived: archived ? "1" : "0", basis, outcomeBasis: mode === "real" ? "portions" : "complete", dateBasis: "activity", start: selectedDay!, end: selectedDay!, ...(filters?.symbol && filters.symbol !== "all" ? { symbol: filters.symbol } : {}), ...(filters?.direction ? { direction: filters.direction } : {}) })}`}
              >
                Open this day in Trade View →
              </Link>
              {mode === "real" && (
                <p className="calendar-scope-note">
                  Related report portions are combined into one journal trade. A trade
                  with exits on different days counts once on each active day;
                  amounts and win percentages reflect only this day&apos;s exits.
                </p>
              )}
              {details.data.records.length ? (
                <div className="calendar-contributions">
                  {details.data.records.map((r) => (
                    <article key={r.id}>
                      <div className="calendar-contribution-heading">
                        <strong>{r.symbol}</strong>
                        <span>{r.direction}</span>
                        <strong
                          className={tone(basis === "gross" ? r.gross : r.net)}
                        >
                          {journalMoney(
                            basis === "gross" ? r.gross : r.net,
                            true,
                          )}
                        </strong>
                      </div>
                      <p>{r.account}</p>
                      <p>
                        Last exit this day:{" "}
                        {journalTimestamp(r.exitAt, details.data!.timezone)}
                      </p>
                      <p>
                        Closed quantity this day:{" "}
                        {r.quantity === null
                          ? "Not modeled in demo"
                          : new D(r.quantity).toFixed()}
                      </p>
                      <p>
                        {r.partial ? "Partial daily contribution · " : ""}
                        {r.status === "Matched portions"
                          ? "Grouped trade"
                          : r.status}
                      </p>
                      <p>
                        Daily gross {journalMoney(r.gross, true)} · fees{" "}
                        {journalMoney(r.fees)} ·{" "}
                        {r.estimated ? "estimated " : ""}net{" "}
                        {journalMoney(r.net, true)}
                      </p>
                      {r.href && (
                        <>
                          <Link
                            href={`/trade-view/${r.id}?${new URLSearchParams({ mode, accounts: ids.join(","), archived: archived ? "1" : "0", basis, outcomeBasis: mode === "real" ? "portions" : "complete", dateBasis: "activity", start: selectedDay!, end: selectedDay!, ...(filters?.symbol && filters.symbol !== "all" ? { symbol: filters.symbol } : {}), ...(filters?.direction ? { direction: filters.direction } : {}), from: `${pathname}?${search}` })}`}
                          >
                            View full record →
                          </Link>
                          <Link
                            href={`/trade-view/${r.id}?${new URLSearchParams({ mode, accounts: ids.join(","), archived: archived ? "1" : "0", basis, tab: "review", dateBasis: "activity", start: selectedDay!, end: selectedDay!, ...(filters?.symbol && filters.symbol !== "all" ? { symbol: filters.symbol } : {}), ...(filters?.direction ? { direction: filters.direction } : {}), from: `${pathname}?${search}` })}`}
                          >
                            Review →
                          </Link>
                          <p className="small muted">
                            This review belongs to the whole record, including
                            contributions on other days.
                          </p>
                        </>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="calendar-empty-note">
                  No {mode === "demo" ? "demo" : "imported realized"} records
                  for the selected accounts and date
                  {filters &&
                  (selectedDay! < filters.start || selectedDay! > filters.end)
                    ? " within the active date range"
                    : ""}
                  . This does not establish that no trading occurred.
                </p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
