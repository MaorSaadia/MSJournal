"use client";
import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
  LineChart,
  Line,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ScatterChart,
  Scatter,
} from "recharts";
import { compactMoney, money, netCents } from "@/lib/calculations";
import {
  dateLabel,
  entryMinutes,
  timeLabel,
  timestampLabel,
} from "@/lib/dates";
import type { Account, Trade } from "@/lib/types";
import { illustrativeProfile } from "@/data/demo";
import { Empty } from "./panel";
type Point = { date: string; value: number; opening?: boolean; index?: number };
type TooltipEntry = { payload: Point; value: number };
function FinancialTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly TooltipEntry[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <span>
        {dateLabel(point.date, "MMM d, yyyy")}
        {point.opening ? " · Opening" : ""}
      </span>
      <strong className={point.value < 0 ? "negative" : ""}>
        {money(point.value * 100, true)}
      </strong>
      {point.index !== undefined && <small>Closed trade #{point.index}</small>}
    </div>
  );
}
export function FinancialChart({
  data,
  kind,
  empty = false,
}: {
  data: Point[];
  kind: "cumulative" | "daily" | "balance" | "drawdown";
  empty?: boolean;
}) {
  const reduced = useReducedMotion();
  const [entrance, setEntrance] = useState(true);
  useEffect(() => {
    const timeout = setTimeout(() => setEntrance(false), 650);
    return () => clearTimeout(timeout);
  }, []);
  if (empty || !data.length)
    return (
      <Empty
        text={
          kind === "balance"
            ? "Select an account to see its balance."
            : undefined
        }
      />
    );
  const animate = entrance && !reduced;
  const axis = {
    tick: { fill: "var(--muted-foreground)", fontSize: 10 },
    axisLine: false,
    tickLine: false,
  };
  const common = (
    <>
      <CartesianGrid
        stroke="var(--border)"
        vertical={false}
        strokeDasharray="3 4"
      />
      <XAxis
        dataKey={kind === "drawdown" ? "index" : "date"}
        {...axis}
        tickFormatter={
          kind === "drawdown"
            ? (v: number) => `${v}`
            : (v: string) => dateLabel(v)
        }
        minTickGap={34}
      />
      <YAxis
        {...axis}
        width={53}
        tickFormatter={compactMoney}
        domain={
          kind === "balance"
            ? ["dataMin - 400", "dataMax + 400"]
            : [
                (minimum: number) => Math.min(0, minimum),
                (maximum: number) => Math.max(0, maximum),
              ]
        }
      />
      <Tooltip content={<FinancialTooltip />} />
      {kind !== "balance" && (
        <ReferenceLine
          y={0}
          stroke="var(--muted-foreground)"
          strokeOpacity={0.6}
        />
      )}
    </>
  );
  const max = Math.max(0, ...data.map((d) => d.value));
  const min = Math.min(0, ...data.map((d) => d.value));
  const zeroOffset = max === min ? 0 : max / (max - min);
  const chart =
    kind === "daily" ? (
      <BarChart data={data} margin={{ top: 12, right: 6, bottom: 0, left: 0 }}>
        {common}
        <Bar
          dataKey="value"
          radius={[3, 3, 0, 0]}
          maxBarSize={20}
          isAnimationActive={animate}
          animationDuration={450}
        >
          {data.map((d, i) => (
            <Cell
              key={i}
              fill={
                d.value > 0
                  ? "var(--positive)"
                  : d.value < 0
                    ? "var(--negative)"
                    : "var(--muted-foreground)"
              }
            />
          ))}
        </Bar>
      </BarChart>
    ) : kind === "balance" ? (
      <LineChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
        {common}
        <Line
          type="linear"
          dataKey="value"
          stroke="var(--violet)"
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4 }}
          isAnimationActive={animate}
          animationDuration={450}
        />
      </LineChart>
    ) : (
      <AreaChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`fill-${kind}`} x1="0" y1="0" x2="0" y2="1">
            <stop
              offset={kind === "drawdown" ? 0 : zeroOffset}
              stopColor={
                kind === "drawdown" ? "var(--negative)" : "var(--positive)"
              }
              stopOpacity={0.17}
            />
            <stop
              offset={zeroOffset}
              stopColor="var(--negative)"
              stopOpacity={0.15}
            />
            <stop offset="1" stopColor="var(--negative)" stopOpacity={0.08} />
          </linearGradient>
          <linearGradient id={`line-${kind}`} x1="0" y1="0" x2="0" y2="1">
            <stop
              offset={zeroOffset}
              stopColor={
                kind === "drawdown" ? "var(--negative)" : "var(--positive)"
              }
            />
            <stop offset={zeroOffset} stopColor="var(--negative)" />
          </linearGradient>
        </defs>
        {common}
        <Area
          type="linear"
          dataKey="value"
          stroke={`url(#line-${kind})`}
          fill={`url(#fill-${kind})`}
          strokeWidth={2}
          isAnimationActive={animate}
          animationDuration={450}
        />
      </AreaChart>
    );
  return (
    <div
      className={`chart chart-${kind}`}
      data-entrance={animate ? "running" : "complete"}
      role="img"
      aria-label={`${kind} chart: ${data.length} points; opening ${money(data[0].value * 100)}, ending ${money(data[data.length - 1].value * 100)}`}
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        {chart}
      </ResponsiveContainer>
    </div>
  );
}
export function ProfileChart() {
  return (
    <>
      <div
        className="profile-chart"
        role="img"
        aria-label={illustrativeProfile
          .map((v) => `${v.axis} ${v.value} out of 100`)
          .join(", ")}
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <RadarChart data={illustrativeProfile} outerRadius="65%">
            <PolarGrid stroke="var(--border)" />
            <PolarAngleAxis
              dataKey="axis"
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
            />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            <Radar
              dataKey="value"
              stroke="var(--violet)"
              fill="var(--violet)"
              fillOpacity={0.15}
              strokeWidth={2}
              isAnimationActive={false}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <p className="panel-note">
        <span className="violet-dot" />
        Illustrative values · scoring not implemented
      </p>
    </>
  );
}
export function TimeData({
  trades,
  accounts,
  timezone,
}: {
  trades: Trade[];
  accounts: Account[];
  timezone: string;
}) {
  if (!trades.length) return null;
  return (
    <details className="chart-data">
      <summary>View entry-time data</summary>
      <div className="chart-data-scroll">
        <table className="recent-table">
          <caption className="sr-only">
            Entry times in {timezone}. Completed demo trade results in USD.
          </caption>
          <thead>
            <tr>
              <th>Entry time</th>
              <th>Symbol / account</th>
              <th>Net P&L</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => (
              <tr key={t.id}>
                <td>{timestampLabel(t.entryAt, timezone)}</td>
                <td>
                  {t.symbol}
                  <br />
                  <small>
                    {accounts.find((a) => a.id === t.accountId)?.name}
                  </small>
                </td>
                <td
                  className={
                    netCents(t) > 0
                      ? "positive"
                      : netCents(t) < 0
                        ? "negative"
                        : ""
                  }
                >
                  {money(netCents(t), true)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
export function TimeChart({
  trades,
  accounts,
  timezone,
}: {
  trades: Trade[];
  accounts: Account[];
  timezone: string;
}) {
  if (!trades.length) return <Empty />;
  const points = trades.map((t) => ({
    minute: entryMinutes(t.entryAt, timezone),
    value: netCents(t) / 100,
    trade: t,
  }));
  return (
    <div
      className="chart chart-time"
      role="img"
      aria-label={`Entry time versus net P&L for ${trades.length} closed trades in ${timezone}`}
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <ScatterChart margin={{ top: 12, right: 10, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" />
          <XAxis
            type="number"
            dataKey="minute"
            domain={["dataMin - 30", "dataMax + 30"]}
            tickFormatter={timeLabel}
            tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="number"
            dataKey="value"
            tickFormatter={compactMoney}
            width={53}
            tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <ReferenceLine
            y={0}
            stroke="var(--muted-foreground)"
            strokeOpacity={0.5}
          />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as (typeof points)[number];
              return (
                <div className="chart-tooltip">
                  <span>
                    {timestampLabel(p.trade.entryAt, timezone)} · {timezone}
                  </span>
                  <strong>
                    {p.trade.symbol} · {p.trade.direction}
                  </strong>
                  <span>
                    {accounts.find((a) => a.id === p.trade.accountId)?.name}
                  </span>
                  <strong
                    className={
                      p.value > 0 ? "positive" : p.value < 0 ? "negative" : ""
                    }
                  >
                    {money(p.value * 100, true)}
                  </strong>
                </div>
              );
            }}
          />
          <Scatter data={points} isAnimationActive={false}>
            {points.map((p, i) => (
              <Cell
                key={i}
                fill={
                  p.value > 0
                    ? "var(--positive)"
                    : p.value < 0
                      ? "var(--negative)"
                      : "var(--muted-foreground)"
                }
                fillOpacity={0.7}
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
