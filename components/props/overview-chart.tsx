"use client";
import { motion } from "motion/react";
import {
  ResponsiveContainer,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Area,
  Line,
  Scatter,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { D } from "@/lib/journal/processing";
import { journalMoney, localDay } from "@/lib/journal/calculations";
import { journalTimestamp } from "@/lib/timezones";
import { daySchema, shiftDay } from "@/lib/calendar/model";
import type { PhaseProgress } from "@/lib/props/model";
import type { Payout } from "@/lib/props/tracking-rules";
import {
  phasePayoutEvents,
  overviewChartRows,
  overviewReference,
} from "@/lib/props/overview-model";
import { useOverviewLocation } from "./overview-location";

export function OverviewChart({
  progress,
  timezone,
  payouts,
}: {
  progress: PhaseProgress;
  timezone: string;
  payouts: Payout[];
}) {
  const { search, patch } = useOverviewLocation(
    progress.phase.tradingAccountId,
  );
  const mode = search.get("range") ?? "phase";
  const through = search.get("through") ?? localDay(progress.asOf, timezone);
  const from = search.get("from") ?? localDay(progress.phase.startAt, timezone);
  const endDay =
    mode === "custom"
      ? through
      : localDay(progress.phase.endAt ?? progress.asOf, timezone);
  const startDay =
    mode === "custom"
      ? from
      : mode === "30"
        ? shiftDay(endDay, -29)
        : localDay(progress.phase.startAt, timezone);
  const valid =
    daySchema.safeParse(startDay).success &&
    daySchema.safeParse(endDay).success &&
    startDay <= endDay;
  const inRange = (at: number) =>
    valid &&
    localDay(new Date(at).toISOString(), timezone) >= startDay &&
    localDay(new Date(at).toISOString(), timezone) <= endDay;
  const rows = overviewChartRows(progress).filter((row) => inRange(row.at));
  const reference = overviewReference(progress);
  const events = phasePayoutEvents(progress, payouts).filter((e) =>
    inRange(Date.parse(e.at)),
  );
  const visible = rows.some(
    (r) => r.exactBalance !== null || r.exactFloor !== null,
  );
  const axisValues = rows
    .flatMap((r) => [r.balance, r.floor, r.snapshotBalance, r.snapshotFloor])
    .filter((v): v is number => v !== null);
  if (reference) axisValues.push(Number(reference.value));
  if (progress.phase.baseline !== null)
    axisValues.push(Number(progress.phase.baseline));
  const low = axisValues.length
      ? axisValues.reduce((a, b) => Math.min(a, b))
      : 0,
    high = axisValues.length ? axisValues.reduce((a, b) => Math.max(a, b)) : 1;
  const pad = Math.max((high - low) * 0.08, 1);
  return (
    <motion.section
      className="panel prop-overview-chart"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <header className="prop-overview-panel-heading">
        <div>
          <h2>Balance & loss threshold</h2>
          <p>
            {progress.phase.label} · {timezone} · one phase only
          </p>
        </div>
        <div className="prop-chart-range" aria-label="Chart date range">
          {[
            ["phase", "Full phase"],
            ["30", "30 days"],
            ["custom", "Custom"],
          ].map(([id, label]) => (
            <button
              key={id}
              aria-pressed={mode === id}
              onClick={() => patch({ range: id })}
            >
              {label}
            </button>
          ))}
        </div>
      </header>
      {mode === "custom" && (
        <div className="prop-chart-custom-range">
          <label>
            From
            <input
              type="date"
              aria-label="Chart from date"
              value={from}
              onChange={(e) => patch({ from: e.target.value })}
            />
          </label>
          <label>
            Through
            <input
              type="date"
              aria-label="Chart through date"
              value={through}
              onChange={(e) => patch({ through: e.target.value })}
            />
          </label>
        </div>
      )}
      <div className="prop-overview-chart-legend">
        <span className="balance">Balance</span>
        <span className="floor">Loss threshold</span>
        {reference && <span className="target">{reference.label}</span>}
        <span>Starting balance</span>
      </div>
      {!valid ? (
        <p className="prop-overview-empty" role="status">
          Choose valid dates with From on or before Through.
        </p>
      ) : !visible ? (
        <p className="prop-overview-empty">
          No supported observations in this range. Add a starting balance or
          dated firm snapshot; no sample curve is shown.
        </p>
      ) : (
        <div
          className="prop-overview-chart-canvas"
          role="img"
          aria-label="Phase balance shown with linear segments; supported loss thresholds shown as steps; manual snapshots shown as individual points"
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={rows}
              margin={{ top: 22, right: 18, left: 0, bottom: 12 }}
            >
              <defs>
                <linearGradient
                  id={`balance-${progress.phase.id}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor="var(--positive)"
                    stopOpacity={0.17}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--positive)"
                    stopOpacity={0.01}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                vertical={false}
                stroke="var(--border)"
                strokeDasharray="3 5"
              />
              <XAxis
                dataKey="at"
                type="number"
                domain={
                  rows.length === 1
                    ? [rows[0].at - 3600000, rows[0].at + 3600000]
                    : ["dataMin", "dataMax"]
                }
                tickFormatter={(at) =>
                  new Intl.DateTimeFormat("en-US", {
                    month: "short",
                    day: "numeric",
                    timeZone: timezone,
                  }).format(new Date(at))
                }
                minTickGap={45}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              />
              <YAxis
                domain={[low - pad, high + pad]}
                width={72}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                tickFormatter={(v) =>
                  new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                    notation: "compact",
                    maximumFractionDigits: 1,
                  }).format(v)
                }
              />
              <Tooltip
                cursor={{
                  stroke: "var(--muted-foreground)",
                  strokeDasharray: "3 4",
                }}
                content={({ active, payload }) => {
                  const row = payload?.[0]?.payload as
                    (typeof rows)[number] | undefined;
                  if (!active || !row) return null;
                  const buffer =
                    row.exactBalance !== null && row.exactFloor !== null
                      ? new D(row.exactBalance).minus(row.exactFloor).toFixed()
                      : null;
                  return (
                    <div className="chart-tooltip prop-overview-tooltip">
                      <span>
                        {journalTimestamp(
                          new Date(row.at).toISOString(),
                          timezone,
                        )}
                      </span>
                      <strong>
                        Balance{" "}
                        {row.exactBalance === null
                          ? "Not observed"
                          : journalMoney(row.exactBalance)}
                      </strong>
                      <span>
                        Loss threshold{" "}
                        {row.exactFloor === null
                          ? "Not confirmed at this time"
                          : journalMoney(row.exactFloor)}
                      </span>
                      <span>
                        Remaining buffer{" "}
                        {buffer === null
                          ? "Needs matching observations"
                          : journalMoney(buffer)}
                      </span>
                      <small>{row.source}</small>
                    </div>
                  );
                }}
              />
              {progress.phase.baseline !== null && (
                <ReferenceLine
                  y={Number(progress.phase.baseline)}
                  stroke="var(--muted-foreground)"
                  strokeDasharray="2 6"
                />
              )}
              {reference && (
                <ReferenceLine
                  y={Number(reference.value)}
                  stroke="var(--violet)"
                  strokeDasharray="5 5"
                />
              )}
              {events.slice(0, 20).map((e, i) => (
                <ReferenceLine
                  key={`${e.at}-${e.label}-${i}`}
                  x={Date.parse(e.at)}
                  ifOverflow="extendDomain"
                  stroke="var(--violet)"
                  strokeOpacity={0.35}
                  strokeDasharray="2 5"
                />
              ))}
              <Area
                type="linear"
                dataKey="balance"
                name="Balance"
                baseValue="dataMin"
                stroke="var(--positive)"
                fill={`url(#balance-${progress.phase.id})`}
                strokeWidth={2}
                dot={{ r: 2 }}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Line
                type="stepAfter"
                dataKey="floor"
                name="Loss threshold"
                stroke="var(--negative)"
                strokeDasharray="6 5"
                strokeWidth={2}
                dot={{ r: 2 }}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Scatter
                name="Confirmed snapshot balance"
                dataKey="snapshotBalance"
                fill="var(--positive)"
                isAnimationActive={false}
              />
              <Scatter
                name="Confirmed snapshot threshold"
                dataKey="snapshotFloor"
                fill="var(--negative)"
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="prop-overview-chart-note">
        {rows.filter((r) => r.exactBalance !== null || r.exactFloor !== null)
          .length === 1
          ? "One observation: a point is shown. History will appear as supported observations are added. "
          : ""}
        Linear balances and step thresholds reflect recorded data. Gaps are
        intentional; snapshot points do not establish the intervening equity
        path.{" "}
        {progress.tracking?.estimatedFees
          ? "Amounts include estimated fees."
          : ""}
      </p>
      {events.length > 0 && (
        <details className="prop-overview-events">
          <summary>
            {events.length} payout events in range · dates and amounts
          </summary>
          {events.map((e, i) => (
            <p key={`${e.label}-${i}`}>
              <strong>{e.label}</strong> · {journalTimestamp(e.at, timezone)} ·{" "}
              {e.amount === null
                ? "Amount not recorded"
                : journalMoney(e.amount)}
              {e.label.endsWith("deducted")
                ? " · account deduction"
                : " · not a separate trading profit"}
            </p>
          ))}
          {events.length > 20 && (
            <p>First 20 markers shown; all events are listed here.</p>
          )}
        </details>
      )}
    </motion.section>
  );
}
