import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
const fixture = vi.hoisted(() => ({
  owner: { id: "owner-id", email: "owner@example.com", name: "Owner" },
  authorize: vi.fn(),
  predicates: [] as { sql: string; params: unknown[] }[],
  inserted: undefined as unknown,
  rows: [] as Record<string, unknown>[],
  updateError: undefined as unknown,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/session", () => ({
  requireOwner: fixture.authorize,
  UnauthorizedError: class extends Error {},
}));
vi.mock("@/db/client", () => ({
  getDb: () => {
    const dialect = new PgDialect();
    const capture = (predicate: Parameters<typeof dialect.sqlToQuery>[0]) =>
      fixture.predicates.push(dialect.sqlToQuery(predicate));
    return {
      select: () => ({
        from: () => ({
          where: (predicate: Parameters<typeof dialect.sqlToQuery>[0]) => {
            capture(predicate);
            return {
              orderBy: () => Promise.resolve(fixture.rows),
              then: (resolve: (rows: unknown) => void) => resolve(fixture.rows),
            };
          },
        }),
      }),
      update: () => ({
        set: () => ({
          where: (predicate: Parameters<typeof dialect.sqlToQuery>[0]) => {
            capture(predicate);
            return {
              returning: () =>
                fixture.updateError
                  ? Promise.reject(fixture.updateError)
                  : Promise.resolve(fixture.rows),
            };
          },
        }),
      }),
      insert: () => ({
        values: (values: unknown) => {
          fixture.inserted = values;
          return { returning: () => Promise.resolve(fixture.rows) };
        },
      }),
    };
  },
}));
import {
  listTradingAccounts,
  getTradingAccount,
  saveTradingAccount,
  archiveTradingAccount,
  NotFoundError,
  DuplicateAccountError,
} from "@/lib/accounts/service";
const id = "020ff9cd-a993-4c4f-b942-911e6b80dbde";
describe("account service authorization (database mocked)", () => {
  beforeEach(() => {
    fixture.authorize.mockReset();
    fixture.authorize.mockResolvedValue(fixture.owner);
    fixture.predicates.length = 0;
    fixture.rows = [];
    fixture.updateError = undefined;
    fixture.inserted = undefined;
  });
  it("denies unauthenticated operations before any account query", async () => {
    fixture.authorize.mockRejectedValue(new Error("Unauthorized"));
    for (const operation of [
      () => listTradingAccounts(),
      () => getTradingAccount(id),
      () => saveTradingAccount({}),
      () => archiveTradingAccount(id, true),
    ])
      await expect(operation()).rejects.toThrow("Unauthorized");
    expect(fixture.predicates).toEqual([]);
  });
  it("scopes lookup, edit, archive, and restore by both account ID and server owner", async () => {
    await listTradingAccounts();
    expect(fixture.predicates[0].params).toContain("owner-id");
    await expect(getTradingAccount(id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(archiveTradingAccount(id, true)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(archiveTradingAccount(id, false)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    const values = {
      displayName: "Owned",
      firmChoice: "",
      customFirm: "",
      platform: "Tradovate",
      brokerIdentifier: "",
      stage: "Personal",
      status: "Active",
      nominalSize: "10",
      openingBalance: "",
      openingBalanceDate: "",
      currency: "USD",
      reportingTimezone: "UTC",
      notes: "",
    };
    await expect(saveTradingAccount(values, id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    for (const predicate of fixture.predicates.slice(1)) {
      expect(predicate.params).toContain("owner-id");
      expect(predicate.params).toContain(id);
      expect(predicate.sql).toContain('"owner_id"');
    }
    await expect(
      saveTradingAccount({ ...values, ownerId: "forged" }),
    ).rejects.toThrow();
    expect(fixture.inserted).toBeUndefined();
  });
  it("maps a database uniqueness rejection to a useful safe duplicate error", async () => {
    fixture.updateError = { cause: { code: "23505" } };
    const values = {
      displayName: "Owned",
      firmChoice: "",
      customFirm: "",
      platform: "Tradovate",
      brokerIdentifier: "0001",
      stage: "Personal",
      status: "Active",
      nominalSize: "10",
      openingBalance: "",
      openingBalanceDate: "",
      currency: "USD",
      reportingTimezone: "UTC",
      notes: "",
    };
    await expect(saveTradingAccount(values, id)).rejects.toBeInstanceOf(
      DuplicateAccountError,
    );
  });
});
