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
import type { DashboardData } from "@/lib/dashboard/service";
import type { Summary } from "@/lib/journal/statistics";
import { journalMoney } from "@/lib/journal/calculations";
import { Help } from "./panel";
import { calculateMsScore, msScoreConvention } from "@/lib/dashboard/ms-score";

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
    unit = complete ? "trades" : "recorded trades";
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
      label: "Trade Win",
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

export const profileConvention = msScoreConvention;
export function PerformanceProfile({
  data,
  complete,
}: {
  data: {
    outcomes: Summary;
    days: { date: string; total: string | null }[];
    basis: "gross" | "net";
    requestedBasis: "gross" | "net";
  };
  complete: boolean;
}) {
  const score = calculateMsScore(data.outcomes, data.days);
  const fallback = data.requestedBasis !== data.basis;
  return (
    <div className="ms-score">
      <div
        className="real-profile-chart"
        role="img"
        aria-label={
          score.value === null
            ? "MS Score needs trading data"
            : `MS Score ${score.value} out of 100. ${data.basis} P&L. Daily drawdown, not intraday equity.`
        }
      >
        {score.value !== null ? (
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={score.axes} outerRadius="66%">
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
                  const point = payload?.[0]?.payload;
                  return active && point ? (
                    <div className="chart-tooltip">
                      <span>{point.axis}</span>
                      <strong>
                        {point.axis === "Drawdown"
                          ? journalMoney(point.raw)
                          : point.raw}
                      </strong>
                      <small>
                        {Number(point.value).toFixed(1)} / 100 normalized
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
                isAnimationActive={false}
              />
            </RadarChart>
          </ResponsiveContainer>
        ) : (
          <p className="dashboard-action-state">{score.reason}</p>
        )}
      </div>
      <div className="ms-score-footer">
        <div>
          <span>
            Your MS Score{" "}
            <Help label="How MS Score works" text={profileConvention} />
          </span>
          <strong>
            {score.value ?? "—"}
            <small> / 100</small>
          </strong>
        </div>
        <div className="ms-score-scale">
          <div className="ms-score-track">
            {score.value !== null && <i style={{ left: `${score.value}%` }} />}
          </div>
          <div className="ms-score-ticks">
            <span>0</span>
            <span>25</span>
            <span>50</span>
            <span>75</span>
            <span>100</span>
          </div>
        </div>
      </div>
      <p className="ms-score-context">
        {complete ? "Full positions" : "Closed trades"} / {data.basis} P&L
        {fallback ? " / fees incomplete" : ""}
        {score.value !== null && score.early ? " / early sample" : ""}
      </p>
    </div>
  );
}
