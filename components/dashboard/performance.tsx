"use client";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { useReducedMotion } from "motion/react";
import type { DashboardData } from "@/lib/dashboard/service";
import type { Summary } from "@/lib/journal/statistics";
import { journalMoney } from "@/lib/journal/calculations";
import { Help } from "./panel";

function OutcomeGauge({ stats }: { stats: Summary }) {
  const counts = [stats.wins, stats.zeros, stats.losses];
  const total = counts.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  let offset = 0;
  return (
    <div className="outcome-gauge">
      <svg
        viewBox="0 0 100 58"
        role="img"
        aria-label={`${stats.wins ?? "Unknown"} wins, ${stats.zeros ?? "unknown"} breakevens, ${stats.losses ?? "unknown"} losses`}
      >
        <path
          d="M8 48 A42 42 0 0 1 92 48"
          fill="none"
          stroke="var(--track)"
          strokeWidth="6"
        />
        {total > 0 &&
          counts.map((count, i) => {
            const length = ((count ?? 0) / total) * 100,
              start = offset;
            offset += length;
            return length > 0 ? (
              <path
                key={i}
                d="M8 48 A42 42 0 0 1 92 48"
                pathLength={100}
                fill="none"
                stroke={
                  ["var(--positive)", "var(--violet)", "var(--negative)"][i]
                }
                strokeWidth="6"
                strokeDasharray={`${length} ${100 - length}`}
                strokeDashoffset={-start}
              />
            ) : null;
          })}
      </svg>
      <div className="outcome-counts">
        {counts.map((n, i) => (
          <span key={i} className={["positive", "violet-text", "negative"][i]}>
            {n ?? "—"}
          </span>
        ))}
      </div>
    </div>
  );
}

export function RealMetricCards({
  data,
  complete,
}: {
  data: DashboardData;
  complete: boolean;
}) {
  const s = data.outcomes,
    days = data.realizedSummary,
    unit = complete ? "trades" : "portions";
  // Monetary weights are used only to paint the visualization. Displayed statistics remain server values.
  const gain = Number(s.averageWin ?? 0) * (s.wins ?? 0),
    loss = Math.abs(Number(s.averageLoss ?? 0)) * (s.losses ?? 0);
  const win = Number(s.averageWin ?? 0),
    losing = Math.abs(Number(s.averageLoss ?? 0));
  const cards = [
    {
      label: `Realized ${data.basis} P&L`,
      value: journalMoney(days.total, true),
      help: "Realized exit P&L in the selected range. Cash movements are excluded.",
      foot: `${data.days.length} active days`,
      kind: "pnl",
    },
    {
      label: complete ? "Winning trades" : "Winning portions",
      value: s.winRate == null ? "—" : `${s.winRate}%`,
      help: `Winning ${unit} divided by all selected ${unit}, including breakevens. Counts: wins / breakevens / losses.`,
      kind: "outcomes",
    },
    {
      label: "Profit factor",
      value: s.profitFactor ?? "—",
      help: `${s.profitFactorNote} Positive ${data.basis} P&L / absolute negative P&L. The donut represents monetary totals, not outcome counts. ${unit}.`,
      kind: "factor",
    },
    {
      label: "Winning days",
      value: days.winRate == null ? "—" : `${days.winRate}%`,
      help: "Profitable / all active local exit days, including breakevens. Counts: profitable / breakeven / losing days.",
      kind: "days",
    },
    {
      label: "Average win/loss",
      value: s.averageRatio ?? "—",
      help: `Average winning / absolute average losing ${unit}, ${data.basis}. Undefined when either group is absent.`,
      kind: "average",
    },
  ];
  return (
    <div className="metric-grid">
      {cards.map((c) => (
        <section className={`metric-card metric-${c.kind}`} key={c.kind}>
          <div className="metric-label">
            {c.label}
            <Help label={c.label} text={c.help} />
          </div>
          <div className="metric-body">
            <strong
              className={`metric-value ${c.kind === "pnl" ? (Number(days.total) < 0 ? "negative" : Number(days.total) > 0 ? "positive" : "") : ""}`}
            >
              {c.value}
            </strong>
            {c.kind === "outcomes" && <OutcomeGauge stats={s} />}
            {c.kind === "days" && <OutcomeGauge stats={days} />}
            {c.kind === "factor" && (
              <div
                className="profit-ring"
                aria-hidden
                style={{
                  background:
                    gain + loss > 0
                      ? `conic-gradient(var(--positive) ${(gain / (gain + loss)) * 100}%, var(--negative) 0)`
                      : "var(--track)",
                }}
              >
                <span />
              </div>
            )}
            {c.kind === "average" && (
              <div className="average-visual">
                <div className="comparison-bar">
                  <span
                    style={{ flex: win, display: win ? undefined : "none" }}
                  />
                  <span
                    style={{
                      flex: losing,
                      display: losing ? undefined : "none",
                    }}
                  />
                </div>
                <div className="comparison-values">
                  <span className="positive">{journalMoney(s.averageWin)}</span>
                  <span className="negative">
                    {journalMoney(s.averageLoss)}
                  </span>
                </div>
              </div>
            )}
          </div>
          {c.foot && <p className="metric-foot">{c.foot}</p>}
        </section>
      ))}
    </div>
  );
}

export const profileConvention =
  "MSJournal visual profile, without an overall score. Percentages use 0–100. Ratio axes use min(ratio / 3, 1) × 100: a ratio of 3 or more reaches the display cap. This monotonic visual convention is not a validated measure of skill. Undefined axes are omitted. Review completion is reviewed / eligible contributing records.";
export function PerformanceProfile({
  data,
  complete,
}: {
  data: DashboardData;
  complete: boolean;
}) {
  const reduced = useReducedMotion(),
    s = data.outcomes;
  const review =
    data.reviewCoverage.total > 0
      ? (data.reviewCoverage.reviewed / data.reviewCoverage.total) * 100
      : null;
  const candidates = [
    { axis: "Win %", raw: s.winRate, ratio: false },
    { axis: "Profit factor", raw: s.profitFactor, ratio: true },
    { axis: "Avg win/loss", raw: s.averageRatio, ratio: true },
    {
      axis: "Reviews",
      raw: review === null ? null : review.toFixed(1),
      ratio: false,
    },
    { axis: "Winning days", raw: data.realizedSummary.winRate, ratio: false },
  ];
  const points = candidates
    .filter((p) => p.raw !== null)
    .map((p) => ({
      ...p,
      value: p.ratio ? Math.min(Number(p.raw) / 3, 1) * 100 : Number(p.raw),
    }));
  const omitted = candidates.filter((p) => p.raw === null).map((p) => p.axis);
  return (
    <>
      <div
        className="real-profile-chart"
        role="img"
        aria-label="MSJournal performance radar; ratios have a display cap of 3; no overall score"
      >
        {points.length >= 3 ? (
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={points} outerRadius="67%">
              <PolarGrid stroke="var(--border)" />
              <PolarAngleAxis
                dataKey="axis"
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              />
              <PolarRadiusAxis
                domain={[0, 100]}
                tick={false}
                axisLine={false}
              />
              <Tooltip
                content={({ active, payload }) => {
                  const p = payload?.[0]?.payload;
                  return active && p ? (
                    <div className="chart-tooltip">
                      <span>{p.axis}</span>
                      <strong>
                        {p.raw}
                        {p.ratio ? " : 1" : "%"}
                      </strong>
                      <small>
                        {p.ratio
                          ? "Visual cap: 3 : 1"
                          : "Natural percentage scale"}
                      </small>
                    </div>
                  ) : null;
                }}
              />
              <Radar
                dataKey="value"
                stroke="var(--violet)"
                fill="var(--violet)"
                fillOpacity={0.28}
                dot={{ r: 3, fill: "var(--violet)" }}
                isAnimationActive={!reduced}
              />
            </RadarChart>
          </ResponsiveContainer>
        ) : (
          <p className="dashboard-action-state">
            At least three supported measures are needed for a profile. Select a
            range with realized activity.
          </p>
        )}
      </div>
      <div className="profile-footer">
        <span>
          {complete ? "Complete trades" : "Closed portions"} · {s.count}{" "}
          outcomes · {data.basis}
        </span>
        <Help label="Profile normalization" text={profileConvention} />
      </div>
      {omitted.length > 0 && (
        <p className="profile-omissions">Unavailable: {omitted.join(", ")}</p>
      )}
    </>
  );
}
