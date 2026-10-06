import { describe, expect, it } from "vitest";
import {
  tradingAccountSchema,
  accountValues,
  exactDecimal,
} from "@/lib/accounts/validation";
import { authorizedSelection } from "@/lib/accounts/types";
import { safeRedirect } from "@/lib/auth-policy";
import { readFileSync } from "node:fs";
const input = {
  displayName: "My evaluation",
  firmChoice: "Apex Trader Funding",
  customFirm: "",
  platform: "Tradovate",
  brokerIdentifier: "000012345678901234567890",
  stage: "Evaluation",
  status: "Active",
  nominalSize: "9999999999999999.99",
  openingBalance: "",
  openingBalanceDate: "",
  currency: "USD",
  reportingTimezone: "Asia/Jerusalem",
  notes: "",
};
describe("Day 2 exact account input and data separation", () => {
  it("preserves exact numeric inputs and broker identifiers as strings", () => {
    const values = accountValues(tradingAccountSchema.parse(input));
    expect(values.nominalSize).toBe("9999999999999999.99");
    expect(values.brokerIdentifier).toBe(input.brokerIdentifier);
    expect(values.openingBalance).toBeNull();
    expect(exactDecimal("000050000.1")).toBe("50000.10");
    expect(
      tradingAccountSchema.safeParse({ ...input, nominalSize: "1.001" })
        .success,
    ).toBe(false);
  });
  it("requires a real calendar date for an explicit baseline and permits a Personal account without a firm", () => {
    expect(
      tradingAccountSchema.safeParse({ ...input, openingBalance: "0" }).success,
    ).toBe(false);
    expect(
      tradingAccountSchema.safeParse({
        ...input,
        openingBalance: "5",
        openingBalanceDate: "2026-02-30",
      }).success,
    ).toBe(false);
    expect(
      accountValues(
        tradingAccountSchema.parse({
          ...input,
          stage: "Personal",
          firmChoice: "",
          openingBalance: "-20.25",
          openingBalanceDate: "2026-03-01",
        }),
      ),
    ).toMatchObject({ firm: null, openingBalance: "-20.25" });
    expect(
      tradingAccountSchema.safeParse({ ...input, reportingTimezone: "NewYork" })
        .success,
    ).toBe(false);
  });
  it("rejects forged ownership fields and validates URL selections against active authorized records", () => {
    expect(
      tradingAccountSchema.safeParse({ ...input, ownerId: "someone-else" })
        .success,
    ).toBe(false);
    const accounts = [
      { id: "owned", archivedAt: null },
      { id: "archived", archivedAt: "2026-10-05" },
    ];
    expect(
      authorizedSelection(accounts, "forged,archived,demo-apex,owned,owned"),
    ).toEqual(["owned"]);
    expect(authorizedSelection(accounts, "")).toEqual([]);
    expect(authorizedSelection(accounts, undefined)).toEqual(["owned"]);
  });
  it("retains owner/platform identifier uniqueness for archived records and excludes later schemas", () => {
    const sql = readFileSync("drizzle/0000_faithful_gambit.sql", "utf8");
    const unique = sql
      .split("\n")
      .find((line) =>
        line.includes(
          'CREATE UNIQUE INDEX "trading_accounts_owner_platform_broker_unique"',
        ),
      )!;
    expect(unique).toContain('"owner_id","platform","broker_identifier"');
    expect(unique).not.toContain("archived_at");
    expect(sql).toContain("numeric(18, 2)");
    expect(sql).toContain("trading_accounts_opening_pair");
    expect(sql).not.toMatch(
      /CREATE TABLE "(trades|imports|payouts|screenshots)"/,
    );
  });
});
describe("private redirect policy", () => {
  it("rejects unsafe redirects", () => {
    for (const url of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "/api/auth/sign-up/email",
      "/login",
      "/%2f%2fevil.example",
    ])
      expect(safeRedirect(url)).toBe("/");
    expect(safeRedirect("/prop-accounts")).toBe("/prop-accounts");
    expect(safeRedirect("/?mode=demo")).toBe("/?mode=demo");
  });
});
