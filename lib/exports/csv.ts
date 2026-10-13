import type { ViewQuery, ViewRecord } from "@/lib/journal/view-model";

export const CSV_LIMIT = 20000;
export function csvCell(value: string | null | undefined, numeric = false) {
  if (value == null) return '""';
  // Only financial columns may contain unprefixed signed decimal values.
  const safeNumber = numeric && /^-?\d+(?:\.\d+)?$/.test(value);
  const text =
    !safeNumber && /^[\s\uFEFF]*[=+@\-\t\r\n]/.test(value)
      ? `'${value}`
      : value;
  return `"${text.replaceAll('"', '""')}"`;
}
export type ExportRecord = ViewRecord & {
  fullFees?: string | null;
  fullNet?: string | null;
  fullQuantity?: string;
  currency?: string;
};
const headers = [
  "record_id",
  "record_type",
  "grouping_status",
  "account_id",
  "account_name",
  "exact_contract",
  "direction",
  "entry_utc",
  "exit_utc",
  "display_timezone",
  "entry_local",
  "exit_local",
  "selected_closed_quantity",
  "full_record_closed_quantity",
  "entry_price",
  "exit_price",
  "selected_gross_pnl",
  "selected_fees",
  "selected_fee_source",
  "selected_net_pnl",
  "full_record_gross_pnl",
  "full_record_fees",
  "full_record_net_pnl",
  "currency",
  "strategy_name",
  "review_status",
  "pnl_basis",
  "date_basis",
  "statistics_basis",
  "financial_scope",
  "partial_record",
  "filter_start",
  "filter_end",
];
function local(instant: string | null, timezone: string) {
  if (!instant) return null;
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset",
  }).format(new Date(instant));
}
export function csvHeader() {
  return headers.map((h) => csvCell(h)).join(",") + "\r\n";
}
export function csvRow(row: ExportRecord, q: ViewQuery, timezone: string) {
  const values: (string | null | undefined)[] = [
    row.id,
    row.type,
    row.status,
    row.accountId,
    row.account,
    row.symbol,
    row.direction === "unknown" ? null : row.direction,
    row.entry ? new Date(row.entry).toISOString() : null,
    new Date(row.exit).toISOString(),
    timezone,
    local(row.entry, timezone),
    local(row.exit, timezone),
    row.quantity,
    row.fullQuantity ?? row.quantity,
    row.entryPrice,
    row.exitPrice,
    row.gross,
    row.fees,
    row.feeKind,
    row.net,
    row.fullGross,
    row.fullFees === undefined && !row.partial ? row.fees : row.fullFees,
    row.fullNet === undefined && !row.partial ? row.net : row.fullNet,
    row.currency ?? "USD",
    row.strategyName,
    row.reviewStatus ?? "unreviewed",
    q.basis,
    q.dateBasis,
    q.outcomeBasis,
    q.dateBasis === "activity"
      ? "selected realized activity"
      : "records closed in range",
    String(row.partial),
    q.start,
    q.end,
  ];
  return (
    values
      .map((v, index) =>
        csvCell(v, [12, 13, 14, 15, 16, 17, 19, 20, 21, 22].includes(index)),
      )
      .join(",") + "\r\n"
  );
}
