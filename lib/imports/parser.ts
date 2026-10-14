import Papa from "papaparse";
import Decimal from "decimal.js";
import { createHash } from "node:crypto";
import { z } from "zod";
import { parseSourceTime, sourceTimezone } from "./time";
import {
  MAX_FILE_BYTES,
  MAX_ROWS,
  type ParsedFile,
  type ReportType,
  type SourceRow,
  type OrderValues,
  type PerformanceValues,
} from "./types";
import { HEADERS, detectReportHeaders, reportTypeError } from "./reports";
export { HEADERS } from "./reports";

export function hash(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}
export function exactDecimal(
  value: string,
  optional = false,
  money = false,
): string | null {
  let text = value.trim();
  if (!text && optional) return null;
  if (money) {
    if (/^\$\(.+\)$/.test(text)) text = "-" + text.slice(2, -1);
    else text = text.replace(/^\$/, "");
  }
  if (!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,8})?$/.test(text))
    throw new Error(
      "Expected an exact decimal with at most 8 fractional digits (US comma grouping).",
    );
  const decimal = new Decimal(text.replaceAll(",", ""));
  if (decimal.abs().gte("100000000000000000000"))
    throw new Error("Value exceeds the supported 20-digit integer range.");
  return decimal.toFixed();
}
class ColumnError extends Error {
  constructor(
    public column: string,
    message: string,
  ) {
    super(message);
  }
}
function normalize(
  raw: Record<string, string>,
  type: ReportType,
  timezone: string,
): OrderValues | PerformanceValues {
  const read = (column: string) => raw[column]?.trim() ?? "";
  function checked<T>(column: string, fn: () => T): T {
    try {
      return fn();
    } catch (e) {
      throw new ColumnError(
        column,
        e instanceof z.ZodError
          ? (e.issues[0]?.message ?? "Invalid value.")
          : e instanceof Error
            ? e.message
            : "Invalid value.",
      );
    }
  }
  const required = (column: string) =>
    checked(column, () =>
      z
        .string()
        .min(1, "Required source value is missing.")
        .max(250, "Source value is too long.")
        .parse(read(column)),
    );
  const decimal = (column: string, optional = false, money = false) =>
    checked(column, () => exactDecimal(read(column), optional, money));
  const positive = (column: string) =>
    checked(column, () => {
      const n = decimal(column)!;
      if (!new Decimal(n).isInteger() || new Decimal(n).lte(0))
        throw new Error("Quantity must be a positive whole number.");
      return n;
    });
  const time = (column: string, optional = false) =>
    checked(column, () =>
      optional && !read(column)
        ? null
        : parseSourceTime(read(column), timezone),
    );
  const equal = (a: string, b: string) => {
    if (decimal(a, true) !== decimal(b, true))
      throw new ColumnError(b, `Value disagrees with ${a}.`);
  };
  checked("_priceFormat", () =>
    z
      .string()
      .regex(/^-?\d+$/, "Expected an integer price format.")
      .parse(read("_priceFormat")),
  );
  checked("_priceFormatType", () =>
    z
      .string()
      .regex(/^\d+$/, "Expected an integer price format type.")
      .parse(read("_priceFormatType")),
  );
  const tick = decimal("_tickSize")!;
  if (new Decimal(tick).lte(0))
    throw new ColumnError("_tickSize", "Tick size must be positive.");
  if (type === "orders") {
    const orderId = required("orderId");
    if (orderId !== required("Order ID"))
      throw new ColumnError("Order ID", "Order identifiers disagree.");
    const status = checked("Status", () =>
      z
        .enum([
          "Filled",
          "Canceled",
          "Working",
          "Rejected",
          "Expired",
          "Pending",
          "Suspended",
          "Partially Filled",
        ])
        .parse(read("Status")),
    );
    const quantity = positive("Quantity"),
      filledQuantity = decimal("filledQty", true);
    equal("filledQty", "Filled Qty");
    equal("avgPrice", "decimalFillAvg");
    equal("avgPrice", "Avg Fill Price");
    equal("Limit Price", "decimalLimit");
    equal("Stop Price", "decimalStop");
    if (
      filledQuantity &&
      (!new Decimal(filledQuantity).isInteger() ||
        new Decimal(filledQuantity).lt(0) ||
        new Decimal(filledQuantity).gt(quantity))
    )
      throw new ColumnError(
        "filledQty",
        "Filled quantity must be a whole number between zero and order quantity.",
      );
    const averagePrice = decimal("avgPrice", true),
      fillTime = time("Fill Time", true);
    if (
      filledQuantity &&
      new Decimal(filledQuantity).gt(0) &&
      (!averagePrice || !fillTime)
    )
      throw new ColumnError(
        "Fill Time",
        "A nonzero aggregate fill requires its average price and fill time.",
      );
    if (
      status === "Filled" &&
      (!filledQuantity || new Decimal(filledQuantity).lte(0))
    )
      throw new ColumnError(
        "filledQty",
        "A filled order requires a positive filled quantity.",
      );
    const timestamp = time("Timestamp")!;
    const short = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(read("Date"));
    const stamp = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(read("Timestamp"))!;
    const isoStamp = /^(\d{4})-(\d{2})-(\d{2})/.exec(read("Timestamp"));
    const stampMonth = stamp?.[1] ?? isoStamp![2],
      stampDay = stamp?.[2] ?? isoStamp![3],
      stampYear = stamp?.[3] ?? isoStamp![1];
    if (
      !short ||
      Number(short[1]) !== Number(stampMonth) ||
      Number(short[2]) !== Number(stampDay) ||
      Number(short[3]) + 2000 !== Number(stampYear)
    )
      throw new ColumnError(
        "Date",
        "Expected M/D/YY matching the Timestamp date.",
      );
    return {
      orderId,
      versionId: required("Version ID"),
      commandId: required("lastCommandId"),
      brokerAccount: required("Account"),
      symbol: required("Contract"),
      product: required("Product"),
      side: checked("B/S", () => z.enum(["Buy", "Sell"]).parse(read("B/S"))),
      status,
      orderType: required("Type"),
      quantity,
      filledQuantity,
      averagePrice,
      fillTime,
      timestamp,
      limitPrice: decimal("Limit Price", true),
      stopPrice: decimal("Stop Price", true),
      notionalValue: decimal("Notional Value", true),
      currency: checked("Currency", () =>
        z.literal("USD").parse(read("Currency")),
      ),
    };
  }
  // This is reported text, not an input to financial calculations or intervals.
  // Tradovate exports can omit it or use a different display format.
  const duration = checked("duration", () =>
    z.string().max(250, "Source value is too long.").parse(read("duration")),
  );
  return {
    buyFillId: required("buyFillId"),
    sellFillId: required("sellFillId"),
    symbol: required("symbol"),
    quantity: positive("qty"),
    buyPrice: decimal("buyPrice")!,
    sellPrice: decimal("sellPrice")!,
    grossPnl: decimal("pnl", false, true)!,
    boughtAt: time("boughtTimestamp")!,
    soldAt: time("soldTimestamp")!,
    duration,
  };
}
export function parseReport(
  bytes: Uint8Array,
  name: string,
  expected: ReportType,
  timezone: string,
): ParsedFile {
  sourceTimezone.parse(timezone);
  const file: ParsedFile = {
    type: expected,
    name: name.slice(0, 255),
    hash: hash(bytes),
    bytes: bytes.length,
    total: 0,
    rows: [],
    errors: [],
    warnings: [],
    start: null,
    end: null,
  };
  if (!bytes.length || bytes.length > MAX_FILE_BYTES) {
    file.errors.push({
      row: 0,
      column: "file",
      message: "Select a nonempty CSV of at most 5 MiB.",
    });
    return file;
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true })
      .decode(bytes)
      .replace(/^\uFEFF/, "");
  } catch {
    file.errors.push({
      row: 0,
      column: "file",
      message: "CSV must use UTF-8 encoding.",
    });
    return file;
  }
  // Array mode avoids automatic duplicate-header renaming and keeps source record numbers.
  const records: string[][] = [];
  const csvErrors: Papa.ParseError[] = [];
  let sourceRow = 0,
    pendingEmpty = 0,
    exceeded = false;
  Papa.parse<string[]>(text, {
    delimiter: ",",
    dynamicTyping: false,
    skipEmptyLines: false,
    step(result, parser) {
      sourceRow++;
      // Keep trailing empty records out of the limit without accumulating them.
      if (
        sourceRow > 1 &&
        result.data.every((v) => !v.trim()) &&
        !result.errors.length
      ) {
        pendingEmpty++;
        return;
      }
      if (records.length && records.length - 1 + pendingEmpty >= MAX_ROWS) {
        exceeded = true;
        parser.abort();
        return;
      }
      while (pendingEmpty > 0) {
        records.push([""]);
        pendingEmpty--;
      }
      records.push(result.data);
      csvErrors.push(
        ...result.errors.map((e) => ({ ...e, row: sourceRow - 1 })),
      );
    },
  });
  const result = { data: records, errors: csvErrors };
  const headers = result.data[0] ?? [];
  if (new Set(headers).size !== headers.length)
    file.errors.push({
      row: 1,
      column: "headers",
      message: "Duplicate column headers are not supported.",
    });
  const detected = detectReportHeaders(headers);
  if (detected !== expected)
    file.errors.push({
      row: 1,
      column: "headers",
      message: detected
        ? reportTypeError(expected, detected)!
        : `Missing required ${expected} headers: ${HEADERS[expected].filter((h) => !headers.includes(h)).join(", ")}`,
    });
  if (file.errors.length) return file;
  if (headers.some((h) => !([...HEADERS[expected]] as string[]).includes(h)))
    file.warnings.push({
      row: 1,
      column: "headers",
      message:
        "Additional columns are preserved as raw values but are not normalized.",
    });
  const data = result.data.slice(1);
  while (data.length && data.at(-1)!.every((v) => !v.trim())) data.pop();
  file.total = exceeded ? sourceRow - 1 : data.length;
  if (exceeded) {
    file.errors.push({
      row: 0,
      column: "file",
      message: `Maximum ${MAX_ROWS.toLocaleString()} source rows per file. Split the export into smaller periods.`,
    });
    return file;
  }
  const badRows = new Set<number>();
  for (const error of result.errors) {
    const row = (error.row ?? 0) + 1;
    badRows.add(row);
    file.errors.push({ row, column: "CSV", message: error.message });
  }
  const occurrences = new Map<string, number>();
  for (const [i, values] of data.entries()) {
    const row = i + 2;
    if (badRows.has(row)) continue;
    if (values.length !== headers.length) {
      file.errors.push({
        row,
        column: "CSV",
        message: `Expected ${headers.length} fields; received ${values.length}.`,
      });
      continue;
    }
    const raw = Object.fromEntries(headers.map((h, i) => [h, values[i]]));
    try {
      const normalized = normalize(raw, expected, timezone);
      if (
        "duration" in normalized &&
        !/^(?:(?:\d+day|\d+hr|\d+min)\s*)*\d+sec$/.test(normalized.duration)
      )
        file.warnings.push({
          row,
          column: "duration",
          message: normalized.duration
            ? "Reported duration uses an unfamiliar display format and is preserved as source metadata. Matched intervals use the validated buy/sell timestamps."
            : "Reported duration is blank. Matched intervals use the validated buy/sell timestamps.",
        });
      const identity =
        "orderId" in normalized
          ? normalized.orderId
          : JSON.stringify([normalized.buyFillId, normalized.sellFillId]);
      const fingerprint = hash(
        JSON.stringify([
          timezone,
          Object.entries(raw)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, v.trim()]),
        ]),
      );
      const occurrence = (occurrences.get(identity + fingerprint) ?? 0) + 1;
      occurrences.set(identity + fingerprint, occurrence);
      const source: SourceRow = {
        row,
        raw,
        values: normalized,
        identity,
        fingerprint,
        occurrence,
        disposition: "new",
      };
      file.rows.push(source);
      const dates =
        "timestamp" in normalized
          ? [
              normalized.timestamp,
              ...(normalized.fillTime ? [normalized.fillTime] : []),
            ]
          : [normalized.boughtAt, normalized.soldAt];
      for (const t of dates) {
        if (!file.start || t < file.start) file.start = t;
        if (!file.end || t > file.end) file.end = t;
      }
    } catch (e) {
      file.errors.push({
        row,
        column: e instanceof ColumnError ? e.column : "row",
        message: e instanceof Error ? e.message : "Invalid source record.",
      });
    }
  }
  file.warnings.push({
    row: 0,
    column: "report",
    message:
      expected === "orders"
        ? "Orders are source snapshots with aggregate fills. Canceled orders are retained, not counted as trades."
        : "Performance rows are matched portions, not completed trades. Reported P&L is gross; fees remain unknown.",
  });
  return file;
}
