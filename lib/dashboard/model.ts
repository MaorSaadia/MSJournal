import { z } from "zod";
import { reportSchema } from "@/lib/reports/model";
export const dashboardSchema = z
  .object({
    start: z.string(),
    end: z.string(),
    accounts: z.string().max(8000).optional(),
    archived: z.enum(["0", "1"]).default("0"),
    basis: z.enum(["gross", "net"]).default("gross"),
    outcomeBasis: z.enum(["portions", "complete"]).default("portions"),
    symbol: z.string().max(80).optional(),
    direction: z.enum(["all", "long", "short", "unknown"]).default("all"),
  })
  .strict()
  .refine(
    (q) => reportSchema.safeParse({ start: q.start, end: q.end }).success,
    "Choose valid local dates and a range of at most 10 years.",
  );
