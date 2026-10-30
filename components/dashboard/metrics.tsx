import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { money, ratio, type metrics } from "@/lib/calculations";
import { Help } from "./panel";
function Gauge({ value }: { value: number | null }) {
  return (
    <svg className="gauge" viewBox="0 0 90 52" aria-hidden="true">
      <path
        d="M 8 45 A 37 37 0 0 1 82 45"
        fill="none"
        stroke="var(--track)"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <path
        d="M 8 45 A 37 37 0 0 1 82 45"
        fill="none"
        stroke="var(--positive)"
        strokeWidth="8"
        strokeLinecap="round"
        pathLength="100"
        strokeDasharray={`${value ?? 0} 100`}
      />
      <circle cx="45" cy="45" r="3" fill="var(--muted-foreground)" />
      <path
        d="M45 45 L45 21"
        stroke="var(--muted-foreground)"
        strokeWidth="2"
        transform={`rotate(${(value ?? 0) * 1.8 - 90} 45 45)`}
      />
    </svg>
  );
}
export function MetricCards({ stats }: { stats: ReturnType<typeof metrics> }) {
  const pct = (value: number | null) =>
    value === null ? "—" : `${value.toFixed(1)}%`;
  const proportion =
    stats.positive + stats.negative
      ? (stats.positive / (stats.positive + stats.negative)) * 100
      : 0;
  const cards = [
    {
      label: "Net P&L",
      value: money(stats.netCents, true),
      help: "Gross trading P&L minus commissions and fees. Cash deposits and withdrawals are excluded.",
      foot: `${stats.count} closed trades · after fees`,
      kind: "net",
    },
    {
      label: "Trade Win",
      value: pct(stats.winRate),
      help: "Winning closed trades divided by all closed trades, including breakeven trades.",
      foot: `${stats.wins} wins · ${stats.losses} losses · ${stats.breakeven} flat`,
      kind: "trade",
    },
    {
      label: "Profit factor",
      value: ratio(stats.profitFactor),
      help: "Positive net trade P&L divided by absolute negative net trade P&L. Undefined when there are no losing trades. Ring shows their dollar proportions.",
      foot:
        stats.profitFactor === null
          ? "No losses · ratio undefined"
          : "Positive / absolute negative P&L",
      kind: "factor",
    },
    {
      label: "Day win %",
      value: pct(stats.dayWinRate),
      help: "Profitable trading days divided by all trading days. Close dates are grouped in Asia/Jerusalem.",
      foot: `${stats.days} trading days · Jerusalem`,
      kind: "day",
    },
    {
      label: "Average win/loss ratio",
      value: ratio(stats.winLossRatio),
      help: "Average positive net trade P&L divided by absolute average negative net trade P&L. Undefined if either group is missing.",
      foot: "Average net win / net loss",
      kind: "ratio",
    },
  ];
  return (
    <div className="metric-grid">
      {cards.map((card) => (
        <section className={`metric-card metric-${card.kind}`} key={card.label}>
          <div className="metric-label">
            {card.label}
            <Help text={card.help} label={card.label} />
          </div>
          <div className="metric-body">
            <strong
              className={`metric-value ${card.kind === "net" ? (stats.netCents < 0 ? "negative" : stats.netCents > 0 ? "positive" : "") : ""}`}
            >
              {card.value}
            </strong>
            {card.kind === "net" && (
              <span
                className={`metric-trend ${stats.netCents < 0 ? "down" : ""}`}
              >
                {stats.netCents === 0 ? (
                  <Minus size={23} />
                ) : stats.netCents < 0 ? (
                  <ArrowDownRight size={23} />
                ) : (
                  <ArrowUpRight size={23} />
                )}
              </span>
            )}
            {(card.kind === "trade" || card.kind === "day") && (
              <Gauge
                value={card.kind === "trade" ? stats.winRate : stats.dayWinRate}
              />
            )}{" "}
            {card.kind === "factor" && (
              <div
                className="profit-ring"
                style={{
                  background: stats.count
                    ? `conic-gradient(var(--positive) ${proportion}%, var(--negative) 0)`
                    : "var(--track)",
                }}
                aria-hidden="true"
              >
                <span />
              </div>
            )}
          </div>
          {card.kind === "ratio" && (
            <div className="average-comparison">
              <div className="comparison-values">
                <span className="positive">
                  {stats.averageWin === null ? "—" : money(stats.averageWin)}
                </span>
                <span className="negative">
                  {stats.averageLoss === null ? "—" : money(-stats.averageLoss)}
                </span>
              </div>
              <div className="comparison-bar">
                <span
                  style={{
                    flex: stats.averageWin ?? 0,
                    display: stats.averageWin === null ? "none" : undefined,
                  }}
                />
                <span
                  style={{
                    flex: stats.averageLoss ?? 0,
                    display: stats.averageLoss === null ? "none" : undefined,
                  }}
                />
              </div>
            </div>
          )}
          <p className="metric-foot">{card.foot}</p>
        </section>
      ))}
    </div>
  );
}
