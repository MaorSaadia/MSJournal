import Decimal from "decimal.js";
import type { PerformanceValues, ParsedFile, StoredIdentity } from "./types";
// No export field proves order snapshot precedence. Changed orders are blocked.
// Performance identity is the fill-ID pair + complete multiset of normalized
// financial portions. Original raw fingerprints remain immutable for provenance.
// Equal-looking portions with different IDs, and repeated portions, remain intact.
const financialFields = [
  "symbol",
  "quantity",
  "buyPrice",
  "sellPrice",
  "grossPnl",
  "boughtAt",
  "soldAt",
] as const;
const labels = {
  symbol: "contract",
  quantity: "quantity",
  buyPrice: "buy price",
  sellPrice: "sell price",
  grossPnl: "gross P&L",
  boughtAt: "buy time (UTC)",
  soldAt: "sell time (UTC)",
};
function normalized(v: PerformanceValues) {
  return {
    symbol: v.symbol.trim(),
    quantity: new Decimal(v.quantity).toFixed(),
    buyPrice: new Decimal(v.buyPrice).toFixed(),
    sellPrice: new Decimal(v.sellPrice).toFixed(),
    grossPnl: new Decimal(v.grossPnl).toFixed(),
    boughtAt: new Date(v.boughtAt).toISOString(),
    soldAt: new Date(v.soldAt).toISOString(),
  };
}
function signature(values: PerformanceValues) {
  return JSON.stringify(normalized(values));
}
// Existing saved copies win when only a uniform timezone-sized offset differs.
// Keep exact quantity/price/P&L, multiplicity, direction and elapsed time checks.
function savedTimeMatches(old: StoredIdentity[], rows: ParsedFile["rows"]) {
  if (!old.length || old.length !== rows.length || !old.every((r) => r.values))
    return null;
  const withoutTimes = (v: PerformanceValues) => {
    const n = normalized(v);
    return JSON.stringify([
      n.symbol,
      n.quantity,
      n.buyPrice,
      n.sellPrice,
      n.grossPnl,
      Date.parse(n.soldAt) - Date.parse(n.boughtAt),
    ]);
  };
  const sortedOld = [...old].sort(
    (a, b) =>
      withoutTimes(a.values!).localeCompare(withoutTimes(b.values!)) ||
      a.values!.boughtAt.localeCompare(b.values!.boughtAt),
  );
  const sortedNew = [...rows].sort(
    (a, b) =>
      withoutTimes(a.values as PerformanceValues).localeCompare(
        withoutTimes(b.values as PerformanceValues),
      ) ||
      (a.values as PerformanceValues).boughtAt.localeCompare(
        (b.values as PerformanceValues).boughtAt,
      ),
  );
  const matches = new Map<ParsedFile["rows"][number], StoredIdentity>();
  let shift: number | null = null;
  for (let i = 0; i < sortedOld.length; i++) {
    const stored = sortedOld[i],
      incoming = sortedNew[i];
    const a = stored.values!,
      b = incoming.values as PerformanceValues;
    if (withoutTimes(a) !== withoutTimes(b)) return null;
    const delta = Date.parse(b.boughtAt) - Date.parse(a.boughtAt);
    if (
      delta !== Date.parse(b.soldAt) - Date.parse(a.soldAt) ||
      Math.abs(delta) > 26 * 3600000 ||
      delta % 900000 !== 0 ||
      (shift !== null && delta !== shift)
    )
      return null;
    shift = delta;
    matches.set(incoming, stored);
  }
  return matches;
}

function conflictMessage(old: StoredIdentity[], rows: ParsedFile["rows"]) {
  const prefix = "These fill IDs already exist in this account. ";
  if (old.length !== rows.length)
    return `${prefix}Stored portions: ${old.length}; uploaded portions: ${rows.length}. Export the complete matching period; partial or regrouped fill pairs cannot be safely merged.`;
  if (!old.every((r) => r.values))
    return `${prefix}Source values differ. This batch is blocked to prevent double counting.`;
  const previous = old.map((r) => normalized(r.values!));
  const incoming = rows.map((r) => normalized(r.values as PerformanceValues));
  const changed = financialFields.filter(
    (field) =>
      JSON.stringify(previous.map((v) => v[field]).sort()) !==
      JSON.stringify(incoming.map((v) => v[field]).sort()),
  );
  const detail =
    old.length === 1
      ? changed
          .map(
            (field) =>
              `${labels[field]}: saved ${previous[0][field]}, uploaded ${incoming[0][field]}`,
          )
          .join("; ")
      : changed.map((field) => labels[field]).join(", ");
  return `${prefix}${detail ? `Different ${detail}.` : "The matched portions differ as a set."} Check the selected account and CSV source timezone. Existing trades have not been changed; this batch is blocked.`;
}

export function classify(file: ParsedFile, existing: StoredIdentity[]) {
  let keptTimes = 0;
  const stored = new Map<string, StoredIdentity[]>();
  for (const row of existing)
    stored.set(row.identity, [...(stored.get(row.identity) ?? []), row]);
  const incoming = new Map<string, typeof file.rows>();
  for (const row of file.rows)
    incoming.set(row.identity, [...(incoming.get(row.identity) ?? []), row]);
  for (const [identity, rows] of incoming) {
    const old = stored.get(identity) ?? [];
    if (file.type === "orders") {
      const signatures = new Set([...old, ...rows].map((r) => r.fingerprint));
      const conflict = signatures.size > 1;
      rows.forEach((r, i) => {
        r.disposition = conflict
          ? "conflict"
          : old.length || i > 0
            ? "duplicate"
            : "new";
        // Duplicate order rows always refer to the same immutable source record.
        r.occurrence = 1;
      });
    } else {
      const hasValues = old.every((row) => row.values !== undefined);
      const oldSignature = (row: StoredIdentity) =>
        hasValues ? signature(row.values!) : row.fingerprint;
      const incomingSignature = (row: ParsedFile["rows"][number]) =>
        hasValues
          ? signature(row.values as PerformanceValues)
          : row.fingerprint;
      const multiset = (items: string[]) => items.sort().join("|");
      const exact =
        multiset(old.map(oldSignature)) ===
        multiset(rows.map(incomingSignature));
      const timeMatches =
        !exact && hasValues ? savedTimeMatches(old, rows) : null;
      if (timeMatches) keptTimes += rows.length;
      const disposition = !old.length
        ? "new"
        : exact || timeMatches !== null
          ? "duplicate"
          : "conflict";
      const matches = new Map<string, StoredIdentity[]>();
      for (const row of old)
        matches.set(oldSignature(row), [
          ...(matches.get(oldSignature(row)) ?? []),
          row,
        ]);
      for (const row of rows) {
        row.disposition = disposition;
        delete row.matchedSource;
        if (disposition === "duplicate") {
          const match =
            timeMatches?.get(row) ??
            matches.get(incomingSignature(row))!.shift()!;
          row.matchedSource = {
            fingerprint: match.fingerprint,
            occurrence: match.occurrence,
          };
        }
      }
    }
    if (rows.some((r) => r.disposition === "conflict"))
      file.errors.push({
        row: rows[0].row,
        column: file.type === "orders" ? "orderId" : "buyFillId / sellFillId",
        message:
          file.type === "orders"
            ? "Existing order has changed source values. Version precedence cannot be established; this batch is blocked for review."
            : conflictMessage(old, rows),
      });
  }
  if (keptTimes)
    file.warnings.push({
      row: 0,
      column: "Existing trade times",
      message: `${keptTimes} existing portions have different export times but matching fill IDs and financial values. The saved trades and their times will be kept; these uploaded copies will be skipped. Only new trades will be added. Check the CSV source timezone for new trades before confirming.`,
    });
}
