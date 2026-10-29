import { describe, expect, it } from "vitest";
import {
  automaticBaselines,
  type BalancePhase,
} from "@/lib/balances/automatic";
import { balanceEstimates } from "@/lib/balances/model";
import type { Portion } from "@/lib/journal/processing";
const account = {
  id: "a",
  displayName: "Apex 50K",
  currency: "USD",
  openingBalance: null,
  openingBalanceDate: null,
  reportingTimezone: "Asia/Jerusalem",
  nominalSize: "50000.00",
  startDate: null,
};
const part = (
  id: string,
  amount: string,
  entry: string,
  exit: string,
): Portion => ({
  id,
  ownerId: "u",
  tradingAccountId: "a",
  symbol: "MNQZ6",
  quantity: "1",
  buyFillId: id + "b",
  sellFillId: id + "s",
  buyPrice: "100",
  sellPrice: "101",
  grossPnl: amount,
  boughtAt: entry,
  soldAt: exit,
});
const phase: BalancePhase = {
  tradingAccountId: "a",
  startAt: "2026-10-10T09:00:00.000Z",
  endAt: null,
  baseline: "50000",
  ledgerStart: "50000",
};
function result(
  parts: Portion[] = [],
  phases: BalancePhase[] = [],
  selected = account,
) {
  const accounts = automaticBaselines(
    [selected],
    parts,
    phases,
    "2026-10-01",
    "2026-10-29",
    "Asia/Jerusalem",
  );
  return balanceEstimates(
    accounts,
    parts,
    {},
    [],
    "2026-10-01",
    "2026-10-29",
    "Asia/Jerusalem",
  );
}
describe("automatic dashboard starting balances", () => {
  it("defaults a 50K account to 50,000 with no setup and carries older imported profit exactly once", () => {
    expect(result().combined).toMatchObject({
      entering: "50000",
      ending: "50000",
    });
    const p = part(
      "p",
      "100",
      "2026-09-01T09:00:00.000Z",
      "2026-09-01T10:00:00.000Z",
    );
    expect(result([p]).combined).toMatchObject({
      entering: "50100",
      ending: "50100",
      missingFees: 1,
    });
    expect(result([p]).accounts[0].baselineSource).toBe("account-size");
    expect(account.openingBalance).toBeNull();
  });
  it("preserves explicit manual amounts and their cutoff, including zero", () => {
    const selected = {
      ...account,
      openingBalance: "51000",
      openingBalanceDate: "2026-10-02",
    };
    const rows = automaticBaselines(
      [selected],
      [
        part(
          "p",
          "999",
          "2026-09-01T09:00:00.000Z",
          "2026-09-01T10:00:00.000Z",
        ),
      ],
      [phase],
      "2026-10-01",
      "2026-10-29",
      "Asia/Jerusalem",
    );
    expect(rows[0]).toMatchObject({
      openingBalance: "51000",
      openingBalanceDate: "2026-10-02",
      baselineSource: "manual",
    });
    expect(
      automaticBaselines(
        [{ ...selected, openingBalance: "0" }],
        [],
        [],
        "2026-10-01",
        "2026-10-29",
        "Asia/Jerusalem",
      )[0].openingBalance,
    ).toBe("0");
  });
  it("uses a funded zero ledger rather than its nominal 50K size", () => {
    const r = result([], [{ ...phase, baseline: "0", ledgerStart: "0" }]);
    expect(r.accounts[0].baseline).toBe("0");
    expect(r.combined?.ending).toBe("0");
    expect(
      result([], [{ ...phase, baseline: null, ledgerStart: "0" }]).combined
        ?.ending,
    ).toBe("0");
  });
  it("honors exact phase cutoffs, fees and reset separation without inventing earlier balances", () => {
    const before = part(
      "before",
      "9000",
      "2026-10-09T09:00:00.000Z",
      "2026-10-09T10:00:00.000Z",
    );
    const crossing = part(
      "cross",
      "999",
      "2026-10-10T08:59:59.000Z",
      "2026-10-10T10:00:00.000Z",
    );
    const after = part(
      "after",
      "100",
      "2026-10-10T09:00:00.000Z",
      "2026-10-10T10:00:00.000Z",
    );
    const rows = automaticBaselines(
      [account],
      [before, crossing, after],
      [{ ...phase, baseline: "0", ledgerStart: "0" }],
      "2026-10-01",
      "2026-10-29",
      "Asia/Jerusalem",
    );
    const r = balanceEstimates(
      rows,
      [before, crossing, after],
      { after: { amount: "2", kind: "Manual" } },
      [],
      "2026-10-01",
      "2026-10-29",
      "Asia/Jerusalem",
    );
    expect(r.combined?.entering).toBeNull();
    expect(r.combined?.points[0].value).toBeNull();
    expect(r.combined?.ending).toBe("98");
  });
  it("uses the phase applicable to the selected period and leaves other-account activity out", () => {
    const old = {
      ...phase,
      startAt: "2026-09-01T00:00:00.000Z",
      endAt: "2026-11-01T00:00:00.000Z",
    };
    const later = {
      ...phase,
      startAt: "2026-11-01T00:00:00.000Z",
      baseline: "0",
      ledgerStart: "0",
    };
    expect(result([], [later, old]).accounts[0].baseline).toBe("50000");
    const other = {
      ...part(
        "other",
        "9999",
        "2026-09-01T00:00:00.000Z",
        "2026-09-01T01:00:00.000Z",
      ),
      tradingAccountId: "another",
    };
    expect(result([other]).combined?.ending).toBe("50000");
  });
  it("carries pre-range cash adjustments once without making them trading profit", () => {
    const cash = [{id:"deposit",tradingAccountId:"a",effectiveAt:"2026-09-01T12:00:00.000Z",amount:"500",kind:"deposit" as const,explanation:"Fixture"}];
    const rows = automaticBaselines([account],[],[],"2026-10-01","2026-10-29","Asia/Jerusalem",cash);
    const r = balanceEstimates(rows,[],{},cash,"2026-10-01","2026-10-29","Asia/Jerusalem");
    expect(r.combined).toMatchObject({entering:"50500",ending:"50500"});
  });

});
