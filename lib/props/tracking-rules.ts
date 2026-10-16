import { z } from "zod";
import { sourceTimezone } from "@/lib/imports/time";

export const exactAmount = z.string().regex(/^-?\d{1,16}(?:\.\d{1,8})?$/);
const money = exactAmount.nullable().default(null);
const count = z.number().int().min(0).max(100000).nullable().default(null);
const utc = z.iso.datetime().transform((v) => new Date(v).toISOString());
const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/);
export const eventKind = z.enum(["requested", "approved", "deducted", "paid"]);
export const trackingRulesSchema = z
  .object({
    firm: z.enum([
      "Apex",
      "MyFundedFutures",
      "Lucid",
      "Take Profit Trader",
      "Custom",
    ]),
    product: z.string().trim().min(1).max(120),
    stage: z.enum(["Evaluation", "Sim Funded", "Live"]),
    size: exactAmount.refine(
      (v) => Number(v) > 0,
      "Use a positive nominal size.",
    ),
    ledgerStart: money,
    platform: z.string().max(80),
    options: z.array(z.string().max(120)).max(12).default([]),
    preset: z
      .object({
        id: z.string().max(160),
        version: z.string().max(100),
        verifiedOn: z.string().nullable(),
        effectiveDate: z.string().nullable(),
        sources: z
          .array(
            z
              .url()
              .refine(
                (v) => new URL(v).protocol === "https:",
                "Use HTTPS source links.",
              ),
          )
          .max(20),
        gaps: z.array(z.string().max(400)).max(30),
        customized: z.boolean(),
      })
      .nullable()
      .default(null),
    session: z.object({
      timezone: sourceTimezone,
      reset: clock,
      close: clock,
      confirmed: z.boolean(),
    }),
    drawdown: z.object({
      mode: z.enum(["Static", "End-of-day trailing", "Intraday trailing"]),
      distance: money,
      initialThreshold: money,
      highWater: money,
      basis: z.enum(["balance", "equity"]),
      breachBasis: z.enum(["balance", "equity"]),
      comparison: z.enum(["touch", "below"]),
      cap: money,
      locked: z.boolean(),
      activation: z.enum(["immediate", "nextSession"]),
      lockTrigger: z.enum(["cap", "payout", "manual"]),
      allowCorrection: z.boolean().default(false),
      payoutEvent: eventKind.nullable().default(null),
      payoutThreshold: money,
    }),
    daily: z.object({
      mode: z.enum(["disabled", "fixed", "tiers"]),
      amount: money,
      basis: z.enum(["balance", "equity"]),
      effect: z.enum(["pause", "breach"]),
      comparison: z.enum(["touch", "below"]),
      reference: z.literal("sessionStart"),
    }),
    positions: z.object({
      minis: count,
      micros: count,
      microPerMini: z.number().int().min(1).max(1000),
      equivalences: z
        .record(z.string().max(20), z.number().positive().max(1000))
        .default({}),
      activation: z.enum(["immediate", "nextSession"]),
      tiers: z
        .array(
          z.object({
            profit: exactAmount,
            minis: z.number().int().min(0),
            micros: z.number().int().min(0),
            dailyLoss: money,
          }),
        )
        .max(20),
    }),
    evaluation: z.object({
      target: money,
      tradingDays: count,
      expiry: utc.nullable(),
      activationDays: count,
    }),
    consistency: z.object({
      percent: money.refine(
        (v) => v === null || (Number(v) > 0 && Number(v) <= 100),
      ),
      comparison: z.enum(["strict", "inclusive"]),
      denominator: z.enum(["netProfit", "positiveDays"]),
      period: z.enum(["phase", "cycle"]),
      rounding: z.enum(["exact", "floor", "halfUp"]),
      digits: z.number().int().min(0).max(8),
    }),
    payout: z.object({
      enabled: z.boolean(),
      verified: z.boolean(),
      minimum: money,
      caps: z.array(exactAmount).max(50),
      maxPayouts: count,
      minimumBalanceToSubmit: money,
      minimumBalanceAfter: money,
      protectedBuffer: money,
      profitPercent: money.refine(
        (v) => v === null || (Number(v) >= 0 && Number(v) <= 100),
      ),
      percentBasis: z.enum(["cycleProfit", "ledgerProfit"]),
      split: exactAmount.refine((v) => Number(v) >= 0 && Number(v) <= 100),
      requiredDays: count,
      dailyProfit: money,
      minimumCycleProfit: money,
      dailyProfitCap: money,
      waitHours: count,
      waitFrom: z.enum(["firstTrade", "cycleStart", "lastPaid"]),
      resetEvent: eventKind.nullable(),
    }),
    restrictions: z.array(z.string().max(500)).max(25),
    manualConfirmed: z.boolean(),
  })
  .strict()
  .superRefine((v, ctx) => {
    for (const [path, amount] of [
      ["drawdown.distance", v.drawdown.distance],
      ["daily.amount", v.daily.amount],
      ["evaluation.target", v.evaluation.target],
      ["payout.minimum", v.payout.minimum],
      ["payout.protectedBuffer", v.payout.protectedBuffer],
      ["payout.dailyProfit", v.payout.dailyProfit],
    ] as const) {
      if (amount !== null && Number(amount) < 0)
        ctx.addIssue({
          code: "custom",
          path: path.split("."),
          message: "Use zero or a positive amount.",
        });
    }
    if (
      v.drawdown.mode !== "Static" &&
      v.drawdown.distance !== null &&
      Number(v.drawdown.distance) <= 0
    )
      ctx.addIssue({
        code: "custom",
        path: ["drawdown", "distance"],
        message: "Trailing distance must be positive.",
      });
    if (v.daily.mode === "fixed" && v.daily.amount === null)
      ctx.addIssue({
        code: "custom",
        path: ["daily", "amount"],
        message: "Enter the fixed daily loss amount.",
      });
    if (v.daily.mode === "tiers" && !v.positions.tiers.length)
      ctx.addIssue({
        code: "custom",
        path: ["positions", "tiers"],
        message: "Define daily loss tiers explicitly.",
      });
  });
export type TrackingRules = z.infer<typeof trackingRulesSchema>;
export function customTrackingRules(): TrackingRules {
  return trackingRulesSchema.parse({
    firm: "Custom",
    product: "Custom rules",
    stage: "Evaluation",
    size: "50000",
    platform: "Tradovate",
    session: {
      timezone: "America/New_York",
      reset: "18:00",
      close: "17:00",
      confirmed: false,
    },
    drawdown: {
      mode: "Static",
      basis: "balance",
      breachBasis: "equity",
      comparison: "touch",
      locked: false,
      activation: "nextSession",
      lockTrigger: "cap",
    },
    daily: {
      mode: "disabled",
      basis: "equity",
      effect: "pause",
      comparison: "touch",
      reference: "sessionStart",
    },
    positions: { microPerMini: 10, activation: "nextSession", tiers: [] },
    evaluation: { expiry: null },
    consistency: {
      comparison: "inclusive",
      denominator: "netProfit",
      period: "phase",
      rounding: "exact",
      digits: 2,
    },
    payout: {
      enabled: false,
      verified: false,
      caps: [],
      split: "100",
      percentBasis: "cycleProfit",
      waitFrom: "cycleStart",
      resetEvent: null,
    },
    restrictions: [],
    manualConfirmed: false,
  });
}

// These opening values are facts supplied at a dated dashboard cutoff, never deposits.
export const snapshotDetailsSchema = z
  .object({
    highWater: money,
    locked: z.boolean().default(false),
    thresholdCorrection: z.boolean().default(false),
    cycleNumber: z.number().int().min(1).max(10000).default(1),
    payoutNumber: z.number().int().min(1).max(10000).nullable().default(null),
    cycleStartedAt: utc.nullable().default(null),
    phaseProfit: money,
    cycleProfit: money,
    bestDay: money,
    tradingDays: count,
    qualifyingDays: count,
    openingConfirmed: z.boolean().default(false),
    coverageThrough: utc.nullable().default(null),
    daily: z
      .array(
        z.object({
          date: z.iso.date(),
          profit: exactAmount,
          qualifying: z.boolean(),
        }),
      )
      .max(1000)
      .default([]),
  })
  .strict();
export type SnapshotDetails = z.infer<typeof snapshotDetailsSchema>;

export const payoutFieldsSchema = z
  .object({
    status: z.enum(["Requested", "Approved", "Paid", "Denied", "Cancelled"]),
    requestedAmount: z
      .string()
      .regex(/^\d{1,16}(?:\.\d{1,2})?$/)
      .refine((v) => Number(v) > 0),
    requestedAt: utc,
    approvedAmount: money,
    approvedAt: utc.nullable(),
    deductionAmount: money,
    deductedAt: utc.nullable(),
    receiptAmount: money,
    paidAt: utc.nullable(),
    note: z.string().trim().max(1000),
  })
  .strict()
  .superRefine((v, ctx) => {
    for (const [amount, at] of [
      ["approvedAmount", "approvedAt"],
      ["deductionAmount", "deductedAt"],
      ["receiptAmount", "paidAt"],
    ] as const) {
      if (
        (v[amount] === null) !== (v[at] === null) ||
        (v[amount] !== null &&
          (Number(v[amount]) < 0 || !/^\d+(?:\.\d{1,2})?$/.test(v[amount]!)))
      )
        ctx.addIssue({
          code: "custom",
          message:
            "Enter a nonnegative amount (at most 2 decimals) and its timestamp together.",
          path: [amount],
        });
      if (v[at] && v[at]! < v.requestedAt)
        ctx.addIssue({
          code: "custom",
          message: "An event cannot precede the request.",
          path: [at],
        });
    }
    if ((v.status === "Approved" || v.status === "Paid") && !v.approvedAt)
      ctx.addIssue({
        code: "custom",
        message: "Record approval separately.",
        path: ["approvedAt"],
      });
    if (v.status === "Paid" && !v.paidAt)
      ctx.addIssue({
        code: "custom",
        message: "Record the receipt and payment timestamp.",
        path: ["paidAt"],
      });
  });
export type PayoutFields = z.infer<typeof payoutFieldsSchema>;
export type Payout = PayoutFields & {
  deductionId?: string | null;
  id: string;
  phaseId: string;
  revision: number;
};
