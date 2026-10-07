import Papa from "papaparse";
import { HEADERS } from "../../lib/imports/parser";
import type { ReportType } from "../../lib/imports/types";
export function order(overrides: Record<string, string> = {}) {
  return {
    ...Object.fromEntries(HEADERS.orders.map((h) => [h, ""])),
    orderId: "9007199254740993101",
    "Order ID": "9007199254740993101",
    Account: "SYNTHETIC-ACCOUNT",
    "B/S": " Sell",
    Contract: "MNQU6",
    Product: "MNQ",
    "Product Description": "Synthetic micro future",
    avgPrice: "20000.25",
    filledQty: "2",
    "Fill Time": "09/02/2026 16:52:15",
    lastCommandId: "9007199254740993201",
    Status: " Filled",
    _priceFormat: "-2",
    _priceFormatType: "0",
    _tickSize: "0.25",
    "Version ID": "9007199254740993301",
    Timestamp: "09/02/2026 16:52:15",
    Date: "9/2/26",
    Quantity: "2",
    Text: "Synthetic, quoted text",
    Type: " Market",
    "Filled Qty": "2",
    "Avg Fill Price": "20000.25",
    decimalFillAvg: "20000.25",
    "Notional Value": "80,001.00",
    Currency: "USD",
    ...overrides,
  };
}
export function performance(overrides: Record<string, string> = {}) {
  return {
    symbol: "MNQU6",
    _priceFormat: "-2",
    _priceFormatType: "0",
    _tickSize: "0.25",
    buyFillId: "9007199254740993401",
    sellFillId: "9007199254740993402",
    qty: "2",
    buyPrice: "20011.50",
    sellPrice: "20000.25",
    pnl: "$(45.00)",
    boughtTimestamp: "09/02/2026 16:52:32",
    soldTimestamp: "09/02/2026 16:52:15",
    duration: "16sec",
    ...overrides,
  };
}
export function csv(type: ReportType, rows: Record<string, string>[]) {
  return (
    "\uFEFF" +
    Papa.unparse({
      fields: [...HEADERS[type]],
      data: rows.map((r) => HEADERS[type].map((h) => r[h] ?? "")),
    }) +
    "\r\n\r\n"
  );
}
