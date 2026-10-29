"use client";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ZAxis,
  ReferenceDot,
  ScatterChart,
  Scatter,
  ReferenceLine,
} from "recharts";
import { useReducedMotion } from "motion/react";
import { journalMoney } from "@/lib/journal/calculations";
import { journalTimestamp } from "@/lib/timezones";
import type { CashAdjustment, BalancePoint } from "@/lib/balances/model";
import type { DashboardData } from "@/lib/dashboard/service";
const axis = {
  tick: { fill: "var(--muted-foreground)", fontSize: 10 },
  axisLine: false,
  tickLine: false,
};
const tickMoney = (v: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(v);
export function BalanceChart({
  points,
  entering,
  start,
  adjustments,
  timezone,
}: {
  points: BalancePoint[];
  entering: string | null;
  start: string;
  adjustments: CashAdjustment[];
  timezone: string;
}) {
  const reduced = useReducedMotion(),
    rows = [
      ...(entering === null ? [] : [{ date: `${start} · Entering`, exact: entering, value: Number(entering) }]),
      ...points.map((p) => ({
        date: p.date,
        exact: p.value,
        value: p.value === null ? null : Number(p.value),
      })),
    ];
  const cashDates = new Set(
    adjustments.map((a) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(a.effectiveAt)),
    ),
  );
  return (
    <div
      className="chart-container"
      role="img"
      aria-label="Journal balance estimate in USD; entering balance includes activity since the baseline"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="date"
            {...axis}
            minTickGap={35}
            tickFormatter={(date) =>
              new Intl.DateTimeFormat("en-US", {
                timeZone: "UTC",
                month: "short",
                day: "numeric",
              }).format(new Date(date.slice(0, 10) + "T12:00:00Z"))
            }
          />
          <YAxis
            {...axis}
            width={65}
            domain={["dataMin", "dataMax"]}
            tickFormatter={tickMoney}
          />
          <Tooltip
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload;
              return active && p ? (
                <div className="chart-tooltip">
                  <span>{p.date}</span>
                  <strong>{journalMoney(p.exact)}</strong>
                  <small>Journal balance estimate · USD</small>
                </div>
              ) : null;
            }}
          />
          {rows
            .filter((p) => p.value !== null && cashDates.has(p.date))
            .map((p) => (
              <ReferenceDot
                key={p.date}
                x={p.date}
                y={p.value!}
                r={3}
                fill="var(--violet)"
                stroke="var(--card)"
              />
            ))}
          <Line
            dataKey="value"
            type="linear"
            stroke="var(--violet)"
            dot={false}
            isAnimationActive={!reduced}
            animationDuration={250}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
export function PortionTimeChart({
  data,
  onInspect,
}: {
  data: DashboardData;
  onInspect: (id: string) => void;
}) {
  const reduced = useReducedMotion(),
    rows = data.timePoints.map((p) => ({ ...p, result: Number(p.value) }));
  return (
    <div
      className="chart-container"
      role="img"
      aria-label={`Entry time by closed portion, ${data.basis} USD, ${data.timezone}; click a point for its record`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ left: 0, right: 14, top: 12, bottom: 10 }}>
          <CartesianGrid stroke="var(--border)" />
          <XAxis
            {...axis}
            type="number"
            dataKey="minutes"
            domain={[
              Math.max(
                0,
                Math.floor(Math.min(...rows.map((p) => p.minutes)) / 60) * 60 -
                  30,
              ),
              Math.min(
                1440,
                Math.ceil(Math.max(...rows.map((p) => p.minutes)) / 60) * 60 +
                  30,
              ),
            ]}
            tickFormatter={(v) =>
              `${Math.floor(v / 60)
                .toString()
                .padStart(2, "0")}:${Math.round(v % 60)
                .toString()
                .padStart(2, "0")}`
            }
          />
          <YAxis
            {...axis}
            type="number"
            dataKey="result"
            width={65}
            tickFormatter={tickMoney}
            domain={[
              (min: number) => Math.min(0, min),
              (max: number) => Math.max(0, max),
            ]}
          />
          <ZAxis range={[24, 24]} />
          <ReferenceLine y={0} stroke="var(--muted-foreground)" />
          <Tooltip
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as
                DashboardData["timePoints"][number] | undefined;
              return active && p ? (
                <div className="chart-tooltip">
                  <span>
                    {p.symbol} · {p.direction}
                  </span>
                  <strong>
                    {journalMoney(p.value, true)} · {data.basis}
                  </strong>
                  <small>
                    {journalTimestamp(p.entry, data.timezone)} · {data.timezone}
                  </small>
                </div>
              ) : null;
            }}
          />
          <Scatter
            data={rows}
            fill="var(--violet)"
            fillOpacity={0.7}
            isAnimationActive={!reduced}
            onClick={(_, index) => onInspect(rows[index].recordId)}
          >
            {rows.map((p) => (
              <Cell
                key={p.id}
                fill={
                  p.result > 0
                    ? "var(--positive)"
                    : p.result < 0
                      ? "var(--negative)"
                      : "var(--violet)"
                }
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
