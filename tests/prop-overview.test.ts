import { describe, it, expect } from "vitest";
import { propAccountSummary } from "@/lib/dashboard/prop-summary";
import { phaseProgress, type Phase } from "@/lib/props/model";
import {
  customTrackingRules,
  snapshotDetailsSchema,
  type Payout,
} from "@/lib/props/tracking-rules";
import { toLegacyRules } from "@/lib/props/presets";
import { rulesSchema } from "@/lib/props/validation";
import {
  accountPosition,
  overviewChartRows,
  phaseSessionActivity,
  phasePayoutEvents,
} from "@/lib/props/overview-model";
import type { Portion } from "@/lib/journal/processing";
const phase: Phase = {
  id: "phase",
  tradingAccountId: "account",
  previousId: null,
  kind: "Evaluation",
  label: "Synthetic",
  startAt: "2026-10-01T00:00:00.000Z",
  endAt: null,
  baseline: "0",
  historyConfirmed: true,
  status: "Active",
  statusAt: "2026-10-01T00:00:00.000Z",
  note: "",
};
const at = "2026-10-06T00:00:00.000Z";
function config() {
  const r = customTrackingRules();
  r.stage = "Evaluation";
  r.ledgerStart = "0";
  r.session.confirmed = true;
  r.manualConfirmed = true;
  r.drawdown.mode = "Static";
  r.drawdown.initialThreshold = "-500";
  r.drawdown.highWater = "0";
  r.evaluation.target = "1000";
  r.consistency.status = "disabled";
  return r;
}
function version(r = config()) {
  return {
    id: "v",
    phaseId: phase.id,
    effectiveAt: phase.startAt,
    rules: rulesSchema.parse(toLegacyRules(r)),
  };
}
const part: Portion = {
  id: "source",
  ownerId: "owner",
  tradingAccountId: "account",
  symbol: "MNQZ6",
  buyFillId: "b",
  sellFillId: "s",
  quantity: "1",
  buyPrice: "100",
  sellPrice: "101",
  grossPnl: "100.12345678",
  boughtAt: "2026-10-02T21:50:00.000Z",
  soldAt: "2026-10-02T22:10:00.000Z",
};

describe("Dashboard prop account cards", () => {
  const account = {
    id: phase.tradingAccountId, displayName: "Evaluation fixture",
    firm: "Custom", stage: "Evaluation" as const, status: "Active" as const, archivedAt: null,
  };
  const inputs = { account, phase, now: at, versions: [version()], portions: [part] };

  it("matches the account overview without counting activity from another account", () => {
    const fees = { source: { amount: "0.12", kind: "Estimated" as const } };
    const foreign = { ...part, id: "foreign", tradingAccountId: "another", grossPnl: "999" };
    const own = phaseProgress(phase, inputs.versions, [part], fees, [], [], at).imported;
    const card = propAccountSummary({ ...inputs, portions: [part, foreign], fees });
    expect(card.balance).toMatchObject({
      value: own.balance, buffer: own.buffer, source: "journal", estimatedFees: true, estimatedBuffer: true,
    });
    expect(card.milestone).toEqual({ kind: "target", remaining: own.remainingProfit, estimated: true });
  });

  it("uses a dated snapshot with its own buffer if missing fees prevent the journal estimate", () => {
    const snapshot = {
      id: "snapshot", phaseId: phase.id, asOf: phase.startAt, balance: "50000",
      threshold: "48000", qualifyingDays: null, note: "",
    };
    const { balance, milestone } = propAccountSummary({ ...inputs, snapshots: [
      snapshot,
      { ...snapshot, id: "foreign", phaseId: "another", asOf: at, balance: "90000" },
      { ...snapshot, id: "future", asOf: "2026-10-11T00:00:00.000Z", balance: "90000" },
    ] });
    expect(balance).toMatchObject({ source: "snapshot", asOf: snapshot.asOf, value: "50000", buffer: "2000" });
    expect(milestone).toEqual({ kind: "message", text: "Review missing fees" });
    expect(propAccountSummary({ ...inputs, snapshots: [{ ...snapshot, threshold: null }] }).balance?.buffer).toBeNull();
  });

  it("shows payout trading days and keeps closed phases out of active tracking", () => {
    const r = config();
    r.stage = "Sim Funded";
    r.payout.enabled = true;
    r.payout.requiredDays = 5;
    r.payout.dayBasis = "trading";
    const funded = {
      ...inputs, account: { ...account, stage: "Funded" as const },
      phase: { ...phase, kind: "Funded" as const },
      versions: [version(r)], fees: { source: { amount: "0", kind: "Manual" as const } },
    };
    expect(propAccountSummary(funded).milestone).toEqual({ kind: "payout-days", count: 1, required: 5, basis: "trading" });
    expect(propAccountSummary({ ...funded, phase: { ...funded.phase, endAt: at, status: "Closed" } })).toMatchObject({
      status: "Closed", milestone: null,
    });
  });

  it("shows setup for an unconfigured account and suppresses milestones after archiving", () => {
    expect(propAccountSummary({ account, now: at })).toMatchObject({
      balance: null, milestone: { kind: "message", text: "Finish setup" },
    });
    expect(propAccountSummary({ ...inputs, account: { ...account, archivedAt: at } })).toMatchObject({
      archived: true, milestone: null,
    });
  });
});

describe("prop overview presentation integrity", () => {
  it("keeps proportional marker ordering below the threshold, at negative balances, and beyond a target", () => {
    const below = phaseProgress(
      phase,
      [version()],
      [],
      {},
      [
        {
          id: "cash",
          tradingAccountId: "account",
          kind: "other",
          amount: "-750",
          effectiveAt: "2026-10-02T12:00:00.000Z",
          explanation: "Synthetic adjustment",
        },
      ],
      [],
      at,
    );
    const markers = accountPosition(below)!;
    expect(markers.map((m) => m.value)).toEqual(["-500", "0", "-750", "250"]);
    expect(markers.find((m) => m.key === "current")!.position).toBeLessThan(
      markers.find((m) => m.key === "floor")!.position,
    );
    const above = phaseProgress(
      phase,
      [version()],
      [{ ...part, grossPnl: "2000" }],
      { source: { amount: "0", kind: "Manual" } },
      [],
      [],
      at,
    );
    const more = accountPosition(above)!;
    expect(more.find((m) => m.key === "current")!.position).toBeGreaterThan(
      more.find((m) => m.key === "target")!.position,
    );
    expect(more.every((m) => m.position > 0 && m.position < 100)).toBe(true);
  });
  it("uses firm-session dates and owned source links once, retaining precise gross when fees are unknown", () => {
    const r = config();
    r.session.timezone = "America/Chicago";
    r.session.reset = "17:00";
    const rows = phaseSessionActivity(
      phase,
      [version(r)],
      [
        part,
        part,
        { ...part, id: "foreign", tradingAccountId: "another" },
        { ...part, id: "old", boughtAt: "2026-09-30T00:00:00.000Z" },
      ],
      {},
      at,
      { source: "record" },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe("2026-10-03");
    expect(rows[0].net).toBeNull();
    expect(rows[0].gross).toBe("100.12345678");
    expect(rows[0].activity).toHaveLength(1);
    expect(rows[0].activity[0].recordId).toBe("record");
  });
  it("keeps sparse manual intraday thresholds isolated and does not replace an unknown snapshot floor with zero", () => {
    const r = config();
    r.drawdown.mode = "Intraday trailing";
    r.drawdown.distance = "500";
    const snapshots = [
      {
        id: "s1",
        phaseId: phase.id,
        asOf: "2026-10-03T12:00:00.000Z",
        balance: "100",
        threshold: "-400",
        qualifyingDays: null,
        note: "",
        details: snapshotDetailsSchema.parse({}),
      },
      {
        id: "s2",
        phaseId: phase.id,
        asOf: "2026-10-05T12:00:00.000Z",
        balance: "150",
        threshold: null,
        qualifyingDays: null,
        note: "",
        details: snapshotDetailsSchema.parse({}),
      },
    ];
    const result = phaseProgress(
      { ...phase, historyConfirmed: false },
      [version(r)],
      [],
      {},
      [],
      snapshots,
      at,
    );
    const rows = overviewChartRows(result);
    expect(
      rows.every((row) => row.at <= Date.parse(result.tracking!.asOf)),
    ).toBe(true);
    expect(
      rows.find((row) => row.at === Date.parse(snapshots[0].asOf))!.balance,
    ).toBeNull();
    expect(
      rows.find((row) => row.at === Date.parse(snapshots[0].asOf))!
        .snapshotFloor,
    ).toBe(-400);
    expect(
      rows.find((row) => row.at === Date.parse(snapshots[1].asOf))!.exactFloor,
    ).toBeNull();
    expect(rows.filter((row) => row.floor !== null)).toHaveLength(0);
  });
  it("keeps request, deduction and receipt markers on their own dates and within the selected phase", () => {
    const progress = phaseProgress(phase, [version()], [], {}, [], [], at);
    const payout = {
      id: "p",
      phaseId: phase.id,
      revision: 1,
      status: "Paid",
      requestedAmount: "200",
      requestedAt: "2026-10-02T12:00:00.000Z",
      approvedAmount: "175",
      approvedAt: "2026-10-03T12:00:00.000Z",
      deductionAmount: "175",
      deductedAt: "2026-10-04T12:00:00.000Z",
      receiptAmount: "140",
      paidAt: "2026-10-05T12:00:00.000Z",
      note: "",
    } as Payout;
    const events = phasePayoutEvents(progress, [
      payout,
      { ...payout, id: "foreign", phaseId: "other" },
    ]);
    expect(events.map((e) => [e.kind, e.at, e.amount])).toEqual([
      ["requested", payout.requestedAt, "200"],
      ["approved", payout.approvedAt, "175"],
      ["deducted", payout.deductedAt, "175"],
      ["paid", payout.paidAt, "140"],
    ]);
  });
});

it("includes earlier imports exactly once after an explicit initial-phase date correction", () => {
  const oldStart = "2026-10-04T00:00:00.000Z";
  const original = { ...phase, startAt: oldStart, baseline: "50000" };
  const originalRule = { ...version(), effectiveAt: oldStart };
  const fees = { source: { amount: "10", kind: "Manual" as const } };
  const before = phaseProgress(original, [originalRule], [part], fees, [], [], at);
  expect(before.portionCount).toBe(0);
  const corrected = phaseProgress(
    { ...original, startAt: phase.startAt },
    [{ ...originalRule, id: "correction", effectiveAt: phase.startAt }, originalRule],
    [part], fees, [], [], at,
  );
  expect(corrected.portionCount).toBe(1);
  expect(corrected.net).toBe("90.12345678");
  expect(corrected.tracking?.phaseProfit).toBe("90.12345678");
  expect(corrected.tracking?.balance).toBe("50090.12345678");
  expect(originalRule.effectiveAt).toBe(oldStart);
});
