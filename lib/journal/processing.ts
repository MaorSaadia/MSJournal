import Decimal from "decimal.js";

// Enough headroom for exact sums of PostgreSQL source numerics; no JS money arithmetic.
export const D = Decimal.clone({ precision: 80 });
export const PROCESSING_VERSION = "performance-1.0";
export type Portion = {
  id: string;
  ownerId: string;
  tradingAccountId: string;
  symbol: string;
  buyFillId: string;
  sellFillId: string;
  quantity: string;
  buyPrice: string;
  sellPrice: string;
  grossPnl: string;
  boughtAt: string;
  soldAt: string;
};
export type PortionFee = {
  amount: string | null;
  kind: "Unknown" | "Estimated" | "Manual";
  perSide?: string | null;
  settingRevision?: string | null;
};
export type Group = {
  sourceIds: string[];
  symbol: string;
  direction: "long" | "short" | "unknown";
  status: "Matched portions" | "Needs review";
  explanation: string;
  entryAt: string | null;
  exitAt: string;
  closedQuantity: string;
  entryPrice: string | null;
  exitPrice: string | null;
  grossPnl: string;
};
export function direction(p: Portion): Group["direction"] {
  const buy = new Date(p.boughtAt).getTime(),
    sell = new Date(p.soldAt).getTime();
  return buy < sell ? "long" : buy > sell ? "short" : "unknown";
}
export function portionExit(p: Portion) {
  return new Date(
    Math.max(new Date(p.boughtAt).getTime(), new Date(p.soldAt).getTime()),
  ).toISOString();
}
export function portionEntry(p: Portion) {
  return direction(p) === "unknown"
    ? null
    : new Date(
        Math.min(new Date(p.boughtAt).getTime(), new Date(p.soldAt).getTime()),
      ).toISOString();
}
export function sum(values: string[]) {
  return values.reduce((n, v) => n.plus(v), new D(0)).toFixed();
}

/** A connected fill graph proves shared matching, NOT an account flat-to-flat position.
 * Quantity is the sum of matched quantities. Fill IDs are not assumed numerically ordered.
 * Time proximity, dates, prices and month boundaries never create edges.
 */
export function processPortions(input: Portion[]): Group[] {
  const rows = [...input].sort((a, b) => a.id.localeCompare(b.id));
  const parents = rows.map((_, i) => i);
  const root = (i: number): number => {
    let r = i;
    while (parents[r] !== r) r = parents[r];
    while (parents[i] !== i) {
      const next = parents[i];
      parents[i] = r;
      i = next;
    }
    return r;
  };
  const fills = new Map<string, number>();
  const events = new Map<string, Set<string>>();
  const uncertain = new Set<string>();
  rows.forEach((p, i) => {
    for (const [side, id, time, price] of [
      ["buy", p.buyFillId, p.boughtAt, p.buyPrice],
      ["sell", p.sellFillId, p.soldAt, p.sellPrice],
    ]) {
      const scoped = JSON.stringify([
        p.ownerId,
        p.tradingAccountId,
        p.symbol,
        id,
      ]);
      const prior = fills.get(scoped);
      if (prior !== undefined) parents[root(i)] = root(prior);
      else fills.set(scoped, i);
      const eventKey = JSON.stringify([p.ownerId, p.tradingAccountId, id]);
      const descriptions = events.get(eventKey) ?? new Set<string>();
      descriptions.add(
        JSON.stringify([
          p.symbol,
          side,
          new Date(time).toISOString(),
          new D(price).toFixed(),
        ]),
      );
      events.set(eventKey, descriptions);
    }
  });
  rows.forEach((p) => {
    if (
      [p.buyFillId, p.sellFillId].some(
        (id) =>
          (events.get(JSON.stringify([p.ownerId, p.tradingAccountId, id]))
            ?.size ?? 0) > 1,
      )
    )
      uncertain.add(p.id);
  });
  const groups = new Map<number, Portion[]>();
  rows.forEach((p, i) => {
    const r = root(i);
    groups.set(r, [...(groups.get(r) ?? []), p]);
  });
  return [...groups.values()].map((parts) => {
    const directions = new Set(parts.map(direction));
    const known =
      directions.size === 1 &&
      !directions.has("unknown") &&
      !parts.some((p) => uncertain.has(p.id));
    const side = known ? direction(parts[0]) : "unknown";
    const qty = sum(parts.map((p) => p.quantity));
    const weighted = (entry: boolean) =>
      known
        ? parts
            .reduce(
              (n, p) =>
                n.plus(
                  new D(p.quantity).times(
                    (side === "long") === entry ? p.buyPrice : p.sellPrice,
                  ),
                ),
              new D(0),
            )
            .div(qty)
            .toFixed(16)
        : null;
    const entryTimes = parts
      .map(portionEntry)
      .filter((v): v is string => v !== null)
      .sort();
    return {
      sourceIds: parts.map((p) => p.id),
      symbol: parts[0].symbol,
      direction: side,
      status: known ? "Matched portions" : "Needs review",
      explanation: known
        ? `${parts.length} matched portion${parts.length === 1 ? "" : "s"}${parts.length > 1 ? " connected by shared fill identifiers" : ""}. Chronology supports ${side} direction. Open portions may be absent: these records do not prove a complete flat-to-flat position or its maximum size.`
        : "Direction/grouping needs review: equal timestamps, inconsistent fill metadata, or mixed chronology do not establish event ordering. Reported gross P&L is retained. Complete position history and maximum size are unknown.",
      entryAt: known ? entryTimes[0] : null,
      exitAt: parts.map(portionExit).sort().at(-1)!,
      closedQuantity: qty,
      entryPrice: weighted(true),
      exitPrice: weighted(false),
      grossPnl: sum(parts.map((p) => p.grossPnl)),
    };
  });
}
export function feeTotal(fees: PortionFee[]) {
  const known = fees.filter((f) => f.amount !== null);
  const kinds = new Set(known.map((f) => f.kind));
  return {
    amount:
      known.length === fees.length ? sum(known.map((f) => f.amount!)) : null,
    kind:
      known.length !== fees.length
        ? ("Unknown" as const)
        : kinds.size > 1
          ? ("Mixed" as const)
          : (kinds.values().next().value ?? ("Unknown" as const)),
    covered: known.length,
  };
}
export function estimateFee(quantity: string, rate: string | null): PortionFee {
  return rate === null
    ? { amount: null, kind: "Unknown", perSide: null }
    : {
        amount: new D(quantity).times(2).times(rate).toFixed(),
        kind: "Estimated",
        perSide: rate,
      };
}
// Allocate a manual GROUP total once. Final residual makes the persisted sum exact.
// These source-level allocations survive later merge/split processing unchanged.
export function allocateManual(
  total: string,
  parts: Pick<Portion, "id" | "quantity">[],
) {
  const sorted = [...parts].sort((a, b) => a.id.localeCompare(b.id));
  const quantity = sum(sorted.map((p) => p.quantity));
  let remaining = new D(total);
  return sorted.map((p, i) => {
    // Truncate positive allocations so the residual can never become negative.
    const amount =
      i === sorted.length - 1
        ? remaining
        : new D(total)
            .times(p.quantity)
            .div(quantity)
            .toDecimalPlaces(8, D.ROUND_DOWN);
    remaining = remaining.minus(amount);
    return {
      sourceId: p.id,
      amount: amount.toFixed(),
      kind: "Manual" as const,
    };
  });
}
