import { D, sum } from "@/lib/journal/processing";
import type { Summary } from "@/lib/journal/statistics";
export const MS_SCORE_VERSION = "1.0";
export const msScoreConvention =
  "MS Score v1.0 is MSJournal's own 0-100 summary, not TradeZella's formula. Six equally weighted measures: trade win rate; profit factor and average win/loss (ratios capped at 3); recovery (positive daily profit / daily drawdown, capped at 3); daily drawdown resilience (1 - drawdown / total absolute daily P&L); and consistency of positive-day profits. This is not a prop firm payout rule. Consistency compares the best positive day with equal positive days; one or no positive days scores 0. Drawdown uses daily closes from zero, not intraday equity or account risk limits. Review completion and cash movements do not affect the score. Selections below 20 trades or 5 days are marked early samples.";
export function calculateMsScore(
  stats: Summary,
  days: { date: string; total: string | null }[],
) {
  const empty = {
    value: null,
    axes: [],
    early: true,
    reason: "Select a range with closed trades to calculate your MS Score.",
  };
  if (!stats.count || !days.length) return empty;
  if (
    stats.wins === null ||
    stats.losses === null ||
    stats.zeros === null ||
    stats.total === null ||
    days.some((day) => day.total === null)
  )
    return {
      ...empty,
      reason: "Complete P&L data is needed for this selection.",
    };
  if (!stats.wins && !stats.losses)
    return {
      ...empty,
      reason: "A winning or losing trade is needed to calculate your MS Score.",
    };
  const ordered = [...days].sort((a, b) => a.date.localeCompare(b.date));
  let balance = new D(0),
    peak = new D(0),
    drawdown = new D(0);
  for (const day of ordered) {
    balance = balance.plus(day.total!);
    peak = D.max(peak, balance);
    drawdown = D.max(drawdown, peak.minus(balance));
  }
  const positive = ordered
    .filter((day) => new D(day.total!).gt(0))
    .map((day) => day.total!);
  const gains = new D(stats.averageWin ?? 0).times(stats.wins);
  const losses = new D(stats.averageLoss ?? 0).abs().times(stats.losses);
  const activity = new D(
    sum(ordered.map((day) => new D(day.total!).abs().toFixed())),
  );
  const cappedRatio = (value: InstanceType<typeof D>) =>
    D.min(100, D.max(0, value.div(3).times(100)));
  const profitFactor = losses.gt(0) ? gains.div(losses) : null;
  const averageRatio =
    stats.wins && stats.losses
      ? new D(stats.averageWin!).div(new D(stats.averageLoss!).abs())
      : null;
  const recovery = drawdown.gt(0) ? D.max(0, balance).div(drawdown) : null;
  const consistency =
    positive.length > 1
      ? new D(1)
          .minus(D.max(...positive).div(sum(positive)))
          .div(new D(1).minus(new D(1).div(positive.length)))
          .times(100)
      : new D(0);
  const axes = [
    {
      axis: "Win %",
      raw: new D(stats.wins).div(stats.count).times(100).toFixed(1) + "%",
      score: new D(stats.wins).div(stats.count).times(100),
    },
    {
      axis: "Profit factor",
      raw: profitFactor?.toFixed(2) ?? "No losing trades",
      score: profitFactor
        ? cappedRatio(profitFactor)
        : gains.gt(0)
          ? new D(100)
          : new D(0),
    },
    {
      axis: "Avg win/loss",
      raw:
        averageRatio?.toFixed(2) ??
        (stats.wins ? "No losing trades" : "No winning trades"),
      score: averageRatio
        ? cappedRatio(averageRatio)
        : stats.wins
          ? new D(100)
          : new D(0),
    },
    {
      axis: "Recovery",
      raw: recovery?.toFixed(2) ?? "No daily drawdown",
      score: recovery
        ? cappedRatio(recovery)
        : balance.gt(0)
          ? new D(100)
          : new D(0),
    },
    {
      axis: "Drawdown",
      raw: drawdown.toFixed(2),
      score: activity.gt(0)
        ? new D(1).minus(drawdown.div(activity)).times(100)
        : new D(0),
    },
    {
      axis: "Consistency",
      raw: consistency.toFixed(1) + "%",
      score: consistency,
    },
  ].map((axis) => ({
    axis: axis.axis,
    raw: axis.raw,
    normalized: D.min(100, D.max(0, axis.score)).toFixed(),
    value: D.min(100, D.max(0, axis.score)).toNumber(),
  }));
  return {
    value: new D(sum(axes.map((axis) => axis.normalized)))
      .div(6)
      .toDecimalPlaces(2)
      .toFixed(2),
    axes,
    early: stats.count < 20 || days.length < 5,
    reason: null,
  };
}
