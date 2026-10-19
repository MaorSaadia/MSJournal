import type { PropPreset } from "./presets";
const base = "https://takeprofittraderhelp.zendesk.com/hc/en-us/articles/";
// Stage-specific tables checked 2026-10-19. Saved account snapshots are unaffected.
export function expandTptPresets(registry: PropPreset[]) {
  for (const product of ["Test", "PRO"] as const) {
    const template = registry.find(
      (p) => p.id === `tpt-${product.toLowerCase()}-50`,
    )!;
    for (const [size, target, distance, minis] of [
      [25000, 1500, 1500, 3],
      [50000, 3000, 2000, 6],
      [75000, 4500, 2500, 9],
      [100000, 6000, 3000, 12],
      [150000, 9000, 4500, 15],
    ]) {
      const id = `tpt-${product.toLowerCase()}-${size / 1000}`;
      const rules = structuredClone(template.rules);
      rules.size = String(size);
      rules.ledgerStart = String(size);
      Object.assign(rules.drawdown, {
        distance: String(distance),
        initialThreshold: String(size - distance),
        highWater: String(size),
        cap: String(size),
        basis: product === "PRO" ? "equity" : "balance",
        breachBasis: "equity",
      });
      const sources = [
        base + "15169070804125-Rule-1-Hit-Your-Profit-Target",
        base +
          "15170265979165-Rule-3-Do-Not-Hit-End-Of-Day-EOD-Maximum-Trailing-Drawdown",
        base + "15170316538013-Rule-5-Be-Consistent",
        base + "15169066911133-Rule-2-Do-Not-Exceed-Maximum-Position-Size",
      ];
      const gaps = [
        "Confirm platform, session cutoff, restrictions and your purchased agreement. Historical five-day Tests require custom rules.",
      ];
      if (product === "Test") {
        rules.evaluation.target = String(target);
        rules.evaluation.targetAdjustsForConsistency = true;
        rules.positions.minis = minis;
        rules.positions.micros = minis * 10;
        rules.positions.microPerMini = 10;
      } else {
        rules.payout.minimumBalanceToSubmit = String(size + distance);
        rules.payout.minimumBalanceAfter = String(size + distance);
        // Test position tables do not establish every PRO agreement's exposure limits.
        rules.positions.minis = null;
        rules.positions.micros = null;
        sources.push(
          base + "15171769361053-PRO-Account-Rules",
          base + "15172219527581-PRO-Account-Profit-Split-Withdrawal-Rules",
        );
        gaps.push(
          "Confirm PRO position limits, consistency applicability, minimum request and exact payout-cycle event. Intraday equity thresholds require firm-dashboard snapshots. Closed-account buffer liquidation is separate from ordinary payouts.",
        );
      }
      rules.preset = {
        ...rules.preset!,
        id,
        version: "observed-2026-10-19",
        verifiedOn: "2026-10-19",
        effectiveDate: null,
        sources,
        gaps,
        customized: false,
      };
      const preset = {
        id,
        label: `${product} / ${rules.stage} / ${size / 1000}K`,
        rules,
        ledger: String(size),
        legacy: false,
      };
      const index = registry.findIndex((p) => p.id === id);
      if (index >= 0) registry[index] = preset;
      else registry.push(preset);
    }
  }
}
