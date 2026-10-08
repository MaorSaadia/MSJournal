import { z } from "zod";
export const FIRMS = [
  "Apex Trader Funding",
  "MyFundedFutures",
  "Lucid Trading",
  "Take Profit Trader",
] as const;
export const STAGES = ["Evaluation", "Funded", "Personal"] as const;
export const STATUSES = ["Active", "Passed", "Failed", "Closed"] as const;
export function validTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}
export const timezoneSchema = z
  .string()
  .trim()
  .min(1, "Timezone is required.")
  .max(80)
  .refine(
    validTimezone,
    "Use a valid IANA timezone, such as Asia/Jerusalem or America/New_York.",
  );
export function exactDecimal(value: string) {
  const negative = value.startsWith("-"),
    [whole, fraction = ""] = value.replace(/^-/, "").split(".");
  const normalized = `${whole.replace(/^0+(?=\d)/, "")}.${fraction.padEnd(2, "0")}`;
  return negative && /[1-9]/.test(normalized) ? `-${normalized}` : normalized;
}
const money = z
  .string()
  .trim()
  .regex(
    /^\d{1,16}(\.\d{1,2})?$/,
    "Enter a decimal amount with up to 2 decimal places (no commas).",
  );
const openingMoney = z
  .string()
  .trim()
  .refine(
    (v) => !v || /^-?\d{1,16}(\.\d{1,2})?$/.test(v),
    "Enter a decimal amount with up to 2 decimal places (no commas).",
  );
function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export const tradingAccountSchema = z
  .object({
    displayName: z.string().trim().min(1, "Display name is required.").max(100),
    firmChoice: z.enum([...FIRMS, "Other", ""]),
    customFirm: z.string().trim().max(100),
    platform: z.literal("Tradovate"),
    brokerIdentifier: z.string().trim().max(160),
    stage: z.enum(STAGES),
    status: z.enum(STATUSES),
    nominalSize: money.refine(
      (v) => /[1-9]/.test(v),
      "Nominal size must be greater than zero.",
    ),
    openingBalance: openingMoney,
    openingBalanceDate: z
      .string()
      .refine((v) => !v || validDate(v), "Enter a valid effective date."),
    currency: z.literal("USD"),
    reportingTimezone: timezoneSchema,
    notes: z.string().trim().max(2000),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.stage !== "Personal" && !data.firmChoice)
      ctx.addIssue({
        code: "custom",
        path: ["firmChoice"],
        message: "Choose a prop firm.",
      });
    if (
      data.stage !== "Personal" &&
      data.firmChoice === "Other" &&
      !data.customFirm
    )
      ctx.addIssue({
        code: "custom",
        path: ["customFirm"],
        message: "Enter the custom firm name.",
      });
    if (data.openingBalance && !data.openingBalanceDate)
      ctx.addIssue({
        code: "custom",
        path: ["openingBalanceDate"],
        message: "An opening balance requires an effective date.",
      });
    if (!data.openingBalance && data.openingBalanceDate)
      ctx.addIssue({
        code: "custom",
        path: ["openingBalance"],
        message: "Enter an opening balance or clear the effective date.",
      });
  });
export type AccountFormValues = z.infer<typeof tradingAccountSchema>;
export function accountValues(input: AccountFormValues) {
  return {
    displayName: input.displayName,
    firm:
      input.stage === "Personal"
        ? null
        : input.firmChoice === "Other"
          ? input.customFirm
          : input.firmChoice,
    platform: input.platform,
    brokerIdentifier: input.brokerIdentifier || null,
    stage: input.stage,
    status: input.status,
    nominalSize: exactDecimal(input.nominalSize),
    openingBalance: input.openingBalance
      ? exactDecimal(input.openingBalance)
      : null,
    openingBalanceDate: input.openingBalanceDate || null,
    currency: input.currency,
    reportingTimezone: input.reportingTimezone,
    notes: input.notes || null,
  };
}
export const preferencesSchema = z
  .object({
    displayName: z.string().trim().min(1, "Display name is required.").max(100),
    displayTimezone: timezoneSchema,
    currency: z.literal("USD"),
    weekStartsOn: z.union([z.literal(0), z.literal(1)]).optional(),
  })
  .strict();
