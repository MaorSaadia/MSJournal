import { z } from "zod";
export const emotions = [
  "Calm",
  "Focused",
  "Confident",
  "Hesitant",
  "Anxious",
  "Frustrated",
  "Impatient",
  "Excited",
  "Overconfident",
  "Fear of missing out",
] as const;
export const stages = ["before", "during", "after"] as const;
export const mistakes = [
  ["no-setup", "Entered without a clear setup"],
  ["early", "Entered too early"],
  ["chased", "Chased a missed move"],
  ["fomo", "FOMO entry"],
  ["revenge", "Revenge trade"],
  ["oversized", "Oversized position"],
  ["stop", "Moved stop farther away"],
  ["exit", "Exited outside the plan"],
  ["overtraded", "Overtraded"],
  ["rule", "Ignored a trading rule"],
] as const;
export const noteFields = [
  ["entryRationale", "Entry rationale", "What did I see, and why did I enter?"],
  ["management", "Trade management", "What did I do while the trade was open?"],
  ["wentWell", "What went well", "One thing I want to repeat."],
  ["change", "What I would change", "What would I do differently?"],
  ["lesson", "Lesson for next time", "A reminder for my next trade."],
] as const;
const note = z.string().max(5000, "Keep each note within 5,000 characters.");
export const emotionNameSchema = z
  .string()
  .trim()
  .min(1, "Enter an emotion name.")
  .max(60, "Use 60 characters or fewer.")
  .refine(
    (value) => !/[\u0000-\u001f\u007f]/.test(value),
    "Use a single-line emotion name.",
  )
  .transform(
    (value) =>
      emotions.find((known) => known.toLowerCase() === value.toLowerCase()) ??
      value,
  );
export function emotionOptions(values: readonly string[]) {
  const unique = new Map<string, string>();
  for (const value of values) {
    const parsed = emotionNameSchema.safeParse(value);
    if (parsed.success && !unique.has(parsed.data.toLowerCase()))
      unique.set(parsed.data.toLowerCase(), parsed.data);
  }
  return [...unique.values()];
}
const choices = z.array(emotionNameSchema).max(30).transform(emotionOptions);
export const reviewFieldsSchema = z
  .object({
    entryRationale: note,
    management: note,
    wentWell: note,
    change: note,
    lesson: note,
    emotions: z
      .object({ before: choices, during: choices, after: choices })
      .strict(),
    mistakes: z
      .array(z.string().max(100))
      .max(50)
      .transform((v) => [...new Set(v)]),
    adherence: z.enum(["followed", "partly", "not-followed"]).nullable(),
  })
  .strict();
export type ReviewFields = z.infer<typeof reviewFieldsSchema>;
export const emptyFields = (): ReviewFields => ({
  entryRationale: "",
  management: "",
  wentWell: "",
  change: "",
  lesson: "",
  emotions: { before: [], during: [], after: [] },
  mistakes: [],
  adherence: null,
});
export function hasNotes(fields: ReviewFields) {
  return noteFields.some(([key]) => fields[key].trim().length > 0);
}
export function meaningful(fields: ReviewFields) {
  return (
    hasNotes(fields) ||
    stages.some((s) => fields.emotions[s].length > 0) ||
    fields.mistakes.length > 0 ||
    fields.adherence !== null
  );
}
export function reviewState(
  fields: ReviewFields,
  status: "draft" | "reviewed",
  images = 0,
): ReviewStatus {
  return status === "reviewed"
    ? "reviewed"
    : meaningful(fields) || images > 0
      ? "draft"
      : "unreviewed";
}
export type ReviewStatus = "unreviewed" | "draft" | "reviewed";
export type ReviewTag = { id: string; name: string; archived: boolean };
export type Attachment = {
  id: string;
  caption: string;
  stage: (typeof stages)[number] | null;
  position: number;
  width: number;
  height: number;
  revision: number;
};
export type ReviewData = {
  userId: string;
  timezone: string;
  id: string | null;
  recordId: string | null;
  revision: number;
  status: "draft" | "reviewed";
  fields: ReviewFields;
  tags: ReviewTag[];
  emotionChoices?: string[];
  images: Attachment[];
  storageEnabled: boolean;
  needsReassignment: boolean;
};
export const saveReviewSchema = z
  .object({
    recordId: z.uuid(),
    revision: z.number().int().nonnegative(),
    status: z.enum(["draft", "reviewed"]),
    fields: reviewFieldsSchema,
  })
  .strict();
export class ReviewError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
export function unchangedAssociation(
  saved: string[],
  current: { id: string; sourceIds: string[] }[],
) {
  const signature = (s: string[]) => [...s].sort().join(",");
  return (
    current.find((r) => signature(r.sourceIds) === signature(saved))?.id ?? null
  );
}
