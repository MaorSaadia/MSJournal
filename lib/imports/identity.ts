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
      const disposition = !old.length
        ? "new"
        : multiset(old.map(oldSignature)) ===
            multiset(rows.map(incomingSignature))
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
          const match = matches.get(incomingSignature(row))!.shift()!;
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
}
