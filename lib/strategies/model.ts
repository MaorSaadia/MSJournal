import { z } from "zod";
const note = z.string().max(5000);
export const playbookSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required.").max(100),
    description: z.string().max(500),
    color: z.enum(["emerald", "violet", "blue", "amber", "rose"]).nullable(),
    instruments: note,
    timeframes: note,
    window: note,
    context: note,
    entry: note,
    invalidation: note,
    stop: note,
    exit: note,
    management: note,
    avoid: note,
    mistakes: note,
    checklist: z
      .array(
        z
          .object({ id: z.uuid(), text: z.string().trim().min(1).max(300) })
          .strict(),
      )
      .max(30)
      .refine((v) => new Set(v.map((i) => i.id)).size === v.length),
  })
  .strict();
export type Playbook = z.infer<typeof playbookSchema>;
export const emptyPlaybook = (): Playbook => ({
  name: "",
  description: "",
  color: null,
  instruments: "",
  timeframes: "",
  window: "",
  context: "",
  entry: "",
  invalidation: "",
  stop: "",
  exit: "",
  management: "",
  avoid: "",
  mistakes: "",
  checklist: [],
});
export const playbookNotes = [
  ["instruments", "Instruments or markets"],
  ["timeframes", "Preferred timeframes"],
  ["window", "Preferred trading window"],
  ["context", "Market context"],
  ["entry", "Entry conditions"],
  ["invalidation", "Invalidation conditions"],
  ["stop", "Stop-placement approach"],
  ["exit", "Target and exit approach"],
  ["management", "Management rules"],
  ["avoid", "Conditions to avoid"],
  ["mistakes", "Common mistakes to watch for"],
] as const;
export const exampleTypes = [
  "Valid setup",
  "Invalid setup",
  "Management example",
] as const;
export const response = z.enum(["Met", "Not met", "Not assessed"]);
export const strategyPlanSchema = z
  .object({ strategyId: z.uuid(), revision: z.number().int().positive() })
  .strict();
export const plansSchema = z
  .array(strategyPlanSchema)
  .max(20)
  .refine((v) => new Set(v.map((i) => i.strategyId)).size === v.length);
export type StrategyPlan = z.infer<typeof strategyPlanSchema>;
export type StrategyData = {
  userId: string;
  timezone: string;
  id: string;
  revision: number;
  galleryRevision: number;
  status: "draft";
  fields: Playbook;
  archived: boolean;
  updatedAt: string;
  storageEnabled: boolean;
  images: {
    id: string;
    caption: string;
    stage: string | null;
    position: number;
    width: number;
    height: number;
    revision: number;
  }[];
  linked: number;
  unresolved: number;
};
export type AssignmentData = {
  userId: string;
  timezone: string;
  recordId: string;
  assignment: null | {
    id: string;
    revision: number;
    strategyId: string;
    playbookRevision: number;
    fields: Playbook;
    answers: Record<string, z.infer<typeof response>>;
    archived: boolean;
    latestRevision: number;
  };
  strategies: {
    id: string;
    name: string;
    revision: number;
    archived: boolean;
  }[];
};
export const saveStrategySchema = z
  .object({
    id: z.uuid().optional(),
    revision: z.number().int().nonnegative(),
    fields: playbookSchema,
  })
  .strict();
export const strategyAction = z
  .object({
    id: z.uuid(),
    revision: z.number().int().positive(),
    action: z.enum(["archive", "restore", "duplicate"]),
  })
  .strict();
export const assignmentMutation = z
  .object({
    recordId: z.uuid(),
    revision: z.number().int().nonnegative(),
    strategyId: z.uuid().nullable(),
    answers: z.record(z.uuid(), response).default({}),
    adoptLatest: z.boolean().default(false),
    confirmReset: z.boolean().default(false),
    recoverId: z.uuid().optional(),
  })
  .strict();
