import { D } from "@/lib/journal/processing";
import { customTrackingRules, type TrackingRules } from "./tracking-rules";
import { emptyRules, type RuleInput } from "./validation";
import { expandTptPresets } from "./tpt-presets";
import { expandPresets } from "./preset-expansion";
export const VERIFIED_ON = "2026-10-16";
const apex = "https://apextraderfunding.com/help-center/";
const mff = "https://help.myfundedfutures.com/en/articles/";
const lucid = "https://support.lucidtrading.com/en/articles/";
const tpt = "https://takeprofittraderhelp.zendesk.com/hc/en-us/articles/";
export type PropPreset = {
  id: string;
  label: string;
  rules: TrackingRules;
  ledger: string | null;
  legacy: boolean;
};
export const propPresets: PropPreset[] = [];
function add(
  id: string,
  firm: TrackingRules["firm"],
  product: string,
  stage: TrackingRules["stage"],
  size: string,
  ledger: string | null,
  sources: string[],
  configure: (r: TrackingRules) => void,
  gaps: string[] = [],
  legacy = false,
) {
  const rules = customTrackingRules();
  Object.assign(rules, { firm, product, stage, size });
  rules.ledgerStart = ledger;
  rules.platform = firm === "Apex" ? "Tradovate" : "Unknown";
  rules.drawdown.initialThreshold =
    ledger === null ? null : new D(ledger).minus("2000").toFixed();
  rules.drawdown.highWater = ledger;
  rules.preset = {
    id,
    version: `observed-${VERIFIED_ON}-setup2`,
    verifiedOn: VERIFIED_ON,
    effectiveDate: null,
    sources,
    platforms: firm === "Apex" ? ["Tradovate"] : [],
    customized: false,
    gaps: [
      "Confirm the exact session cutoff and restrictions in your account agreement.",
      ...gaps,
    ],
  };
  rules.restrictions = [
    "Position concurrency, news restrictions, overnight holdings and prohibited trading require manual verification. A CSV does not certify compliance.",
  ];
  configure(rules);
  rules.consistency.status =
    rules.consistency.percent !== null
      ? "enabled"
      : (firm === "Apex" &&
            stage === "Evaluation" &&
            ["EOD", "Intraday"].includes(product)) ||
          firm === "MyFundedFutures" ||
          (firm === "Lucid" &&
            stage === "Sim Funded" &&
            ["Flex", "Daily"].includes(product))
        ? "disabled"
        : "unknown";
  propPresets.push({
    id,
    label: `${product} · ${stage} · ${Number(size) / 1000}K${legacy ? " · Legacy" : ""}`,
    rules,
    ledger,
    legacy,
  });
}
for (const mode of ["EOD", "Intraday"] as const)
  for (const stage of ["Evaluation", "Sim Funded"] as const) {
    add(
      `apex-${mode.toLowerCase()}-50-${stage === "Evaluation" ? "eval" : "pa"}`,
      "Apex",
      mode,
      stage,
      "50000",
      "50000",
      [
        apex +
          (mode === "EOD"
            ? "eod-trailing-drawdown-accounts/eod-evaluations/"
            : "evaluation-accounts-ea/intraday-trailing-drawdown-evaluations/"),
        apex + "eod-trailing-drawdown-accounts/eod-drawdown-explained/",
        apex + "additional-helpful-items/daily-loss-limit-explained/",
        apex +
          (mode === "EOD"
            ? "eod-trailing-drawdown-accounts/eod-payouts/"
            : "uncategorized/intraday-trailing-drawdown-payouts/"),
      ],
      (r) => {
        r.session.close = "16:59:59";
        r.drawdown.mode =
          mode === "EOD" ? "End-of-day trailing" : "Intraday trailing";
        r.drawdown.distance = "2000";
        r.drawdown.basis = mode === "EOD" ? "balance" : "equity";
        r.evaluation.target = stage === "Evaluation" ? "3000" : null;
        r.evaluation.tradingDays = stage === "Evaluation" ? 0 : null;
        r.evaluation.activationDays = 7;
        r.positions.minis = stage === "Evaluation" ? 6 : 4;
        r.positions.micros = r.positions.minis * 10;
        if (stage === "Evaluation") {
          r.daily.mode = mode === "EOD" ? "fixed" : "disabled";
          r.daily.amount = mode === "EOD" ? "1000" : null;
        } else {
          r.drawdown.cap = "50100";
          r.daily.mode = "tiers";
          r.positions.tiers = [
            ["0", 2, "1000"],
            ["1500", 3, "1000"],
            ["3000", 4, "2000"],
            ["6000", 4, "3000"],
          ].map(([profit, minis, dailyLoss]) => ({
            profit: String(profit),
            minis: Number(minis),
            micros: Number(minis) * 10,
            dailyLoss: String(dailyLoss),
          }));
          r.consistency.percent = "50";
          r.consistency.comparison = "strict";
          r.consistency.period = "cycle";
          Object.assign(r.payout, {
            enabled: true,
            verified: true,
            minimum: "500",
            requiredDays: 5,
            dailyProfit: mode === "EOD" ? "250" : "200",
            minimumBalanceToSubmit: "52600",
            minimumBalanceAfter: "52100",
            split: "100",
            maxPayouts: 6,
            resetEvent: "approved",
            caps:
              mode === "EOD"
                ? ["1500", "1500", "2000", "2500", "2500", "3000"]
                : ["1500", "2000", "2500", "2500", "3000", "3000"],
          });
          r.restrictions.push(
            "PA inactivity: two net-$50 days in each rolling 30-day period; review manually.",
          );
        }
      },
      [
        "Tradovate evaluation trailing is uncapped; other platforms need a separate custom cap.",
        "Evaluation access expires 30 days from purchase; enter the actual expiry date.",
      ],
    );
  }
for (const [product, size, distance] of [
  ["Legacy Full", "50000", "2500"],
  ["Legacy Static", "100000", "625"],
])
  for (const stage of ["Evaluation", "Sim Funded"] as const) {
    add(
      `apex-${product.replaceAll(" ", "-").toLowerCase()}-${stage}`,
      "Apex",
      product,
      stage,
      size,
      size,
      [
        apex + "evaluation-accounts-ea/legacy-evaluation-rules/",
        apex + "legacy-payouts/legacy-performance-account-pa-trading-rules/",
      ],
      (r) => {
        r.drawdown.mode =
          product === "Legacy Static" ? "Static" : "Intraday trailing";
        r.drawdown.distance = distance;
        r.drawdown.initialThreshold = new D(size).minus(distance).toFixed();
        r.drawdown.basis = product === "Legacy Full" ? "equity" : "balance";
        if (stage === "Sim Funded" && product === "Legacy Full")
          r.drawdown.cap = new D(size).plus(100).toFixed();
        r.positions.minis = product === "Legacy Static" ? 2 : 10;
        r.positions.micros = r.positions.minis * 10;
        r.payout.enabled = stage !== "Evaluation";
      },
      [
        "Legacy purchase/promotional versions, passing days, payout schedule, safety-net exceptions and conduct rules require the actual agreement. Do not use new-product rules.",
      ],
      true,
    );
  }
for (const [serial, size, distance, target, micros] of [
  ["001", "10000", "500", "1000", 10],
  ["002", "20000", "1000", "2000", 20],
  ["003", "5000", "250", "500", 5],
] as const)
  for (const stage of ["Evaluation", "Sim Funded"] as const) {
    const ledger = stage === "Evaluation" ? size : "0";
    add(
      `mff-studio-${serial}-${stage}`,
      "MyFundedFutures",
      `Studio #${serial}`,
      stage,
      size,
      ledger,
      [mff + "17589665-studio-plans-a-comprehensive-guide"],
      (r) => {
        r.drawdown.initialThreshold = new D(ledger).minus(distance).toFixed();
        r.drawdown.mode = "Static";
        r.drawdown.distance = distance;
        r.positions.minis = 0;
        r.positions.micros = micros;
        r.evaluation.target = stage === "Evaluation" ? target : null;
        r.evaluation.tradingDays = 0;
        Object.assign(r.payout, {
          enabled: stage !== "Evaluation",
          minimum: serial === "003" ? "100" : "250",
          split: "80",
          requiredDays: 0,
          dailyProfit: "0",
          minimumBalanceAfter: "0",
          dailyProfitCap:
            serial === "001" ? "5000" : serial === "002" ? "10000" : "2500",
        });
        if (serial === "003") r.preset!.effectiveDate = "2026-10-14";
        r.restrictions.push(
          "Seven-calendar-day inactivity policy. Stop trading after requesting until deduction is confirmed. Daily profit above the cap is forfeited; confirm adjustments.",
        );
      },
      [
        "The precise cycle-reset event and session cutoff are not specified in the Studio article; confirm them explicitly.",
      ],
    );
  }
const mffProducts = [
  ["Rapid Intraday", "13134709-rapid-plan-50k-a-comprehensive-look"],
  ["Rapid EOD", "16158363-rapid-eod-50k-a-comprehensive-look"],
  ["Builder", "14290805-builder-plan-50k-a-comprehensive-guide"],
  ["Builder Add-On", "14290805-builder-plan-50k-a-comprehensive-guide"],
  ["Pro", "17573707-comprehensive-look-into-redesigned-pro-plan"],
  ["Pro One-Day", "12879226-pro-plan-1day-addon"],
  ["Flex", "15072271-flex-plan-50-000-a-comprehensive-guide"],
  ["Flex Legacy", "13521620-flex-plan-the-path-forward-legacy"],
];
for (const [product, source] of mffProducts)
  for (const stage of ["Evaluation", "Sim Funded"] as const) {
    const funded = stage !== "Evaluation",
      distance = product === "Builder Add-On" ? "1500" : "2000";
    add(
      `mff-${product.toLowerCase().replaceAll(" ", "-")}-${stage}`,
      "MyFundedFutures",
      product,
      stage,
      "50000",
      funded ? "0" : "50000",
      [
        mff + source,
        mff +
          "13745661-payout-policy-overview-best-and-fastest-prop-firm-payouts",
      ],
      (r) => {
        r.drawdown.mode =
          funded && product === "Rapid Intraday"
            ? "Intraday trailing"
            : "End-of-day trailing";
        r.drawdown.distance = distance;
        r.drawdown.initialThreshold = new D(funded ? 0 : 50000)
          .minus(distance)
          .toFixed();
        r.drawdown.highWater = funded ? "0" : "50000";
        if (funded && product.startsWith("Rapid")) r.drawdown.cap = "100";
        if (funded && !product.startsWith("Rapid")) {
          r.drawdown.payoutThreshold = "100";
        }
        r.evaluation.target = funded
          ? null
          : product === "Pro One-Day"
            ? "4000"
            : "3000";
        r.evaluation.tradingDays = product.startsWith("Rapid")
          ? 4
          : product.startsWith("Builder") || product === "Pro One-Day"
            ? 1
            : 2;
        if (funded) r.evaluation.tradingDays = null;
        r.consistency.percent = funded
          ? product.startsWith("Builder")
            ? "50"
            : null
          : product.startsWith("Rapid")
            ? "30"
            : product.startsWith("Builder") || product === "Pro One-Day"
              ? null
              : "50";
        r.consistency.period = funded ? "cycle" : "phase";
        r.positions.minis = product.startsWith("Builder")
          ? 4
          : product === "Flex Legacy"
            ? 5
            : 3;
        r.positions.micros = r.positions.minis * 10;
        if (funded && product === "Rapid Intraday") {
          r.positions.minis = 5;
          r.positions.micros = 50;
        }
        if (product.startsWith("Pro")) {
          r.positions.minis = 3;
          r.positions.micros = funded ? null : 30;
          if (funded) {
            // The redesigned article does not establish a Sim ledger start;
            // its post-payout floor conflicts with zero-based older plans.
            r.ledgerStart = null;
            r.drawdown.initialThreshold = null;
            r.drawdown.highWater = null;
            r.drawdown.payoutThreshold = null;
          }
        }
        if (product.startsWith("Builder")) {
          r.daily.mode = "fixed";
          r.daily.amount = "1000";
        }
        Object.assign(r.payout, {
          enabled: funded,
          minimum:
            product === "Flex Legacy"
              ? "250"
              : product.startsWith("Pro")
                ? "1000"
                : "500",
          split: product.startsWith("Rapid") ? "90" : "80",
          waitHours: product.startsWith("Pro")
            ? 336
            : product.startsWith("Builder")
              ? 48
              : product.startsWith("Rapid")
                ? 24
                : null,
          waitFrom: "firstTrade",
        });
        if (funded && product.startsWith("Flex")) {
          Object.assign(r.payout, {
            requiredDays: 5,
            dailyProfit: "150",
            minimumCycleProfit: "500",
            profitPercent: "50",
            percentBasis: "ledgerProfit",
            caps: [product === "Flex Legacy" ? "5000" : "2000"],
            maxPayouts: product === "Flex" ? 5 : null,
          });
          const minis = product === "Flex Legacy" ? [2, 3, 5] : [1, 2, 3];
          r.positions.tiers = ["0", "1500", "2000"].map((profit, i) => ({
            profit,
            minis: minis[i],
            micros: minis[i] * 10,
            dailyLoss: null,
          }));
        }
        r.restrictions.push(
          "Review product-specific news, seven-day inactivity, scaling, buffer retention and first-payout exceptions against your agreement.",
        );
      },
      [
        "Account-specific cycle reset, buffer retention, denominator/rounding, scaling activation and payout-trigger event need confirmation. Redesigned Pro Sim starting balance/threshold and its inconsistent mini/micro table require manual confirmation; older versions remain separate.",
      ],
      product === "Flex Legacy",
    );
  }
for (const product of [
  "Pro",
  "Flex",
  "Daily",
  "Direct",
  "Black Legacy",
] as const)
  for (const stage of (product === "Direct"
    ? ["Sim Funded"]
    : ["Evaluation", "Sim Funded"]) as ("Evaluation" | "Sim Funded")[]) {
    const funded = stage !== "Evaluation",
      flex = product === "Flex",
      direct = product === "Direct",
      daily = product === "Daily";
    const source = direct
      ? "12890148-luciddirect-funded-account"
      : flex
        ? "12945790-lucidflex-evaluation-account"
        : daily
          ? "15996664-luciddaily-evaluation"
          : product === "Pro"
            ? "12890029-lucidpro-evaluation-account"
            : "13424894-lucidblack-evaluation-account";
    add(
      `lucid-${product.toLowerCase().replaceAll(" ", "-")}-${stage}`,
      "Lucid",
      product,
      stage,
      "50000",
      "50000",
      [
        lucid + source,
        lucid +
          (flex
            ? "12945815-lucidflex-drawdown"
            : direct
              ? "12890192-luciddirect-drawdown"
              : daily
                ? "15998425-luciddaily-drawdown"
                : product === "Pro"
                  ? "12890136-lucidpro-drawdown"
                  : "13424906-lucidblack-drawdown"),
        ...(flex
          ? [
              lucid + "12945796-lucidflex-payouts",
              lucid + "12945808-lucidflex-scaling-plan",
            ]
          : []),
      ],
      (r) => {
        r.drawdown.mode =
          daily && funded ? "Intraday trailing" : "End-of-day trailing";
        r.drawdown.distance = "2000";
        r.drawdown.cap = "50100";
        r.evaluation.target = funded ? null : "3000";
        r.positions.minis = 4;
        r.positions.micros = 40;
        r.consistency.percent = funded
          ? product === "Pro" || product === "Black Legacy"
            ? "40"
            : direct
              ? "20"
              : null
          : flex || daily
            ? "50"
            : product === "Black Legacy"
              ? "60"
              : null;
        r.consistency.period = funded ? "cycle" : "phase";
        Object.assign(r.payout, {
          enabled: funded,
          minimum: "500",
          split: "90",
          resetEvent: "approved",
          maxPayouts: daily || product === "Black Legacy" ? null : 5,
        });
        if (funded && flex) {
          Object.assign(r.payout, {
            verified: true,
            requiredDays: 5,
            dailyProfit: "150",
            minimumCycleProfit: "0.01",
            profitPercent: "50",
            percentBasis: "ledgerProfit",
            caps: ["2000"],
          });
          r.drawdown.payoutEvent = "requested";
          r.drawdown.payoutThreshold = "50100";
          r.positions.tiers = [0, 1000, 2000].map((v, i) => ({
            profit: String(v),
            minis: i + 2,
            micros: (i + 2) * 10,
            dailyLoss: null,
          }));
        }
        if (product === "Pro") {
          r.daily.mode = "fixed";
          r.daily.amount = "1200";
          if (funded)
            Object.assign(r.payout, {
              minimumBalanceAfter: "52100",
              minimumBalanceToSubmit: "52600",
              minimumCycleProfit: "500",
              caps: ["2000", "2500"],
            });
        }
        r.restrictions.push(
          "Be flat by 16:45 Eastern (holiday exceptions). News and platform restrictions require manual review. Live transitions are discretionary.",
        );
      },
      [
        ...(flex && !funded
          ? [
              "Evaluation consistency includes an undocumented cushion; the exact acceptance/rounding requires manual confirmation.",
            ]
          : []),
        "Confirm session boundary, purchased DLL/drawdown option, and account-specific payout terms.",
      ],
      product === "Black Legacy",
    );
  }
for (const product of ["Test", "PRO", "PRO+"] as const) {
  const stage =
    product === "Test"
      ? "Evaluation"
      : product === "PRO+"
        ? "Live"
        : "Sim Funded";
  add(
    `tpt-${product.toLowerCase().replace("+", "plus")}-50`,
    "Take Profit Trader",
    product,
    stage,
    "50000",
    product === "PRO+" ? null : "50000",
    [
      tpt +
        "15170265979165-Rule-3-Do-Not-Hit-End-Of-Day-EOD-Maximum-Trailing-Drawdown",
      tpt + "15170316538013-Rule-5-Be-Consistent",
      tpt + "15171769361053-PRO-Account-Rules",
      tpt + "15172219527581-PRO-Account-Profit-Split-Withdrawal-Rules",
    ],
    (r) => {
      r.drawdown.mode =
        product === "PRO" ? "Intraday trailing" : "End-of-day trailing";
      r.drawdown.distance = "2000";
      r.drawdown.cap = "50000";
      r.positions.minis = 6;
      r.positions.micros = null;
      if (product === "Test") {
        r.evaluation.target = "3000";
        r.evaluation.tradingDays = 3;
        r.consistency.percent = "50";
        r.consistency.comparison = "strict";
      } else {
        r.payout.enabled = true;
        r.payout.split = product === "PRO" ? "80" : "90";
        r.payout.minimumBalanceAfter = product === "PRO" ? "52000" : null;
      }
      if (product === "PRO+") {
        r.drawdown.distance = null;
        r.drawdown.initialThreshold = null;
        r.drawdown.highWater = null;
        r.drawdown.cap = null;
        r.positions.minis = null;
      }
      r.restrictions.push(
        "PRO: one round-trip trading day per calendar week and prohibited-news flat windows; manual verification. PRO+ requires a firm invitation.",
      );
    },
    [
      "Confirm current minimum request, cycle event, mini/micro equivalence and platform/session details. PRO+ baseline and risk settings are agreement-specific; enter them manually.",
    ],
  );
}

expandPresets(propPresets);
expandTptPresets(propPresets);

export function toLegacyRules(r: TrackingRules): RuleInput {
  return {
    ...emptyRules,
    basis: "net",
    tracking: r,
    profitTarget: r.evaluation.target ?? "",
    minimumDays: r.evaluation.tradingDays?.toString() ?? "",
    drawdownMode: r.drawdown.mode,
    staticFloor: r.drawdown.initialThreshold ?? "",
    trailingDistance: r.drawdown.distance ?? "",
    floorCap: r.drawdown.cap ?? "",
    startingHighWater: r.drawdown.highWater ?? "",
    dailyLoss: r.daily.amount ?? "",
    maximumContracts: r.positions.minis?.toString() ?? "",
    consistencyPercent: r.consistency.percent ?? "",
    consistencyComparison: r.consistency.comparison,
    timezone: r.session.timezone,
    resetTime: r.session.reset.slice(0, 5),
    daySettingsConfirmed: r.session.confirmed,
    sourceUrl: r.preset?.sources[0] ?? "",
  };
}

export function normalizePreset(rules: TrackingRules) {
  if (!rules.preset) return rules;
  const registered = propPresets.find(
    (p) =>
      p.id === rules.preset!.id &&
      p.rules.preset!.version === rules.preset!.version,
  );
  if (!registered)
    return {
      ...rules,
      preset: {
        ...rules.preset,
        customized: true,
        verifiedOn: null,
        gaps: [
          "This historical preset revision is not in the verified catalog; confirm its saved rules manually.",
        ],
      },
    };
  const changed = Object.keys(registered.rules).some(
    (k) =>
      !["preset", "manualConfirmed"].includes(k) &&
      JSON.stringify(registered.rules[k as keyof TrackingRules]) !==
        JSON.stringify(rules[k as keyof TrackingRules]),
  );
  return {
    ...rules,
    preset: {
      ...registered.rules.preset!,
      customized: changed || rules.preset.customized,
    },
  };
}
