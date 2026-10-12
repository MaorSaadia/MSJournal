import { describe, it, expect } from "vitest";
import {
  phaseProgress,
  ruleDay,
  ruleBoundary,
  overlaps,
  type Phase,
  type RuleVersion,
} from "@/lib/props/model";
import { emptyRules, rulesSchema } from "@/lib/props/validation";
import type { Portion, PortionFee } from "@/lib/journal/processing";
const phase: Phase = {
  id: "p",
  tradingAccountId: "a",
  previousId: null,
  kind: "Evaluation",
  label: "Fictional test phase",
  startAt: "2026-10-01T00:00:00.000Z",
  endAt: null,
  baseline: "100",
  historyConfirmed: true,
  status: "Active",
  statusAt: "2026-10-01T00:00:00.000Z",
  note: "",
};
const rule = (changes: Partial<typeof emptyRules> = {}): RuleVersion => ({
  id: "r",
  phaseId: "p",
  effectiveAt: phase.startAt,
  rules: rulesSchema.parse({
    ...emptyRules,
    timezone: "UTC",
    resetTime: "00:00",
    dayLabel: "start",
    daySettingsConfirmed: true,
    ...changes,
  }),
});
function portion(
  id: string,
  pnl: string,
  exit: string,
  entry = "2026-10-01T00:01:00.000Z",
): Portion {
  return {
    id,
    ownerId: "u",
    tradingAccountId: "a",
    symbol: "MNQ",
    quantity: "1",
    buyFillId: "b" + id,
    sellFillId: "s" + id,
    buyPrice: "100",
    sellPrice: "101",
    grossPnl: pnl,
    boughtAt: entry,
    soldAt: exit,
  };
}
function compute(
  parts: Portion[],
  version = rule(),
  now = "2026-10-04T12:00:00.000Z",
  fees: Record<string, PortionFee> = Object.fromEntries(
    parts.map((p) => [p.id, { amount: "0", kind: "Manual" }]),
  ),
) {
  return phaseProgress(phase, [version], parts, fees, [], [], now).current!;
}
describe("Custom prop progress from observed imported results", () => {
  it("keeps trading profit separate from cash and compares a static floor at the last imported close", () => {
    const parts = [
      portion("one", "10", "2026-10-01T12:00:00.000Z"),
      portion("two", "-3", "2026-10-02T12:00:00.000Z"),
    ];
    const fees = Object.fromEntries(
      parts.map((p) => [p.id, { amount: "0", kind: "Manual" as const }]),
    );
    const data = phaseProgress(
      phase,
      [rule({ profitTarget: "5", staticFloor: "150" })],
      parts,
      fees,
      [
        {
          id: "c",
          tradingAccountId: "a",
          effectiveAt: "2026-10-02T10:00:00.000Z",
          amount: "50",
          kind: "deposit",
          explanation: "Synthetic",
        },
      ],
      [],
      "2026-10-04T00:00:00.000Z",
    ).current!;
    expect(data).toMatchObject({
      total: "7",
      remainingProfit: "0",
      targetReached: true,
      lastBalance: "157",
      buffer: "7",
    });
    expect(data.crossings[0]).toMatchObject({ balance: "110", floor: "150" });
    expect(phase.status).toBe("Active");
  });
  it("uses DST-aware session boundaries, reset time and date-label conventions", () => {
    const r = rule({
      timezone: "America/New_York",
      resetTime: "17:00",
      dayLabel: "end",
    }).rules;
    const spring = ruleDay("2026-03-08T12:00:00.000Z", r),
      fall = ruleDay("2026-11-01T12:00:00.000Z", r);
    expect(spring.date).toBe("2026-03-08");
    expect((Date.parse(spring.end) - Date.parse(spring.start)) / 3600000).toBe(
      23,
    );
    expect((Date.parse(fall.end) - Date.parse(fall.start)) / 3600000).toBe(25);
    expect(ruleDay("2026-11-01T22:00:00.000Z", r).date).toBe("2026-11-02");
    expect(() =>
      ruleBoundary("2026-03-08", {
        timezone: "America/New_York",
        resetTime: "02:30",
      }),
    ).toThrow(/does not exist/);
    expect(() =>
      ruleBoundary("2026-11-01", {
        timezone: "America/New_York",
        resetTime: "01:30",
      }),
    ).toThrow(/ambiguous/);
  });
  it("advances completed-day trailing floors, never decreases, and applies a cap", () => {
    const parts = [
      portion("one", "20", "2026-10-01T12:00:00.000Z"),
      portion("two", "-5", "2026-10-02T12:00:00.000Z"),
      portion("three", "30", "2026-10-03T12:00:00.000Z"),
    ];
    const p = compute(
      parts,
      rule({
        drawdownMode: "End-of-day trailing",
        trailingDistance: "10",
        startingHighWater: "100",
        floorCap: "125",
      }),
    );
    expect(p.latestFloor).toBe("125");
    const floors = p.points
      .map((p) => p.floor)
      .filter((v): v is string => v !== null)
      .map(Number);
    expect(floors).toEqual([...floors].sort((a, b) => a - b));
    expect(floors).toContain(110);
  });
  it("does not let an unfinished current rule day advance an end-of-day floor", () => {
    const parts = [
      portion("one", "20", "2026-10-01T12:00:00.000Z"),
      portion("two", "100", "2026-10-02T12:00:00.000Z"),
    ];
    const p = compute(
      parts,
      rule({
        drawdownMode: "End-of-day trailing",
        trailingDistance: "10",
        startingHighWater: "100",
      }),
      "2026-10-02T15:00:00.000Z",
    );
    expect(p.latestFloor).toBe("110");
    expect(p.qualifying).toBe(1);
    expect(p.days[1]).toMatchObject({ complete: false, qualifying: null });
    const partialPhase = { ...phase, startAt: "2026-10-01T10:00:00.000Z" };
    const partialRule = {
      ...rule({
        drawdownMode: "End-of-day trailing",
        trailingDistance: "10",
        startingHighWater: "100",
      }),
      effectiveAt: partialPhase.startAt,
    };
    const partial = phaseProgress(
      partialPhase,
      [partialRule],
      [
        portion(
          "partial",
          "20",
          "2026-10-01T12:00:00.000Z",
          "2026-10-01T10:01:00.000Z",
        ),
      ],
      { partial: { amount: "0", kind: "Manual" } },
      [],
      [],
      "2026-10-02T15:00:00.000Z",
    ).current!;
    expect(partial.latestFloor).toBe("110");
    expect(partial.qualifying).toBe(0);
  });
  it("keeps intraday thresholds manual and invalidates inferred trailing floors after cash", () => {
    const parts = [portion("one", "20", "2026-10-01T12:00:00.000Z")];
    expect(
      compute(
        parts,
        rule({ drawdownMode: "Intraday trailing", trailingDistance: "10" }),
      ),
    ).toMatchObject({ latestFloor: null, buffer: null });
    const p = phaseProgress(
      phase,
      [
        rule({
          drawdownMode: "End-of-day trailing",
          trailingDistance: "10",
          startingHighWater: "100",
        }),
      ],
      parts,
      { one: { amount: "0", kind: "Manual" } },
      [
        {
          id: "cash",
          tradingAccountId: "a",
          effectiveAt: "2026-10-01T10:00:00.000Z",
          amount: "10",
          kind: "deposit",
          explanation: "Synthetic",
        },
      ],
      [],
      "2026-10-03T12:00:00.000Z",
    ).current!;
    expect(p).toMatchObject({ total: "20", latestFloor: null, buffer: null });
    expect(p.warnings.join(" ")).toMatch(/Cash adjustment treatment/);
  });
  it("distinguishes unknown fees, estimates, unconfirmed history and unknown day settings", () => {
    const parts = [portion("one", "20", "2026-10-01T12:00:00.000Z")];
    expect(
      compute(parts, rule({ basis: "net", profitTarget: "10" }), undefined, {}),
    ).toMatchObject({ state: "Incomplete data", total: null, buffer: null });
    expect(
      compute(parts, rule({ basis: "net" }), undefined, {
        one: { amount: "2", kind: "Estimated" },
      }),
    ).toMatchObject({
      state: "Estimated",
      total: "18",
      balanceEstimated: true,
    });
    expect(compute(parts, rule({ daySettingsConfirmed: false }))).toMatchObject(
      { qualifying: null, days: [] },
    );
    expect(
      phaseProgress(
        { ...phase, historyConfirmed: false },
        [rule()],
        parts,
        { one: { amount: "0", kind: "Manual" } },
        [],
        [],
        "2026-10-03T00:00:00.000Z",
      ).current,
    ).toMatchObject({ state: "Incomplete data", lastBalance: null });
  });
  it("detects realized daily loss crossings even when the day recovers, and defines strict consistency", () => {
    const parts = [
      portion("one", "-20", "2026-10-01T10:00:00.000Z"),
      portion("two", "30", "2026-10-01T12:00:00.000Z"),
    ];
    const strict = compute(
      parts,
      rule({
        dailyLoss: "15",
        consistencyPercent: "100",
        consistencyComparison: "strict",
      }),
    );
    expect(strict.days[0]).toMatchObject({
      pnl: "10",
      minimum: "-20",
      lossCrossing: true,
    });
    expect(strict).toMatchObject({ consistency: "100", consistencyMet: false });
    expect(
      compute(
        parts,
        rule({ consistencyPercent: "100", consistencyComparison: "inclusive" }),
      ).consistencyMet,
    ).toBe(true);
    expect(
      compute(
        [portion("loss", "-5", "2026-10-01T12:00:00.000Z")],
        rule({ consistencyPercent: "0" }),
      ).consistency,
    ).toBeNull();
  });
  it("does not turn a snapshot into P&L/baseline and excludes ambiguous phase/reset positions", () => {
    const before = portion(
        "before",
        "5",
        "2026-09-30T12:00:00.000Z",
        "2026-09-30T10:00:00.000Z",
      ),
      spanning = portion(
        "spanning",
        "100",
        "2026-10-01T01:00:00.000Z",
        "2026-09-30T22:00:00.000Z",
      ),
      after = portion("after", "10", "2026-10-01T12:00:00.000Z");
    const p = phaseProgress(
      phase,
      [rule()],
      [before, spanning, after],
      { after: { amount: "0", kind: "Manual" } },
      [],
      [
        {
          id: "s",
          phaseId: "p",
          asOf: "2026-10-01T13:00:00.000Z",
          balance: "500",
          threshold: "490",
          qualifyingDays: 1,
          note: "Synthetic",
        },
      ],
      "2026-10-03T00:00:00.000Z",
    );
    expect(p).toMatchObject({ gross: "10", ambiguous: 1, portionCount: 1 });
    expect(p.phase.baseline).toBe("100");
    expect(p.snapshots[0].balance).toBe("500");
    const old = phaseProgress(
      { ...phase, endAt: "2026-10-02T00:00:00.000Z" },
      [rule()],
      [
        portion(
          "outbound",
          "25",
          "2026-10-02T12:00:00.000Z",
          "2026-10-01T10:00:00.000Z",
        ),
      ],
      {},
      [],
      [],
      "2026-10-03T00:00:00.000Z",
    );
    expect(old).toMatchObject({ gross: "0", ambiguous: 1 });
    expect(old.current?.state).toBe("Incomplete data");

    expect(
      overlaps(
        { startAt: "2026-10-01", endAt: "2026-10-02" },
        { startAt: "2026-10-02", endAt: null },
      ),
    ).toBe(false);
    expect(
      overlaps(
        { startAt: "2026-10-01", endAt: null },
        { startAt: "2026-10-02", endAt: null },
      ),
    ).toBe(true);
  });
  it("versions rules by effective periods and preserves zero limits separately from blanks", () => {
    const parts = [
      portion("one", "10", "2026-10-01T12:00:00.000Z"),
      portion(
        "two",
        "20",
        "2026-10-02T12:00:00.000Z",
        "2026-10-02T10:00:00.000Z",
      ),
    ];
    const second = {
      ...rule({ profitTarget: "15" }),
      id: "r2",
      effectiveAt: "2026-10-02T00:00:00.000Z",
    };
    const p = phaseProgress(
      phase,
      [rule({ profitTarget: "50" }), second],
      parts,
      {
        one: { amount: "0", kind: "Manual" },
        two: { amount: "0", kind: "Manual" },
      },
      [],
      [],
      "2026-10-04T00:00:00.000Z",
    );
    expect(p.periods.map((v) => v.periodTotal)).toEqual(["10", "20"]);
    expect(p.periods.map((v) => v.total)).toEqual(["10", "30"]);
    expect(p.current?.targetReached).toBe(true);
    expect(p.current?.qualifying).toBe(2);
    expect(p.gross).toBe("30");
    expect(p.periods[0].lastBalance).toBe("110");
    expect(p.periods[0].lastClose).toBe("2026-10-01T12:00:00.000Z");
    expect(
      rule({ profitTarget: "0", dailyLoss: "0", minimumDays: "0" }).rules,
    ).toMatchObject({ profitTarget: "0", dailyLoss: "0", minimumDays: 0 });
    expect(rule().rules.profitTarget).toBeNull();
  });
});
