"use client";
import Link from "next/link";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { shiftDay } from "@/lib/calendar/model";
import { journalMoney } from "@/lib/journal/calculations";
import type { DashboardData } from "@/lib/dashboard/service";
export function RealActivity({
  data,
  start,
  end,
  dayHref,
  onInspect,
}: {
  data: DashboardData;
  start: string;
  end: string;
  dayHref: (date: string) => string;
  onInspect: () => void;
}) {
  const byDate = new Map(data.days.map((d) => [d.date, d]));
  const first = shiftDay(start, -new Date(start + "T12:00:00Z").getUTCDay());
  const dates: string[] = [];
  for (let date = first; date <= end; date = shiftDay(date, 1))
    dates.push(date);
  while (dates.length % 7) dates.push(shiftDay(dates.at(-1)!, 1));
  const weeks = Array.from({ length: dates.length / 7 }, (_, i) =>
    dates.slice(i * 7, i * 7 + 7),
  );
  return (
    <div className="heatmap-content">
      <div className="heatmap-summary">
        <strong>
          {data.portionCount}
          <span> closed portions</span>
        </strong>
        <span>{data.days.length} active days</span>
      </div>
      <div className="heatmap-scroll">
        <div className="heatmap-grid">
          <div className="heatmap-weekdays">
            <span />
            <span>Sun</span>
            <span />
            <span>Tue</span>
            <span />
            <span>Thu</span>
            <span />
            <span>Sat</span>
          </div>
          {weeks.map((week, i) => (
            <div className="heatmap-week" key={week[0]}>
              <span className="heatmap-month">
                {i === 0 || week.some((d) => d.endsWith("-01"))
                  ? (week.find((d) => d.endsWith("-01"))?.slice(0, 7) ??
                    start.slice(0, 7))
                  : ""}
              </span>
              {week.map((date) => {
                const day = byDate.get(date),
                  outside = date < start || date > end;
                const text = `${date} · ${day ? journalMoney(day.total, true) + ` ${data.basis} · ${day.count} closed portions` : "No imported realized activity"} · ${data.timezone}`;
                return (
                  <Tooltip key={date}>
                    <TooltipTrigger asChild>
                      <Link
                        prefetch={false}
                        href={dayHref(date)}
                        onClick={onInspect}
                        aria-label={text}
                        tabIndex={outside ? -1 : 0}
                        className={`heat-cell intensity-${Math.min(day?.count ?? 0, 4)} ${day?.total === "0" ? "heat-flat" : ""} ${outside ? "heat-outside" : ""}`}
                      />
                    </TooltipTrigger>
                    <TooltipContent>{text}</TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="heatmap-legend">
        <span>Closed portions / day</span>
        <div>
          <span>None</span>
          {[0, 1, 2, 3, 4].map((v) => (
            <i className={`intensity-${v}`} key={v} />
          ))}
          <span>4+</span>
        </div>
      </div>
      <p className="panel-note">
        <i className="heat-flat-key" /> Zero-P&L activity has a violet outline.
        Empty days mean no imported activity.
      </p>
    </div>
  );
}
