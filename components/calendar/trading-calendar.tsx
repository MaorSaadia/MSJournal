"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import {
  CalendarDays,
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
import { Panel, Help } from "@/components/dashboard/panel";
import { usePrivateRequest } from "./cache-provider";
import { requestJson } from "@/lib/client-api";
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
function useCalendarRequest<T>(query: string | null, revision: number) {
  const [state, setState] = useState<{ key: string; data?: T; error?: string }>(
    { key: "" },
  );
  useEffect(() => {
    if (!query) return;
    const abort = new AbortController();
    requestJson<T>(`/api/calendar?${query}`, { signal: abort.signal })
      .then((data) => setState({ key: query + revision, data }))
      .catch((error) => {
        if (!abort.signal.aborted)
          setState({
            key: query + revision,
            error:
              error instanceof Error
                ? error.message
                : "Unable to load calendar.",
          });
      });
    return () => abort.abort();
  }, [query, revision]);
  return state.key === (query ?? "") + revision ? state : { key: "" };
}
export function TradingCalendar({
  accounts,
  mode = "real",
  initialMonth,
  timezone,
  compact = false,
  filters,
  onAccountsChange,
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
    basisKey = compact ? "calBasis" : "basis",
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
  const requestedBasis = search.get(basisKey) === "net" ? "net" : "gross";
  const dayValue = search.get(dayKey),
    selectedDay =
      daySchema.safeParse(dayValue).success && dayValue!.startsWith(month)
        ? dayValue
        : null;
  const [revision, refresh] = useState(0),
    [monthDirection, setMonthDirection] = useState(1),
    [view, setView] = useState<"auto" | "grid" | "agenda">("auto");
  const focusReturn = useRef<HTMLButtonElement | null>(null),
    lastScope = useRef("");
  const query = new URLSearchParams({
    month,
    mode,
    accounts: ids.join(","),
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
  const state = useCalendarRequest<CalendarMonth>(query, revision),
    data = state.data;
  const reviewIndicators = usePrivateRequest<import("@/lib/reviews/indicators").ReviewIndicators>(query,"/api/reviews/indicators");
  const details = useCalendarRequest<CalendarDetails>(
    selectedDay ? query + `&day=${selectedDay}` : null,
    revision,
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
  useEffect(() => {
    const handler = (event?: Event) => {
      if ((event as CustomEvent<{url?:string}> | undefined)?.detail?.url?.startsWith("/api/reviews")) return;
      refresh((n) => n + 1);
    };
    const visible = () => {
      if (document.visibilityState === "visible") handler();
    };
    window.addEventListener("focus", handler);
    window.addEventListener("msjournal:data-updated", handler);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("focus", handler);
      window.removeEventListener("msjournal:data-updated", handler);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
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
  const countLabel = mode === "demo" ? "Trades closed" : "Matched portions";
  const basis = data?.basis ?? requestedBasis;
  const basisLabel =
    basis === "gross"
      ? "Gross P&L"
      : data?.estimated
        ? "Estimated net P&L"
        : "Net P&L";
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
          {date === data?.today && <small>Today</small>}
          {inMonth && !!reviewIndicators.data?.days[date] && <span className="calendar-review-dot" title="Trade reviews saved" aria-label="Trade reviews saved">✎</span>}
        </span>
        {inMonth && (
          <>
            <strong>{d ? journalMoney(value, true) : "—"}</strong>
            <span>
              {d
                ? `${d.count} ${countLabel.toLowerCase()}`
                : !inRange
                  ? "Outside range"
                  : "No activity imported"}
            </span>
            {d && <span className="calendar-outcome">{outcome}</span>}
          </>
        )}
      </button>
    );
  };
  return (
    <Panel
      title="Trading calendar"
      className={`calendar-panel trading-calendar ${compact ? "calendar-compact" : "calendar-full"}`}
      help="Realized P&L follows each portion’s actual exit date in the journal display timezone. Empty days do not establish complete CSV coverage."
      action={
        <span className="calendar-timezone">
          {data?.timezone ?? timezone} · USD
        </span>
      }
    >
      <div className="calendar-toolbar">
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
            <ChevronLeft size={16} />
          </Button>
          <h3>{monthLabel(month)}</h3>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next month"
            disabled={month === "9998-12"}
            onClick={() =>
              update({ [monthKey]: shiftMonth(month, 1), [dayKey]: null })
            }
          >
            <ChevronRight size={16} />
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              update({
                [monthKey]: todayIn(data?.timezone ?? timezone).slice(0, 7),
                [dayKey]: null,
              })
            }
          >
            Today
          </Button>
          <label className="calendar-month-input">
            <span className="sr-only">Choose month and year</span>
            <input
              type="month"
              aria-label="Choose month and year"
              min="1900-01"
              max="9998-12"
              value={month}
              onChange={(e) => {
                if (monthSchema.safeParse(e.target.value).success)
                  update({ [monthKey]: e.target.value, [dayKey]: null });
              }}
            />
          </label>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Refresh calendar"
          onClick={() => refresh((n) => n + 1)}
        >
          <RefreshCw size={14} />
        </Button>
      </div>
      <div className="calendar-controls">
        <details className="calendar-account-filter">
          <summary>
            {ids.length === available.length
              ? `All ${archived ? "active and archived" : "unarchived"} accounts`
              : `${ids.length} accounts selected`}
          </summary>
          <div className="calendar-account-options">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                onAccountsChange
                  ? onAccountsChange(available.map((a) => a.id))
                  : update({ accounts: null, [dayKey]: null })
              }
            >
              Select all {archived ? "including archived" : "unarchived"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                onAccountsChange
                  ? onAccountsChange([])
                  : update({ accounts: "", [dayKey]: null })
              }
            >
              Clear selection
            </Button>
            {available.length ? (
              available.map((a) => (
                <label key={a.id}>
                  <input
                    type="checkbox"
                    checked={ids.includes(a.id)}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...ids, a.id]
                        : ids.filter((id) => id !== a.id);
                      if (onAccountsChange) onAccountsChange(next);
                      else update({ accounts: next.join(","), [dayKey]: null });
                    }}
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
          </div>
        </details>
        {mode === "real" && (
          <label className="calendar-archived">
            <input
              type="checkbox"
              checked={archived}
              onChange={(e) => {
                if (onArchivedChange) onArchivedChange(e.target.checked);
                else
                  update({
                    archived: e.target.checked ? "1" : null,
                    accounts: null,
                    [dayKey]: null,
                  });
              }}
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
        <div
          className="calendar-view-switch"
          role="group"
          aria-label="Calendar layout"
        >
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={view !== "agenda"}
            onClick={() => setView("grid")}
          >
            Grid
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={view === "agenda"}
            onClick={() => setView("agenda")}
          >
            Agenda
          </Button>
        </div>
      </div>
      <motion.div
        key={month}
        initial={{ opacity: 0, x: monthDirection * 6 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.16 }}
      >
        {state.error ? (
          <div className="calendar-request-error" role="alert">
            <strong>Calendar could not be loaded.</strong>
            <p>{state.error}</p>
            <Button variant="outline" onClick={() => refresh((n) => n + 1)}>
              Try again
            </Button>
          </div>
        ) : !data ? (
          <div className="calendar-loading" role="status">
            Loading {monthLabel(month)}…
          </div>
        ) : (
          <>
            {(data.processing.unpublished > 0 ||
              data.processing.failed ||
              data.processing.outdated) && (
              <p className="calendar-status" role="status">
                {data.processing.failed
                  ? "Processing failed for a selected account. Published results may be incomplete."
                  : data.processing.outdated
                    ? "Reprocessing is required for a selected account."
                    : `${data.processing.unpublished} imported portions in this month are not processed yet.`}{" "}
                <Link href="/trade-view">Review processing</Link>.
              </p>
            )}
            {!data.netAvailable && (
              <p className="calendar-scope-note">
                Gross view ·{" "}
                {data.summary.count
                  ? "Fees are incomplete for this month and filters. A complete net view is unavailable."
                  : "Net view becomes available when every realized record in the selection has known fees."}
                {requestedBasis === "net"
                  ? " Your requested net view cannot currently be shown."
                  : ""}
              </p>
            )}
            <div
              className="calendar-month-summary"
              aria-label="Monthly summary"
            >
              <div>
                <span>{basisLabel}</span>
                <strong className={tone(data.summary.total)}>
                  {journalMoney(data.summary.total, true)}
                </strong>
              </div>
              <div>
                <span>Days with activity</span>
                <strong>{data.summary.activeDays}</strong>
              </div>
              <div>
                <span>Profitable / losing / breakeven</span>
                <strong>
                  {data.summary.positive} / {data.summary.negative} /{" "}
                  {data.summary.zero}
                </strong>
              </div>
              <div>
                <span>{countLabel}</span>
                <strong>{data.summary.count}</strong>
              </div>
              <div>
                <span>Best active day</span>
                <strong>
                  {data.summary.best
                    ? `${data.summary.best.date.slice(5)} · ${journalMoney(basis === "gross" ? data.summary.best.gross : data.summary.best.net, true)}`
                    : "Unavailable"}
                </strong>
              </div>
              <div>
                <span>Worst active day</span>
                <strong>
                  {data.summary.worst
                    ? `${data.summary.worst.date.slice(5)} · ${journalMoney(basis === "gross" ? data.summary.worst.gross : data.summary.worst.net, true)}`
                    : "Unavailable"}
                </strong>
              </div>
            </div>
            <div className={`calendar-body calendar-view-${view}`}>
              <div className="calendar-grid-view">
                <div className="calendar-week-head">
                  {Array.from({ length: 7 }, (_, i) => (
                    <span key={i}>
                      {
                        ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
                          (i + data.weekStartsOn) % 7
                        ]
                      }
                    </span>
                  ))}
                  <span className="calendar-week-total-label">
                    Weekly total{" "}
                    <Help
                      label="Weekly scope"
                      text="Only dates belonging to the displayed month and active filters are included in each row. Weekly totals sum to the monthly result."
                    />
                  </span>
                </div>
                <div className="calendar-weeks">
                  {data.weeks.map((week, i) => (
                    <div className="calendar-week" key={week.dates[0]}>
                      {week.dates.map((date) => dayButton(date))}
                      <div className="weekly-summary">
                        <span>Week {i + 1}</span>
                        <strong className={tone(week.summary.total)}>
                          {journalMoney(week.summary.total, true)}
                        </strong>
                        <span>{week.summary.activeDays} active days</span>
                        <span>
                          {week.summary.count} {countLabel.toLowerCase()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="calendar-agenda-view">
                {data.weeks
                  .flatMap((w) => w.dates)
                  .filter((d) => d.startsWith(month))
                  .map((date) => dayButton(date, true))}
                <div className="calendar-agenda-weeks">
                  {data.weeks.map((week, i) => (
                    <p key={i}>
                      Week {i + 1} · {journalMoney(week.summary.total, true)} ·{" "}
                      {week.summary.activeDays} active days
                    </p>
                  ))}
                </div>
              </div>
            </div>
            {!data.summary.activeDays && (
              <p className="calendar-empty-note">
                {!ids.length
                  ? "Select an account to view results."
                  : mode === "demo"
                    ? "No matching demo activity. Fictional trades cover January–March 2026."
                    : "No imported realized records for this month and account selection. CSV coverage may be incomplete."}
              </p>
            )}
            <div className="calendar-footer">
              <span>
                <i className="positive-dot" />
                Profit
              </span>
              <span>
                <i className="negative-dot" />
                Loss
              </span>
              <span>Zero with activity = breakeven</span>
              <span>
                <CalendarDays size={12} />
                Select any day for details
              </span>
              {compact && (
                <Link
                  href={`/calendar?${new URLSearchParams({ month, mode, accounts: ids.join(","), basis, archived: archived ? "1" : "0" })}`}
                >
                  Full calendar →
                </Link>
              )}
            </div>
          </>
        )}
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
              <Button onClick={() => refresh((n) => n + 1)}>
                Retry day details
              </Button>
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
              <Link
                className="back-link"
                href={`/trade-view?${new URLSearchParams({ mode, accounts: ids.join(","), archived: archived ? "1" : "0", basis, dateBasis: "activity", start: selectedDay!, end: selectedDay!, ...(filters?.symbol && filters.symbol !== "all" ? { symbol: filters.symbol } : {}), ...(filters?.direction ? { direction: filters.direction } : {}) })}`}
              >
                Open this day in Trade View →
              </Link>
              {mode === "real" && (
                <p className="calendar-scope-note">
                  Complete trades are not verified. Counts reflect matched
                  portions, including partial realized activity.
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
                        {r.status}
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
                          href={`/trade-view/${r.id}?${new URLSearchParams({ mode, accounts: ids.join(","), archived: archived ? "1" : "0", basis, dateBasis: "activity", start: selectedDay!, end: selectedDay!, ...(filters?.symbol && filters.symbol !== "all" ? { symbol: filters.symbol } : {}), ...(filters?.direction ? { direction: filters.direction } : {}), from: `${pathname}?${search}` })}`}
                        >
                          View full record →
                        </Link>
                        <Link
                          href={`/trade-view/${r.id}?${new URLSearchParams({ mode, accounts: ids.join(","), archived: archived ? "1" : "0", basis, tab: "review", dateBasis: "activity", start: selectedDay!, end: selectedDay!, ...(filters?.symbol && filters.symbol !== "all" ? { symbol: filters.symbol } : {}), ...(filters?.direction ? { direction: filters.direction } : {}), from: `${pathname}?${search}` })}`}
                        >
                          Review →
                        </Link>
                        <p className="small muted">This review belongs to the whole record, including contributions on other days.</p>
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
    </Panel>
  );
}
