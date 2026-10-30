import {
  D,
  direction,
  feeTotal,
  portionExit,
  sum,
  type Portion,
  type PortionFee,
} from "./processing";

/** Presentation groups supported exit fills, never reconstructs open positions. */
export function exitBreakdown(
  parts: Portion[],
  fees: Record<string, PortionFee>,
) {
  const grouped = new Map<string, Portion[]>();
  for (const p of parts) {
    const side = direction(p);
    const price =
      side === "long" ? p.sellPrice : side === "short" ? p.buyPrice : null;
    const fill =
      side === "long" ? p.sellFillId : side === "short" ? p.buyFillId : p.id;
    const key = JSON.stringify([
      side,
      fill,
      portionExit(p),
      price === null ? null : new D(price).toFixed(),
    ]);
    const rows = grouped.get(key) ?? [];
    rows.push(p);
    grouped.set(key, rows);
  }
  const totalQuantity = sum(parts.map((p) => p.quantity));
  const exits = [...grouped.entries()]
    .map(([id, rows]) => {
      const first = rows[0],
        side = direction(first);
      const quantity = sum(rows.map((p) => p.quantity));
      const gross = sum(rows.map((p) => p.grossPnl));
      const fee = feeTotal(
        rows.map((p) => fees[p.id] ?? { amount: null, kind: "Unknown" }),
      );
      return {
        id,
        at: portionExit(first),
        side,
        quantity,
        gross,
        fees: fee.amount,
        feeKind: fee.kind,
        net:
          fee.amount === null ? null : new D(gross).minus(fee.amount).toFixed(),
        price:
          side === "long"
            ? first.sellPrice
            : side === "short"
              ? first.buyPrice
              : null,
        share: new D(totalQuantity).gt(0)
          ? new D(quantity).div(totalQuantity).times(100).toNumber()
          : 0,
        sourceCount: rows.length,
      };
    })
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  return { totalQuantity, exits };
}
