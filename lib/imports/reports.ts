import Papa from "papaparse";
import type { ReportType } from "./types";
export const HEADERS = {
  orders: [
    "orderId",
    "Account",
    "Order ID",
    "B/S",
    "Contract",
    "Product",
    "Product Description",
    "avgPrice",
    "filledQty",
    "Fill Time",
    "lastCommandId",
    "Status",
    "_priceFormat",
    "_priceFormatType",
    "_tickSize",
    "spreadDefinitionId",
    "Version ID",
    "Timestamp",
    "Date",
    "Quantity",
    "Text",
    "Type",
    "Limit Price",
    "Stop Price",
    "decimalLimit",
    "decimalStop",
    "Filled Qty",
    "Avg Fill Price",
    "decimalFillAvg",
    "Venue",
    "Notional Value",
    "Currency",
  ],
  performance: [
    "symbol",
    "_priceFormat",
    "_priceFormatType",
    "_tickSize",
    "buyFillId",
    "sellFillId",
    "qty",
    "buyPrice",
    "sellPrice",
    "pnl",
    "boughtTimestamp",
    "soldTimestamp",
    "duration",
  ],
} as const;
export function detectReportHeaders(headers: string[]): ReportType | null {
  if (new Set(headers).size !== headers.length) return null;
  return HEADERS.orders.every((h) => headers.includes(h))
    ? "orders"
    : HEADERS.performance.every((h) => headers.includes(h))
      ? "performance"
      : null;
}
export function reportTypeError(
  expected: ReportType,
  detected: ReportType | null,
) {
  if (detected === expected) return null;
  if (expected === "performance" && detected === "orders")
    return "This is a Tradovate Orders report. Select your Performance CSV, or use Advanced Orders import.";
  return detected
    ? "This is a Tradovate Performance report. Select it in the main Performance uploader."
    : `Unrecognized CSV. Expected a Tradovate ${expected === "performance" ? "Performance" : "Orders"} report with its original export headers.`;
}
export function inspectReportType(text: string, expected: ReportType) {
  const result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), {
    delimiter: ",",
    preview: 1,
    dynamicTyping: false,
  });
  return reportTypeError(
    expected,
    result.errors.length ? null : detectReportHeaders(result.data[0] ?? []),
  );
}
