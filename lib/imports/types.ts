export type ReportType = "orders" | "performance";
export const PARSER_VERSION = "tradovate-1.1";
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 10000;
export type Diagnostic = { row: number; column: string; message: string };
export type OrderValues = {
  orderId: string;
  versionId: string;
  commandId: string;
  brokerAccount: string;
  symbol: string;
  product: string;
  side: "Buy" | "Sell";
  status: string;
  orderType: string;
  quantity: string;
  filledQuantity: string | null;
  averagePrice: string | null;
  limitPrice: string | null;
  stopPrice: string | null;
  notionalValue: string | null;
  currency: string;
  timestamp: string;
  fillTime: string | null;
};
export type PerformanceValues = {
  buyFillId: string;
  sellFillId: string;
  symbol: string;
  quantity: string;
  buyPrice: string;
  sellPrice: string;
  grossPnl: string;
  boughtAt: string;
  soldAt: string;
  duration: string;
};
export type SourceRow = {
  row: number;
  identity: string;
  fingerprint: string;
  occurrence: number;
  raw: Record<string, string>;
  values: OrderValues | PerformanceValues;
  disposition: "new" | "duplicate" | "conflict";
};
export type ParsedFile = {
  type: ReportType;
  name: string;
  hash: string;
  bytes: number;
  total: number;
  rows: SourceRow[];
  errors: Diagnostic[];
  warnings: Diagnostic[];
  start: string | null;
  end: string | null;
};
export type ImportOptions = {
  accountId: string;
  timezone: string;
  confirmOrders: boolean;
  confirmPerformance: boolean;
};
export type Counts = {
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  conflicts: number;
  new: number;
};
export type Preview = {
  files: ParsedFile[];
  counts: Counts;
  canConfirm: boolean;
  token: string | null;
};
export type StoredIdentity = {
  identity: string;
  fingerprint: string;
  occurrence: number;
};
export function counts(files: ParsedFile[]): Counts {
  const rows = files.flatMap((f) => f.rows);
  return {
    total: files.reduce((n, f) => n + f.total, 0),
    valid: rows.length,
    invalid: files.reduce((n, f) => n + f.total - f.rows.length, 0),
    duplicates: rows.filter((r) => r.disposition === "duplicate").length,
    conflicts: rows.filter((r) => r.disposition === "conflict").length,
    new: rows.filter((r) => r.disposition === "new").length,
  };
}
