"use client";
import {
  ResponsiveContainer,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Line,
  Scatter,
  Tooltip,
} from "recharts";
import { journalMoney } from "@/lib/journal/calculations";
import type { PhaseProgress } from "@/lib/props/model";
export function PropBalanceChart({ progress }: { progress: PhaseProgress }) {
  const points = progress.tracking?.points ?? progress.current?.points ?? [],
    snapshots = progress.snapshots;
  const rows = [
    ...points.map((p) => ({
      at: new Date(p.at).getTime(),
      exactBalance: p.balance,
      exactFloor: p.floor,
      balance: p.balance === null ? null : Number(p.balance),
      floor: p.floor === null ? null : Number(p.floor),
      reason: p.reason,
    })),
    ...snapshots.map((s) => ({
      at: new Date(s.asOf).getTime(),
      manual: Number(s.balance),
      manualFloor: s.threshold === null ? null : Number(s.threshold),
      exactBalance: s.balance,
      exactFloor: s.threshold,
      reason: "Manually recorded from prop dashboard",
    })),
  ].sort((a, b) => a.at - b.at);
  if (!rows.some((r) => r.exactBalance !== null || r.exactFloor !== null))
    return (
      <p className="prop-setup">
        Set a phase baseline and import realized activity, or record a dated
        dashboard snapshot. Manual observations remain separate from imported
        results.
      </p>
    );
  return (
    <div
      className="prop-chart"
      role="img"
      aria-label="Imported balance and floor estimates; standalone manual balance/threshold snapshots. Manual observations are not connected."
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={rows}
          margin={{ top: 16, right: 16, left: 8, bottom: 12 }}
        >
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="at"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v) =>
              new Intl.DateTimeFormat("en-US", {
                month: "short",
                day: "numeric",
                timeZone: "UTC",
              }).format(new Date(v))
            }
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            minTickGap={40}
          />
          <YAxis
            width={65}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v) =>
              `$${new Intl.NumberFormat("en-US", { notation: "compact" }).format(v)}`
            }
          />
          <Tooltip
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload;
              return active && p ? (
                <div className="chart-tooltip">
                  <span>{new Date(p.at).toISOString()}</span>
                  <strong>Balance {journalMoney(p.exactBalance)}</strong>
                  <small>
                    Threshold {journalMoney(p.exactFloor)} · {p.reason}
                  </small>
                </div>
              ) : null;
            }}
          />
          <Line
            dataKey="balance"
            type="linear"
            stroke="var(--violet)"
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            dataKey="floor"
            type="stepAfter"
            stroke="var(--negative)"
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Scatter
            data={rows.filter((row) => "manual" in row)}
            dataKey="manual"
            fill="var(--positive)"
            isAnimationActive={false}
          />
          <Scatter
            data={rows.filter(
              (row) => "manualFloor" in row && row.manualFloor !== null,
            )}
            dataKey="manualFloor"
            fill="var(--negative)"
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="prop-local-note">
        Violet: imported balance estimate · red line: custom floor estimate ·
        isolated dots: manual balance / threshold. Dates on chart are UTC;
        tooltips show exact timestamps.
      </p>
    </div>
  );
}
