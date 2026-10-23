"use client";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import {
  calendarWeeks,
  shiftMonth,
  monthSchema,
  daySchema,
} from "@/lib/calendar/model";
import { firmSession } from "@/lib/props/tracking-calculations";
import { phasePayoutEvents } from "@/lib/props/overview-model";
import { sum } from "@/lib/journal/processing";
import { journalMoney } from "@/lib/journal/calculations";
import { journalTimestamp } from "@/lib/timezones";
import type { PhaseProgress } from "@/lib/props/model";
import type { Payout } from "@/lib/props/tracking-rules";
import { useCalendarCache } from "@/components/calendar/cache-provider";
import { useOverviewLocation } from "./overview-location";
export function OverviewCalendar({
  progress,
  payouts,
}: {
  progress: PhaseProgress;
  payouts: Payout[];
}) {
  const p = progress.tracking;
  const { weekStartsOn } = useCalendarCache();
  const { search, patch } = useOverviewLocation(
    progress.phase.tradingAccountId,
  );
  if (!p) return null;
  let observationSessionDate = p.asOf.slice(0, 10);
  try {
    observationSessionDate = firmSession(p.asOf, p.rules).date;
  } catch {
    /* The engine reports ambiguous firm boundaries. */
  }
  const month = monthSchema.safeParse(search.get("month")).success
    ? search.get("month")!
    : (progress.sessions.at(-1)?.date ?? observationSessionDate).slice(0, 7);
  const selected = daySchema.safeParse(search.get("day")).success
    ? search.get("day")
    : null;
  const weeks = calendarWeeks(month, weekStartsOn);
  const calendarView =
    search.get("calendarView") === "events" ? "events" : "pnl";
  const payoutEvents = phasePayoutEvents(progress, payouts).flatMap((event) => {
    try {
      const policy =
        progress.periods
          .filter((period) => period.effectiveAt <= event.at)
          .at(-1)?.rules.tracking ?? p.rules;
      return [
        {
          ...event,
          timezone: policy.session.timezone,
          date: firmSession(event.at, policy).date,
        },
      ];
    } catch {
      return [];
    }
  });
  const daily = (date: string) => {
    const sessions = progress.sessions.filter((d) => d.date === date);
    return {
      sessions,
      net:
        sessions.length && sessions.every((d) => d.net !== null)
          ? sum(sessions.map((d) => d.net!))
          : null,
      gross: sum(sessions.map((d) => d.gross)),
      estimated: sessions.some((d) => d.estimated),
      events: payoutEvents.filter((e) => e.date === date),
    };
  };
  const chosen = selected ? daily(selected) : null;
  const qualifies = (start: string) => {
    const day = p.days.find((value) => value.start === start);
    return p.rules.stage !== "Evaluation" && p.rules.payout.dayBasis !== "trading" &&
      p.rules.session.confirmed && p.qualifyingDays !== null &&
      !!day?.complete && day.countedForDayRequirement && day.qualifying === true;
  };
  return (
    <section className="panel prop-overview-calendar">
      <header className="prop-overview-panel-heading">
        <div>
          <div className="prop-calendar-heading-tabs">
            <h2>Trading calendar</h2>
            <div className="prop-chart-range" aria-label="Calendar view">
              <button
                aria-pressed={calendarView === "pnl"}
                onClick={() => patch({ calendarView: "pnl" })}
              >
                P&L
              </button>
              <button
                aria-pressed={calendarView === "events"}
                onClick={() => patch({ calendarView: "events" })}
              >
                Events
              </button>
            </div>
          </div>
          <p>
            Firm-session dates · {p.rules.session.timezone} · reset{" "}
            {p.rules.session.reset}
            {!p.rules.session.confirmed && " · confirm boundary in Rules"}
          </p>
        </div>
        <div className="prop-calendar-controls">
          <button
            aria-label="Previous calendar month"
            onClick={() => patch({ month: shiftMonth(month, -1), day: null })}
          >
            <ChevronLeft size={17} />
          </button>
          <label>
            <span className="sr-only">Calendar month</span>
            <input
              aria-label="Calendar month"
              type="month"
              value={month}
              onChange={(e) => {
                if (monthSchema.safeParse(e.target.value).success)
                  patch({ month: e.target.value, day: null });
              }}
            />
          </label>
          <button
            aria-label="Next calendar month"
            onClick={() => patch({ month: shiftMonth(month, 1), day: null })}
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </header>
      <div className="prop-session-calendar-scroll">
        <div className="prop-session-weekdays">
          {Array.from(
            { length: 7 },
            (_, i) =>
              ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
                (i + weekStartsOn) % 7
              ],
          ).map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="prop-session-calendar-grid">
          {weeks.flat().map((date) => {
            const day = daily(date),
              value = day.net ?? day.gross;
            const qualifying = day.sessions.some(
              (s) => qualifies(s.start),
            );
            return (
              <button
                key={date}
                className={`${date.slice(0, 7) !== month ? "outside" : ""} ${day.sessions.length ? (Number(value) >= 0 ? "profit" : "loss") : ""}`}
                aria-pressed={selected === date}
                aria-label={`${date}${day.sessions.length ? `, ${day.net === null ? "gross" : day.estimated ? "estimated net" : "net"} ${journalMoney(value)}` : ", no imported session activity"}${qualifying ? ", qualifying day" : ""}${day.events.length ? ", payout events" : ""}`}
                onClick={() => patch({ day: date })}
              >
                <span>{Number(date.slice(-2))}</span>
                {calendarView === "pnl" && day.sessions.length > 0 && (
                  <>
                    <strong>{journalMoney(value, true)}</strong>
                    <small>
                      {day.net === null
                        ? "Gross"
                        : day.estimated
                          ? "Est. net"
                          : "Net"}
                    </small>
                  </>
                )}
                {calendarView === "events" &&
                  day.events.slice(0, 2).map((event, i) => (
                    <small
                      className="prop-session-payout-event"
                      key={`${event.at}-${i}`}
                    >
                      {event.label}
                      {event.amount !== null && (
                        <strong>{journalMoney(event.amount)}</strong>
                      )}
                    </small>
                  ))}
                {qualifying && (
                  <span
                    className="prop-session-qualification"
                    title="Qualifying day"
                  >
                    <Check size={12} />
                  </span>
                )}
                {day.events.length > 0 && (
                  <small className="prop-session-payout">
                    Payout · {day.events.length}
                  </small>
                )}
              </button>
            );
          })}
        </div>
      </div>
      {chosen && selected && (
        <div className="prop-session-detail" aria-live="polite">
          <h3>{selected} · session activity</h3>
          {!chosen.sessions.length && (
            <p>
              No imported realized activity in this session date. This does not
              prove no trading occurred.
            </p>
          )}
          {chosen.sessions.map((session) => (
            <div key={`${session.start}-${session.timezone}`}>
              <p>
                {session.timezone} ·{" "}
                {journalTimestamp(session.start, session.timezone)} to session
                close {journalTimestamp(session.close, session.timezone)}
              </p>
              <strong>
                {session.net === null
                  ? `Gross ${journalMoney(session.gross)} · add missing fees for net`
                  : `${session.estimated ? "Estimated net" : "Net"} ${journalMoney(session.net)}`}
              </strong>
              <ul>
                {session.activity.map((activity) => (
                  <li key={activity.id}>
                    <span>
                      {activity.symbol} ·{" "}
                      {journalTimestamp(activity.at, session.timezone)} ·{" "}
                      {activity.net === null
                        ? `Gross ${journalMoney(activity.gross)}`
                        : `${activity.estimated ? "Estimated net" : "Net"} ${journalMoney(activity.net)}`}
                    </span>
                    {activity.recordId && (
                      <Link href={`/trade-view/${activity.recordId}`}>
                        Open journal record →
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {chosen.events.map((event, i) => (
            <p key={`${event.at}-${i}`}>
              <strong>{event.label}</strong> ·{" "}
              {journalTimestamp(event.at, event.timezone)} ·{" "}
              {event.amount === null
                ? "Amount not recorded"
                : journalMoney(event.amount)}{" "}
              · separate from trading P&L
            </p>
          ))}
        </div>
      )}
      <p className="prop-overview-chart-note">
        Dates follow the configured trading sessions. Payout events are separate from trading profit.
      </p>
    </section>
  );
}
