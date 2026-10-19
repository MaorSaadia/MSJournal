import { describe, expect, it } from "vitest";
import {
  trackingProgress,
  consistencyProgress,
  firmSession,
  nextThreshold,
} from "@/lib/props/tracking-calculations";
import {
  customTrackingRules,
  snapshotDetailsSchema,
  type Payout,
  type TrackingRules,
} from "@/lib/props/tracking-rules";
import { toLegacyRules, propPresets } from "@/lib/props/presets";
import { rulesSchema } from "@/lib/props/validation";
import type { Phase, Snapshot } from "@/lib/props/model";
import type { Portion, PortionFee } from "@/lib/journal/processing";
import type { CashAdjustment } from "@/lib/balances/model";
const phase: Phase = {
  id: "phase",
  tradingAccountId: "a",
  previousId: null,
  kind: "Funded",
  label: "Synthetic",
  startAt: "2026-10-01T00:00:00.000Z",
  endAt: null,
  baseline: "50000",
  historyConfirmed: true,
  status: "Active",
  statusAt: "2026-10-01T00:00:00.000Z",
  note: "",
};
function rules() {
  const r = customTrackingRules();
  r.stage = "Sim Funded";
  r.ledgerStart = "50000";
  r.drawdown.initialThreshold = "48000";
  r.drawdown.highWater = "50000";
  r.drawdown.distance = "2000";
  r.session.confirmed = true;
  r.manualConfirmed = true;
  return r;
}
function part(
  id: string,
  pnl: string,
  at = "2026-10-02T16:00:00.000Z",
): Portion {
  return {
    id,
    ownerId: "owner",
    tradingAccountId: "a",
    symbol: "MNQZ6",
    buyFillId: "b" + id,
    sellFillId: "s" + id,
    quantity: "1",
    buyPrice: "100",
    sellPrice: "101",
    boughtAt: "2026-10-02T15:00:00.000Z",
    soldAt: at,
    grossPnl: pnl,
  };
}
function run(
  r: TrackingRules,
  parts: Portion[] = [],
  extra: {
    snapshots?: Snapshot[];
    cash?: CashAdjustment[];
    payouts?: Payout[];
    phase?: Phase;
    now?: string;
    fees?: Record<string, PortionFee>;
  } = {},
) {
  const fees =
    extra.fees ??
    Object.fromEntries(
      parts.map((p) => [p.id, { amount: "0", kind: "Manual" as const }]),
    );
  return trackingProgress(
    extra.phase ?? phase,
    [
      {
        id: "v",
        phaseId: phase.id,
        effectiveAt: phase.startAt,
        rules: rulesSchema.parse(toLegacyRules(r)),
      },
    ],
    parts,
    fees,
    extra.cash ?? [],
    extra.snapshots ?? [],
    extra.payouts ?? [],
    extra.now ?? "2026-10-03T23:00:00.000Z",
  )!;
}
const payout = (fields: Partial<Payout> = {}): Payout => ({
  id: "p",
  phaseId: phase.id,
  revision: 1,
  status: "Requested",
  requestedAmount: "100",
  requestedAt: "2026-10-02T18:00:00.000Z",
  approvedAmount: null,
  approvedAt: null,
  deductionAmount: null,
  deductedAt: null,
  receiptAmount: null,
  paidAt: null,
  note: "",
  ...fields,
});
describe("Day 14 financial and session boundaries", () => {
  it("keeps static thresholds fixed and separates withdrawals from profit", () => {
    const r = rules(),
      cash: CashAdjustment = {
        id: "cash",
        tradingAccountId: "a",
        effectiveAt: "2026-10-02T19:00:00.000Z",
        amount: "-200",
        kind: "withdrawal",
        explanation: "Synthetic",
      };
    expect(run(r, [part("one", "100")], { cash: [cash] })).toMatchObject({
      threshold: "48000",
      balance: "49900",
      phaseProfit: "100",
    });
    expect(
      nextThreshold("49000", "49001", {
        ...r,
        drawdown: { ...r.drawdown, mode: "End-of-day trailing" },
      }),
    ).toBe("49000");
  });
  it("updates EOD high-water thresholds only at close and activates the next session", () => {
    const r = rules();
    r.drawdown.mode = "End-of-day trailing";
    expect(
      run(r, [part("one", "100")], { now: "2026-10-02T21:30:00.000Z" })
        .threshold,
    ).toBe("48000");
    expect(
      run(r, [part("one", "100")], { now: "2026-10-02T22:01:00.000Z" })
        .threshold,
    ).toBe("48100");
    r.drawdown.cap = "48050";
    expect(run(r, [part("one", "100")]).threshold).toBe("48050");
  });
  it("never derives an intraday equity path from closed portions", () => {
    const r = rules();
    r.drawdown.mode = "Intraday trailing";
    const s: Snapshot = {
      id: "s",
      phaseId: phase.id,
      asOf: "2026-10-02T15:00:00.000Z",
      balance: "51000",
      threshold: "49000",
      qualifyingDays: null,
      note: "",
    };
    expect(run(r, [], { snapshots: [s] })).toMatchObject({
      threshold: "49000",
      buffer: "2000",
    });
    expect(
      run(r, [part("one", "100")], { snapshots: [s] }).threshold,
    ).toBeNull();
  });
  it("uses exact strict/inclusive comparisons and explains the fixed-best-day assumption", () => {
    const r = rules();
    r.consistency.percent = "50";
    r.consistency.comparison = "strict";
    expect(consistencyProgress("200", "100", r)).toMatchObject({
      met: false,
      additional: "0.01",
    });
    r.consistency.comparison = "inclusive";
    expect(consistencyProgress("200", "100", r)).toMatchObject({
      met: true,
      additional: "0",
    });
    expect(consistencyProgress("-1", "100", r).percent).toBeNull();
  });
  it("uses a 23-hour DST firm session independently of journal display time", () => {
    const r = rules(),
      day = firmSession("2026-03-08T15:00:00.000Z", r);
    expect(new Date(day.end).getTime() - new Date(day.start).getTime()).toBe(
      23 * 3600000,
    );
    expect(day.date).toBe("2026-03-08");
  });
  it("anchors at the exact snapshot cutoff without re-adding earlier imports or cash", () => {
    const r = rules(),
      s: Snapshot = {
        id: "s",
        phaseId: phase.id,
        asOf: "2026-10-02T16:00:00.000Z",
        balance: "51000",
        threshold: "48000",
        qualifyingDays: null,
        note: "",
        details: snapshotDetailsSchema.parse({
          openingConfirmed: true,
          phaseProfit: "100",
          cycleProfit: "100",
          bestDay: "100",
          qualifyingDays: 1,
          tradingDays: 1,
        }),
      };
    const result = run(
      r,
      [part("old", "100"), part("new", "10", "2026-10-03T16:00:00.000Z")],
      { snapshots: [s], phase: { ...phase, historyConfirmed: false } },
    );
    expect(result.balance).toBe("51010");
    expect(result.phaseProfit).toBe("110");
    expect(result.payout.eligible).toBeNull();
  });
  it("preserves confirmed dated qualifying-day exclusions at the opening cutoff", () => {
    const r = rules();
    r.payout.dailyProfit = "150";
    const s: Snapshot = {
      id: "s",
      phaseId: phase.id,
      asOf: "2026-10-02T21:30:00.000Z",
      balance: "50500",
      threshold: "48000",
      qualifyingDays: 0,
      note: "Synthetic",
      details: snapshotDetailsSchema.parse({
        openingConfirmed: true,
        phaseProfit: "500",
        cycleProfit: "500",
        bestDay: "500",
        daily: [{ date: "2026-10-02", profit: "500", qualifying: false }],
      }),
    };
    const result = run(r, [], {
      phase: { ...phase, historyConfirmed: false },
      snapshots: [s],
    });
    expect(result.qualifyingDays).toBe(0);
    expect(result.days[0].qualifying).toBe(false);
  });
  it("keeps missing fees unknown and account/phase source contributions isolated", () => {
    const r = rules(),
      one = part("one", "100"),
      other = { ...part("other", "500"), tradingAccountId: "other-account" };
    expect(run(r, [one, other], { fees: {} })).toMatchObject({
      balance: null,
      phaseProfit: null,
    });
    expect(run(r, [one, other]).phaseProfit).toBe("100");
    const precise = {
      ...r,
      drawdown: { ...r.drawdown, initialThreshold: "48000.12345678" },
    };
    expect(
      rulesSchema.parse(toLegacyRules(precise)).tracking!.drawdown
        .initialThreshold,
    ).toBe("48000.12345678");
    const estimate = run(r, [one], {
      fees: { one: { amount: "1", kind: "Estimated" } },
    });
    expect(estimate.estimatedFees).toBe(1);
    expect(estimate.phaseProfit).toBe("99");
    expect(estimate.payout.eligible).toBeNull();
    expect(
      run(r, [{ ...one, boughtAt: "2026-09-30T00:00:00.000Z" }]).warnings.join(
        " ",
      ),
    ).toContain("phase boundary");
  });
  it("distinguishes request reservation, approval reset and the actual deduction", () => {
    const r = rules();
    r.payout.resetEvent = "approved";
    expect(run(r, [part("one", "100")], { payouts: [payout()] })).toMatchObject(
      {
        cycleNumber: 1,
        cycleProfit: "100",
        balance: "50100",
        payout: { reserved: "100" },
      },
    );
    const approved = payout({
      status: "Approved",
      approvedAmount: "100",
      approvedAt: "2026-10-02T19:00:00.000Z",
    });
    expect(run(r, [part("one", "100")], { payouts: [approved] })).toMatchObject(
      { cycleNumber: 2, cycleProfit: "0", balance: "50100" },
    );
    const cash: CashAdjustment = {
      id: "deduct",
      tradingAccountId: "a",
      effectiveAt: "2026-10-02T20:00:00.000Z",
      amount: "-100",
      kind: "withdrawal",
      explanation: "Synthetic payout",
    };
    const paid = {
      ...approved,
      status: "Paid" as const,
      deductionId: "deduct",
      deductionAmount: "100",
      deductedAt: cash.effectiveAt,
      receiptAmount: "80",
      paidAt: "2026-10-03T14:00:00.000Z",
    };
    expect(
      run(r, [part("one", "100")], { cash: [cash], payouts: [paid] }),
    ).toMatchObject({
      balance: "50000",
      phaseProfit: "100",
      payout: { reserved: "0" },
    });
  });
  it("combines minimum-submit balance, protected remaining balance, caps and split", () => {
    const r = rules();
    Object.assign(r.payout, {
      enabled: true,
      verified: true,
      minimum: "500",
      minimumBalanceToSubmit: "52600",
      minimumBalanceAfter: "52100",
      caps: ["2000"],
      requiredDays: 0,
      resetEvent: "approved",
      split: "80",
    });
    expect(run(r, [part("one", "4000")]).payout).toMatchObject({
      eligible: "1900",
      receipt: "1520",
      projectedBalance: "52100",
      projectedBuffer: "4100",
    });
    Object.assign(r.payout, {
      minimumBalanceToSubmit: null,
      minimumBalanceAfter: "50000",
      caps: ["5000"],
      profitPercent: "50",
      percentBasis: "ledgerProfit",
    });
    expect(run(r, [part("one", "4000")]).payout).toMatchObject({
      eligible: "2000",
      receipt: "1600",
      projectedBalance: "52000",
    });
  });
  it("reserves a paid payout until its independent deduction is recorded", () => {
    const paid = payout({
      status: "Paid",
      approvedAmount: "100",
      approvedAt: "2026-10-02T19:00:00.000Z",
      receiptAmount: "80",
      paidAt: "2026-10-03T14:00:00.000Z",
    });
    const result = run(rules(), [part("one", "100")], { payouts: [paid] });
    expect(result.balance).toBe("50100");
    expect(result.payout.reserved).toBe("100");
    expect(result.payout.missing.join(" ")).toContain(
      "actual account deduction",
    );
  });
  it("assesses phase positive-day consistency across payout resets", () => {
    const r = rules();
    r.consistency.percent = "50";
    r.consistency.period = "phase";
    r.consistency.denominator = "positiveDays";
    r.payout.resetEvent = "approved";
    const result = run(
      r,
      [part("one", "100"), part("two", "100", "2026-10-03T16:00:00.000Z")],
      {
        payouts: [
          payout({
            status: "Approved",
            approvedAmount: "100",
            approvedAt: "2026-10-02T19:00:00.000Z",
          }),
        ],
      },
    );
    expect(result.cycleProfit).toBe("100");
    expect(result.consistency).toMatchObject({ percent: "50", met: true });
  });
  it("limits expanded size/stage combinations and preserves distinct purchased payout options", () => {
    const standard = propPresets.filter(
      (p) => p.rules.firm === "Topstep" && p.rules.product === "XFA Standard",
    );
    expect([...new Set(standard.map((p) => p.rules.size))].sort()).toEqual([
      "100000",
      "150000",
      "50000",
    ]);
    expect(
      standard.every((p) => p.rules.stage === "Sim Funded" && p.ledger === "0"),
    ).toBe(true);
    const base = standard.find(
      (p) =>
        p.rules.size === "50000" && p.rules.options[0] === "No purchased DLL",
    )!;
    const addOn = standard.find(
      (p) => p.rules.size === "50000" && p.rules.options[0] === "Purchased DLL",
    )!;
    const promo = standard.find(
      (p) =>
        p.rules.size === "50000" &&
        p.rules.options[0] === "Qualifying Combine DLL promotion",
    )!;
    expect(base.rules.payout.caps).toEqual(["2000"]);
    expect(addOn.rules.payout.caps).toEqual(["2000"]);
    expect(promo.rules.payout.caps).toEqual(["4000"]);
    expect(
      propPresets.some(
        (p) => p.rules.firm === "Topstep" && p.rules.size === "25000",
      ),
    ).toBe(false);
    const flex = propPresets.find(
      (p) =>
        p.rules.firm === "FundedNext Futures" &&
        p.rules.product === "Flex" &&
        p.rules.stage === "Evaluation" &&
        p.rules.size === "50000",
    )!;
    expect(flex.rules.evaluation.target).toBe("2500");
    expect(flex.rules.drawdown.distance).toBe("1500");
    expect(
      propPresets.find((p) => p.id === "fundednext-direct-50000")!.rules
        .consistency,
    ).toMatchObject({ percent: "20", period: "cycle", bestScope: "phase" });
  });
  it("uses Topstep trading-day rather than winning-day counts and an inclusive adjusted target", () => {
    const preset = propPresets.find(
      (p) =>
        p.rules.firm === "Topstep" &&
        p.rules.product === "XFA Consistency" &&
        p.rules.size === "50000" &&
        p.rules.options[0] === "No purchased DLL",
    )!;
    const r = structuredClone(preset.rules);
    r.manualConfirmed = true;
    r.session.confirmed = true;
    const parts = ["300", "300", "-1", "300"].map((p, i) =>
      part(`top-${i}`, p, `2026-10-0${i + 2}T16:00:00.000Z`),
    );
    const p = run(r, parts, {
      phase: { ...phase, baseline: "0" },
      now: "2026-10-10T23:00:00.000Z",
    });
    expect(p.tradingDays).toBe(4);
    expect(p.qualifyingDays).toBe(3);
    expect(p.payout.eligible).toBe("449.5");
    const combine = structuredClone(
      propPresets.find(
        (p) =>
          p.rules.firm === "Topstep" &&
          p.rules.product === "Trading Combine" &&
          p.rules.size === "50000",
      )!.rules,
    );
    combine.session.confirmed = true;
    combine.manualConfirmed = true;
    expect(
      run(combine, [
        part("one", "2000"),
        part("two", "1000", "2026-10-03T16:00:00.000Z"),
      ]),
    ).toMatchObject({ effectiveTarget: "3636.37", remainingProfit: "636.37" });
  });
  it("keeps the phase best day while assessing FundedNext Direct against current-cycle profit", () => {
    const r = rules();
    r.consistency = {
      ...r.consistency,
      percent: "20",
      period: "cycle",
      bestScope: "phase",
    };
    r.payout.resetEvent = "approved";
    const parts = [
      part("old", "400"),
      part("new", "400", "2026-10-04T16:00:00.000Z"),
    ];
    const result = run(r, parts, {
      now: "2026-10-06T23:00:00.000Z",
      payouts: [
        payout({
          status: "Approved",
          approvedAt: "2026-10-03T19:00:00.000Z",
          approvedAmount: "100",
        }),
      ],
    });
    expect(result.cycleProfit).toBe("400");
    expect(result.consistency).toMatchObject({
      percent: "100",
      additional: "1600",
    });
  });
  it("activates an EOD floor at a coincident session reset and refuses intraday-only buffer qualification", () => {
    const r = rules();
    r.session = {
      ...r.session,
      timezone: "America/Chicago",
      reset: "17:00",
      close: "17:00",
    };
    r.drawdown.mode = "End-of-day trailing";
    expect(
      run(r, [part("one", "100")], { now: "2026-10-02T22:01:00.000Z" })
        .threshold,
    ).toBe("48100");
    Object.assign(r.payout, {
      enabled: true,
      verified: true,
      minimum: "100",
      requiredDays: 0,
      resetEvent: "approved",
      minimumBalanceToSubmit: "50100",
      bufferObservation: "sessionClose",
    });
    const intraday = run(r, [part("one", "200")], {
      now: "2026-10-02T20:00:00.000Z",
    });
    expect(intraday.payout.eligible).toBeNull();
    expect(intraday.payout.missing.join(" ")).toContain(
      "completed-session EOD",
    );
    expect(
      run(r, [part("one", "200")], {
        now: "2026-10-02T22:01:00.000Z",
      }).payout.missing.join(" "),
    ).not.toContain("completed-session EOD");
  });
  it("keeps source/version metadata and zero-ledger Studio stages distinct", () => {
    const p = propPresets.find((p) => p.id === "mff-studio-001-Sim Funded")!;
    expect(p.ledger).toBe("0");
    expect(p.rules.drawdown.initialThreshold).toBe("-500");
    expect(p.rules.size).toBe("10000");
    for (const preset of propPresets)
      expect(() =>
        rulesSchema.parse(toLegacyRules(preset.rules)),
      ).not.toThrow();
  });
});

describe("TPT exact-size presets", () => {
  it("uses stage-specific thresholds, targets and buffers without cloning a 50K ledger", () => {
    for (const [size, target, dd, minis] of [
      [25000, 1500, 1500, 3],
      [50000, 3000, 2000, 6],
      [75000, 4500, 2500, 9],
      [100000, 6000, 3000, 12],
      [150000, 9000, 4500, 15],
    ]) {
      const test = propPresets.find((p) => p.id === `tpt-test-${size / 1000}`)!;
      expect(test.ledger).toBe(String(size));
      expect(test.rules.drawdown).toMatchObject({
        mode: "End-of-day trailing",
        distance: String(dd),
        initialThreshold: String(size - dd),
        highWater: String(size),
        cap: String(size),
        breachBasis: "equity",
      });
      expect(test.rules.evaluation).toMatchObject({
        target: String(target),
        tradingDays: 3,
        targetAdjustsForConsistency: true,
      });
      expect(test.rules.consistency).toMatchObject({
        percent: "50",
        comparison: "strict",
      });
      expect(test.rules.positions).toMatchObject({ minis, micros: minis * 10 });
      const pro = propPresets.find((p) => p.id === `tpt-pro-${size / 1000}`)!;
      expect(pro.rules.drawdown).toMatchObject({
        mode: "Intraday trailing",
        basis: "equity",
        initialThreshold: String(size - dd),
        distance: String(dd),
      });
      expect(pro.rules.payout).toMatchObject({
        split: "80",
        minimumBalanceToSubmit: String(size + dd),
        minimumBalanceAfter: String(size + dd),
      });
      expect(rulesSchema.safeParse(toLegacyRules(test.rules)).success).toBe(
        true,
      );
      expect(rulesSchema.safeParse(toLegacyRules(pro.rules)).success).toBe(
        true,
      );
    }
    expect(
      propPresets.some(
        (p) =>
          p.rules.firm === "Take Profit Trader" &&
          p.rules.product === "PRO+" &&
          p.rules.size === "150000",
      ),
    ).toBe(false);
  });
});
