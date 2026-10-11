"use client";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ScatterChart,
  Scatter,
  ReferenceLine,
} from "recharts";
import { useReducedMotion } from "motion/react";
import { journalMoney } from "@/lib/journal/calculations";
import { journalTimestamp } from "@/lib/timezones";
import type { BalancePoint } from "@/lib/balances/model";
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
}: {
  points: BalancePoint[];
  entering: string;
  start: string;
}) {
  const reduced = useReducedMotion(),
    rows = [
      { date: `${start} · Entering`, exact: entering, value: Number(entering) },
      ...points.map((p) => ({
        date: p.date,
        exact: p.value,
        value: Number(p.value),
      })),
    ];
  return (
    <div
      className="chart-container"
      role="img"
      aria-label="Journal balance estimate in USD; entering balance includes activity since the baseline"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="date" {...axis} minTickGap={35} />
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
          <Line
            dataKey="value"
            type="linear"
            stroke="var(--primary)"
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
            domain={[0, 1440]}
            ticks={[0, 360, 720, 1080, 1440]}
            tickFormatter={(v) =>
              `${Math.floor(v / 60)
                .toString()
                .padStart(2, "0")}:00`
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
            isAnimationActive={!reduced}
            onClick={(_, index) => onInspect(rows[index].recordId)}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
