import {
  summary,
  isCompleteTrade,
  type Summary,
} from "@/lib/journal/statistics";
export { summary, type Summary } from "@/lib/journal/statistics";
import { z } from "zod";
import { daySchema } from "@/lib/calendar/model";
import {
  D,
  sum,
  type Portion,
  type PortionFee,
} from "@/lib/journal/processing";
import { realizedPerformance, localDay } from "@/lib/journal/calculations";
import { rootSymbol, type ViewRecord } from "@/lib/journal/view-model";
import {
  durationBucket,
  durationLabels,
  entryHour,
} from "@/lib/journal/analysis-filters";
import { emotions, stages, type ReviewTag } from "@/lib/reviews/model";
export const reportSchema = z
  .object({
    mode: z.enum(["real", "demo"]).default("real"),
    tab: z.enum(["overview", "breakdowns", "behavior"]).default("overview"),
    start: daySchema,
    end: daySchema,
    accounts: z.string().max(8000).optional(),
    archived: z.enum(["0", "1"]).default("0"),
    direction: z.enum(["all", "long", "short", "unknown"]).default("all"),
    basis: z.enum(["gross", "net"]).default("gross"),
    analysis: z.enum(["activity", "complete", "portions"]).default("activity"),
    root: z
      .string()
      .regex(/^[A-Z0-9]{1,20}$/)
      .optional(),
    symbol: z.string().max(80).optional(),
    currency: z.literal("USD").default("USD"),
    behaviorBasis: z.enum(["complete", "records"]).default("complete"),
    review: z.enum(["reviewed", "all"]).default("reviewed"),
    emotionStage: z.enum(stages).default("before"),
    emotion: z.enum(emotions).optional(),
    mistakes: z.string().max(2000).optional(),
    adherence: z.enum(["followed", "partly", "not-followed"]).optional(),
    instrument: z.enum(["root", "contract"]).default("root"),
    group: z
      .enum([
        "account",
        "instrument",
        "weekday",
        "direction",
        "hour",
        "duration",
        "plan",
        "mistake",
        "emotion",
      ])
      .optional(),
  })
  .strict()
  .refine(
    (q) =>
      q.start >= "1900-01-01" &&
      q.end <= "9998-12-31" &&
      q.start <= q.end &&
      Date.parse(q.end) - Date.parse(q.start) <= 3660 * 86400000,
    "Choose an ordered range of at most 10 years.",
  );
export type ReportQuery = z.infer<typeof reportSchema>;
export type Group = {
  key: string;
  label: string;
  count: number;
  total: string | null;
  average: string | null;
  winRate: string | null;
  href: string;
};
export type DayPoint = Group & {
  date: string;
  cumulative: string | null;
  drawdown: string | null;
};
export type ReportData = {
  userId: string;
  timezone: string;
  currency: "USD";
  accounts: { id: string; name: string; archived: boolean }[];
  tags: ReviewTag[];
  summary: Summary;
  days: DayPoint[];
  groups: Record<string, Group[]>;
  distribution: Group[];
  coverage: {
    reviewed: number;
    draft: number;
    unreviewed: number;
    unresolved: number;
  };
  supportedComplete: number;
  closedRecords: number;
  pending: boolean;
  excludedEntry: number;
  excludedDuration: number;
};
export type StructuredReview = {
  status: "unreviewed" | "draft" | "reviewed";
  mistakes: string[];
  emotions: Record<(typeof stages)[number], string[]>;
  adherence: string | null;
};
export type ReportRecord = ViewRecord & { reviewData: StructuredReview };
type Item = {
  id: string;
  date: string;
  value: string | null;
  estimated: boolean;
};
export function reportHref(
  q: ReportQuery,
  ids: string[],
  extra: Record<string, string> = {},
) {
  const base = {
    mode: q.mode,
    accounts: ids.join(","),
    archived: q.archived,
    start: q.start,
    end: q.end,
    basis: q.basis,
    direction: q.direction,
    ...(q.analysis === "portions" && q.tab !== "behavior"
      ? { outcomeBasis: "portions" }
      : {}),
    dateBasis:
      q.tab === "behavior" || q.analysis === "complete" ? "closed" : "activity",
    ...(q.tab === "behavior"
      ? {
          type: q.behaviorBasis === "complete" ? "trade" : "portion",
          review: q.review,
          ...(q.emotion
            ? { emotion: q.emotion, emotionStage: q.emotionStage }
            : {}),
          ...(q.adherence ? { adherence: q.adherence } : {}),
          ...(q.mistakes ? { mistakes: q.mistakes } : {}),
        }
      : q.analysis === "complete"
        ? { type: "trade" }
        : {}),
    ...(q.symbol ? { symbol: q.symbol } : {}),
    ...(q.root ? { root: q.root } : {}),
    ...extra,
  };
  const params = new URLSearchParams(base);
  params.set(
    "reportFrom",
    `/reports?${new URLSearchParams(
      Object.entries(q)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)]),
    )}`,
  );
  return `/trade-view?${params}`;
}
export function summarizeReports({
  q,
  ids,
  timezone,
  portions,
  fees,
  records,
  tags,
  unresolved = 0,
}: {
  q: ReportQuery;
  ids: string[];
  timezone: string;
  portions: Portion[];
  fees: Record<string, PortionFee>;
  records: ReportRecord[];
  tags: ReviewTag[];
  unresolved?: number;
}) {
  const realized = realizedPerformance(
    portions,
    fees,
    {
      accounts: ids,
      start: q.start,
      end: q.end,
      symbol: q.symbol,
      direction: q.direction,
    },
    timezone,
  );
  const full = records.filter((r) =>
    (
      q.tab === "behavior"
        ? q.behaviorBasis === "complete"
        : q.analysis === "complete"
    )
      ? isCompleteTrade(r) &&
        (q.direction === "all" || r.direction === q.direction)
      : true,
  );
  const coverageBase = records.filter(
    (r) =>
      (q.behaviorBasis === "complete"
        ? isCompleteTrade(r)
        : r.type === "portion") &&
      (q.direction === "all" || r.direction === q.direction),
  );
  const coverage = {
    reviewed: coverageBase.filter((r) => r.reviewData.status === "reviewed")
      .length,
    draft: coverageBase.filter((r) => r.reviewData.status === "draft").length,
    unreviewed: coverageBase.filter((r) => r.reviewData.status === "unreviewed")
      .length,
    unresolved,
  };
  const behavior = coverageBase.filter(
    (r) =>
      (q.review === "all" || r.reviewData.status === q.review) &&
      (!q.emotion ||
        r.reviewData.emotions[q.emotionStage].includes(q.emotion)) &&
      (!q.adherence || r.reviewData.adherence === q.adherence) &&
      (!q.mistakes ||
        q.mistakes.split(",").some((id) => r.reviewData.mistakes.includes(id))),
  );
  const chosen = q.tab === "behavior" ? behavior : full;
  const complete =
    q.tab === "behavior"
      ? q.behaviorBasis === "complete"
      : q.analysis === "complete";
  const outcomeMode =
    complete || (q.analysis === "portions" && q.tab !== "behavior");
  const value = (r: ViewRecord) => (q.basis === "gross" ? r.gross : r.net);
  const items: Item[] =
    q.tab !== "behavior" && !complete
      ? realized.selected.map((p) => ({
          id: p.id,
          date: localDay(
            p.boughtAt > p.soldAt ? p.boughtAt : p.soldAt,
            timezone,
          ),
          value:
            q.basis === "gross"
              ? p.grossPnl
              : fees[p.id]?.amount == null
                ? null
                : new D(p.grossPnl).minus(fees[p.id].amount!).toFixed(),
          estimated: fees[p.id]?.kind === "Estimated",
        }))
      : chosen.map((r) => ({
          id: r.id,
          date: localDay(r.exit, timezone),
          value: value(r),
          estimated: r.estimated,
        }));
  const aggregate = (
    key: string,
    label: string,
    group: Item[],
    extra: Record<string, string> = {},
  ): Group => {
    const unique = [...new Map(group.map((i) => [i.id, i])).values()],
      values = unique.map((i) => i.value),
      eligible = values.every((v) => v !== null),
      count =
        outcomeMode || q.tab === "behavior"
          ? unique.length
          : new Set(unique.map((i) => i.date)).size,
      total = eligible ? sum(values as string[]) : null;
    return {
      key,
      label,
      count,
      total,
      average:
        total !== null && count ? new D(total).div(count).toFixed() : null,
      winRate: outcomeMode ? summary(values).winRate : null,
      href: reportHref(q, ids, extra),
    };
  };
  const daily = new Map<string, Item[]>();
  for (const item of items)
    daily.set(item.date, [...(daily.get(item.date) ?? []), item]);
  const eligible = items.every((i) => i.value !== null);
  let cumulative = new D(0),
    peak = new D(0),
    minimum = new D(0);
  const days: DayPoint[] = [...daily]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, group]) => {
      const row = aggregate(date, date, group, { start: date, end: date });
      if (eligible) {
        cumulative = cumulative.plus(row.total!);
        peak = D.max(peak, cumulative);
        minimum = D.min(minimum, cumulative.minus(peak));
      }
      return {
        ...row,
        date,
        cumulative: eligible ? cumulative.toFixed() : null,
        drawdown: eligible ? cumulative.minus(peak).toFixed() : null,
      };
    });
  const stats = summary(
    outcomeMode || q.tab === "behavior"
      ? items.map((i) => i.value)
      : days.map((d) => d.total),
    items.some((i) => i.estimated),
  );
  stats.maxDrawdown = eligible ? minimum.abs().toFixed() : null;
  if (!outcomeMode && q.tab !== "behavior" && eligible && days.length) {
    stats.best = D.max(...days.map((d) => new D(d.total!))).toFixed();
    stats.worst = D.min(...days.map((d) => new D(d.total!))).toFixed();
  }
  // Daily coverage belongs to the day denominator; missing fees never become zero.
  const groups: Record<string, Group[]> = {};
  function groupBy(
    name: string,
    keyFor: (index: number) => string | null,
    labelFor: (key: string) => string,
    filters: (key: string) => Record<string, string>,
  ) {
    const buckets = new Map<string, Item[]>();
    items.forEach((item, i) => {
      const key = keyFor(i);
      if (key !== null) buckets.set(key, [...(buckets.get(key) ?? []), item]);
    });
    groups[name] = [...buckets]
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
      .map(([key, group]) =>
        aggregate(key, labelFor(key), group, filters(key)),
      );
  }
  if (q.tab === "breakdowns") {
    const ps = realized.selected,
      rs = chosen;
    groupBy(
      "account",
      (i) => (complete ? rs[i].accountId : ps[i].tradingAccountId),
      (key) => records.find((r) => r.accountId === key)?.account ?? key,
      (key) => ({ accounts: key }),
    );
    groupBy(
      "instrument",
      (i) => {
        const symbol = complete ? rs[i].symbol : ps[i].symbol;
        return q.instrument === "contract"
          ? symbol
          : (rootSymbol(symbol) ?? symbol);
      },
      (key) => key,
      (key): Record<string, string> =>
        q.instrument === "contract" ? { symbol: key } : { root: key },
    );
    groupBy(
      "weekday",
      (i) => String(new Date(items[i].date + "T12:00:00Z").getUTCDay()),
      (key) =>
        [
          "Sunday",
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
        ][Number(key)],
      (key) => ({ weekday: key }),
    );
    groupBy(
      "direction",
      (i) =>
        complete
          ? rs[i].direction
          : ps[i].boughtAt < ps[i].soldAt
            ? "long"
            : ps[i].boughtAt > ps[i].soldAt
              ? "short"
              : "unknown",
      (key) => key,
      (key) => ({ direction: key }),
    );
    if (complete) {
      groupBy(
        "hour",
        (i) => {
          const hour = entryHour(rs[i].entry, timezone);
          return hour === null ? null : String(hour);
        },
        (key) => `${key.padStart(2, "0")}:00–${key.padStart(2, "0")}:59`,
        (key) => ({ hour: key }),
      );
      groupBy(
        "duration",
        (i) => durationBucket(rs[i].duration),
        (key) => durationLabels[key as keyof typeof durationLabels],
        (key) => ({ holding: key }),
      );
    }
  }
  if (q.tab === "behavior") {
    const plan = ["followed", "partly", "not-followed", "missing"];
    groups.plan = plan.map((key) =>
      aggregate(
        key,
        {
          followed: "Followed my plan",
          partly: "Partly followed my plan",
          "not-followed": "Did not follow my plan",
          missing: "Not recorded",
        }[key]!,
        items.filter(
          (_, i) => (chosen[i].reviewData.adherence ?? "missing") === key,
        ),
        key === "missing" ? { reviewMissing: "adherence" } : { adherence: key },
      ),
    );
    const allMistakes = [
      ...new Set(chosen.flatMap((r) => r.reviewData.mistakes)),
    ];
    groups.mistake = [...allMistakes, "missing"].map((key) =>
      aggregate(
        key,
        key === "missing"
          ? "Not recorded"
          : (tags.find((t) => t.id === key)?.name ?? key),
        items.filter((_, i) =>
          key === "missing"
            ? !chosen[i].reviewData.mistakes.length
            : chosen[i].reviewData.mistakes.includes(key),
        ),
        key === "missing" ? { reviewMissing: "mistake" } : { mistake: key },
      ),
    );
    groups.emotion = [
      ...new Set(chosen.flatMap((r) => r.reviewData.emotions[q.emotionStage])),
      "missing",
    ].map((key) =>
      aggregate(
        key,
        key === "missing" ? "Not recorded" : key,
        items.filter((_, i) =>
          key === "missing"
            ? !chosen[i].reviewData.emotions[q.emotionStage].length
            : chosen[i].reviewData.emotions[q.emotionStage].includes(key),
        ),
        key === "missing"
          ? { reviewMissing: "emotion", emotionStage: q.emotionStage }
          : { emotion: key, emotionStage: q.emotionStage },
      ),
    );
  }
  const distribution =
    outcomeMode && eligible
      ? ["profit", "loss", "zero"].map((key) =>
          aggregate(
            key,
            {
              profit: complete ? "Winning trades" : "Winning portions",
              loss: complete ? "Losing trades" : "Losing portions",
              zero: complete ? "Breakeven trades" : "Breakeven portions",
            }[key]!,
            items.filter(
              (i) =>
                i.value !== null &&
                (key === "profit"
                  ? new D(i.value).gt(0)
                  : key === "loss"
                    ? new D(i.value).lt(0)
                    : new D(i.value).isZero()),
            ),
            { outcome: key },
          ),
        )
      : [];
  if (!eligible)
    distribution.forEach((group) => {
      group.total = null;
      group.average = null;
    });
  return {
    summary: stats,
    days,
    groups,
    distribution,
    coverage,
    supportedComplete: records.filter(isCompleteTrade).length,
    closedRecords: records.filter((r) => r.type === "portion").length,
    excludedEntry: complete ? chosen.filter((r) => r.entry === null).length : 0,
    excludedDuration: complete
      ? chosen.filter((r) => durationBucket(r.duration) === null).length
      : 0,
  };
}
