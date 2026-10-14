import { z } from "zod";
import { daySchema } from "@/lib/calendar/model";
import { D, allocateManual, sum } from "@/lib/journal/processing";
export const feeAmount = z
  .string()
  .trim()
  .regex(
    /^\d{1,12}(?:\.\d{1,8})?$/,
    "Enter a nonnegative fee total, with at most 8 decimal places.",
  );
export const feeScopeSchema = z
  .object({
    accountId: z.uuid(),
    start: daySchema,
    end: daySchema,
    id: z.uuid().optional(),
  })
  .strict()
  .refine((v) => v.start <= v.end, "Start must precede end.");
export const saveFeeTotalSchema = z
  .object({
    scope: feeScopeSchema,
    total: feeAmount,
    note: z.string().trim().max(500),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    replace: z.boolean(),
    confirmed: z.literal(true),
  })
  .strict();
export type FeePart = {
  id: string;
  quantity: string;
  grossPnl: string;
  boughtAt: string;
  soldAt: string;
};
export function allocateFeeTotal(total: string, parts: FeePart[]) {
  feeAmount.parse(total);
  if (!parts.length || new Set(parts.map((p) => p.id)).size !== parts.length)
    throw new Error("Choose a nonempty, unique set of source records.");
  const allocations = allocateManual(total, parts).map((p) => ({
    ...p,
    kind: "Allocated" as const,
  }));
  const gross = sum(parts.map((p) => p.grossPnl));
  return { allocations, gross, net: new D(gross).minus(total).toFixed() };
}
export type FeeQuote = {
  count: number;
  gross: string;
  total: string;
  net: string;
  start: string;
  end: string;
  timezone: string;
  fingerprint: string;
  existingTotals: number;
  manualRecords: number;
  replaceRequired: boolean;
  unchanged: boolean;
};
