import { CalendarDays } from "lucide-react";
import Link from "next/link";
import { Help } from "@/components/dashboard/panel";
import { journalMoney } from "@/lib/journal/calculations";
import { D } from "@/lib/journal/processing";
import { calendarWeeks, type CalendarMonth } from "@/lib/calendar/model";
export function CalendarSkeleton({
  month,
  weekStartsOn,
}: {
  month: string;
  weekStartsOn: 0 | 1;
}) {
  return (
    <div
      className="calendar-skeleton"
      role="status"
      aria-label="Loading calendar"
    >
      <div className="calendar-week-head">
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i}>
            {
              ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
                (i + weekStartsOn) % 7
              ]
            }
          </span>
        ))}
        <span>Weekly total</span>
      </div>
      <div className="calendar-weeks">
        {calendarWeeks(month, weekStartsOn).map((week) => (
          <div className="calendar-week" key={week[0]}>
            {week.map((date) => (
              <div className="calendar-day skeleton-day" key={date}>
                <span>{Number(date.slice(-2))}</span>
                <i />
              </div>
            ))}
            <div className="weekly-summary skeleton-day" />
          </div>
        ))}
      </div>
    </div>
  );
}
export function CalendarGrid({
  data,
  view,
  dayButton,
  compact,
  fullHref,
}: {
  data: CalendarMonth;
  view: "auto" | "grid" | "agenda";
  dayButton: (day: string, agenda?: boolean) => React.ReactNode;
  compact: boolean;
  fullHref: string;
}) {
  return (
    <>
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
              Weekly total
              <Help
                label="Weekly scope"
                text="Only dates in this month and active filters count. Weekly totals reconcile to the monthly total."
              />
            </span>
          </div>
          <div className="calendar-weeks">
            {data.weeks.map((week, i) => (
              <div className="calendar-week" key={week.dates[0]}>
                {week.dates.map((date) => dayButton(date))}
                <div className="weekly-summary">
                  <span>Week {i + 1}</span>
                  <strong
                    className={
                      new D(week.summary.total ?? 0).gt(0)
                        ? "positive"
                        : new D(week.summary.total ?? 0).lt(0)
                          ? "negative"
                          : ""
                    }
                  >
                    {journalMoney(week.summary.total, true)}
                  </strong>
                  <span className="calendar-days-badge">
                    {week.summary.activeDays}{" "}
                    {week.summary.activeDays === 1 ? "day" : "days"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="calendar-agenda-view">
          {data.weeks
            .flatMap((w) => w.dates)
            .filter((d) => d.startsWith(data.month))
            .map((date) => dayButton(date, true))}
        </div>
        <div className="calendar-mobile-weeks" aria-label="Weekly summaries">
          {data.weeks.map((week, i) => (
            <span key={i}>
              Week {i + 1}
              <strong>{journalMoney(week.summary.total, true)}</strong>
              <small>{week.summary.activeDays} days</small>
            </span>
          ))}
        </div>
      </div>
      <details className="calendar-month-details">
        <summary>Month details</summary>
        <div className="calendar-month-summary" aria-label="Month details">
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
            <span>Best active day</span>
            <strong>
              {data.summary.best
                ? `${data.summary.best.date.slice(5)} · ${journalMoney(data.basis === "gross" ? data.summary.best.gross : data.summary.best.net, true)}`
                : "Unavailable"}
            </strong>
          </div>
          <div>
            <span>Worst active day</span>
            <strong>
              {data.summary.worst
                ? `${data.summary.worst.date.slice(5)} · ${journalMoney(data.basis === "gross" ? data.summary.worst.gross : data.summary.worst.net, true)}`
                : "Unavailable"}
            </strong>
          </div>
        </div>
        <p>
          Realized amounts follow each exit in {data.timezone}. Zero P&L with
          activity differs from a date with no imported records.{" "}
          {data.mode === "real"
            ? "Complete trades are not verified; source record counts are in day details."
            : "Demo counts use complete closed trades."}{" "}
          Display amounts round to cents; calculations retain source precision.
        </p>
      </details>
      <div className="calendar-footer">
        <span>
          <CalendarDays size={12} />
          Select a day to review
        </span>
        {compact && <Link href={fullHref}>Full calendar →</Link>}
      </div>
    </>
  );
}
