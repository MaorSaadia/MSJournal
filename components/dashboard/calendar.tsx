"use client";
import { useState } from "react";
import {
  addMonths,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  format,
} from "date-fns";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import {
  currentMonth,
  dayDate,
  dateKeys,
  dayKey,
  dateLabel,
  timestampLabel,
} from "@/lib/dates";
import { dailyResults, money, netCents } from "@/lib/calculations";
import type { Account, Filters, Trade } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Panel } from "./panel";
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function TradingCalendar({
  trades,
  filters,
  accounts,
  initialMonth = "2026-03",
  demo = true,
}: {
  trades: Trade[];
  filters: Filters;
  accounts: Account[];
  initialMonth?: string;
  demo?: boolean;
}) {
  const [month, setMonth] = useState(initialMonth);
  const [direction, setDirection] = useState(1);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const start = dayDate(`${month}-01`),
    end = endOfMonth(start);
  const days = dateKeys(
    dayKey(startOfWeek(start).toISOString()),
    dayKey(endOfWeek(end).toISOString()),
  );
  const results = dailyResults(trades);
  const byDate = new Map(results.map((d) => [d.date, d]));
  const monthResults = results.filter((d) => d.date.startsWith(month));
  const monthNet = monthResults.reduce((s, d) => s + d.netCents, 0);
  const weeks = Array.from({ length: days.length / 7 }, (_, i) =>
    days.slice(i * 7, i * 7 + 7),
  );
  const changeMonth = (step: number) => {
    setDirection(step);
    setMonth(format(addMonths(start, step), "yyyy-MM"));
  };
  const detail = selectedDay ? byDate.get(selectedDay) : undefined;
  return (
    <Panel
      title="Trading calendar"
      className="calendar-panel"
      help="Daily close dates use Asia/Jerusalem. All trade filters apply. Weekly totals include only the displayed month and selected date range."
      action={<span className="calendar-timezone">Asia/Jerusalem</span>}
    >
      <div className="calendar-toolbar">
        <div className="month-controls">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous month"
            onClick={() => changeMonth(-1)}
          >
            <ChevronLeft size={16} />
          </Button>
          <h3>{format(start, "MMMM yyyy")}</h3>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next month"
            onClick={() => changeMonth(1)}
          >
            <ChevronRight size={16} />
          </Button>
          <Button
            variant="outline"
            className="this-month"
            onClick={() => {
              setDirection(currentMonth() >= month ? 1 : -1);
              setMonth(currentMonth());
            }}
          >
            This month
          </Button>
        </div>
        <div className="month-summary">
          <span>
            Monthly P&L{" "}
            <strong
              className={
                monthNet > 0 ? "positive" : monthNet < 0 ? "negative" : ""
              }
            >
              {money(monthNet, true)}
            </strong>
          </span>
          <span>
            <strong>{monthResults.length}</strong> trading days
          </span>
        </div>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={month}
          initial={{ opacity: 0, x: direction * 8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: direction * -8 }}
          transition={{ duration: 0.15 }}
        >
          <div className="calendar-week-head">
            {weekdays.map((day) => (
              <span key={day}>{day}</span>
            ))}
            <span>Weekly total</span>
          </div>
          <div className="calendar-weeks">
            {weeks.map((week, index) => {
              const weekly = week.flatMap((date) =>
                date.startsWith(month) && byDate.has(date)
                  ? [byDate.get(date)!]
                  : [],
              );
              const weeklyNet = weekly.reduce((s, d) => s + d.netCents, 0);
              return (
                <div className="calendar-week" key={week[0]}>
                  {week.map((date) => {
                    const result = byDate.get(date);
                    const inMonth = date.startsWith(month);
                    const inRange =
                      date >= filters.start && date <= filters.end;
                    const active = inMonth && inRange;
                    const tone =
                      active && result
                        ? result.netCents > 0
                          ? "winning-day"
                          : result.netCents < 0
                            ? "losing-day"
                            : "flat-day"
                        : "";
                    return (
                      <button
                        key={date}
                        className={`calendar-day ${tone} ${!inMonth ? "outside-month" : ""} ${!inRange ? "outside-range" : ""}`}
                        disabled={!active || !result}
                        onClick={() => setSelectedDay(date)}
                        aria-label={`${dateLabel(date, "EEEE, MMMM d")}${!inRange ? ", outside selected range" : result && inMonth ? `, ${money(result.netCents, true)}, ${result.trades.length} trades, ${Math.round((result.wins / result.trades.length) * 100)} percent wins. View trades` : ", no closed trades"}`}
                      >
                        <span className="day-number">
                          <span className="mobile-weekday">
                            {dateLabel(date, "EEE")}{" "}
                          </span>
                          {Number(date.slice(-2))}
                          {active && result && <i />}
                        </span>
                        {active && result ? (
                          <>
                            <strong>{money(result.netCents, true)}</strong>
                            <span>{result.trades.length} trades</span>
                            <span className="day-win">
                              {Math.round(
                                (result.wins / result.trades.length) * 100,
                              )}
                              % wins
                            </span>
                          </>
                        ) : (
                          <span className="day-empty">
                            {inMonth ? (inRange ? "—" : "Outside range") : ""}
                          </span>
                        )}
                      </button>
                    );
                  })}
                  <div className="weekly-summary">
                    <span>Week {index + 1}</span>
                    <strong
                      className={
                        weeklyNet > 0
                          ? "positive"
                          : weeklyNet < 0
                            ? "negative"
                            : ""
                      }
                    >
                      {money(weeklyNet, true)}
                    </strong>
                    <span>{weekly.length} trading days</span>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      </AnimatePresence>
      {!monthResults.length && (
        <p className="calendar-empty-note">
          {demo
            ? `No matching demo trades in ${format(start, "MMMM yyyy")}. Demo records cover January–March 2026.`
            : `No trades imported yet for ${format(start, "MMMM yyyy")}.`}
        </p>
      )}
      <div className="calendar-footer">
        <span>
          <i className="positive-dot" /> Profitable day
        </span>
        <span>
          <i className="negative-dot" /> Losing day
        </span>
        <span>
          <CalendarDays size={12} /> Select a trading day to review
        </span>
      </div>
      <Dialog
        open={!!selectedDay}
        onOpenChange={(open) => {
          if (!open) setSelectedDay(null);
        }}
      >
        <DialogContent className="day-dialog">
          <DialogTitle>
            {selectedDay
              ? dateLabel(selectedDay, "EEEE, MMMM d, yyyy")
              : "Day details"}
          </DialogTitle>
          <DialogDescription>
            Read-only demo trades · close times in Asia/Jerusalem. Journaling
            and editing arrive later.
          </DialogDescription>
          {detail && (
            <>
              <div className="day-detail-summary">
                <strong
                  className={
                    detail.netCents > 0
                      ? "positive"
                      : detail.netCents < 0
                        ? "negative"
                        : ""
                  }
                >
                  {money(detail.netCents, true)}
                </strong>
                <span>
                  {detail.trades.length} completed trades ·{" "}
                  {Math.round((detail.wins / detail.trades.length) * 100)}% wins
                </span>
              </div>
              <div className="day-trades">
                {detail.trades.map((t) => (
                  <div key={t.id}>
                    <div>
                      <strong>{t.symbol}</strong>
                      <span>
                        {t.direction} ·{" "}
                        {accounts.find((a) => a.id === t.accountId)?.name}
                      </span>
                      <small>
                        {timestampLabel(t.closeAt)} · fees{" "}
                        {money(t.commissionCents + t.feesCents)}
                      </small>
                    </div>
                    <strong
                      className={
                        netCents(t) > 0
                          ? "positive"
                          : netCents(t) < 0
                            ? "negative"
                            : ""
                      }
                    >
                      {money(netCents(t), true)}
                    </strong>
                  </div>
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
