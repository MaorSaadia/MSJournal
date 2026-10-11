"use client";
import { useReducedMotion } from "motion/react";
import {
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
}: {
  rows: (Group & { cumulative?: string | null; drawdown?: string | null })[];
  basis: string;
  field?: "total" | "cumulative" | "drawdown";
  line?: boolean;
  onInspect: (href: string) => void;
}) {
  const reduced = useReducedMotion(),
    points: Point[] = rows.map((r) => ({
      ...r,
      exact: r[field] ?? null,
      value: r[field] == null ? null : Number(r[field]),
    }));
  const axes = (
    <>
      <CartesianGrid vertical={false} stroke="var(--border)" />
      <XAxis
        dataKey="label"
        tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
        tickLine={false}
        axisLine={false}
        minTickGap={30}
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
                  : basis.includes("closed portions")
                    ? "portions"
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
        {line ? (
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
