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
import {
  getReview,
  saveReview,
  saveReviewTag,
  listReviewTags,
  recoveryReviews,
  reassignReview,
  uploadScreenshot,
  screenshotContent,
  editScreenshot,
  reorderScreenshots,
  removeScreenshot,
  cleanupMyScreenshots,
} from "@/lib/reviews/service";
import { emptyFields } from "@/lib/reviews/model";
import { reviewIndicators } from "@/lib/reviews/indicators";
import sharp from "sharp";
const objects = vi.hoisted(() => ({
  bytes: new Map<string, Buffer>(),
  fail: false,
}));
vi.mock("@/lib/reviews/storage", () => ({
  storageEnabled: () => true,
  objectStorage: async () => ({
    put: async (key: string, bytes: Buffer) => {
      if (objects.fail) throw new Error("Injected storage failure");
      objects.bytes.set(key, bytes);
    },
    get: async (key: string) => {
      const bytes = objects.bytes.get(key);
      if (!bytes) throw new Error("Missing object");
      return bytes;
    },
    remove: async (key: string) => {
      if (objects.fail) throw new Error("Injected removal failure");
      objects.bytes.delete(key);
    },
  }),
}));
import { calendarData } from "@/lib/calendar/service";
import { tradeView } from "@/lib/journal/view-service";
import type { CalendarMonth, CalendarDetails } from "@/lib/calendar/model";
import { archiveTradingAccount } from "@/lib/accounts/service";
describe.skipIf(process.env.MSJOURNAL_TEST_DISPOSABLE !== "true")(
  "disposable journal processing, fees and isolation",
  () => {
    const users = [randomUUID(), randomUUID()],
      accounts = [randomUUID(), randomUUID()],
      emails = users.map((id) => `msjournal-test-${id}@example.invalid`);
    let db: ReturnType<(typeof import("@/db/client"))["getDb"]>,
      close: () => Promise<void>;
    const options = (accountId = accounts[0]) => ({
      accountId,
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
      accountId = accounts[0],
    ) {
      const files = () => [
        parseReport(
          Buffer.from(csv(type, rows)),
          "synthetic.csv",
          type,
          "Asia/Jerusalem",
        ),
      ];
      const preview = await previewImport(options(accountId), files());
      expect(preview.canConfirm).toBe(true);
      return confirmImport(options(accountId), files(), preview.token!);
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
            schema.reviewAttachments,
            schema.reviewSources,
            schema.journalReviews,
            schema.reviewTags,
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
      expect((await tradeView({})).summary.net).toBeNull();
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
      const month = (await calendarData({
        month: "2026-10",
        accounts: accounts[0],
        basis: "net",
      })) as CalendarMonth;
      expect(month.summary.total).toBe("32");
      expect(month.summary.count).toBe(2);
      expect(month.estimated).toBe(true);
      const day = (await calendarData({
        month: "2026-09",
        day: "2026-09-30",
        accounts: accounts[0],
      })) as CalendarDetails;
      expect(day.day?.gross).toBe("40");
      expect(day.records).toHaveLength(1);
      expect(day.records[0].partial).toBe(true);
      expect(new D(day.records[0].quantity!).eq("2")).toBe(true);
      const closed = await tradeView({
        start: "2026-09-30",
        end: "2026-09-30",
      });
      expect(closed.summary.count).toBe(0);
      const activity = await tradeView({
        start: "2026-09-30",
        end: "2026-09-30",
        dateBasis: "activity",
        basis: "net",
      });
      expect(activity.summary.count).toBe(1);
      expect(activity.summary.gross).toBe("40.00000000");
      expect(new D(activity.summary.net!).eq("37")).toBe(true);
      expect(activity.summary.estimated).toBe(true);
      expect(activity.summary.winRate).toBeNull();
      expect(activity.rows[0].partial).toBe(true);
      expect(new D(activity.rows[0].fullGross).eq("75")).toBe(true);
      const full = await tradeView({ start: "2026-10-01", end: "2026-10-01" });
      expect(full.summary.count).toBe(1);
      expect(new D(full.summary.gross).eq("75")).toBe(true);
      expect(full.summary.trades).toBe(0);
      expect(full.summary.portions).toBe(1);
      expect(
        (
          await tradeView({
            root: "MNQ",
            search: "synthetic",
            direction: "long",
            min: "50",
            outcome: "profit",
          })
        ).summary.count,
      ).toBe(1);
      expect((await tradeView({ root: "ES" })).summary.count).toBe(0);
      await archiveTradingAccount(accounts[0], true);
      try {
        expect(
          ((await calendarData({ month: "2026-10" })) as CalendarMonth).summary
            .count,
        ).toBe(0);
        await expect(
          calendarData({ month: "2026-10", accounts: accounts[0] }),
        ).rejects.toThrow("not found");
        expect(
          (
            (await calendarData({
              month: "2026-10",
              accounts: accounts[0],
              archived: "1",
            })) as CalendarMonth
          ).summary.count,
        ).toBe(2);
      } finally {
        await archiveTradingAccount(accounts[0], false);
      }
    }, 120000);
    it("rejects forged account and record IDs for processing, details and all fee mutations", async () => {
      const data = await getJournal();
      state.actor = users[1];
      try {
        expect((await tradeView({})).summary.count).toBe(0);
        await expect(tradeView({ accounts: accounts[0] })).rejects.toThrow(
          "not found",
        );
        expect(
          (await tradeView({ record: data.records[0].id })).navigation,
        ).toBeNull();
        expect((await getJournal()).records).toHaveLength(0);
        expect(
          ((await calendarData({ month: "2026-10" })) as CalendarMonth).summary
            .count,
        ).toBe(0);
        await expect(
          calendarData({ month: "2026-10", accounts: accounts[0] }),
        ).rejects.toThrow("not found");
        await expect(
          calendarData({
            month: "2026-10",
            day: "2026-10-01",
            accounts: accounts[0],
          }),
        ).rejects.toThrow("not found");
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
        await expect(
          calendarData({ month: "2026-10", mode: "demo" }),
        ).rejects.toThrow("Unauthenticated");
      } finally {
        state.actor = users[0];
      }
    }, 30000);
    it("queries combined filters and neighbors across server pages with full totals", async () => {
      await importRows(
        Array.from({ length: 22 }, (_, i) =>
          performance({
            buyFillId: `page-entry-${i}`,
            sellFillId: `page-exit-${i}`,
            pnl: String(i),
            boughtTimestamp: "10/03/2026 16:00:00",
            soldTimestamp: "10/03/2026 16:01:00",
          }),
        ),
      );
      await processAccount(accounts[0]);
      const query = {
        search: "synthetic",
        root: "MNQ",
        direction: "long",
        outcome: "profit",
        min: "10",
        sort: "gross",
        order: "desc",
        size: 10,
      };
      const first = await tradeView(query),
        second = await tradeView({ ...query, page: 2 });
      expect(first.summary.count).toBe(13);
      expect(new D(first.summary.gross).eq("261")).toBe(true);
      expect(first.rows).toHaveLength(10);
      expect(second.rows).toHaveLength(3);
      expect(second.summary).toEqual(first.summary);
      const nav = await tradeView({ ...query, record: first.rows[9].id });
      expect(nav.navigation?.next).toBe(second.rows[0].id);
      expect(
        new Set([...first.rows, ...second.rows].map((r) => r.id)).size,
      ).toBe(13);
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
      expect(after.records.sort((a, b) => a.id.localeCompare(b.id))).toEqual(
        before.records.sort((a, b) => a.id.localeCompare(b.id)),
      );
      expect(after.fees).toEqual(before.fees);
      expect(after.portions.sort((a, b) => a.id.localeCompare(b.id))).toEqual(
        before.portions.sort((a, b) => a.id.localeCompare(b.id)),
      );
      expect(after.states[0].status).toBe("Failed");
      expect(
        (
          (await calendarData({
            month: "2026-10",
            accounts: accounts[0],
          })) as CalendarMonth
        ).processing.failed,
      ).toBe(true);
      await processAccount(accounts[0]);
      expect((await getJournal()).states[0].status).toBe("Ready");
    }, 30000);
    it("saves private reviews, handles versions and tags, authorizes images, and recovers changed source groups", async () => {
      state.actor = users[0];
      const reviewAccount = randomUUID();
      await db
        .insert(schema.tradingAccounts)
        .values({
          id: reviewAccount,
          ownerId: users[0],
          displayName: "Synthetic review account",
          stage: "Personal",
          nominalSize: "50000",
          brokerIdentifier: "SYNTHETIC-REVIEW",
        });
      const importReviewRows = (rows: Record<string, string>[]) =>
        importRows(rows, "performance", reviewAccount);
      const original = performance({
        buyFillId: "review-entry",
        sellFillId: "review-exit",
        pnl: "-12",
        boughtTimestamp: "10/06/2026 14:00:00",
        soldTimestamp: "10/06/2026 14:01:00",
      });
      await importReviewRows([original]);
      await processAccount(reviewAccount);
      let row = (
        await tradeView({
          accounts: reviewAccount,
          archived: "1",
          start: "2026-10-06",
          end: "2026-10-06",
        })
      ).rows[0];
      expect((await getReview(row.id)).id).toBeNull();
      const tag = await saveReviewTag({ name: "Wait for confirmation" });
      await expect(
        saveReviewTag({ name: "WAIT FOR CONFIRMATION" }),
      ).rejects.toThrow("already exists");
      const fields = {
        ...emptyFields(),
        lesson: "Wait patiently.\n\nAccept a planned loss.",
        adherence: "followed" as const,
        mistakes: [tag.id],
        emotions: { before: ["Calm" as const], during: [], after: [] },
      };
      let saved = await saveReview({
        recordId: row.id,
        revision: 0,
        status: "draft",
        fields,
      });
      expect(saved.revision).toBe(1);
      expect((await getReview(row.id)).fields.lesson).toBe(fields.lesson);
      await expect(
        saveReview({ recordId: row.id, revision: 0, status: "draft", fields }),
      ).rejects.toThrow("changed");
      expect(
        (
          await tradeView({
            accounts: reviewAccount,
            archived: "1",
            review: "draft",
            mistake: tag.id,
            emotion: "Calm",
            emotionStage: "before",
            adherence: "followed",
          })
        ).rows.map((r) => r.id),
      ).toContain(row.id);
      await saveReviewTag({
        id: tag.id,
        name: "Wait for confirmation renamed",
        archived: true,
      });
      saved = await saveReview({
        recordId: row.id,
        revision: saved.revision,
        status: "reviewed",
        fields,
      });
      expect(
        (
          await tradeView({
            accounts: reviewAccount,
            archived: "1",
            review: "reviewed",
          })
        ).rows.map((r) => r.id),
      ).toContain(row.id);
      expect(
        (
          await reviewIndicators({
            month: "2026-10",
            accounts: reviewAccount,
            archived: "1",
          })
        ).days["2026-10-06"],
      ).toBe(1);
      const png = await sharp({
        create: {
          width: 1400,
          height: 800,
          channels: 3,
          background: "#059669",
        },
      })
        .png()
        .toBuffer();
      let images = await uploadScreenshot(row.id, png);
      const image = images.images[0];
      expect(images.images).toHaveLength(1);
      expect(objects.bytes.size).toBe(2);
      expect(
        (await screenshotContent(image.id, false)).bytes.length,
      ).toBeGreaterThan(0);
      await editScreenshot({
        id: image.id,
        revision: image.revision,
        caption: "Entry chart",
        stage: "before",
      });
      images = await uploadScreenshot(row.id, png);
      images = await reorderScreenshots({
        reviewId: images.id,
        revision: images.revision,
        ids: images.images.map((i) => i.id).reverse(),
      });
      expect(images.images[1].caption).toBe("Entry chart");
      state.actor = users[1];
      expect(await listReviewTags()).toEqual([]);
      await expect(getReview(row.id)).rejects.toThrow("not found");
      await expect(
        saveReview({ recordId: row.id, revision: 0, status: "draft", fields }),
      ).rejects.toThrow("not found");
      await expect(screenshotContent(image.id, false)).rejects.toThrow(
        "not found",
      );
      await expect(removeScreenshot(image.id)).rejects.toThrow("not found");
      await expect(
        editScreenshot({
          id: image.id,
          revision: 2,
          caption: "stolen",
          stage: null,
        }),
      ).rejects.toThrow("not found");
      await expect(uploadScreenshot(row.id, png)).rejects.toThrow("not found");
      await expect(
        saveReviewTag({ id: tag.id, name: "stolen" }),
      ).rejects.toThrow("not found");
      state.actor = users[0];
      const snapshot = await getReview(row.id);
      await processAccount(reviewAccount);
      expect(await getReview(row.id)).toEqual(snapshot);
      await importReviewRows([original]);
      await processAccount(reviewAccount);
      expect((await getReview(row.id)).id).toBe(snapshot.id);
      await importReviewRows([
        performance({
          buyFillId: "review-entry",
          sellFillId: "review-new-exit",
          pnl: "8",
          boughtTimestamp: "10/06/2026 14:00:00",
          soldTimestamp: "10/06/2026 14:02:00",
        }),
      ]);
      await processAccount(reviewAccount);
      const recovery = (await recoveryReviews()).find(
        (r) => r.id === snapshot.id,
      )!;
      expect(recovery.needsReassignment).toBe(true);
      expect(recovery.fields).toEqual(snapshot.fields);
      expect(recovery.images).toHaveLength(2);
      expect(recovery.originalSourceIds).toHaveLength(1);
      row = (
        await tradeView({
          accounts: reviewAccount,
          archived: "1",
          start: "2026-10-06",
          end: "2026-10-06",
        })
      ).rows[0];
      expect((await getReview(row.id)).id).toBeNull();
      const reassigned = await reassignReview({
        reviewId: recovery.id,
        recordId: row.id,
        revision: recovery.revision,
      });
      expect(reassigned.fields).toEqual(fields);
      expect(reassigned.images).toHaveLength(2);
      await processAccount(reviewAccount);
      expect((await getReview(row.id)).id).toBe(reassigned.id);
      objects.fail = true;
      await expect(uploadScreenshot(row.id, png)).rejects.toThrow(
        "Upload failed",
      );
      expect((await getReview(row.id)).images).toHaveLength(2);
      await expect(removeScreenshot(image.id)).rejects.toThrow();
      expect((await getReview(row.id)).images).toHaveLength(1);
      objects.fail = false;
      await cleanupMyScreenshots();
      expect(objects.bytes.size).toBe(2);
      await expect(screenshotContent(image.id, false)).rejects.toThrow(
        "not found",
      );
      await removeScreenshot(
        reassigned.images.find((i) => i.id !== image.id)!.id,
      );
      expect(objects.bytes.size).toBe(0);
    }, 120000);
  },
);
