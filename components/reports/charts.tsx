"use client";
import { useId } from "react";
import { useReducedMotion } from "motion/react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { journalMoney } from "@/lib/journal/calculations";
import type { Group } from "@/lib/reports/model";
type Point = Group & { exact: string | null; value: number | null };
export function ReportChart({
  rows,
  basis,
  field = "total",
  line = false,
  onInspect,
  dashboard = false,
}: {
  rows: (Group & { cumulative?: string | null; drawdown?: string | null })[];
  basis: string;
  dashboard?: boolean;
  field?: "total" | "cumulative" | "drawdown";
  line?: boolean;
  onInspect: (href: string) => void;
}) {
  const gradient = useId().replaceAll(":", ""),
    reduced = useReducedMotion(),
    points: Point[] = rows.map((r) => ({
      ...r,
      exact: r[field] ?? null,
      value: r[field] == null ? null : Number(r[field]),
    }));
  const high = Math.max(0, ...points.map((p) => p.value ?? 0)),
    low = Math.min(0, ...points.map((p) => p.value ?? 0));
  const split = high === low ? 0 : high / (high - low);
  const axes = (
    <>
      <CartesianGrid vertical={false} stroke="var(--border)" />
      <XAxis
        dataKey="label"
        tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
        tickLine={false}
        axisLine={false}
        minTickGap={30}
        tickFormatter={(v) =>
          dashboard && /^\d{4}-\d{2}-\d{2}/.test(v)
            ? new Intl.DateTimeFormat("en-US", {
                month: "short",
                day: "numeric",
                timeZone: "UTC",
              }).format(new Date(v.slice(0, 10) + "T12:00:00Z"))
            : v
        }
      />
      <YAxis
        domain={[
          (minimum: number) => Math.min(0, minimum),
          (maximum: number) => Math.max(0, maximum),
        ]}
        width={65}
        tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
        tickLine={false}
        axisLine={false}
        tickFormatter={(v) =>
          new Intl.NumberFormat("en-US", {
            notation: "compact",
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 1,
          }).format(v)
        }
      />
      <ReferenceLine y={0} stroke="var(--muted-foreground)" />
      <Tooltip
        content={({ active, payload }) => {
          const p = payload?.[0]?.payload as Point | undefined;
          return active && p ? (
            <div className="chart-tooltip">
              <span>{p.label}</span>
              <strong>{journalMoney(p.exact, true)}</strong>
              <small>
                {p.count}{" "}
                {basis.includes("complete trades")
                  ? "trades"
                  : basis.includes("closed trades")
                    ? "trades"
                    : basis.includes("closed records")
                      ? "records"
                      : "active days"}{" "}
                · {basis}
              </small>
            </div>
          ) : null;
        }}
      />
    </>
  );
  return (
    <div
      className="report-chart"
      role="img"
      aria-label={`${field} in USD, ${basis}. Exact values and record links in the table below.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        {line && dashboard ? (
          <AreaChart
            data={points}
            margin={{ top: 16, right: 18, bottom: 10, left: 0 }}
          >
            <defs>
              <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                <stop offset={`${split * 100}%`} stopColor="var(--positive)" />
                <stop offset={`${split * 100}%`} stopColor="var(--negative)" />
              </linearGradient>
            </defs>
            {axes}
            <Area
              type="linear"
              baseValue={0}
              dataKey="value"
              stroke={
                field === "drawdown" ? "var(--violet)" : `url(#${gradient})`
              }
              fill={
                field === "drawdown" ? "var(--violet)" : `url(#${gradient})`
              }
              fillOpacity={0.18}
              strokeWidth={1.5}
              dot={false}
              connectNulls={false}
              isAnimationActive={!reduced}
              animationDuration={250}
            />
          </AreaChart>
        ) : line ? (
          <LineChart
            data={points}
            margin={{ top: 14, right: 15, bottom: 10, left: 0 }}
          >
            {axes}
            <Line
              type="linear"
              dataKey="value"
              stroke={field === "drawdown" ? "var(--violet)" : "var(--primary)"}
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              isAnimationActive={!reduced}
              animationDuration={250}
            />
          </LineChart>
        ) : (
          <BarChart
            data={points}
            margin={{ top: 14, right: 15, bottom: 10, left: 0 }}
          >
            {axes}
            <Bar
              maxBarSize={dashboard ? 24 : undefined}
              dataKey="value"
              radius={[3, 3, 0, 0]}
              isAnimationActive={!reduced}
              animationDuration={250}
              onClick={(_, index) => onInspect(points[index].href)}
            >
              {points.map((p) => (
                <Cell
                  key={p.key}
                  fill={
                    p.value === 0
                      ? "var(--muted-foreground)"
                      : (p.value ?? 0) < 0
                        ? "var(--negative)"
                        : "var(--positive)"
                  }
                  cursor="pointer"
                />
              ))}
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
