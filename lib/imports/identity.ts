import type { ParsedFile, StoredIdentity } from "./types";
// No export field proves order snapshot precedence. Changed orders are blocked.
// Performance identity is the fill-ID pair + complete multiset of portions.
// Equal-looking portions with different IDs, and repeated portions, remain intact.
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
      const multiset = (items: { fingerprint: string }[]) =>
        items
          .map((r) => r.fingerprint)
          .sort()
          .join("|");
      const disposition = !old.length
        ? "new"
        : multiset(old) === multiset(rows)
          ? "duplicate"
          : "conflict";
      rows.forEach((r) => {
        r.disposition = disposition;
      });
    }
    if (rows.some((r) => r.disposition === "conflict"))
      file.errors.push({
        row: rows[0].row,
        column: file.type === "orders" ? "orderId" : "buyFillId / sellFillId",
        message:
          file.type === "orders"
            ? "Existing order has changed source values. Version precedence cannot be established; this batch is blocked for review."
            : "Overlapping fill-ID pair has different values or multiplicity. Its matched portions cannot be deduplicated safely; this batch is blocked.",
      });
  }
}
