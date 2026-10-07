import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { loadEnvConfig } from "@next/env";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, count } from "drizzle-orm";
import {
  user,
  tradingAccounts,
  importBatches,
  importFiles,
  importProvenance,
  tradovateOrders,
  tradovatePerformance,
} from "@/db/schema";
import { parseReport } from "@/lib/imports/parser";
import { csv, order, performance } from "./fixtures/tradovate";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  actor: "",
  fail: false,
  database: vi.fn(),
  authorize: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ requireUser: state.authorize }));
vi.mock("@/db/client", () => ({ getDb: state.database }));
import {
  previewImport,
  confirmImport,
  listImports,
  importDetails,
  lastSourceTimezones,
} from "@/lib/imports/service";
import { ImportError } from "@/lib/imports/errors";
const enabled = process.env.MSJOURNAL_TEST_DISPOSABLE === "true";
describe.skipIf(!enabled)(
  "disposable Neon import transactions and isolation",
  () => {
    let db: ReturnType<(typeof import("@/db/client"))["getDb"]>;
    let close: () => Promise<void>;
    const ids = [randomUUID(), randomUUID()];
    const accounts = [randomUUID(), randomUUID()];
    const email = (id: string) => `msjournal-test-${id}@example.invalid`;
    const options = () => ({
      accountId: accounts[0],
      timezone: "Asia/Jerusalem",
      confirmOrders: true,
      confirmPerformance: true,
    });
    const files = () => [
      parseReport(
        Buffer.from(csv("orders", [order()])),
        "synthetic-orders.csv",
        "orders",
        "Asia/Jerusalem",
      ),
      parseReport(
        Buffer.from(csv("performance", [performance(), performance()])),
        "synthetic-performance.csv",
        "performance",
        "Asia/Jerusalem",
      ),
    ];
    beforeAll(async () => {
      // Next deliberately skips .env.local under NODE_ENV=test. This opt-in
      // development integration suite uses the intended local development config.
      const environment = process.env.NODE_ENV;
      Object.assign(process.env, { NODE_ENV: "development" });
      loadEnvConfig(process.cwd(), true, undefined, true);
      Object.assign(process.env, { NODE_ENV: environment });
      const actual =
        await vi.importActual<typeof import("@/db/client")>("@/db/client");
      db = actual.getDb();
      close = actual.closePool;
      state.authorize.mockImplementation(async () => {
        if (!state.actor) throw new Error("Unauthorized");
        return { id: state.actor };
      });
      // Inject one failure after source records were written, inside the real transaction.
      state.database.mockImplementation(
        () =>
          new Proxy(db, {
            get(target, property) {
              if (property !== "transaction")
                return Reflect.get(target, property);
              return (callback: Parameters<typeof db.transaction>[0]) =>
                target.transaction((tx) =>
                  callback(
                    new Proxy(tx, {
                      get(t, p) {
                        if (p !== "insert") return Reflect.get(t, p);
                        return (table: Parameters<typeof tx.insert>[0]) => {
                          if (state.fail && table === importProvenance)
                            throw new Error("Injected fixture failure");
                          return tx.insert(table);
                        };
                      },
                    }),
                  ),
                );
            },
          }),
      );
      await db.insert(user).values(
        ids.map((id) => ({
          id,
          name: "Disposable import fixture",
          email: email(id),
        })),
      );
      await db.insert(tradingAccounts).values(
        ids.map((id, i) => ({
          id: accounts[i],
          ownerId: id,
          displayName: "Disposable source account",
          stage: "Personal" as const,
          nominalSize: "50000",
          brokerIdentifier: "SYNTHETIC-ACCOUNT",
        })),
      );
    }, 30000);
    afterAll(async () => {
      if (!db) return;
      try {
        await db.transaction(async (tx) => {
          const fixtures = await tx
            .select({ id: user.id })
            .from(user)
            .where(
              and(inArray(user.id, ids), inArray(user.email, ids.map(email))),
            );
          const safe = fixtures.map((u) => u.id);
          if (!safe.length) return;
          await tx
            .delete(importProvenance)
            .where(inArray(importProvenance.ownerId, safe));
          await tx
            .delete(importFiles)
            .where(inArray(importFiles.ownerId, safe));
          await tx
            .delete(importBatches)
            .where(inArray(importBatches.ownerId, safe));
          await tx
            .delete(tradovateOrders)
            .where(inArray(tradovateOrders.ownerId, safe));
          await tx
            .delete(tradovatePerformance)
            .where(inArray(tradovatePerformance.ownerId, safe));
          await tx
            .delete(tradingAccounts)
            .where(inArray(tradingAccounts.ownerId, safe));
          await tx.delete(user).where(inArray(user.id, safe));
        });
      } finally {
        await close();
      }
    }, 30000);
    it("denies unauthenticated and cross-user account/import access", async () => {
      state.actor = "";
      state.database.mockClear();
      await expect(listImports()).rejects.toThrow("Unauthorized");
      expect(state.database).not.toHaveBeenCalled();
      state.actor = ids[1];
      await expect(previewImport(options(), files())).rejects.toThrow(
        "Account not found",
      );
      expect(await listImports()).toEqual([]);
      expect(await lastSourceTimezones()).toEqual({});
    }, 30000);
    it("rolls back the entire batch on a mid-confirmation failure, then safely retries and handles concurrency", async () => {
      state.actor = ids[0];
      const preview = await previewImport(options(), files());
      expect(preview.canConfirm).toBe(true);
      expect(preview.counts.new).toBe(3);
      state.fail = true;
      await expect(
        confirmImport(options(), files(), preview.token!),
      ).rejects.toThrow("Injected fixture failure");
      state.fail = false;
      expect(
        (
          await db
            .select({ n: count() })
            .from(importBatches)
            .where(eq(importBatches.ownerId, ids[0]))
        )[0].n,
      ).toBe(0);
      expect(
        (
          await db
            .select({ n: count() })
            .from(tradovateOrders)
            .where(eq(tradovateOrders.ownerId, ids[0]))
        )[0].n,
      ).toBe(0);
      expect(
        (
          await db
            .select({ n: count() })
            .from(tradovatePerformance)
            .where(eq(tradovatePerformance.ownerId, ids[0]))
        )[0].n,
      ).toBe(0);
      const other = await previewImport(options(), files());
      const results = await Promise.all([
        confirmImport(options(), files(), preview.token!),
        confirmImport(options(), files(), other.token!),
      ]);
      expect(results.map((r) => r.added).sort()).toEqual([0, 3]);
      expect(results.map((r) => r.outcome).sort()).toEqual([
        "Already imported",
        "Imported",
      ]);
      expect(await confirmImport(options(), files(), preview.token!)).toEqual(
        results[0],
      );
      expect(
        (
          await db
            .select({ n: count() })
            .from(tradovatePerformance)
            .where(eq(tradovatePerformance.ownerId, ids[0]))
        )[0].n,
      ).toBe(2);
      expect(
        (
          await db
            .select({ n: count() })
            .from(importBatches)
            .where(eq(importBatches.ownerId, ids[0]))
        )[0].n,
      ).toBe(2);
      const original = results.find((r) => r.added)!;
      expect((await importDetails(original.id)).rows).toHaveLength(1);
      state.actor = ids[1];
      await expect(importDetails(original.id)).rejects.toThrow("not found");
      await expect(
        confirmImport(options(), files(), preview.token!),
      ).rejects.toBeInstanceOf(ImportError);
      // The same broker IDs are valid for another independent user's account.
      const own = { ...options(), accountId: accounts[1] };
      const p = await previewImport(own, files());
      expect(p.counts.new).toBe(3);
      expect((await confirmImport(own, files(), p.token!)).added).toBe(3);
      expect(await lastSourceTimezones()).toEqual({
        [accounts[1]]: "Asia/Jerusalem",
      });
      const otherZone = { ...own, timezone: "America/New_York" };
      const reparsed = files().map((f) =>
        parseReport(
          Buffer.from(
            csv(
              f.type,
              f.type === "orders" ? [order()] : [performance(), performance()],
            ),
          ),
          f.name,
          f.type,
          otherZone.timezone,
        ),
      );
      const conflict = await previewImport(otherZone, reparsed);
      expect(conflict.canConfirm).toBe(false);
      expect(
        conflict.files[0].errors.some((e) =>
          e.message.includes("explicit correction workflow"),
        ),
      ).toBe(true);
      expect(await lastSourceTimezones()).toEqual({
        [accounts[1]]: "Asia/Jerusalem",
      });
    }, 60000);
    it("rechecks conflicts at confirmation and blocks changed data atomically", async () => {
      state.actor = ids[0];
      const changed = files();
      changed[0] = parseReport(
        Buffer.from(csv("orders", [order({ Text: "Changed snapshot" })])),
        "changed.csv",
        "orders",
        "Asia/Jerusalem",
      );
      const result = await previewImport(options(), changed);
      expect(result.canConfirm).toBe(false);
      expect(result.counts.conflicts).toBe(1);
      const valid = await previewImport(options(), files());
      await expect(
        confirmImport(options(), changed, valid.token!),
      ).rejects.toThrow("files/settings changed");
      const invalid = files();
      invalid[1] = parseReport(
        Buffer.from(csv("performance", [performance({ qty: "invalid" })])),
        "invalid.csv",
        "performance",
        "Asia/Jerusalem",
      );
      expect((await previewImport(options(), invalid)).canConfirm).toBe(false);
      expect(
        (
          await db
            .select({ n: count() })
            .from(importBatches)
            .where(eq(importBatches.ownerId, ids[0]))
        )[0].n,
      ).toBe(2);
      // A different export wins the race after this preview. The stale
      // confirmation must recheck and reject instead of overwriting it.
      const source = (text: string) => [
        parseReport(
          Buffer.from(
            csv("orders", [
              order({
                orderId: "race-order",
                "Order ID": "race-order",
                Text: text,
              }),
            ]),
          ),
          "race.csv",
          "orders",
          "Asia/Jerusalem",
        ),
      ];
      const pending = await previewImport(options(), source("first candidate"));
      const competing = await previewImport(
        options(),
        source("different candidate"),
      );
      expect(
        (
          await confirmImport(
            options(),
            source("different candidate"),
            competing.token!,
          )
        ).added,
      ).toBe(1);
      await expect(
        confirmImport(options(), source("first candidate"), pending.token!),
      ).rejects.toThrow("nothing was saved");
      expect(
        (
          await db
            .select({ n: count() })
            .from(importBatches)
            .where(eq(importBatches.ownerId, ids[0]))
        )[0].n,
      ).toBe(3);
    }, 30000);
  },
);
