import { describe, it, expect } from "vitest";
import { propPresets, toLegacyRules } from "@/lib/props/presets";
import { rulesSchema } from "@/lib/props/validation";

const find = (firm: string, product: string, stage: string, size: number) =>
  propPresets.find(
    (p) =>
      p.rules.firm === firm &&
      p.rules.product === product &&
      p.rules.stage === stage &&
      p.rules.size === String(size),
  )!;
const sizes = (firm: string, product: string, stage = "Evaluation") =>
  [
    ...new Set(
      propPresets
        .filter(
          (p) =>
            p.rules.firm === firm &&
            p.rules.product === product &&
            p.rules.stage === stage,
        )
        .map((p) => Number(p.rules.size)),
    ),
  ].sort((a, b) => a - b);

describe("official account-size catalog", () => {
  it("covers current Apex sizes with exact targets, thresholds and stage-specific DLLs", () => {
    for (const mode of ["EOD", "Intraday"]) {
      expect(sizes("Apex", mode)).toEqual([25000, 50000, 100000, 150000]);
      expect(sizes("Apex", mode, "Sim Funded")).toEqual([
        25000, 50000, 100000, 150000,
      ]);
      const evaluation = find("Apex", mode, "Evaluation", 150000).rules;
      expect(evaluation.evaluation.target).toBe("9000");
      expect(evaluation.drawdown.initialThreshold).toBe("146000");
      expect(evaluation.daily.amount).toBe(mode === "EOD" ? "2000" : null);
      expect(evaluation.drawdown.activation).toBe(
        mode === "EOD" ? "nextSession" : "immediate",
      );
      const pa = find("Apex", mode, "Sim Funded", 100000).rules;
      expect(pa.drawdown.cap).toBe("100100");
      expect(pa.payout.minimumBalanceToSubmit).toBe("103600");
      expect(pa.payout.caps).toEqual(
        mode === "EOD"
          ? ["2000", "2500", "2500", "3000", "4000", "4000"]
          : ["2000", "2500", "3000", "3000", "4000", "4000"],
      );
      expect(pa.payout.dailyProfit).toBe(mode === "EOD" ? "300" : "250");
      expect(pa.positions.tiers.at(-1)).toMatchObject({
        minis: 6,
        dailyLoss: "3500",
      });
    }
  });
  it("does not apply newer Intraday distances to Apex legacy sizes", () => {
    expect(
      find("Apex", "Legacy Full", "Evaluation", 150000).rules.drawdown.distance,
    ).toBe("5000");
    expect(find("Apex", "Legacy Full", "Evaluation", 300000).legacy).toBe(true);
    expect(
      find("Apex", "Legacy Full", "Evaluation", 300000).rules.evaluation.target,
    ).toBeNull();
  });
  it("uses Lucid product-specific sizes, floors, payouts and scaling", () => {
    for (const product of ["Pro", "Flex", "Daily"])
      for (const stage of ["Evaluation", "Sim Funded"])
        expect(sizes("Lucid", product, stage)).toEqual([
          25000, 50000, 100000, 150000,
        ]);
    expect(sizes("Lucid", "Direct", "Sim Funded")).toEqual([
      25000, 50000, 100000, 150000,
    ]);
    expect(sizes("Lucid", "Black Legacy")).toEqual([25000, 50000, 100000]);
    expect(
      find("Lucid", "Direct", "Sim Funded", 150000).rules.drawdown.distance,
    ).toBe("5000");
    const flex = find("Lucid", "Flex", "Sim Funded", 25000).rules;
    expect(flex.payout.caps).toEqual(["1000"]);
    expect(flex.payout.dailyProfit).toBe("100");
    expect(flex.positions.tiers[0].minis).toBe(1);
    expect(
      find("Lucid", "Pro", "Sim Funded", 150000).rules.payout
        .minimumBalanceAfter,
    ).toBe("154600");
    expect(
      find("Lucid", "Flex", "Evaluation", 100000).rules.consistency.percent,
    ).toBe("40");
  });
  it("keeps MFFU zero-ledger funded stages and supported product sizes distinct", () => {
    expect(sizes("MyFundedFutures", "Rapid Intraday")).toEqual([
      25000, 50000, 100000, 150000,
    ]);
    expect(sizes("MyFundedFutures", "Rapid EOD")).toEqual([25000, 50000]);
    expect(sizes("MyFundedFutures", "Builder")).toEqual([
      25000, 50000, 100000, 150000,
    ]);
    expect(sizes("MyFundedFutures", "Pro")).toEqual([50000, 100000, 150000]);
    expect(sizes("MyFundedFutures", "Flex")).toEqual([25000, 50000]);
    const rapid = find(
      "MyFundedFutures",
      "Rapid Intraday",
      "Sim Funded",
      150000,
    );
    expect(rapid.ledger).toBe("0");
    expect(rapid.rules.drawdown.initialThreshold).toBe("-4500");
    expect(rapid.rules.drawdown.cap).toBe("100");
    const pro = find("MyFundedFutures", "Pro", "Sim Funded", 100000);
    expect(pro.ledger).toBeNull();
    expect(pro.rules.drawdown.initialThreshold).toBeNull();
    expect(pro.rules.payout.verified).toBe(false);
    expect(pro.rules.positions.micros).toBeNull();
  });
  it("retains TPT, Topstep and FundedNext supported sizes without invented combinations", () => {
    expect(sizes("Take Profit Trader", "Test")).toEqual([
      25000, 50000, 75000, 100000, 150000,
    ]);
    expect(sizes("Topstep", "Trading Combine")).toEqual([
      50000, 100000, 150000,
    ]);
    expect(sizes("FundedNext Futures", "Rapid Pro")).toEqual([
      25000, 50000, 100000,
    ]);
    expect(sizes("FundedNext Futures", "Flex")).toEqual([
      50000, 100000, 150000,
    ]);
    expect(sizes("FundedNext Futures", "Direct", "Sim Funded")).toEqual([
      50000,
    ]);
  });
  it("has unique IDs, valid typed rules and dated official sources for every new revision", () => {
    expect(new Set(propPresets.map((p) => p.id)).size).toBe(propPresets.length);
    for (const p of propPresets) {
      expect(
        () => rulesSchema.parse(toLegacyRules(p.rules)),
        p.id,
      ).not.toThrow();
      if (p.rules.preset?.version === "observed-2026-10-26-sizes") {
        expect(p.rules.preset.verifiedOn).toBe("2026-10-26");
        expect(p.rules.preset.effectiveDate).toBeNull();
        expect(p.rules.preset.sources.length).toBeGreaterThan(0);
      }
    }
    const original = find("Apex", "Intraday", "Evaluation", 50000);
    const copy = structuredClone(original.rules);
    copy.drawdown.distance = "1";
    expect(original.rules.drawdown.distance).toBe("2000");
  });
});
