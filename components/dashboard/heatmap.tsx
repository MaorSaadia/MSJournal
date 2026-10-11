import { startOfWeek, addDays, format } from "date-fns";
import { DEMO_PERIOD } from "@/data/demo";
import { dateKeys, dayDate, dayKey, dateLabel } from "@/lib/dates";
import { dailyResults } from "@/lib/calculations";
import type { Filters, Trade } from "@/lib/types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
export function Heatmap({
  trades,
  filters,
}: {
  trades: Trade[];
  filters: Filters;
}) {
  const counts = new Map(
    dailyResults(trades).map((d) => [d.date, d.trades.length]),
  );
  const first = startOfWeek(dayDate(DEMO_PERIOD.start), { weekStartsOn: 0 });
  const last = addDays(
    startOfWeek(dayDate(DEMO_PERIOD.end), { weekStartsOn: 0 }),
    6,
  );
  const dates = dateKeys(
    dayKey(first.toISOString()),
    dayKey(last.toISOString()),
  );
  const weeks = Array.from({ length: dates.length / 7 }, (_, i) =>
    dates.slice(i * 7, i * 7 + 7),
  );
  return (
    <div className="heatmap-content">
      <div className="heatmap-summary">
        <strong>
          {trades.length}
          <span> closed trades</span>
        </strong>
        <span>Jan — Mar 2026</span>
      </div>
      <div className="heatmap-scroll">
        <div
          className="heatmap-grid"
          style={{
            gridTemplateColumns: `30px repeat(${weeks.length}, minmax(14px, 1fr))`,
          }}
        >
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
                {i === 0
                  ? "Jan"
                  : week.some((d) => d.endsWith("-01") && d <= DEMO_PERIOD.end)
                    ? format(
                        dayDate(week.find((d) => d.endsWith("-01"))!),
                        "MMM",
                      )
                    : ""}
              </span>
              {week.map((date) => {
                const inDemo =
                  date >= DEMO_PERIOD.start && date <= DEMO_PERIOD.end;
                const active = date >= filters.start && date <= filters.end;
                const count = counts.get(date) ?? 0;
                const text = `${dateLabel(date, "MMMM d, yyyy")}: ${count} closed trades${!active ? "; outside selected range" : ""}`;
                return (
                  <Tooltip key={date}>
                    <TooltipTrigger asChild>
                      <button
                        className={`heat-cell intensity-${Math.min(count, 4)} ${!active ? "heat-inactive" : ""} ${!inDemo ? "heat-outside" : ""}`}
                        aria-label={text}
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
        <span>Closed trades per day</span>
        <div>
          <span>0</span>
          {[0, 1, 2, 3, 4].map((v) => (
            <i className={`intensity-${v}`} key={v} />
          ))}
          <span>4+</span>
        </div>
      </div>
      <p className="panel-note">
        Dimmed days fall outside your selected range.
      </p>
    </div>
  );
}
