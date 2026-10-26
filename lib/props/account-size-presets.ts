import type { PropPreset } from "./presets";
import { customTrackingRules, type TrackingRules } from "./tracking-rules";

// Observation date only; firm purchase-effective dates are not inferred.
const checked = "2026-10-26";
const apex = "https://apextraderfunding.com/help-center/";
const lucid = "https://support.lucidtrading.com/en/articles/";
const mff = "https://help.myfundedfutures.com/en/articles/";

export function expandAccountSizes(registry: PropPreset[]) {
  function put(
    base: PropPreset,
    id: string,
    size: number,
    target: number | null,
    distance: number,
    minis: number,
    ledger: number | null,
    sources: string[],
    configure: (r: TrackingRules) => void = () => {},
  ) {
    const r = structuredClone(base.rules);
    r.size = String(size);
    r.ledgerStart = ledger === null ? null : String(ledger);
    r.evaluation.target =
      r.stage === "Evaluation" && target !== null ? String(target) : null;
    Object.assign(r.drawdown, {
      distance: String(distance),
      initialThreshold: ledger === null ? null : String(ledger - distance),
      highWater: ledger === null ? null : String(ledger),
    });
    Object.assign(r.positions, { minis, micros: minis * 10, tiers: [] });
    // Size-dependent 50K payout values must never leak into another size.
    if (size !== Number(base.rules.size))
      r.payout = {
        ...customTrackingRules().payout,
        enabled: r.stage !== "Evaluation",
        verified: false,
        split: r.payout.split,
      };
    r.preset = {
      ...r.preset!,
      id,
      version: `observed-${checked}-sizes`,
      verifiedOn: checked,
      effectiveDate: null,
      sources: [...new Set([...sources, ...base.rules.preset!.sources])],
      customized: false,
      gaps: [...base.rules.preset!.gaps],
    };
    configure(r);
    const preset: PropPreset = {
      id,
      rules: r,
      ledger: r.ledgerStart,
      legacy: base.legacy,
      label: `${r.product} / ${r.stage} / ${size / 1000}K`,
    };
    const index = registry.findIndex((p) => p.id === id);
    if (index < 0) registry.push(preset);
    else registry[index] = preset;
  }
  const sizes = [25000, 50000, 100000, 150000];
  const targets = [1500, 3000, 6000, 9000];
  const distances = [1000, 2000, 3000, 4000];
  const tiers = [
    [
      [0, 1, 500],
      [1000, 2, 500],
      [2000, 2, 1250],
    ],
    [
      [0, 2, 1000],
      [1500, 3, 1000],
      [3000, 4, 2000],
      [6000, 4, 3000],
    ],
    [
      [0, 3, 1750],
      [2000, 4, 1750],
      [3000, 5, 1750],
      [5000, 6, 2500],
      [10000, 6, 3500],
    ],
    [
      [0, 4, 2500],
      [2000, 5, 2500],
      [3000, 7, 2500],
      [5000, 10, 3000],
      [10000, 10, 4000],
    ],
  ];
  for (const mode of ["EOD", "Intraday"])
    for (const stage of ["Evaluation", "Sim Funded"]) {
      const evaluation = stage === "Evaluation";
      const base = registry.find(
        (p) =>
          p.id ===
          `apex-${mode.toLowerCase()}-50-${evaluation ? "eval" : "pa"}`,
      )!;
      sizes.forEach((size, i) => {
        const existing = registry.find(
          (p) =>
            p.rules.firm === "Apex" &&
            p.rules.product === mode &&
            p.rules.stage === stage &&
            p.rules.size === String(size),
        );
        put(
          base,
          existing?.id ??
            `apex-${mode.toLowerCase()}-${size}-${evaluation ? "eval" : "pa"}`,
          size,
          targets[i],
          distances[i],
          evaluation ? [4, 6, 8, 12][i] : [2, 4, 6, 10][i],
          size,
          [
            apex +
              "evaluation-accounts-ea/intraday-trailing-drawdown-evaluations/",
            apex +
              "intraday-trailing-drawdown-accounts/intraday-trailing-drawdown-explained/",
            apex + "additional-helpful-items/daily-loss-limit-explained/",
          ],
          (r) => {
            r.drawdown.cap = evaluation ? null : String(size + 100);
            r.drawdown.activation =
              mode === "EOD" ? "nextSession" : "immediate";
            r.drawdown.breachBasis = "equity";
            if (evaluation) {
              r.daily.mode = mode === "EOD" ? "fixed" : "disabled";
              r.daily.amount =
                mode === "EOD" ? String([500, 1000, 1500, 2000][i]) : null;
            } else {
              r.daily.mode = "tiers";
              r.daily.amount = null;
              r.positions.activation = "nextSession";
              r.positions.tiers = tiers[i].map(
                ([profit, minis, dailyLoss]) => ({
                  profit: String(profit),
                  minis,
                  micros: minis * 10,
                  dailyLoss: String(dailyLoss),
                }),
              );
              const caps =
                mode === "EOD"
                  ? [
                      [1000, 1000, 1000, 1000, 1000, 1000],
                      [1500, 1500, 2000, 2500, 2500, 3000],
                      [2000, 2500, 2500, 3000, 4000, 4000],
                      [2500, 3000, 3000, 3000, 4000, 5000],
                    ]
                  : [
                      [1000, 1000, 1000, 1000, 1000, 1000],
                      [1500, 2000, 2500, 2500, 3000, 3000],
                      [2000, 2500, 3000, 3000, 4000, 4000],
                      [2500, 3000, 3000, 4000, 4000, 5000],
                    ];
              Object.assign(r.payout, {
                enabled: true,
                verified: true,
                minimum: "500",
                requiredDays: 5,
                dailyProfit: String(
                  (mode === "EOD"
                    ? [100, 250, 300, 350]
                    : [100, 200, 250, 300])[i],
                ),
                minimumBalanceToSubmit: String(size + distances[i] + 600),
                minimumBalanceAfter: String(size + distances[i] + 100),
                split: "100",
                maxPayouts: 6,
                resetEvent: "approved",
                caps: caps[i].map(String),
              });
            }
          },
        );
      });
    }
  // Product tables, not a universal Lucid size/drawdown conversion.
  for (const product of ["Pro", "Flex", "Daily", "Direct", "Black Legacy"]) {
    for (const stage of product === "Direct"
      ? ["Sim Funded"]
      : ["Evaluation", "Sim Funded"]) {
      const base = registry.find(
        (p) =>
          p.rules.firm === "Lucid" &&
          p.rules.product === product &&
          p.rules.stage === stage,
      )!;
      sizes.forEach((size, i) => {
        if (product === "Black Legacy" && size === 150000) return;
        const evaluation = stage === "Evaluation";
        const dd =
          product === "Direct"
            ? [1000, 2000, 3500, 5000][i]
            : [1000, 2000, 3000, 4500][i];
        const existing = registry.find(
          (p) =>
            p.rules.firm === "Lucid" &&
            p.rules.product === product &&
            p.rules.stage === stage &&
            p.rules.size === String(size),
        );
        const slug = product.toLowerCase().replaceAll(" ", "-");
        put(
          base,
          existing?.id ?? `lucid-${slug}-${size}-${stage}`,
          size,
          [1250, 3000, 6000, 9000][i],
          dd,
          [2, 4, 6, 10][i],
          size,
          [
            lucid +
              (product === "Pro"
                ? "12890029-lucidpro-evaluation-account"
                : product === "Flex"
                  ? "12945790-lucidflex-evaluation-account"
                  : product === "Daily"
                    ? "15996664-luciddaily-evaluation"
                    : product === "Direct"
                      ? "12890148-luciddirect-funded-account"
                      : "13424894-lucidblack-evaluation-account"),
          ],
          (r) => {
            r.drawdown.cap = String(size + 100);
            r.payout.verified = false;
            if (product === "Pro" || product === "Direct") {
              const amount =
                product === "Direct"
                  ? [null, 1200, 2100, 3000][i]
                  : evaluation && i === 0
                    ? null
                    : [600, 1200, 1800, 2700][i];
              r.daily.mode = amount === null ? "disabled" : "fixed";
              r.daily.amount = amount === null ? null : String(amount);
              r.preset!.gaps.push(
                "Confirm purchased DLL option and funded scaling DLL; Pro 25K evaluation DLL differs between the account table and checkout.",
              );
            }
            if (product === "Flex" && evaluation) {
              r.consistency.percent = "40";
              r.consistency.status = "enabled";
              r.consistency.comparison = "inclusive";
              r.options = [
                "Standard 40% consistency / DLL off; customize purchased add-ons",
              ];
              r.preset!.sources.push(
                lucid + "16226050-lucidflex-customization",
              );
            }
            if (!evaluation) {
              Object.assign(r.payout, {
                minimum: "500",
                split: "90",
                resetEvent: "approved",
              });
              r.preset!.gaps.push(
                "Review size-specific payout terms and purchased options before confirming eligibility. Unknown cycle/lock events require explicit configuration.",
              );
              if (product === "Flex") {
                Object.assign(r.payout, {
                  requiredDays: 5,
                  dailyProfit: String([100, 150, 200, 250][i]),
                  minimumCycleProfit: "0.01",
                  profitPercent: "50",
                  percentBasis: "ledgerProfit",
                  caps: [String([1000, 2000, 2500, 3000][i])],
                  maxPayouts: 5,
                });
                r.drawdown.payoutThreshold = String(size + 100);
                const thresholds = [0, 1000, 2000, 3000, 4500];
                const limits = [
                  [1, 2],
                  [2, 3, 4],
                  [3, 4, 5, 6],
                  [4, 5, 6, 8, 10],
                ][i];
                r.positions.activation = "nextSession";
                r.positions.tiers = limits.map((minis, j) => ({
                  profit: String(thresholds[j]),
                  minis,
                  micros: minis * 10,
                  dailyLoss: null,
                }));
                r.preset!.sources.push(
                  lucid + "12945796-lucidflex-payouts",
                  lucid + "12945808-lucidflex-scaling-plan",
                  lucid + "12945795-lucidflex-funded-account",
                );
              } else if (product === "Pro" || product === "Daily") {
                Object.assign(r.payout, {
                  minimumBalanceAfter: String(size + dd + 100),
                  minimumBalanceToSubmit: String(size + dd + 600),
                });
                if (product === "Pro") {
                  Object.assign(r.payout, {
                    minimumCycleProfit: String([250, 500, 750, 1000][i]),
                    caps: [
                      String([1000, 2000, 2500, 3000][i]),
                      String([1500, 2500, 3000, 3500][i]),
                    ],
                  });
                  r.preset!.sources.push(
                    lucid + "12890092-lucidpro-payouts",
                    lucid + "12890069-lucidpro-funded-account",
                  );
                } else {
                  r.payout.caps = [];
                  r.payout.minimumCycleProfit = "1";
                  r.preset!.sources.push(lucid + "15997266-luciddaily-payouts");
                }
              } else if (product === "Direct") {
                r.daily.amount =
                  i === 0 ? null : String([0, 1200, 2100, 3000][i]);
                r.payout.caps = Array(3)
                  .fill(String([1000, 2000, 2500, 3000][i]))
                  .concat(Array(2).fill(String([1000, 2500, 3000, 3500][i])));
                r.payout.minimumCycleProfit = null;
                r.preset!.sources.push(
                  lucid + "12890164-luciddirect-payout-objectives",
                );
                r.preset!.gaps.push(
                  `Direct first/later profit goals: ${[1500, 3000, 6000, 9000][i]} / ${[1250, 2500, 3500, 4500][i]}. Configure the applicable cycle goal manually.`,
                );
              } else {
                r.preset!.sources.push(
                  lucid + "13424896-lucidblack-funded-account",
                );
                r.preset!.gaps.push(
                  "Legacy Black scaling and bonus-payout schedule require the actual agreement; enter the current tiers and cycle rules.",
                );
              }
            }
          },
        );
      });
    }
  }
  const evaluationSource = mff + "11802636-traders-evaluation-simplified";
  for (const product of ["Rapid Intraday", "Rapid EOD", "Builder", "Pro"])
    for (const stage of ["Evaluation", "Sim Funded"]) {
      const base = registry.find(
        (p) =>
          p.rules.firm === "MyFundedFutures" &&
          p.rules.product === product &&
          p.rules.stage === stage,
      )!;
      sizes.forEach((size, i) => {
        if (
          (product === "Rapid EOD" && i > 1) ||
          (product === "Pro" && i === 0)
        )
          return;
        const evaluation = stage === "Evaluation",
          rapid = product.startsWith("Rapid"),
          builder = product === "Builder";
        const dd = [1000, 2000, 3000, 4500][i];
        const ledger =
          !evaluation && product === "Pro" ? null : evaluation ? size : 0;
        const minis =
          product === "Rapid Intraday"
            ? [3, 5, 8, 10][i]
            : product === "Rapid EOD"
              ? [2, 3][i]
              : builder
                ? [2, 4, 6, 9][i]
                : [0, 3, 6, 9][i];
        const existing = registry.find(
          (p) =>
            p.rules.firm === "MyFundedFutures" &&
            p.rules.product === product &&
            p.rules.stage === stage &&
            p.rules.size === String(size),
        );
        put(
          base,
          existing?.id ??
            `mff-${product.toLowerCase().replaceAll(" ", "-")}-${size}-${stage}`,
          size,
          targets[i],
          dd,
          minis,
          ledger,
          [evaluationSource],
          (r) => {
            r.drawdown.cap = !evaluation && rapid ? "100" : null;
            r.drawdown.payoutThreshold = null;
            r.payout.verified = false;
            r.consistency.percent = evaluation
              ? product === "Rapid EOD"
                ? "30"
                : builder
                  ? null
                  : "50"
              : builder
                ? "50"
                : null;
            r.consistency.status =
              r.consistency.percent === null ? "disabled" : "enabled";
            r.evaluation.tradingDays = evaluation
              ? product === "Rapid EOD"
                ? 4
                : builder
                  ? 1
                  : 2
              : null;
            if (builder) {
              r.daily.mode = "fixed";
              r.daily.amount = String([600, 1000, 1750, 2500][i]);
            }
            if (product === "Rapid Intraday")
              r.preset!.sources.push(
                mff +
                  [
                    "14116402-rapid-plan-25k-a-comprehensive-look",
                    "13134709-rapid-plan-50k-a-comprehensive-look",
                    "13286542-rapid-plan-100k-a-comprehensive-look",
                    "13286582-rapid-plan-150k-a-comprehensive-look",
                  ][i],
              );
            if (product === "Rapid EOD" && i === 0)
              r.preset!.sources.push(
                mff + "16727601-rapid-eod-25k-a-comprehensive-look",
              );
            if (!evaluation) {
              if (rapid)
                Object.assign(r.payout, {
                  minimum: "500",
                  split: "90",
                  waitHours: 24,
                  waitFrom: "firstTrade",
                });
              if (builder) {
                Object.assign(r.payout, {
                  minimum: String([250, 500, 1000, 1500][i]),
                  minimumProfitAfterFirst: String([250, 500, 1000, 1500][i]),
                  caps: [String([1000, 2000, 3000, 3500][i])],
                  requiredDays: 2,
                  dayBasis: "trading",
                  maxPayouts: 5,
                  split: "80",
                  resetEvent: "approved",
                });
                r.preset!.sources.push(
                  "https://myfundedfutures.com/plans/builder",
                );
              }
              if (product === "Pro") {
                r.positions.micros = null;
                r.payout.minimum = "1000";
                r.payout.waitHours = 336;
                r.payout.split = "80";
              }
              r.preset!.gaps.push(
                `Confirm ${size / 1000}K buffer retention, threshold activation/lock and cycle accounting. Do not infer them from the 50K template.`,
              );
            }
            if (evaluation && rapid)
              r.preset!.gaps.push(
                "Confirm evaluation cap from the purchased agreement; Rapid 25K article documents a +100 lock while the overview does not specify all sizes.",
              );
          },
        );
      });
    }
  for (const stage of ["Evaluation", "Sim Funded"]) {
    const base = registry.find(
      (p) =>
        p.rules.firm === "MyFundedFutures" &&
        p.rules.product === "Flex" &&
        p.rules.stage === stage,
    )!;
    const evaluation = stage === "Evaluation";
    put(
      base,
      `mff-flex-25000-${stage}`,
      25000,
      1500,
      1000,
      2,
      evaluation ? 25000 : 0,
      [mff + "15070844-flex-plan-25-000-a-comprehensive-guide"],
      (r) => {
        r.drawdown.cap = null;
        r.drawdown.payoutThreshold = null;
        r.payout.verified = false;
        if (!evaluation) {
          Object.assign(r.payout, {
            minimum: "250",
            requiredDays: 5,
            dailyProfit: "100",
            minimumCycleProfit: null,
            profitPercent: "50",
            percentBasis: "ledgerProfit",
            caps: ["1000"],
            maxPayouts: 5,
            split: "80",
          });
          r.positions.tiers = [0, 750].map((v, i) => ({
            profit: String(v),
            minis: i + 1,
            micros: (i + 1) * 10,
            dailyLoss: null,
          }));
          r.preset!.gaps.push(
            "25K Flex article lists $250 cycle profit but an example requires $500. Confirm cycle minimum and payout-triggered threshold event manually.",
          );
        }
      },
    );
  }
  // Historical Full sizes remain separate from current Intraday accounts.
  for (const stage of ["Evaluation", "Sim Funded"]) {
    const base = registry.find(
      (p) =>
        p.rules.firm === "Apex" &&
        p.rules.product === "Legacy Full" &&
        p.rules.stage === stage,
    )!;
    for (const [size, dd, minis] of [
      [25000, 1500, 4],
      [75000, 2750, 12],
      [100000, 3000, 14],
      [150000, 5000, 17],
      [250000, 6500, 27],
      [300000, 7500, 35],
    ]) {
      put(
        base,
        `apex-legacy-full-${size}-${stage}`,
        size,
        null,
        dd,
        minis,
        size,
        [apex + "evaluation-accounts-ea/legacy-evaluation-rules/"],
        (r) => {
          r.drawdown.cap = stage === "Evaluation" ? null : String(size + 100);
          r.payout.verified = false;
          r.preset!.gaps.push(
            "Legacy target, passing days and payouts are not verified for this purchased version. Enter them from the actual agreement; this is not the current Intraday preset.",
          );
        },
      );
    }
  }
}
