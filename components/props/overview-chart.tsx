"use client";
import { ResponsiveContainer, ComposedChart, XAxis, YAxis, CartesianGrid, Area, Line, Tooltip, ReferenceLine } from "recharts";
import { D } from "@/lib/journal/processing";
import { journalMoney, localDay } from "@/lib/journal/calculations";
import { journalTimestamp } from "@/lib/timezones";
import { daySchema, shiftDay } from "@/lib/calendar/model";
import { localInstant } from "@/lib/props/validation";
import type { PhaseProgress } from "@/lib/props/model";
import type { Payout } from "@/lib/props/tracking-rules";
import { useOverviewLocation } from "./overview-location";
import { phasePayoutEvents } from "@/lib/props/overview-model";

export function OverviewChart({ progress, timezone, payouts }: { progress: PhaseProgress; timezone: string; payouts: Payout[] }) {
  const { search, patch } = useOverviewLocation(progress.phase.tradingAccountId);
  const o = progress.imported;
  const requestedRange = search.get("range");
  const mode = requestedRange === "30" || requestedRange === "custom" ? requestedRange : "phase";
  const daily = search.get("chartView") === "daily";
  const chartZone = daily ? o.sessionTimezone ?? timezone : timezone;
  const through = search.get("through") ?? localDay(progress.phase.endAt ?? progress.asOf, chartZone);
  const from = search.get("from") ?? localDay(progress.phase.startAt, chartZone);
  const endDay = mode === "custom" ? through : localDay(progress.phase.endAt ?? progress.asOf, chartZone);
  const startDay = mode === "custom" ? from : mode === "30" ? shiftDay(endDay, -29) : localDay(progress.phase.startAt, chartZone);
  let valid = daySchema.safeParse(startDay).success && daySchema.safeParse(endDay).success && startDay <= endDay;
  let start = 0, end = 0;
  try {
    start = Math.max(Date.parse(progress.phase.startAt), Date.parse(localInstant(`${startDay}T00:00`, chartZone)));
    end = Math.min(Date.parse(progress.phase.endAt ?? progress.asOf), Date.parse(localInstant(`${shiftDay(endDay, 1)}T00:00`, chartZone)) - 1);
    if (start > end) valid = false;
  } catch { valid = false; }
  const source = daily ? o.daily : o.points;
  if (daily) {
    const lastClose = source.filter((row) => row.sessionDate !== null).at(-1);
    end = lastClose ? Math.min(end, Date.parse(lastClose.at)) : start - 1;
  }
  const intersects = valid && start <= end;
  const chosen = intersects ? source.filter((row) => Date.parse(row.at) >= start && Date.parse(row.at) <= end) : [];
  const carry = source.filter((row) => Date.parse(row.at) <= start).at(-1);
  if (intersects && carry && (!chosen.length || Date.parse(chosen[0].at) > start)) chosen.unshift({ ...carry, at: new Date(start).toISOString(), netPnl: null, sessionDate: daily ? carry.sessionDate : null });
  if (intersects && chosen.length && Date.parse(chosen.at(-1)!.at) < end) chosen.push({ ...chosen.at(-1)!, at: new Date(end).toISOString(), netPnl: null, sessionDate: daily ? chosen.at(-1)!.sessionDate : null });
  const rows = chosen.map((point) => ({ ...point, at: Date.parse(point.at), exactBalance: point.balance, exactFloor: point.floor,
    balance: point.balance === null ? null : Number(point.balance), floor: point.floor === null ? null : Number(point.floor), target: point.target === null ? null : Number(point.target) }));
  const visible = rows.some((row) => row.balance !== null);
  const showFloor = rows.filter((row) => row.floor !== null).length >= 2;
  const showTarget = rows.some((row) => row.target !== null);
  const values = rows.flatMap((row) => [row.balance, ...(showFloor ? [row.floor] : []), row.target]).filter((value): value is number => value !== null);
  if (o.baseline !== null) values.push(Number(o.baseline));
  const low = values.length ? values.reduce((a, b) => Math.min(a, b)) : 0, high = values.length ? values.reduce((a, b) => Math.max(a, b)) : 1;
  const pad = Math.max((high - low) * .08, 1);
  const events = phasePayoutEvents(progress, payouts).filter((event) => Date.parse(event.at) >= start && Date.parse(event.at) <= end);
  return <section className="panel prop-overview-chart">
    <header className="prop-overview-panel-heading prop-reference-chart-heading">
      <h2 className="sr-only">Account balance and loss limit</h2>
      <div className="prop-reference-series">
        <span className="balance">Account balance</span>
        {showFloor && <span className="floor">Loss limit{o.limitEstimated ? " (estimated)" : ""}</span>}
        {showTarget && <span className="target">Profit target</span>}
        {o.baseline !== null && <span className="starting">Starting balance</span>}
      </div>
      <div className="prop-chart-range" aria-label="Chart date range">
        {[["phase", "All time"], ["30", "30 days"], ["custom", "Custom"]].map(([id, label]) => <button key={id} aria-pressed={mode === id} onClick={() => patch({ range: id })}>{label}</button>)}
      </div>
    </header>
    <div className="prop-chart-display">
      <div className="prop-chart-range" aria-label="Chart data view">{[["trades", "Trades"], ["daily", "Daily"]].map(([id, label]) => <button key={id} aria-pressed={daily === (id === "daily")} onClick={() => patch({ chartView: id })}>{label}</button>)}</div>
      <small>{daily ? `Completed sessions \u00b7 ${chartZone}` : `Closed-trade times \u00b7 ${timezone}`}</small>
    </div>
    {mode === "custom" && <div className="prop-chart-custom-range">
      <label>From<input type="date" aria-label="Chart from date" value={from} onChange={(event) => patch({ from: event.target.value })} /></label>
      <label>Through<input type="date" aria-label="Chart through date" value={through} onChange={(event) => patch({ through: event.target.value })} /></label>
    </div>}
    {!valid ? <p className="prop-overview-empty" role="status">Choose dates within this phase, with From on or before Through.</p> : !visible ? <p className="prop-overview-empty">{o.pending ? "Process the remaining imports to update this chart." : o.baseline === null ? "Set a starting balance in account rules to see the balance chart." : daily ? "No completed sessions in this range. Switch to Trades to see closed-trade progress." : "Add trading fees to calculate the net account balance."}</p> : <div className="prop-overview-chart-canvas" role="img" aria-label="Calculated account balance with loss limit, profit target and starting balance references">
      <ResponsiveContainer width="100%" height="100%"><ComposedChart data={rows} margin={{ top: 20, right: 12, left: 12, bottom: 14 }}>
        <defs><linearGradient id={`imported-balance-${progress.phase.id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--positive)" stopOpacity={.22} /><stop offset="100%" stopColor="var(--positive)" stopOpacity={.015} /></linearGradient></defs>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={.5} />
        <XAxis dataKey="at" type="number" domain={start === end ? [start - 1, end + 1] : [start, end]} tickFormatter={(value) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: chartZone }).format(new Date(value))} minTickGap={50} tickLine={false} axisLine={false} tickMargin={12} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
        <YAxis domain={[low - pad, high + pad]} width={78} orientation="right" axisLine={false} tickLine={false} tickMargin={12} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickFormatter={(value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: Math.abs(value) >= 1000000 ? "compact" : "standard", maximumFractionDigits: 0 }).format(value)} />
        <Tooltip cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 4" }} content={({ active, payload }) => {
          const row = payload?.[0]?.payload as (typeof rows)[number] | undefined;
          if (!active || !row) return null;
          const buffer = row.exactBalance !== null && row.exactFloor !== null ? new D(row.exactBalance).minus(row.exactFloor).toFixed() : null;
          return <div className="chart-tooltip prop-overview-tooltip">
            <span>{daily && row.sessionDate ? row.sessionDate : journalTimestamp(new Date(row.at).toISOString(), chartZone)}</span>
            {row.exactBalance !== null && <strong>Account balance {journalMoney(row.exactBalance)}{o.estimatedFees ? " (Estimated)" : ""}</strong>}
            {row.netPnl !== null && <span>Net P&L {journalMoney(row.netPnl, true)}{o.estimatedFees ? " (Estimated)" : ""}</span>}
            {row.exactFloor !== null && <span>Loss limit {journalMoney(row.exactFloor)}{row.estimated ? " (Estimated)" : ""}</span>}
            {buffer !== null && <span>Remaining loss buffer {journalMoney(buffer)}{row.estimated || o.estimatedFees ? " (Estimated)" : ""}</span>}
          </div>;
        }} />
        {o.baseline !== null && <ReferenceLine y={Number(o.baseline)} stroke="var(--muted-foreground)" strokeOpacity={.6} strokeDasharray="2 6" />}
        {showTarget && <Line type="stepAfter" dataKey="target" name="Profit target" stroke="var(--violet)" strokeDasharray="5 5" strokeWidth={1.2} dot={false} activeDot={false} connectNulls={false} isAnimationActive={false} />}
        <Area type="stepAfter" dataKey="balance" name="Account balance" baseValue="dataMin" stroke="var(--positive)" fill={`url(#imported-balance-${progress.phase.id})`} strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />
        {showFloor && <Line type="stepAfter" dataKey="floor" name="Loss limit" stroke="var(--negative)" strokeOpacity={.8} strokeDasharray="6 5" strokeWidth={1.5} dot={false} activeDot={false} connectNulls={false} isAnimationActive={false} />}
      </ComposedChart></ResponsiveContainer>
    </div>}
    {events.length > 0 && <details className="prop-overview-events"><summary>{events.length} payout events in range</summary>{events.map((event, index) => <p key={`${event.at}-${index}`}><strong>{event.label}</strong>{" \u00b7 "}{journalTimestamp(event.at, timezone)}{" \u00b7 "}{event.amount === null ? "Amount not recorded" : journalMoney(event.amount)}</p>)}</details>}
  </section>;
}
