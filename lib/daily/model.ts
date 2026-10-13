import { z } from "zod";
import { plansSchema } from "@/lib/strategies/model";
import { daySchema } from "@/lib/calendar/model";
import { sourceTimezone } from "@/lib/imports/time";
import { emotions } from "@/lib/reviews/model";
const text = z.string().max(5000, "Keep each field within 5,000 characters.");
export const checklistSchema = z
  .array(
    z
      .object({
        id: z.uuid(),
        text: z.string().trim().min(1).max(200),
        checked: z.boolean(),
      })
      .strict(),
  )
  .max(20)
  .refine(
    (items) => new Set(items.map((i) => i.id)).size === items.length,
    "Checklist items must be unique.",
  );
export const defaultChecklist = [
  "Reviewed my account rules.",
  "Defined the setups I will take.",
  "Defined when I will stop.",
  "Checked relevant scheduled events.",
  "Decided how I will respond to a missed move.",
];
export const observationSchema = z
  .object({
    id: z.uuid(),
    eventLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
    happened: text.min(1),
    response: text,
    recordId: z.uuid().nullable(),
  })
  .strict();
export const dailyFieldsSchema = z
  .object({
    plannedStrategies: plansSchema.default([]),
    focus: text,
    context: text,
    setups: text,
    stayOut: text,
    missedMove: text,
    readiness: z.enum(["Ready", "Unsure", "Sitting out"]).nullable(),
    mood: z.enum(emotions).nullable(),
    plannedLoss: z.string().regex(/^(?:\d{1,12}(?:\.\d{1,2})?)?$/),
    currency: z.enum(["USD", "EUR", "GBP", "ILS"]),
    plannedTrades: z.string().regex(/^(?:\d{1,4})?$/),
    stoppingRule: text,
    checklist: checklistSchema,
    session: text,
    observations: z
      .array(observationSchema)
      .max(100)
      .refine((items) => new Set(items.map((i) => i.id)).size === items.length),
    wentWell: text,
    departed: text,
    pressure: text,
    repeat: text,
    change: text,
    adherence: z.enum(["followed", "partly", "not-followed"]).nullable(),
    endMood: z.enum(emotions).nullable(),
    choseNotToTrade: z.boolean(),
  })
  .strict();
export type DailyFields = z.infer<typeof dailyFieldsSchema>;
export type ObservationMeta = {
  eventAt: string;
  createdAt: string;
  updatedAt: string;
  sourceIds: string[];
  originalAccountId: string | null;
};
export type DailyData = {
  userId: string;
  date: string;
  timezone: string;
  preferenceTimezone: string;
  id: string | null;
  revision: number;
  status: "draft" | "reviewed";
  fields: DailyFields;
  observations: Record<
    string,
    ObservationMeta & {
      linkStatus: "none" | "available" | "changed" | "unavailable";
      href: string | null;
    }
  >;
};
export function emptyDaily(
  checklist: DailyFields["checklist"] = [],
): DailyFields {
  return {
    plannedStrategies: [],
    focus: "",
    context: "",
    setups: "",
    stayOut: "",
    missedMove: "",
    readiness: null,
    mood: null,
    plannedLoss: "",
    currency: "USD",
    plannedTrades: "",
    stoppingRule: "",
    checklist: checklist.map((i) => ({ ...i, checked: false })),
    session: "",
    observations: [],
    wentWell: "",
    departed: "",
    pressure: "",
    repeat: "",
    change: "",
    adherence: null,
    endMood: null,
    choseNotToTrade: false,
  };
}
export const saveDailySchema = z
  .object({
    date: daySchema,
    timezone: sourceTimezone,
    revision: z.number().int().nonnegative(),
    status: z.enum(["draft", "reviewed"]),
    fields: dailyFieldsSchema,
  })
  .strict();
export const templateSchema = z
  .object({ revision: z.number().int().nonnegative(), items: checklistSchema })
  .strict();
export const notebookSchema = z
  .object({
    q: z.string().max(200).default(""),
    start: daySchema.optional(),
    end: daySchema.optional(),
    status: z.enum(["all", "draft", "reviewed"]).default("all"),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict()
  .refine((v) => !v.start || !v.end || v.start <= v.end);
