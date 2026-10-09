import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { loadEnvConfig } from "@next/env";
import { randomUUID } from "node:crypto";
import { and, inArray, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { csv, performance } from "./fixtures/tradovate";
import { parseReport } from "@/lib/imports/parser";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ actor: "", database: vi.fn() }));
vi.mock("@/lib/session", () => ({
  requireUser: async () => ({ id: state.actor }),
}));
vi.mock("@/db/client", () => ({ getDb: state.database }));
import { reports } from "@/lib/reports/service";
import { calendarData } from "@/lib/calendar/service";
import { tradeView } from "@/lib/journal/view-service";
import { previewImport, confirmImport } from "@/lib/imports/service";
import { processAccount, saveFeeSettings } from "@/lib/journal/service";
import { saveReview, saveReviewTag } from "@/lib/reviews/service";
import { emptyFields } from "@/lib/reviews/model";
import { D } from "@/lib/journal/processing";
import type { CalendarMonth } from "@/lib/calendar/model";
describe.skipIf(process.env.MSJOURNAL_TEST_DISPOSABLE !== "true")(
  "disposable reports reconciliation and privacy",
  () => {
    const users = [randomUUID(), randomUUID()],
      accounts = [randomUUID(), randomUUID()],
      emails = users.map((id) => `msjournal-test-${id}@example.invalid`);
    let db: ReturnType<(typeof import("@/db/client"))["getDb"]>,
      close: () => Promise<void>;
    const q = { start: "2026-10-01", end: "2026-10-03", accounts: accounts[0] };
    beforeAll(async () => {
      const previous = process.env.NODE_ENV;
      Object.assign(process.env, { NODE_ENV: "development" });
      loadEnvConfig(process.cwd(), true, undefined, true);
      Object.assign(process.env, { NODE_ENV: previous });
      const actual =
        await vi.importActual<typeof import("@/db/client")>("@/db/client");
      db = actual.getDb();
      close = actual.closePool;
      state.database.mockReturnValue(db);
      await db.insert(schema.user).values(
        users.map((id, i) => ({
          id,
          email: emails[i],
          name: "Disposable report fixture",
        })),
      );
      await db.insert(schema.tradingAccounts).values(
        accounts.map((id, i) => ({
          id,
          ownerId: users[i],
          displayName: "Synthetic report account",
          stage: "Personal" as const,
          nominalSize: "50000",
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
    it("reconciles partial exits, fee coverage, weekday/direction drills, overlapping reviews and ownership", async () => {
      const opts = {
        accountId: accounts[0],
        timezone: "Asia/Jerusalem",
        confirmPerformance: true,
        confirmOrders: false,
      };
      const rows = [
        performance({
          buyFillId: "shared",
          sellFillId: "one",
          pnl: "-10",
          boughtTimestamp: "09/30/2026 23:00:00",
          soldTimestamp: "10/01/2026 00:05:00",
        }),
        performance({
          buyFillId: "shared",
          sellFillId: "two",
          pnl: "5",
          boughtTimestamp: "09/30/2026 23:00:00",
          soldTimestamp: "10/02/2026 12:00:00",
        }),
        performance({
          buyFillId: "other",
          sellFillId: "three",
          pnl: "0",
          boughtTimestamp: "10/03/2026 12:00:00",
          soldTimestamp: "10/03/2026 12:05:00",
        }),
      ];
      const files = () => [
        parseReport(
          Buffer.from(csv("performance", rows)),
          "synthetic-reports.csv",
          "performance",
          "Asia/Jerusalem",
        ),
      ];
      const preview = await previewImport(opts, files());
      expect(preview.canConfirm).toBe(true);
      await confirmImport(opts, files(), preview.token!);
      await processAccount(accounts[0]);
      const gross = await reports(q),
        calendar = (await calendarData({
          month: "2026-10",
          ...q,
        })) as CalendarMonth;
      expect(new D(gross.summary.total!).eq(calendar.summary.total!)).toBe(
        true,
      );
      expect(gross.days.map((d) => d.date)).toEqual([
        "2026-10-01",
        "2026-10-02",
        "2026-10-03",
      ]);
      expect(gross.supportedComplete).toBe(0);
      expect(
        (await reports({ ...q, analysis: "complete" })).summary.count,
      ).toBe(0);
      expect((await reports({ ...q, basis: "net" })).summary.total).toBeNull();
      const breakdown = await reports({ ...q, tab: "breakdowns" });
      for (const groups of Object.values(breakdown.groups))
        for (const group of groups) {
          const drilled = await tradeView(
            Object.fromEntries(
              new URL(group.href, "http://fixture").searchParams,
            ),
          );
          expect(new D(drilled.summary.gross).eq(group.total!)).toBe(true);
        }
      const day = await reports({ ...q, end: "2026-10-01" });
      const drilled = await tradeView(
        Object.fromEntries(
          new URL(day.days[0].href, "http://fixture").searchParams,
        ),
      );
      expect(drilled.rows[0].partial).toBe(true);
      expect(new D(drilled.summary.gross).eq(-10)).toBe(true);
      await saveFeeSettings({
        accountId: accounts[0],
        perSide: "0.5",
        contractOverrides: {},
        applyExisting: true,
      });
      const net = await reports({ ...q, basis: "net" }),
        netCalendar = (await calendarData({
          month: "2026-10",
          ...q,
          basis: "net",
        })) as CalendarMonth;
      expect(net.summary.estimated).toBe(true);
      expect(new D(net.summary.total!).eq(netCalendar.summary.total!)).toBe(
        true,
      );
      const tag = await saveReviewTag({ name: "Synthetic archived tag" });
      const record = (await tradeView({ accounts: accounts[0] })).rows[0];
      await saveReview({
        recordId: record.id,
        revision: 0,
        status: "reviewed",
        fields: {
          ...emptyFields(),
          lesson: "PRIVATE SYNTHETIC NOTE BODY",
          mistakes: [tag.id, "chased"],
          emotions: {
            before: ["Confident", "Calm"],
            during: [],
            after: ["Frustrated"],
          },
          adherence: "followed",
        },
      });
      await saveReviewTag({ id: tag.id, name: tag.name, archived: true });
      const behavior = await reports({
        ...q,
        tab: "behavior",
        behaviorBasis: "records",
        mistakes: `${tag.id},chased`,
      });
      expect(behavior.summary.count).toBe(1);
      expect(behavior.tags.find((t) => t.id === tag.id)?.archived).toBe(true);
      expect(JSON.stringify(behavior)).not.toContain(
        "PRIVATE SYNTHETIC NOTE BODY",
      );
      for (const group of [
        ...behavior.groups.mistake,
        ...behavior.groups.emotion,
        ...behavior.groups.plan,
      ]) {
        const v = await tradeView(
          Object.fromEntries(
            new URL(group.href, "http://fixture").searchParams,
          ),
        );
        expect(v.summary.count).toBe(group.count);
        expect(new D(v.summary.gross).eq(group.total!)).toBe(true);
      }
      await db
        .update(schema.journalReviews)
        .set({ recordId: null, needsReassignment: true })
        .where(eq(schema.journalReviews.ownerId, users[0]));
      const unresolved = await reports({
        ...q,
        tab: "behavior",
        behaviorBasis: "records",
      });
      expect(unresolved.coverage.unresolved).toBe(1);
      expect(unresolved.summary.count).toBe(0);
      state.actor = users[1];
      await expect(reports(q)).rejects.toThrow();
      await expect(
        reports({
          start: q.start,
          end: q.end,
          tab: "behavior",
          mistakes: tag.id,
        }),
      ).rejects.toThrow();
      await expect(tradeView({ mistakes: tag.id })).rejects.toThrow();
      expect(
        (await reports({ start: q.start, end: q.end })).summary.count,
      ).toBe(0);
      state.actor = users[0];
      const demo = await reports({
        ...q,
        accounts: undefined,
        mode: "demo",
        analysis: "complete",
        start: "2026-01-01",
        end: "2026-03-31",
      });
      const demoView = await tradeView({
        mode: "demo",
        start: "2026-01-01",
        end: "2026-03-31",
        type: "trade",
      });
      expect(new D(demo.summary.total!).eq(demoView.summary.gross)).toBe(true);
      expect(demo.summary.count).toBe(demoView.summary.count);
      expect(demo.summary.winRate).toBe(demoView.summary.winRate);
    }, 120000);
  },
);
