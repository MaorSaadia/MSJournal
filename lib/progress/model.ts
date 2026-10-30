import { z } from "zod";
import { daySchema, shiftDay, monthEnd } from "@/lib/calendar/model";
import { mistakes } from "@/lib/reviews/model";

export const daysBetween = (a: string, b: string) =>
  Math.round(
    (Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000,
  );
export const civilDate = daySchema.refine(
  (v) => v >= "1900-01-01" && v <= "9998-12-31",
);
export const rangeSchema = z
  .object({ start: civilDate, end: civilDate })
  .strict()
  .refine(
    (v) => v.end >= v.start && daysBetween(v.start, v.end) < 366,
    "Choose a range of 1–366 days.",
  );
export const goalFields = z
  .object({
    name: z.string().trim().min(1).max(100),
    type: z.enum(["preparation", "daily-review", "trade-review", "habit"]),
    start: civilDate,
    end: civilDate,
    target: z.number().int().min(1).max(100000),
    description: z.string().trim().max(500),
    archived: z.boolean(),
  })
  .strict()
  .refine(
    (v) => v.end >= v.start && daysBetween(v.start, v.end) < 366,
    "Goal windows must contain 1–366 days.",
  );
export const saveGoalSchema = z
  .object({
    id: z.uuid().optional(),
    revision: z.number().int().nonnegative(),
    fields: goalFields,
  })
  .strict();
export const checkinSchema = z
  .object({
    goalId: z.uuid(),
    date: civilDate,
    revision: z.number().int().nonnegative(),
    state: z.enum(["done", "not-done", "not-assessed"]),
    note: z.string().max(500),
  })
  .strict();
export type GoalFields = z.infer<typeof goalFields>;
export type Goal = GoalFields & {
  id: string;
  revision: number;
  timezone: string;
};
export type Checkin = z.infer<typeof checkinSchema> & { updatedAt: string };
export type Daily = {
  date: string;
  total: number;
  completed: number;
  reviewed: boolean;
  updatedAt: string;
};
export type RecordReview = {
  id: string;
  date: string;
  reviewed: boolean;
  adherence: "followed" | "partly" | "not-followed" | null;
  mistakes: string[];
  updatedAt: string | null;
};
export const goalTypes = {
  preparation: "Complete preparation",
  "daily-review": "Complete daily reviews",
  "trade-review": "Review trading records",
  habit: "Custom daily habit",
};
export const recordBasis = "Grouped trade records";
export function presetRange(
  preset: string,
  today: string,
  weekStartsOn: 0 | 1,
) {
  if (preset === "week") {
    const weekday = new Date(today + "T12:00:00Z").getUTCDay();
    const start = shiftDay(today, -((weekday - weekStartsOn + 7) % 7));
    return { start, end: shiftDay(start, 6) };
  }
  if (preset === "month")
    return {
      start: today.slice(0, 7) + "-01",
      end: monthEnd(today.slice(0, 7)),
    };
  return { start: shiftDay(today, -29), end: today };
}
export const ratio = (done: number, total: number) =>
  total ? (done / total) * 100 : null;
export function summarizeProgress(
  daily: Daily[],
  records: RecordReview[],
  activity: string[],
  range: { start: string; end: string },
) {
  const within = (date: string) => date >= range.start && date <= range.end;
  // A canonical record and a saved journal date can each appear only once.
  const entries = [
    ...new Map(
      daily.filter((d) => within(d.date)).map((d) => [d.date, d]),
    ).values(),
  ];
  const eligible = [
    ...new Map(
      records.filter((r) => within(r.date)).map((r) => [r.id, r]),
    ).values(),
  ];
  const relevant = new Set([
    ...entries.map((d) => d.date),
    ...activity.filter(within),
  ]);
  const assessed = entries.filter((d) => d.total > 0);
  const preparation = {
    done: assessed.reduce((n, d) => n + d.completed, 0),
    total: assessed.reduce((n, d) => n + d.total, 0),
    days: assessed.length,
    missing: entries.length - assessed.length,
    activityWithoutEntry: [...relevant].filter(
      (d) => !entries.some((e) => e.date === d),
    ).length,
  };
  const reviews = {
    done: eligible.filter((r) => r.reviewed).length,
    total: eligible.length,
  };
  const adherence = {
    followed: 0,
    partly: 0,
    "not-followed": 0,
    unassessed: 0,
    total: eligible.length,
    assessed: 0,
  };
  eligible.forEach((r) => {
    if (r.adherence) {
      adherence[r.adherence]++;
      adherence.assessed++;
    } else adherence.unassessed++;
  });
  const dailyReviews = {
    done: entries.filter((d) => d.reviewed).length,
    total: relevant.size,
  };
  return { preparation, reviews, adherence, dailyReviews };
}
export function progressDashboard(
  daily: Daily[],
  records: RecordReview[],
  activity: string[],
  range: { start: string; end: string },
  names: { id: string; name: string }[],
  weekStartsOn: 0 | 1,
) {
  const length = daysBetween(range.start, range.end) + 1;
  const previous = {
    start: shiftDay(range.start, -length),
    end: shiftDay(range.start, -1),
  };
  const summary = summarizeProgress(daily, records, activity, range);
  const prior = summarizeProgress(daily, records, activity, previous);
  const unique = [...new Map(records.map((r) => [r.id, r])).values()];
  const tags = new Map<string, number>(),
    old = new Map<string, number>();
  for (const r of unique) {
    const map =
      r.date >= range.start && r.date <= range.end
        ? tags
        : r.date >= previous.start && r.date <= previous.end
          ? old
          : null;
    // Counts describe recorded tags, even on drafts. They are not proof that an
    // unreviewed or untagged record was mistake-free.
    if (map)
      for (const id of new Set(r.mistakes)) map.set(id, (map.get(id) ?? 0) + 1);
  }
  const reviewedTags = (id: string, window: typeof range) =>
    unique.filter(
      (r) =>
        r.reviewed &&
        r.date >= window.start &&
        r.date <= window.end &&
        r.mistakes.includes(id),
    ).length;
  const recordedMistakes = [...new Set([...tags.keys(), ...old.keys()])]
    .map((id) => {
      const reviewed = reviewedTags(id, range),
        priorReviewed = reviewedTags(id, previous);
      const rate = ratio(reviewed, summary.reviews.done),
        previousRate = ratio(priorReviewed, prior.reviews.done);
      return {
        id,
        name:
          names.find((t) => t.id === id)?.name ??
          mistakes.find(([key]) => key === id)?.[1] ??
          "Recorded tag",
        count: tags.get(id) ?? 0,
        previousCount: old.get(id) ?? 0,
        reviewed,
        denominator: summary.reviews.done,
        rate,
        previousReviewed: priorReviewed,
        previousDenominator: prior.reviews.done,
        previousRate,
        change:
          rate !== null && previousRate !== null ? rate - previousRate : null,
      };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const days = Array.from({ length }, (_, i) => {
    const date = shiftDay(range.start, i);
    return {
      date,
      ...summarizeProgress(daily, records, activity, {
        start: date,
        end: date,
      }),
    };
  });
  const weeks: {
    start: string;
    end: string;
    preparation: { done: number; total: number };
    reviews: { done: number; total: number };
  }[] = [];
  for (
    let start = presetRange("week", range.start, weekStartsOn).start;
    start <= range.end;
    start = shiftDay(start, 7)
  ) {
    const end = shiftDay(start, 6);
    const s = summarizeProgress(daily, records, activity, {
      start: start < range.start ? range.start : start,
      end: end > range.end ? range.end : end,
    });
    weeks.push({ start, end, preparation: s.preparation, reviews: s.reviews });
  }
  return { summary, days, weeks, recordedMistakes, previous };
}
export function goalProgress(
  goal: Goal,
  daily: Daily[],
  records: RecordReview[],
  checkins: Checkin[],
  today: string,
) {
  const within = (date: string) => date >= goal.start && date <= goal.end;
  const count =
    goal.type === "habit"
      ? new Set(
          checkins
            .filter(
              (c) =>
                c.goalId === goal.id &&
                within(c.date) &&
                c.date <= today &&
                c.state === "done",
            )
            .map((c) => c.date),
        ).size
      : goal.type === "trade-review"
        ? new Set(
            records
              .filter((r) => within(r.date) && r.reviewed)
              .map((r) => r.id),
          ).size
        : new Set(
            daily
              .filter(
                (d) =>
                  within(d.date) &&
                  (goal.type === "preparation"
                    ? d.total > 0 && d.total === d.completed
                    : d.reviewed),
              )
              .map((d) => d.date),
          ).size;
  const status =
    today < goal.start
      ? "Upcoming"
      : count >= goal.target
        ? "Achieved"
        : today > goal.end
          ? "Ended"
          : "Active";
  return {
    ...goal,
    count,
    status,
    remaining:
      today <= goal.end
        ? daysBetween(today < goal.start ? goal.start : today, goal.end) + 1
        : 0,
  };
}
