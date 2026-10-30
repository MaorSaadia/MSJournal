import { describe, expect, it } from "vitest";
import { calculateMsScore } from "../lib/dashboard/ms-score";
import { tradeText } from "../lib/journal/labels";
import { summary } from "../lib/journal/statistics";
const days = (values: (string | null)[]) =>
  values.map((total, i) => ({
    date: `2026-10-${String(i + 1).padStart(2, "0")}`,
    total,
  }));
describe("MS Score v1", () => {
  it("uses six equally weighted measures and daily drawdown in date order", () => {
    const values = ["100", "-50", "150"];
    const score = calculateMsScore(summary(values), days(values).reverse());
    expect(score.axes).toHaveLength(6);
    expect(score.axes.find((axis) => axis.axis === "Drawdown")?.raw).toBe(
      "50.00",
    );
    expect(
      score.axes.find((axis) => axis.axis === "Drawdown")?.value,
    ).toBeCloseTo(100 * (1 - 50 / 300), 10);
    expect(score.axes.find((axis) => axis.axis === "Consistency")?.value).toBe(
      80,
    );
    // 66.6667 + 100 + 83.3333 + 100 + 83.3333 + 80, divided by six.
    expect(score.value).toBe("85.56");
    expect(score.early).toBe(true);
  });
  it("does not invent scores for empty, all-flat or incomplete P&L", () => {
    expect(calculateMsScore(summary([]), []).value).toBeNull();
    expect(calculateMsScore(summary(["0"]), days(["0"])).value).toBeNull();
    expect(
      calculateMsScore(summary(["1", null]), days(["1", null])).value,
    ).toBeNull();
  });
  it("handles no-loss and all-loss samples without infinite ratios or NaN", () => {
    const winning = calculateMsScore(
      summary(["100", "100", "100"]),
      days(["100", "100", "100"]),
    );
    expect(winning.value).toBe("100.00");
    expect(winning.early).toBe(true);
    const losing = calculateMsScore(
      summary(["-100", "-100"]),
      days(["-100", "-100"]),
    );
    expect(losing.value).toBe("0.00");
    for (const axis of [...winning.axes, ...losing.axes])
      expect(Number.isFinite(axis.value)).toBe(true);
  });
  it("caps ratios, includes breakevens in win rate and labels a supported larger sample", () => {
    const values = Array.from({ length: 20 }, (_, i) =>
      i % 4 === 0 ? "0" : i % 4 === 1 ? "-.1" : ".3",
    );
    const score = calculateMsScore(summary(values), days(values));
    expect(score.axes.find((axis) => axis.axis === "Win %")?.value).toBe(50);
    expect(score.early).toBe(false);
    for (const axis of score.axes) {
      expect(axis.value).toBeGreaterThanOrEqual(0);
      expect(axis.value).toBeLessThanOrEqual(100);
    }
    expect(Number(score.value)).toBeGreaterThanOrEqual(0);
    expect(Number(score.value)).toBeLessThanOrEqual(100);
  });
});

it("uses display wording for old saved descriptions without changing stored statuses", () => {
  expect(tradeText("Matched portions")).toBe("Matched trades");
  expect(
    tradeText("2 matched portions. Open portions may be absent."),
  ).not.toMatch(/\bportions?\b/i);
});
