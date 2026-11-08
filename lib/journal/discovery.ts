import { z } from "zod";
import { emotionNameSchema, type ReviewFields } from "@/lib/reviews/model";
import { durationBuckets, durationBucket, entryHour, localWeekday } from "./analysis-filters";

import { confirmationName } from "@/lib/reviews/confirmations";
export const discoveryShape = {
  strategy: z.union([z.uuid(), z.literal("unassigned")]).optional(),
  confirmation: confirmationName.optional(),
  emotion: emotionNameSchema.optional(),
  emotionStage: z.enum(["before", "during", "after"]).default("before"),
  hour: z.coerce.number().int().min(0).max(23).optional(),
  weekday: z.coerce.number().int().min(0).max(6).optional(),
  holding: z.enum(durationBuckets).optional(),
  adherence: z.enum(["followed", "partly", "not-followed"]).optional(),
};
export const discoverySchema = z.object(discoveryShape);
export const discoveryKeys = Object.keys(discoveryShape) as (keyof typeof discoveryShape)[];
export type DiscoveryQuery = z.infer<typeof discoverySchema>;
export type DiscoveryOptions = { userId: string; timezone: string; confirmations: string[]; emotions: string[]; strategies: { id: string; name: string }[] };
export function matchesDiscovery(q: DiscoveryQuery, record: { entry: string | null; exit: string; strategyId?: string | null; fields?: ReviewFields | null }, timezone: string) {
  const { fields } = record;
  return (!q.strategy || (q.strategy === "unassigned" ? !record.strategyId : record.strategyId === q.strategy)) &&
    (!q.confirmation || !!fields?.confirmations?.includes(q.confirmation)) &&
    (!q.emotion || !!fields?.emotions[q.emotionStage].includes(q.emotion)) &&
    (!q.adherence || fields?.adherence === q.adherence) &&
    (q.hour === undefined || entryHour(record.entry, timezone) === q.hour) &&
    (q.weekday === undefined || localWeekday(record.exit, timezone) === q.weekday) &&
    (!q.holding || (!!record.entry && durationBucket(String((Date.parse(record.exit) - Date.parse(record.entry)) / 1000)) === q.holding));
}
