import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { loadEnvConfig } from "@next/env";
import { randomUUID } from "node:crypto";
import { and, inArray } from "drizzle-orm";
import * as schema from "@/db/schema";
import { csv, performance, order } from "./fixtures/tradovate";
import { parseReport } from "@/lib/imports/parser";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ actor: "", fail: false, database: vi.fn() }));
vi.mock("@/lib/session", () => ({
  requireUser: async () => {
    if (!state.actor) throw new Error("Unauthenticated");
    return { id: state.actor };
  },
}));
vi.mock("@/db/client", () => ({ getDb: state.database }));
import { previewImport, confirmImport } from "@/lib/imports/service";
import {
  getJournal,
  journalDetails,
  processAccount,
  saveFeeSettings,
  setManualFees,
  getFeeSettings,
} from "@/lib/journal/service";
import { realizedPerformance } from "@/lib/journal/calculations";
import { D, sum } from "@/lib/journal/processing";
describe.skipIf(process.env.MSJOURNAL_TEST_DISPOSABLE !== "true")(
  "disposable journal processing, fees and isolation",
  () => {
    const users = [randomUUID(), randomUUID()],
      accounts = [randomUUID(), randomUUID()],
      emails = users.map((id) => `msjournal-test-${id}@example.invalid`);
    let db: ReturnType<(typeof import("@/db/client"))["getDb"]>,
      close: () => Promise<void>;
    const options = () => ({
      accountId: accounts[0],
      timezone: "Asia/Jerusalem",
      confirmOrders: true,
      confirmPerformance: true,
    });
    const rowA = performance({
      buyFillId: "entry-a",
      sellFillId: "exit-a",
      qty: "2",
      buyPrice: "20000",
      sellPrice: "20010",
      pnl: "40",
      boughtTimestamp: "09/30/2026 23:59:00",
      soldTimestamp: "09/30/2026 23:59:40",
    });
    const rowB = performance({
      buyFillId: "entry-a",
      sellFillId: "exit-b",
      qty: "1",
      buyPrice: "20000",
      sellPrice: "20015",
      pnl: "30",
      boughtTimestamp: "09/30/2026 23:59:00",
      soldTimestamp: "10/01/2026 00:02:00",
    });
    const rowC = performance({
      buyFillId: "entry-c",
      sellFillId: "exit-b",
      qty: "1",
      buyPrice: "20012.5",
      sellPrice: "20015",
      pnl: "5",
      boughtTimestamp: "10/01/2026 00:01:00",
      soldTimestamp: "10/01/2026 00:02:00",
    });
    async function importRows(
      rows: Record<string, string>[],
      type: "performance" | "orders" = "performance",
    ) {
      const files = () => [
        parseReport(
          Buffer.from(csv(type, rows)),
          "synthetic.csv",
          type,
          "Asia/Jerusalem",
        ),
      ];
      const preview = await previewImport(options(), files());
      expect(preview.canConfirm).toBe(true);
      return confirmImport(options(), files(), preview.token!);
    }
    beforeAll(async () => {
      const environment = process.env.NODE_ENV;
      Object.assign(process.env, { NODE_ENV: "development" });
      loadEnvConfig(process.cwd(), true, undefined, true);
      Object.assign(process.env, { NODE_ENV: environment });
      const actual =
        await vi.importActual<typeof import("@/db/client")>("@/db/client");
      db = actual.getDb();
      close = actual.closePool;
      state.database.mockImplementation(
        () =>
          new Proxy(db, {
            get(target, key) {
              if (key !== "transaction") return Reflect.get(target, key);
              return (
                callback: Parameters<typeof db.transaction>[0],
                config?: Parameters<typeof db.transaction>[1],
              ) =>
                target.transaction(
                  (tx) =>
                    callback(
                      new Proxy(tx, {
                        get(t, k) {
                          if (k !== "insert") return Reflect.get(t, k);
                          return (table: Parameters<typeof tx.insert>[0]) => {
                            if (state.fail && table === schema.journalSources)
                              throw new Error(
                                "Injected derived publication failure",
                              );
                            return tx.insert(table);
                          };
                        },
                      }),
                    ),
                  config,
                );
            },
          }),
      );
      await db.insert(schema.user).values(
        users.map((id, i) => ({
          id,
          email: emails[i],
          name: "Disposable journal fixture",
        })),
      );
      await db.insert(schema.tradingAccounts).values(
        accounts.map((id, i) => ({
          id,
          ownerId: users[i],
          displayName: "Synthetic account",
          stage: "Personal" as const,
          nominalSize: "50000",
          brokerIdentifier: "SYNTHETIC-ACCOUNT",
        })),
      );
      state.actor = users[0];
    }, 30000);
    afterAll(async () => {
      if (!db) return;
      try {
        await db.transaction(async (tx) => {
          const verified = await tx
            .select({ id: schema.user.id })
            .from(schema.user)
            .where(
              and(
                inArray(schema.user.id, users),
                inArray(schema.user.email, emails),
              ),
            );
          const safe = verified.map((u) => u.id);
          if (!safe.length) return;
          for (const table of [
            schema.journalSources,
            schema.journalPortionFees,
            schema.journalRecords,
            schema.journalProcessing,
            schema.accountFeeSettings,
            schema.importProvenance,
            schema.importFiles,
            schema.importBatches,
            schema.tradovateOrders,
            schema.tradovatePerformance,
            schema.tradingAccounts,
          ])
            await tx.delete(table).where(inArray(table.ownerId, safe));
          await tx
            .delete(schema.user)
            .where(
              and(
                inArray(schema.user.id, safe),
                inArray(schema.user.email, emails),
              ),
            );
        });
      } finally {
        await close();
      }
    }, 30000);
    it("processes Performance alone, deduplicates retries, reconciles monthly partial exits, and preserves manual fees", async () => {
      await importRows([rowA]);
      await processAccount(accounts[0]);
      let data = await getJournal();
      const stable = data.records[0].id;
      expect(data.records).toHaveLength(1);
      expect(new D(data.records[0].grossPnl).eq("40")).toBe(true);
      expect(data.records[0].fees).toBeNull();
      await setManualFees({ recordId: stable, total: "0" });
      expect(new D((await getJournal()).records[0].fees!).eq(0)).toBe(true);
      await importRows([rowB, rowC]);
      await processAccount(accounts[0]);
      data = await getJournal();
      expect(data.records).toHaveLength(1);
      expect(data.records[0].id).toBe(stable);
      expect(new D(data.records[0].grossPnl).eq("75")).toBe(true);
      expect(data.records[0].fees).toBeNull();
      expect(
        new D(
          data.fees[
            data.records[0].sourceIds.find(
              (id) => data.fees[id].kind === "Manual",
            )!
          ].amount!,
        ).eq(0),
      ).toBe(true);
      const filter = {
        accounts: [accounts[0]],
        start: "2026-09-01",
        end: "2026-10-31",
      };
      const realized = realizedPerformance(
        data.portions,
        data.fees,
        filter,
        "Asia/Jerusalem",
      );
      expect(realized.days.map((d) => d.gross)).toEqual(["40", "35"]);
      expect(sum(realized.days.map((d) => d.gross))).toBe(
        sum(data.records.map((r) => r.grossPnl)),
      );
      await saveFeeSettings({
        accountId: accounts[0],
        perSide: "0.5",
        contractOverrides: {},
        applyExisting: true,
      });
      data = await getJournal();
      expect(new D(data.records[0].fees!).eq("2")).toBe(true);
      expect(data.records[0].feeKind).toBe("Mixed");
      await saveFeeSettings({
        accountId: accounts[0],
        perSide: "5",
        contractOverrides: {},
        applyExisting: false,
      });
      await setManualFees({ recordId: stable, total: null });
      // Only the old manual portion adopts the current rate; historical estimates remain.
      expect(new D((await getJournal()).records[0].fees!).eq("22")).toBe(true);
      await setManualFees({ recordId: stable, total: "3" });
      await saveFeeSettings({
        accountId: accounts[0],
        perSide: "5",
        contractOverrides: {},
        applyExisting: true,
      });
      expect(new D((await getJournal()).records[0].fees!).eq("3")).toBe(true);
      expect((await importRows([rowA])).added).toBe(0);
      await Promise.all([
        processAccount(accounts[0]),
        processAccount(accounts[0]),
      ]);
      data = await getJournal();
      expect(data.records).toHaveLength(1);
      expect(data.portions).toHaveLength(3);
      expect(data.records[0].id).toBe(stable);
      expect(new D(data.records[0].fees!).eq("3")).toBe(true);
      await importRows([order()], "orders");
      await processAccount(accounts[0]);
      expect(sum((await getJournal()).records.map((r) => r.grossPnl))).toBe(
        "75",
      );
      await setManualFees({ recordId: stable, total: null });
      expect(new D((await getJournal()).records[0].fees!).eq("40")).toBe(true);
      await saveFeeSettings({
        accountId: accounts[0],
        perSide: null,
        contractOverrides: { MNQU6: "0.75" },
        applyExisting: false,
      });
      expect(new D((await getJournal()).records[0].fees!).eq("40")).toBe(true);
      await saveFeeSettings({
        accountId: accounts[0],
        perSide: null,
        contractOverrides: { MNQU6: "0.75" },
        applyExisting: true,
      });
      expect(new D((await getJournal()).records[0].fees!).eq("6")).toBe(true);
    }, 60000);
    it("rejects forged account and record IDs for processing, details and all fee mutations", async () => {
      const data = await getJournal();
      state.actor = users[1];
      try {
        expect((await getJournal()).records).toHaveLength(0);
        await expect(processAccount(accounts[0])).rejects.toThrow("not found");
        await expect(journalDetails(data.records[0].id)).rejects.toThrow(
          "not found",
        );
        await expect(getFeeSettings(accounts[0])).rejects.toThrow("not found");
        await expect(
          saveFeeSettings({
            accountId: accounts[0],
            userId: users[0],
            perSide: "0",
            contractOverrides: {},
            applyExisting: true,
          }),
        ).rejects.toThrow("not found");
        await expect(
          setManualFees({
            recordId: data.records[0].id,
            total: "0",
            userId: users[0],
          }),
        ).rejects.toThrow("not found");
        state.actor = "";
        await expect(getJournal()).rejects.toThrow("Unauthenticated");
      } finally {
        state.actor = users[0];
      }
    }, 30000);
    it("rolls failed publication back while retaining sources and prior published totals, with a working retry", async () => {
      const before = await getJournal();
      state.fail = true;
      try {
        await expect(processAccount(accounts[0])).rejects.toThrow(
          "Workspace temporarily unavailable",
        );
      } finally {
        state.fail = false;
      }
      const after = await getJournal();
      expect(after.records).toEqual(before.records);
      expect(after.fees).toEqual(before.fees);
      expect(after.portions).toEqual(before.portions);
      expect(after.states[0].status).toBe("Failed");
      await processAccount(accounts[0]);
      expect((await getJournal()).states[0].status).toBe("Ready");
    }, 30000);
  },
);
