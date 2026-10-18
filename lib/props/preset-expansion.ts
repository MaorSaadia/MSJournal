import { D } from "@/lib/journal/processing";
import { customTrackingRules, type TrackingRules } from "./tracking-rules";
import type { PropPreset } from "./presets";
const checked = "2026-10-18";
const top = "https://help.topstep.com/en/articles/";
const fn = "https://helpfutures.fundednext.com/en/articles/";

export function expandPresets(registry: PropPreset[]) {
  const add = (
    id: string,
    r: TrackingRules,
    ledger: string | null,
    sources: string[],
    gaps: string[],
    legacy = false,
  ) => {
    r.ledgerStart = ledger;
    r.consistency.status =
      r.consistency.percent === null ? "disabled" : "enabled";
    r.preset = {
      id,
      version: `observed-${checked}`,
      verifiedOn: checked,
      effectiveDate: null,
      sources,
      gaps,
      customized: false,
      platforms: r.platform === "Unknown" ? [] : [r.platform],
    };
    registry.push({
      id,
      label: `${r.product} / ${r.stage} / ${new D(r.size).div(1000)}K`,
      rules: r,
      ledger,
      legacy,
    });
  };
  for (const [size, target, distance, minis, dll] of [
    [50000, 3000, 2000, 5, 1000],
    [100000, 6000, 3000, 10, 2000],
    [150000, 9000, 4500, 15, 3000],
  ]) {
    for (const path of ["Trading Combine", "XFA Standard", "XFA Consistency"]) {
      for (const option of [
        "No purchased DLL",
        "Purchased DLL",
        "Qualifying Combine DLL promotion",
      ]) {
        if (
          path === "Trading Combine" &&
          option === "Qualifying Combine DLL promotion"
        )
          continue;
        const r = customTrackingRules(),
          evaluation = path === "Trading Combine",
          i = size === 50000 ? 0 : size === 100000 ? 1 : 2;
        Object.assign(r, {
          firm: "Topstep",
          product: path,
          stage: evaluation ? "Evaluation" : "Sim Funded",
          size: String(size),
          platform: "TopstepX",
          options: [option],
        });
        Object.assign(r.session, {
          timezone: "America/Chicago",
          reset: "17:00",
          close: evaluation ? "15:10" : "16:00",
          confirmed: false,
        });
        Object.assign(r.drawdown, {
          mode: "End-of-day trailing",
          distance: String(distance),
          initialThreshold: String((evaluation ? size : 0) - distance),
          highWater: String(evaluation ? size : 0),
          cap: String(evaluation ? size : 0),
          basis: "balance",
          breachBasis: "equity",
          comparison: "touch",
          activation: "nextSession",
        });
        r.positions.minis = evaluation ? minis : null;
        r.positions.micros = evaluation ? minis * 10 : null;
        r.positions.equivalences = { SIL: 5 };
        if (option !== "No purchased DLL")
          Object.assign(r.daily, {
            mode: "fixed",
            amount: String(dll),
            basis: "equity",
            effect: "pause",
          });
        r.evaluation.target = evaluation ? String(target) : null;
        r.evaluation.tradingDays = evaluation ? 2 : null;
        r.evaluation.targetAdjustsForConsistency = evaluation;
        r.consistency.percent = evaluation
          ? "55"
          : path === "XFA Consistency"
            ? "40"
            : null;
        r.consistency.period = evaluation ? "phase" : "cycle";
        if (!evaluation) {
          Object.assign(r.payout, {
            enabled: true,
            verified: false,
            minimum: "125",
            caps: [
              String(
                (path === "XFA Standard"
                  ? [2000, 3000, 5000]
                  : [3000, 4000, 6000])[i] *
                  (option === "Qualifying Combine DLL promotion" ? 2 : 1),
              ),
            ],
            split: "90",
            profitPercent: "50",
            percentBasis: "ledgerProfit",
            requiredDays: path === "XFA Standard" ? 5 : 3,
            dayBasis: path === "XFA Standard" ? "qualifying" : "trading",
            dailyProfit: path === "XFA Standard" ? "150" : null,
            minimumProfitAfterFirst: path === "XFA Standard" ? "0.01" : null,
            resetEvent: "requested",
            excludeResetSession: true,
          });
          r.drawdown.payoutThreshold = "0"; // The exact deduction/lock event needs confirmation.
        }
        r.restrictions = [
          "Intraday equity can breach an EOD threshold. Flat/holiday and product-weighting rules require manual checks.",
          "Purchase DLL promotion eligibility must be confirmed from the actual agreement; adding a DLL at XFA activation alone does not double the cap.",
          "Pre-2026-01-12 lifetime first-$10K split exception is not the ordinary 90/10 path. Use a customized version for that agreement.",
        ];
        add(
          `topstep-${path.replaceAll(" ", "-")}-${size}-${option.replaceAll(" ", "-")}`,
          r,
          String(evaluation ? size : 0),
          [
            top + "8284197-trading-combine-parameters",
            top + "8284204-what-is-the-maximum-loss-limit",
            top + "8284215-express-funded-account-parameters",
            top + "8284233-topstep-payout-policy",
            top +
              "10490293-daily-loss-limit-in-the-trading-combine-and-express-funded-account",
            top + "8284223-what-is-the-scaling-plan",
            top + "8284208-consistency-at-topstep",
          ],
          evaluation
            ? [
                "Confirm the exact EOD threshold activation. Overview says below 55%; detailed consistency article allows equality at 55% without rounding.",
              ]
            : [
                "XFA scaling table is not published as readable tier values in the current source; enter dashboard limits.",
                "Confirm threshold lock event (request/approval/deduction), session close/day-lock and holiday exceptions. XFA page and payout policy differ in their reset-event wording.",
              ],
        );
      }
    }
  }
  const products = [
    {
      name: "Rapid Pro",
      sizes: [
        [25000, 1500, 1000, 2, 800],
        [50000, 3000, 2000, 4, 1200],
        [100000, 5000, 2500, 6, 2500],
      ],
      eval: "17229677-fundednext-futures-rapid-pro-challenge-all-rules",
      fund: "17229713-fundednext-futures-rapid-pro-fundednext-account-all-rules",
    },
    {
      name: "Rapid Daily",
      sizes: [
        [25000, 1500, 1000, 2, 800],
        [50000, 3000, 2000, 4, 1200],
        [100000, 5000, 2500, 6, 2500],
      ],
      eval: "17229762-fundednext-futures-rapid-daily-challenge-all-rules",
      fund: "17229779-fundednext-futures-rapid-daily-fundednext-account-all-rules",
    },
    {
      name: "Flex",
      sizes: [
        [50000, 2500, 1500, 3, 1500],
        [100000, 5000, 2500, 5, 2500],
        [150000, 8000, 4000, 8, 4000],
      ],
      eval: "17229829-fundednext-futures-flex-challenge-all-rules",
      fund: "17229848-fundednext-futures-flex-fundednext-account-all-rules",
    },
    {
      name: "Legacy",
      sizes: [
        [25000, 1250, 1000, 2, 3000],
        [50000, 3000, 2000, 3, 6000],
        [100000, 6000, 3000, 5, 6000],
      ],
      eval: "17229495-what-is-fundednext-futures-legacy-challenge",
      fund: "17229581-fundednext-futures-legacy-fundednext-account-all-rules",
    },
  ];
  for (const product of products)
    for (const [size, target, distance, minis, cap] of product.sizes)
      for (const stage of ["Evaluation", "Sim Funded"] as const) {
        for (const dll of product.name === "Rapid Pro"
          ? [false, true]
          : [product.name === "Rapid Daily"]) {
          const r = customTrackingRules(),
            evaluation = stage === "Evaluation",
            legacy = product.name === "Legacy",
            flex = product.name === "Flex";
          Object.assign(r, {
            firm: "FundedNext Futures",
            product: product.name,
            stage,
            size: String(size),
            platform: "Unknown",
            options: [dll ? "Purchased/fixed DLL" : "No DLL"],
          });
          Object.assign(r.session, {
            timezone: "America/Chicago",
            reset: "17:00",
            close: "17:00",
            confirmed: false,
          });
          Object.assign(r.drawdown, {
            mode: "End-of-day trailing",
            distance: String(distance),
            initialThreshold: String(size - distance),
            highWater: String(size),
            cap: String(size + (legacy ? 0 : 100)),
            basis: "balance",
            breachBasis: "equity",
          });
          r.evaluation.target = evaluation ? String(target) : null;
          r.evaluation.tradingDays = evaluation
            ? legacy || flex
              ? null
              : 1
            : null;
          r.evaluation.targetAdjustsForConsistency =
            evaluation && (legacy || flex);
          r.consistency.percent = evaluation
            ? legacy || flex
              ? "40"
              : null
            : product.name === "Rapid Pro"
              ? "40"
              : null;
          r.consistency.period = evaluation ? "phase" : "cycle";
          r.positions.minis =
            !evaluation && legacy
              ? size === 25000
                ? 3
                : size === 50000
                  ? 5
                  : 7
              : minis;
          r.positions.micros = r.positions.minis * 10;
          if (dll)
            Object.assign(r.daily, {
              mode: "fixed",
              amount: String(
                size === 25000 ? 500 : size === 50000 ? 1000 : 1250,
              ),
              basis: "equity",
              effect: "pause",
            });
          if (!evaluation) {
            Object.assign(r.payout, {
              enabled: true,
              verified: false,
              minimum: "250",
              minimumCycleProfit: "500",
              caps: [String(cap)],
              split: flex ? "95" : legacy ? "80" : "90",
              maxPayouts: legacy ? null : 5,
              profitPercent: flex || legacy ? "50" : null,
              percentBasis: "cycleProfit",
              requiredDays:
                flex || legacy ? 5 : product.name === "Rapid Pro" ? 3 : null,
              dayBasis: product.name === "Rapid Pro" ? "trading" : "qualifying",
              dailyProfit: flex
                ? size === 150000
                  ? "250"
                  : "200"
                : legacy
                  ? size === 25000
                    ? "100"
                    : "200"
                  : null,
              waitHours: product.name === "Rapid Pro" ? 72 : null,
            });
            r.drawdown.payoutThreshold = String(size + (legacy ? 0 : 100));
          }
          const gaps = [
            "Confirm actual funded starting ledger, platform and session/reset/activation timing from the agreement.",
            "Product pages say highest balance that day while overview describes EOD trailing; confirm whether the firm uses closing balance or another high-water observation.",
            ...(!evaluation
              ? [
                  "Withdrawal cycle reset, threshold lock event, waiting-time anchor and profit-percentage basis need confirmation before a verified forecast.",
                ]
              : []),
          ];
          if (product.name === "Rapid Daily" && !evaluation) {
            Object.assign(r.payout, {
              requiredDays: 0,
              bufferObservation: "sessionClose",
              minimumBalanceToSubmit: String(size + distance + 100),
              minimumBalanceAfter: String(size + distance + 100),
            });
            gaps.push(
              "Rapid Daily requires a confirmed EOD buffer, not an intraday balance crossing. Confirm the qualifying EOD balance with a dated firm snapshot.",
            );
          }
          if (!evaluation) {
            r.drawdown.initialThreshold = null;
            r.drawdown.highWater = null;
          }
          if (legacy && !evaluation)
            gaps.push(
              "After 30 lifetime Benchmark Days the cap/50% limit changes. Record a new dated rule version with confirmed cumulative days; this is not automatically inferred from partial history.",
            );
          r.restrictions = [
            "Futures policies only. News, inactivity, contract violations and micro-scalping profit forfeitures require manual confirmation and actual firm adjustments.",
          ];
          add(
            `fundednext-${product.name.replaceAll(" ", "-")}-${size}-${stage}-${dll ? "dll" : "none"}`,
            r,
            evaluation ? String(size) : null,
            [
              fn + product.eval,
              ...(product.fund ? [fn + product.fund] : []),
              fn +
                "17230292-daily-loss-limit-and-maximum-loss-limit-at-fundednext-futures",
              fn +
                "17230245-is-there-any-consistency-rule-to-be-followed-in-the-fundednext-futures-challenge-fundednext-account",
            ],
            gaps,
          );
          r.preset!.platforms = []; // Unknown is explicit, not a claim of platform support.
        }
      }
  {
    const r = customTrackingRules();
    Object.assign(r, {
      firm: "FundedNext Futures",
      product: "Direct",
      stage: "Sim Funded",
      size: "50000",
      platform: "Tradovate",
    });
    Object.assign(r.drawdown, {
      mode: "End-of-day trailing",
      distance: "2000",
      initialThreshold: null,
      highWater: null,
      cap: "50100",
      basis: "balance",
      breachBasis: "equity",
      payoutThreshold: "50100",
    });
    Object.assign(r.session, {
      timezone: "America/Chicago",
      reset: "17:00",
      close: "17:00",
      confirmed: false,
    });
    Object.assign(r.daily, {
      mode: "fixed",
      amount: "1000",
      basis: "equity",
      effect: "pause",
    });
    Object.assign(r.positions, { minis: 3, micros: 30 });
    Object.assign(r.consistency, {
      percent: "20",
      period: "cycle",
      bestScope: "phase",
      comparison: "inclusive",
    });
    Object.assign(r.payout, {
      enabled: true,
      verified: false,
      minimum: "800",
      caps: ["1200"],
      split: "90",
      requiredDays: 0,
      minimumBalanceAfter: "52100",
      minimumCycleProfit: "2900",
      maxPayouts: 5,
    });
    r.restrictions = [
      "KYC before first withdrawal; one trade per week. Request timing is EOD and no new trade on the request day; verify manually.",
      "The all-time best day survives cycle resets. Partial histories need confirmed prior best-day coverage; this cannot be inferred from a current cycle alone.",
    ];
    add(
      "fundednext-direct-50000",
      r,
      null,
      [fn + "17430065-fundednext-futures-direct-account-all-rules"],
      [
        "Confirm opening ledger and threshold, cycle reset, withdrawal/lock event, session close and perpetual best-day coverage.",
        "Current-cycle buffer must remain protected on each withdrawal; confirm the firm's retained-buffer accounting for subsequent cycles.",
      ],
    );
    r.preset!.platforms = ["Tradovate", "NinjaTrader", "TradingView"];
  }
  // Extra sizes only where the stage-specific official tables were checked.
  for (const [size, target, dd, minis, dll] of [
    [25000, 1500, 1000, 4, 500],
    [100000, 6000, 3000, 8, 1500],
    [150000, 9000, 4000, 12, 2000],
  ]) {
    const base = registry.find((p) => p.id === "apex-eod-50-eval")!;
    const r = structuredClone(base.rules);
    r.size = String(size);
    r.ledgerStart = String(size);
    r.evaluation.target = String(target);
    Object.assign(r.drawdown, {
      initialThreshold: String(size - dd),
      highWater: String(size),
      distance: String(dd),
    });
    r.positions.minis = minis;
    r.positions.micros = minis * 10;
    r.daily.amount = String(dll);
    add(
      `apex-eod-${size}-eval`,
      r,
      String(size),
      base.rules.preset!.sources,
      base.rules.preset!.gaps,
    );
  }
  for (const [size, target, dd, minis] of [
    [25000, 1250, 1000, 2],
    [100000, 6000, 3000, 6],
    [150000, 9000, 4500, 10],
  ]) {
    const base = registry.find((p) => p.id === "lucid-flex-Evaluation")!;
    const r = structuredClone(base.rules);
    r.size = String(size);
    r.ledgerStart = String(size);
    r.evaluation.target = String(target);
    Object.assign(r.drawdown, {
      initialThreshold: String(size - dd),
      highWater: String(size),
      distance: String(dd),
      cap: String(size + 100),
    });
    r.positions.minis = minis;
    r.positions.micros = minis * 10;
    add(
      `lucid-flex-${size}-eval`,
      r,
      String(size),
      base.rules.preset!.sources,
      base.rules.preset!.gaps,
    );
  }
}
