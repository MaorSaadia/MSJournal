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
  const last = shiftDay(end, 6 - new Date(end + "T12:00:00Z").getUTCDay());
  const first = shiftDay(last, -90);
  const dates: string[] = [];
  for (let date = first; date <= last; date = shiftDay(date, 1))
    dates.push(date);
  while (dates.length % 7) dates.push(shiftDay(dates.at(-1)!, 1));
  const weeks = Array.from({ length: dates.length / 7 }, (_, i) =>
    dates.slice(i * 7, i * 7 + 7),
  );
  return (
    <div className="heatmap-content">
      <div className="heatmap-summary">
        <span>13 calendar weeks ending {end}</span>
      </div>
      <div className="heatmap-scroll">
        <div className="heatmap-grid">
          <div className="heatmap-weekdays">
            <span />
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          {weeks.map((week, i) => (
            <div className="heatmap-week" key={week[0]}>
              <span className="heatmap-month">
                {i === 0 || week.some((d) => d.endsWith("-01"))
                  ? new Intl.DateTimeFormat("en-US", {
                      month: "short",
                      timeZone: "UTC",
                    }).format(
                      new Date(
                        (week.find((d) => d.endsWith("-01")) ?? week[0]) +
                          "T12:00:00Z",
                      ),
                    )
                  : ""}
              </span>
              {week.map((date) => {
                const day = byDate.get(date),
                  outside = date < start || date > end;
                const text = `${date} · ${outside ? "Outside selected range" : day ? journalMoney(day.total, true) + ` ${data.basis} · ${day.count} closed trades` : "No imported realized activity"} · ${data.timezone}`;
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
        <span>Closed trades / day</span>
        <div>
          <span>None</span>
          {[0, 1, 2, 3, 4].map((v) => (
            <i className={`intensity-${v}`} key={v} />
          ))}
          <span>4+</span>
        </div>
      </div>
      <p className="panel-note">
        {data.portionCount} closed trades · {data.days.length} active days in
        selection <i className="heat-flat-key" title="Breakeven activity" />
      </p>
    </div>
  );
}
