import { describe, it, expect } from "vitest";
import { importedOverview } from "@/lib/props/imported-overview";
import { phaseProgress, type Phase, type RuleVersion } from "@/lib/props/model";
import { customTrackingRules, type Payout } from "@/lib/props/tracking-rules";
import { toLegacyRules } from "@/lib/props/presets";
import { rulesSchema } from "@/lib/props/validation";
import type { Portion, PortionFee } from "@/lib/journal/processing";
const phase: Phase = {
  id: "phase", tradingAccountId: "account", previousId: null, kind: "Evaluation", label: "Synthetic",
  startAt: "2026-10-01T22:00:00.000Z", endAt: null, baseline: "50000", historyConfirmed: false,
  status: "Active", statusAt: "2026-10-01T22:00:00.000Z", note: "",
};
function rules(mode: "Static" | "End-of-day trailing" | "Intraday trailing" = "Static") {
  const r = customTrackingRules(); r.stage = "Evaluation"; r.ledgerStart = "50000";
  r.drawdown.mode = mode; r.drawdown.distance = "2000"; r.drawdown.initialThreshold = "48000";
  r.drawdown.highWater = "50000"; r.drawdown.cap = "50100"; r.drawdown.activation = "immediate";
  r.session = { timezone: "America/Chicago", reset: "17:00", close: "16:00", confirmed: false };
  r.evaluation.target = "3000"; return r;
}
const version = (r = rules(), effectiveAt = phase.startAt): RuleVersion => ({
  id: "v:" + effectiveAt, phaseId: phase.id, effectiveAt, rules: rulesSchema.parse(toLegacyRules(r)),
});
const part = (id: string, at: string, pnl = "1000"): Portion => ({
  id, ownerId: "synthetic", tradingAccountId: "account", symbol: "MNQZ6", buyFillId: id + "b", sellFillId: id + "s",
  quantity: "1", buyPrice: "100", sellPrice: "101", grossPnl: pnl,
  boughtAt: new Date(Date.parse(at) - 60000).toISOString(), soldAt: at,
});
const a = part("a", "2026-10-02T14:00:00.000Z");
const fee = (amount = "0", kind: PortionFee["kind"] = "Manual"): PortionFee => ({ amount, kind });
const now = "2026-10-04T00:00:00.000Z";
describe("imported account overview without reconciliation gates", () => {
  it("uses precise net sources once without history confirmation, and separates cash from profit", () => {
    const source = { ...a, grossPnl: "261.5" };
    const o = importedOverview(phase, [version()], [source, source, { ...source, id: "foreign", tradingAccountId: "other" }], { a: fee("12.48", "Allocated") }, [
      { id: "cash", tradingAccountId: "account", kind: "deposit", amount: "100", effectiveAt: "2026-10-02T15:00:00.000Z", explanation: "Synthetic" },
    ], [], now);
    expect(o.netProfit).toBe("249.02"); expect(o.balance).toBe("50349.02");
    expect(o.remainingProfit).toBe("2750.98"); expect(o.threshold).toBe("48000");
    expect(o.buffer).toBe("2349.02"); expect(o.tradingDays).toBe(1);
    expect(o.points.at(-1)?.target).toBe("53100");
  });
  it("keeps fees unknown and still counts actual activity days", () => {
    const o = importedOverview(phase, [version()], [a], {}, [], [], now);
    expect(o.netProfit).toBeNull(); expect(o.balance).toBeNull(); expect(o.buffer).toBeNull();
    expect(o.threshold).toBe("48000"); expect(o.tradingDays).toBe(1); expect(o.missingFees).toBe(1);
    expect(o.points[0].balance).toBe("50000"); expect(o.points.at(-1)?.balance).toBeNull();
  });
  it("holds static floors fixed despite winning trades and configured high water", () => {
    const r = rules(); r.drawdown.highWater = "60000";
    const o = importedOverview(phase, [version(r)], [a], { a: fee() }, [], [], now);
    expect(o.balance).toBe("51000"); expect(o.points.every((p) => p.floor === "48000")).toBe(true);
  });
  it("trails EOD using the session closing balance, not an individual winning trade", () => {
    const b = part("b", "2026-10-02T20:00:00.000Z", "-500");
    const o = importedOverview(phase, [version(rules("End-of-day trailing"))], [a, b], { a: fee(), b: fee() }, [], [], now);
    expect(o.points.find((p) => p.at === a.soldAt)?.floor).toBe("48000");
    expect(o.points.find((p) => p.at === "2026-10-02T21:00:00.000Z")?.floor).toBe("48500");
    expect(o.threshold).toBe("48500"); expect(o.daily.find((p) => p.sessionDate === "2026-10-02")?.balance).toBe("50500");
    expect(o.limitEstimated).toBe(false);
  });
  it("honors next-session activation and the trailing cap without lowering the limit", () => {
    const r = rules("End-of-day trailing"); r.drawdown.activation = "nextSession";
    const win = { ...a, grossPnl: "5000" }, loss = part("loss", "2026-10-03T15:00:00.000Z", "-1000");
    const o = importedOverview(phase, [version(r)], [win, loss], { a: fee(), loss: fee() }, [], [], now);
    expect(o.points.find((p) => p.at === "2026-10-02T21:00:00.000Z")?.floor).toBe("48000");
    expect(o.points.find((p) => p.at === "2026-10-02T22:00:00.000Z")?.floor).toBe("50100");
    expect(o.threshold).toBe("50100");
  });
  it("labels closed-trade intraday and fee estimates and respects the cap", () => {
    const o = importedOverview(phase, [version(rules("Intraday trailing"))], [a], { a: fee("10", "Estimated") }, [], [], now);
    expect(o.balance).toBe("50990"); expect(o.threshold).toBe("48990");
    expect(o.limitEstimated).toBe(true); expect(o.estimatedFees).toBe(true);
    expect(o.points.find((p) => p.at === a.soldAt)?.estimated).toBe(true);
  });
  it("uses firm sessions across the fall DST boundary and never counts inactive days", () => {
    const r = rules(); r.session.timezone = "America/New_York";
    const p = { ...phase, startAt: "2026-10-31T21:00:00.000Z" };
    const x = part("x", "2026-11-01T05:30:00.000Z"), y = part("y", "2026-11-01T06:30:00.000Z");
    const o = importedOverview(p, [version(r, p.startAt)], [x, y], { x: fee(), y: fee() }, [], [], "2026-11-04T00:00:00.000Z");
    expect(o.tradingDays).toBe(1); expect(o.balance).toBe("52000");
    expect(o.daily.some((p) => p.at === "2026-11-01T21:00:00.000Z" && p.balance === "52000")).toBe(true);
    expect(o.points.at(-1)?.balance).toBe("52000");
  });
  it("deducts a recorded payout once, excludes receipts from profit, and preserves reset boundaries", () => {
    const payout = { id: "pay", phaseId: phase.id, deductionId: "deduction", requestedAt: "2026-10-02T15:00:00.000Z",
      deductedAt: "2026-10-02T17:00:00.000Z", deductionAmount: "200", approvedAt: null, paidAt: "2026-10-03T12:00:00.000Z", receiptAmount: "160" } as Payout;
    const cash = { id: "deduction", tradingAccountId: "account", kind: "withdrawal" as const, amount: "-200", effectiveAt: payout.deductedAt!, explanation: "" };
    const o = importedOverview(phase, [version()], [a], { a: fee("10") }, [cash, cash], [payout, payout], now);
    expect(o.balance).toBe("50790"); expect(o.netProfit).toBe("990");
    const reset: Phase = { ...phase, id: "reset", previousId: phase.id, kind: "Funded", startAt: "2026-10-03T00:00:00.000Z", baseline: "0" };
    const r = rules(); r.stage = "Sim Funded"; r.ledgerStart = "0"; r.drawdown.initialThreshold = "-500";
    const fresh = importedOverview(reset, [{ ...version(r, reset.startAt), phaseId: reset.id }], [a], { a: fee("10") }, [cash], [payout], now);
    expect(fresh.balance).toBe("0"); expect(fresh.netProfit).toBe("0"); expect(fresh.tradingDays).toBe(0); expect(fresh.targetProfit).toBeNull();
  });
  it("keeps saved snapshots separate and does not require them to display imported balance", () => {
    const result = phaseProgress(phase, [version()], [a], { a: fee("10") }, [], [
      { id: "manual", phaseId: phase.id, asOf: "2026-10-03T00:00:00.000Z", balance: "90000", threshold: "80000", qualifyingDays: null, note: "Preserved" },
    ], now);
    expect(result.imported.balance).toBe("50990"); expect(result.imported.netProfit).toBe("990");
    expect(result.snapshots[0].balance).toBe("90000"); expect(result.tracking?.confirmedSnapshot?.balance).toBe("90000");
  });
  it("does not assign an unfinished session a daily closing balance", () => {
    const o = importedOverview(phase, [version(rules("End-of-day trailing"))], [a], { a: fee() }, [], [], "2026-10-02T20:00:00.000Z");
    expect(o.balance).toBe("51000"); expect(o.daily.every((p) => p.sessionDate === null)).toBe(true);
    expect(o.daily.at(-1)?.balance).toBe("50000");
  });
});
