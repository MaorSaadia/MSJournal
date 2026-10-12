import { z } from "zod";
import { sourceTimezone, parseSourceTime } from "@/lib/imports/time";
import { D } from "@/lib/journal/processing";
export const optionalMoney = z
  .string()
  .trim()
  .regex(/^$|^-?\d{1,16}(?:\.\d{1,2})?$/)
  .transform((v) => (v === "" ? null : new D(v).toFixed()));
const nonnegative = optionalMoney.refine(
  (v) => v === null || new D(v).gte(0),
  "Use zero or a positive amount.",
);
const optionalCount = z
  .string()
  .regex(/^$|^\d{1,5}$/)
  .transform((v) => (v === "" ? null : Number(v)));
export const rulesSchema = z
  .object({
    basis: z.enum(["gross", "net"]),
    profitTarget: nonnegative,
    minimumDays: optionalCount,
    qualification: z.enum(["activity", "pnl"]),
    dayThreshold: optionalMoney,
    dailyLoss: nonnegative,
    drawdownMode: z.enum([
      "Static",
      "End-of-day trailing",
      "Intraday trailing",
    ]),
    staticFloor: optionalMoney,
    trailingDistance: nonnegative,
    floorCap: optionalMoney,
    startingHighWater: optionalMoney,
    maximumContracts: optionalCount,
    consistencyPercent: z
      .string()
      .regex(/^$|^\d{1,3}(?:\.\d{1,2})?$/)
      .transform((v) => (v === "" ? null : v))
      .refine((v) => v === null || new D(v).lte(100), "Use 0–100%."),
    consistencyComparison: z.enum(["strict", "inclusive"]),
    timezone: sourceTimezone,
    resetTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    dayLabel: z.enum(["start", "end"]),
    daySettingsConfirmed: z.boolean(),
    notes: z.string().trim().max(2000),
    sourceUrl: z
      .string()
      .trim()
      .max(1000)
      .refine(
        (v) => !v || (/^https?:\/\//i.test(v) && URL.canParse(v)),
        "Use an HTTP(S) source URL.",
      ),
  })
  .strict()
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    if (v.qualification === "pnl" && v.dayThreshold === null)
      issue(
        "dayThreshold",
        "Set the qualifying-day P&L threshold, including zero if intended.",
      );
    if (
      v.drawdownMode === "End-of-day trailing" &&
      v.trailingDistance !== null &&
      v.startingHighWater === null
    )
      issue(
        "startingHighWater",
        "Enter the starting high-water mark as of this rule version.",
      );
  });
export type PropRules = z.output<typeof rulesSchema>;
export type RuleInput = z.input<typeof rulesSchema>;
export const emptyRules: RuleInput = {
  basis: "gross",
  profitTarget: "",
  minimumDays: "",
  qualification: "activity",
  dayThreshold: "",
  dailyLoss: "",
  drawdownMode: "Static",
  staticFloor: "",
  trailingDistance: "",
  floorCap: "",
  startingHighWater: "",
  maximumContracts: "",
  consistencyPercent: "",
  consistencyComparison: "inclusive",
  timezone: "America/New_York",
  resetTime: "17:00",
  dayLabel: "end",
  daySettingsConfirmed: false,
  notes: "",
  sourceUrl: "",
};
export const localTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
export function localInstant(value: string, timezone: string) {
  const [date, time] = value.split("T"),
    [year, month, day] = date.split("-");
  return parseSourceTime(`${month}/${day}/${year} ${time}:00`, timezone);
}
export const propMutation = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("baseline"),
      accountId: z.uuid(),
      phaseId: z.uuid(),
      baseline: optionalMoney,
      historyConfirmed: z.boolean(),
      note: z.string().trim().max(1000),
    })
    .strict(),
  z
    .object({
      action: z.literal("phase"),
      accountId: z.uuid(),
      previousId: z.uuid().nullable(),
      kind: z.enum(["Evaluation", "Funded"]),
      label: z.string().trim().min(1).max(100),
      startLocal: localTime,
      baseline: optionalMoney,
      historyConfirmed: z.boolean(),
      note: z.string().trim().max(1000),
    })
    .strict(),
  z
    .object({
      action: z.literal("rules"),
      accountId: z.uuid(),
      phaseId: z.uuid(),
      effectiveLocal: localTime,
      rules: rulesSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("copy"),
      accountId: z.uuid(),
      phaseId: z.uuid(),
      sourceRuleId: z.uuid(),
      effectiveLocal: localTime,
      confirmCopy: z.literal(true),
    })
    .strict(),
  z
    .object({
      action: z.literal("snapshot"),
      accountId: z.uuid(),
      phaseId: z.uuid(),
      asOfLocal: localTime,
      balance: optionalMoney.refine(
        (v) => v !== null,
        "An observed balance is required.",
      ),
      threshold: optionalMoney,
      qualifyingDays: optionalCount,
      note: z.string().trim().max(1000),
    })
    .strict(),
  z
    .object({
      action: z.literal("status"),
      accountId: z.uuid(),
      phaseId: z.uuid(),
      status: z.enum(["Active", "Passed", "Failed", "Paused", "Closed"]),
      atLocal: localTime,
      note: z.string().trim().max(1000),
    })
    .strict(),
]);
