import { D } from "@/lib/journal/processing";
import type { Cell } from "./model";
const numeric = (v: string | undefined) => v !== undefined && /^-?\d{1,16}(\.\d{1,8})?$/.test(v) ? new D(v) : null;
export type SizingInputs = { entry: string; stop: string; tickSize: string; tickValue: string; costs: string; execution: string; available: string; increment: string; maximum: string; linear: boolean; constraints: boolean; exposureReconciled: boolean };
export function linearSizing(v: SizingInputs) {
  const values = [v.entry,v.stop,v.tickSize,v.tickValue,v.costs,v.execution,v.available,v.increment,v.maximum].map(numeric);
  if (!v.linear || !v.constraints || !v.exposureReconciled || values.some((n) => n === null)) return { message: "Complete every input and confirmation. No quantity estimate is available." };
  const [entry,stop,tickSize,tickValue,costs,execution,available,increment,maximum] = values as InstanceType<typeof D>[];
  if (tickSize.lte(0) || tickValue.lte(0) || increment.lte(0) || maximum.lte(0) || costs.lt(0) || execution.lt(0) || available.lt(0) || entry.eq(stop)) return { message: "Check positive tick values, distance, quantity limits and nonnegative allowances." };
  const ticks = entry.minus(stop).abs().div(tickSize);
  if (!ticks.isInteger()) return { message: "The price distance must be a whole number of ticks for this helper." };
  const priceRisk = ticks.mul(tickValue), perUnit = priceRisk.plus(costs).plus(execution);
  const quantity = D.min(available.div(perUnit), maximum).div(increment).floor().mul(increment);
  return { ticks: ticks.toFixed(), priceRisk: priceRisk.toFixed(), perUnit: perUnit.toFixed(), quantity: quantity.toFixed(), total: quantity.mul(perUnit).toFixed(), message: quantity.isZero() ? "No permitted increment fits these supplied limits." : "Planning estimate from supplied inputs, not permission to trade or a guaranteed maximum loss." };
}
export function adherence(rows: { cells: Record<string, Cell> }[]) {
  let relevant = 0, followed = 0, breached = 0, unclear = 0, notApplicable = 0, unresolvedTrigger = 0;
  for (const { cells } of rows) {
    if (cells.c1?.state !== "value" || cells.c1.value === "Unknown") { unresolvedTrigger++; continue; }
    if (cells.c1.value !== "Yes") continue;
    relevant++;
    if (cells.c2?.state === "not-applicable") { notApplicable++; continue; }
    if (cells.c2?.state !== "value") { unclear++; continue; }
    if (cells.c2.value === "Followed") followed++;
    else if (cells.c2.value === "Breached") breached++;
    else if (cells.c2.value === "Not applicable") notApplicable++;
    else unclear++;
  }
  return { relevant, followed, breached, unclear, notApplicable, unresolvedTrigger, percentage: followed + breached ? new D(followed).div(followed + breached).mul(100).toFixed(2) : null };
}
export function cashLedger(rows: { cells: Record<string, Cell> }[]) {
  const groups = new Map<string, { received: InstanceType<typeof D>; expenses: InstanceType<typeof D>; incomplete: number; rows: number }>();
  let unresolvedCurrency = 0;
  for (const { cells } of rows) {
    const currency = cells.c4?.state === "value" ? cells.c4.value.trim().toUpperCase() : "";
    if (!/^[A-Z]{3}$/.test(currency)) { unresolvedCurrency++; continue; }
    const g = groups.get(currency) ?? { received: new D(0), expenses: new D(0), incomplete: 0, rows: 0 };
    const r = cells.c2?.state === "value" ? numeric(cells.c2.value) : null;
    const e = cells.c3?.state === "value" ? numeric(cells.c3.value) : null;
    if (r && r.gte(0)) g.received = g.received.plus(r);
    if (e && e.gte(0)) g.expenses = g.expenses.plus(e);
    if (!r || !e || r.lt(0) || e.lt(0)) g.incomplete++;
    g.rows++; groups.set(currency,g);
  }
  return { unresolvedCurrency, groups: [...groups].map(([currency,g]) => ({ currency, received: g.received.toFixed(), expenses: g.expenses.toFixed(), difference: g.incomplete ? null : g.received.minus(g.expenses).toFixed(), incomplete: g.incomplete, rows: g.rows })) };
}
