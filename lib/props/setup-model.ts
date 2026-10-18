import {
  D,
  sum,
  portionExit,
  type Portion,
  type PortionFee,
} from "@/lib/journal/processing";
import { localDay } from "@/lib/journal/calculations";
export function activitySummary(
  parts: Portion[],
  fees: Record<string, PortionFee>,
  timezone: string,
) {
  const unknown = parts.some((p) => fees[p.id]?.amount == null);
  const estimated = parts.some((p) => fees[p.id]?.kind === "Estimated");
  const gross = sum(parts.map((p) => p.grossPnl));
  const net = unknown
    ? null
    : sum(
        parts.map((p) => new D(p.grossPnl).minus(fees[p.id].amount!).toFixed()),
      );
  const days = new Map<string, string[]>();
  for (const p of parts) {
    const date = localDay(portionExit(p), timezone);
    days.set(date, [
      ...(days.get(date) ?? []),
      unknown
        ? p.grossPnl
        : new D(p.grossPnl).minus(fees[p.id].amount!).toFixed(),
    ]);
  }
  const totals = [...days.values()].map(sum);
  return {
    count: parts.length,
    gross,
    net,
    estimated,
    basis: unknown ? "gross" : estimated ? "estimated net" : "net",
    best: totals.length ? D.max(...totals).toFixed() : null,
    worst: totals.length ? D.min(...totals).toFixed() : null,
    firstEntry:
      parts
        .map((p) => (p.boughtAt < p.soldAt ? p.boughtAt : p.soldAt))
        .sort()[0] ?? null,
    firstExit: parts.map(portionExit).sort()[0] ?? null,
    lastExit: parts.map(portionExit).sort().at(-1) ?? null,
  };
}
export const firmTiles = [
  { id: "Apex", name: "Apex Trader Funding", initials: "AP" },
  { id: "MyFundedFutures", name: "MyFundedFutures", initials: "MF" },
  { id: "Lucid", name: "Lucid Trading", initials: "LU" },
  { id: "Take Profit Trader", name: "Take Profit Trader", initials: "TP" },
  { id: "Topstep", name: "Topstep", initials: "TS" },
  { id: "FundedNext Futures", name: "FundedNext Futures", initials: "FN" },
  { id: "Custom", name: "Other / Custom", initials: "+" },
] as const;
export function firmKey(name: string | null) {
  return (
    firmTiles.find((f) => f.name === name || f.id === name)?.id ?? "Custom"
  );
}
