import {
  emotions,
  stages,
  type ReviewFields,
  type ReviewTag,
} from "@/lib/reviews/model";
import { z } from "zod";
import { daySchema, dayBounds } from "@/lib/calendar/model";
import { D, sum } from "./processing";

const amount = z.string().regex(/^-?\d{1,20}(?:\.\d{1,8})?$/);
export const viewSchema = z
  .object({
    mode: z.enum(["real", "demo"]).default("real"),
    accounts: z.string().max(8000).optional(),
    archived: z.enum(["0", "1"]).default("0"),
    start: daySchema
      .refine((v) => v >= "1900-01-01" && v <= "9998-12-31")
      .optional(),
    end: daySchema
      .refine((v) => v >= "1900-01-01" && v <= "9998-12-31")
      .optional(),
    dateBasis: z.enum(["closed", "activity"]).default("closed"),
    basis: z.enum(["gross", "net"]).default("gross"),
    search: z.string().trim().max(100).default(""),
    symbol: z.string().max(80).optional(),
    root: z
      .string()
      .regex(/^[A-Z0-9]{1,20}$/)
      .optional(),
    direction: z.enum(["all", "long", "short", "unknown"]).default("all"),
    outcome: z.enum(["all", "profit", "loss", "zero"]).default("all"),
    type: z.enum(["all", "trade", "portion"]).default("all"),
    status: z.enum(["all", "matched", "review"]).default("all"),
    review: z
      .enum(["all", "unreviewed", "draft", "reviewed", "notes", "screenshots"])
      .default("all"),
    mistake: z.string().max(100).optional(),
    emotion: z.enum(emotions).optional(),
    emotionStage: z.enum(stages).default("before"),
    adherence: z.enum(["followed", "partly", "not-followed"]).optional(),
    min: amount.optional(),
    max: amount.optional(),
    sort: z
      .enum([
        "exit",
        "entry",
        "duration",
        "quantity",
        "gross",
        "fees",
        "net",
        "symbol",
        "account",
      ])
      .default("exit"),
    order: z.enum(["asc", "desc"]).default("desc"),
    page: z.coerce.number().int().min(1).max(1000000).default(1),
    size: z.coerce
      .number()
      .refine((v) => [10, 25, 50, 100].includes(v))
      .default(25),
    record: z.string().max(100).optional(),
  })
  .strict()
  .refine(
    (v) => !v.start || !v.end || v.start <= v.end,
    "Start must precede end",
  )
  .refine(
    (v) => !v.min || !v.max || new D(v.min).lte(v.max),
    "Minimum must not exceed maximum",
  );
export type ViewQuery = z.infer<typeof viewSchema>;
export type ViewRecord = {
  reviewStatus?: "unreviewed" | "draft" | "reviewed";
  hasNotes?: boolean;
  imageCount?: number;
  reviewFields?: ReviewFields;
  id: string;
  accountId: string;
  account: string;
  symbol: string;
  root: string | null;
  direction: string;
  status: string;
  type: "trade" | "portion";
  entry: string | null;
  exit: string;
  duration: string | null;
  quantity: string | null;
  entryPrice: string | null;
  exitPrice: string | null;
  gross: string;
  fees: string | null;
  net: string | null;
  estimated: boolean;
  feeKind: string;
  fullGross: string;
  partial: boolean;
  imported: string | null;
};
export type ViewSummary = {
  count: number;
  trades: number;
  portions: number;
  gross: string;
  net: string | null;
  covered: number;
  estimated: boolean;
  winRate: string | null;
};
export type TradeViewData = {
  tags?: ReviewTag[];
  recoveryCount?: number;
  userId: string;
  timezone: string;
  rows: ViewRecord[];
  summary: ViewSummary;
  accounts: { id: string; name: string; archived: boolean }[];
  page: number;
  pages: number;
  sourceCount: number;
  pending: boolean;
  navigation: {
    previous: string | null;
    next: string | null;
    position: number;
  } | null;
};
export function rootSymbol(symbol: string) {
  return symbol.match(/^([A-Z0-9]+?)[FGHJKMNQUVXZ]\d{1,4}$/)?.[1] ?? null;
}
export function rangeBounds(q: ViewQuery, timezone: string) {
  return {
    start: q.start ? dayBounds(q.start, timezone).start : null,
    end: q.end ? dayBounds(q.end, timezone).end : null,
  };
}
export function summaryOf(rows: ViewRecord[], q: ViewQuery): ViewSummary {
  const trades = rows.filter((r) => r.type === "trade");
  const covered = rows.filter((r) => r.net !== null).length;
  return {
    count: rows.length,
    trades: trades.length,
    portions: rows.length - trades.length,
    gross: sum(rows.map((r) => r.gross)),
    net: covered === rows.length ? sum(rows.map((r) => r.net!)) : null,
    covered,
    estimated: rows.some((r) => r.estimated),
    winRate:
      rows.length &&
      trades.length === rows.length &&
      !rows.some((r) => r.partial) &&
      (q.basis === "gross" || covered === rows.length)
        ? new D(
            trades.filter((r) =>
              new D(q.basis === "gross" ? r.gross : r.net!).gt(0),
            ).length,
          )
            .div(trades.length)
            .times(100)
            .toFixed(1)
        : null,
  };
}
export function filterDemo(rows: ViewRecord[], q: ViewQuery, timezone: string) {
  const bounds = rangeBounds(q, timezone);
  const selected = rows.filter((r) => {
    const value = q.basis === "gross" ? r.gross : r.net;
    return (
      (q.review === "all" ||
        (q.review === "notes"
          ? r.hasNotes
          : q.review === "screenshots"
            ? (r.imageCount ?? 0) > 0
            : (r.reviewStatus ?? "unreviewed") === q.review)) &&
      (!q.mistake || r.reviewFields?.mistakes.includes(q.mistake)) &&
      (!q.emotion ||
        r.reviewFields?.emotions[q.emotionStage].includes(q.emotion)) &&
      (!q.adherence || r.reviewFields?.adherence === q.adherence) &&
      (!bounds.start || r.exit >= bounds.start) &&
      (!bounds.end || r.exit < bounds.end) &&
      (!q.symbol || r.symbol === q.symbol) &&
      (!q.root || r.root === q.root || r.symbol === q.root) &&
      (q.direction === "all" || r.direction === q.direction) &&
      (q.type === "all" || r.type === q.type) &&
      (q.status === "all" || q.status === "matched") &&
      (!q.search ||
        (r.account + " " + r.symbol)
          .toLowerCase()
          .includes(q.search.toLowerCase())) &&
      (q.outcome === "all" ||
        (value !== null &&
          (q.outcome === "profit"
            ? new D(value).gt(0)
            : q.outcome === "loss"
              ? new D(value).lt(0)
              : new D(value).isZero()))) &&
      (!q.min || (value !== null && new D(value).gte(q.min))) &&
      (!q.max || (value !== null && new D(value).lte(q.max)))
    );
  });
  const key = (
    {
      quantity: "quantity",
      duration: "duration",
      fees: "fees",
      gross: "gross",
      net: "net",
      exit: "exit",
      entry: "entry",
      account: "account",
      symbol: "symbol",
    } as const
  )[q.sort];
  selected.sort((a, b) => {
    const av = a[key],
      bv = b[key];
    if (av === null || bv === null)
      return av === bv ? a.id.localeCompare(b.id) : av === null ? 1 : -1;
    const cmp = ["quantity", "duration", "fees", "gross", "net"].includes(
      q.sort,
    )
      ? new D(av).cmp(bv)
      : av.localeCompare(bv);
    return cmp * (q.order === "asc" ? 1 : -1) || a.id.localeCompare(b.id);
  });
  return selected;
}
