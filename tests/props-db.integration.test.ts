import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { loadEnvConfig } from "@next/env";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import * as schema from "@/db/schema";
import { emptyRules } from "@/lib/props/validation";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ actor: "", database: vi.fn() }));
vi.mock("@/lib/session", () => ({
  requireUser: async () => ({ id: state.actor }),
}));
vi.mock("@/db/client", () => ({ getDb: state.database }));
import { saveProp, propData } from "@/lib/props/service";
import { saveTradingAccount } from "@/lib/accounts/service";
describe.skipIf(process.env.MSJOURNAL_TEST_DISPOSABLE !== "true")(
  "Owned prop phases and immutable observations",
  () => {
    const users = [randomUUID(), randomUUID()],
      accounts = [randomUUID(), randomUUID(), randomUUID()],
      emails = users.map((id) => `msjournal-test-${id}@example.invalid`);
    let db: ReturnType<(typeof import("@/db/client"))["getDb"]>,
      close: () => Promise<void>;
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
          name: "Disposable prop fixture",
        })),
      );
      await db.insert(schema.tradingAccounts).values(
        accounts.map((id, i) => ({
          id,
          ownerId: users[i === 2 ? 1 : 0],
          displayName: "Fictional prop account",
          firm: "Custom test firm",
          stage: "Evaluation" as const,
          nominalSize: "50000",
        })),
      );
      state.actor = users[0];
    }, 30000);
    afterAll(async () => {
      if (!db) return;
      try {
        await db.transaction(async (tx) => {
          const safe = (
            await tx
              .select({ id: schema.user.id })
              .from(schema.user)
              .where(
                and(
                  inArray(schema.user.id, users),
                  inArray(schema.user.email, emails),
                ),
              )
          ).map((u) => u.id);
          if (!safe.length) return;
          for (const table of [
            schema.propEvents,
            schema.propSnapshots,
            schema.propRuleVersions,
            schema.propPhases,
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
    it("validates ownership/copy, serializes concurrent resets, and preserves versions/snapshots/status dates", async () => {
      const phase = (
        accountId: string,
        previousId: string | null = null,
        startLocal = "2026-10-01T00:00",
      ) => ({
        action: "phase",
        accountId,
        previousId,
        kind: "Evaluation",
        label: "Fictional evaluation",
        startLocal,
        baseline: "100",
        historyConfirmed: true,
        note: "Synthetic",
      });
      const first = await saveProp(phase(accounts[0]));
      await expect(saveProp(phase(accounts[0]))).rejects.toThrow(/overlapping/);
      await saveProp({
        action: "rules",
        accountId: accounts[0],
        phaseId: first.phaseId,
        effectiveLocal: "2026-10-01T00:00",
        rules: {
          ...emptyRules,
          profitTarget: "25",
          staticFloor: "90",
          timezone: "UTC",
          resetTime: "00:00",
          dayLabel: "start",
          daySettingsConfirmed: true,
        },
      });
      await saveProp({
        action: "snapshot",
        accountId: accounts[0],
        phaseId: first.phaseId,
        asOfLocal: "2026-10-01T12:00",
        balance: "120",
        threshold: "90",
        qualifyingDays: "1",
        note: "Manual test observation",
      });
      const before = await propData(accounts[0]);
      expect(before.accounts[0].phases[0].snapshots[0].balance).toBe("120.00");
      expect(before.accounts[0].phases[0].gross).toBe("0");
      await saveProp({
        action: "baseline",
        accountId: accounts[0],
        phaseId: first.phaseId,
        baseline: "110",
        historyConfirmed: true,
        note: "Explicit correction",
      });
      const second = await saveProp(phase(accounts[1]));
      const copied = await saveProp({
        action: "copy",
        accountId: accounts[1],
        phaseId: second.phaseId,
        sourceRuleId: before.copySources[0].id,
        effectiveLocal: "2026-10-01T00:00",
        confirmCopy: true,
      });
      expect("rules" in copied && copied.rules).toMatchObject({
        profitTarget: "25",
        daySettingsConfirmed: false,
        startingHighWater: null,
      });
      expect(
        (await propData(accounts[1])).accounts[0].phases[0].periods,
      ).toHaveLength(0);
      state.actor = users[1];
      await expect(propData(accounts[0])).rejects.toThrow(/not found/);
      await expect(
        saveProp({ ...phase(accounts[0]), previousId: first.phaseId }),
      ).rejects.toThrow(/not found/);
      await expect(
        saveProp({
          action: "snapshot",
          accountId: accounts[0],
          phaseId: first.phaseId,
          asOfLocal: "2026-10-02T12:00",
          balance: "999",
          threshold: "0",
          qualifyingDays: "0",
          note: "",
        }),
      ).rejects.toThrow(/not found/);
      const foreign = await saveProp(phase(accounts[2]));
      await expect(
        saveProp({
          action: "copy",
          accountId: accounts[2],
          phaseId: foreign.phaseId,
          sourceRuleId: before.copySources[0].id,
          effectiveLocal: "2026-10-01T00:00",
          confirmCopy: true,
        }),
      ).rejects.toThrow(/not found/);
      state.actor = users[0];
      await expect(
        saveProp({
          action: "rules",
          accountId: accounts[1],
          phaseId: first.phaseId,
          effectiveLocal: "2026-10-02T00:00",
          rules: emptyRules,
        }),
      ).rejects.toThrow(/not found/);
      await saveProp({
        action: "rules",
        accountId: accounts[0],
        phaseId: first.phaseId,
        effectiveLocal: "2026-10-02T00:00",
        rules: { ...emptyRules, profitTarget: "30" },
      });
      await expect(
        saveProp(phase(accounts[0], first.phaseId, "2026-10-01T13:00")),
      ).rejects.toThrow(/already-saved/);
      const requests = await Promise.allSettled([
        saveProp(phase(accounts[0], first.phaseId, "2026-10-03T00:00")),
        saveProp(phase(accounts[0], first.phaseId, "2026-10-03T00:00")),
      ]);
      expect(requests.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const after = await propData(accounts[0]);
      expect(after.accounts[0].phases).toHaveLength(2);
      expect(after.accounts[0].phases[0].periods).toHaveLength(2);
      expect(after.accounts[0].phases[0].snapshots).toHaveLength(1);
      expect(after.accounts[0].phases[0].phase.baseline).toBe("110.00");
      expect(after.accounts[0].phases[0].phase.endAt).not.toBeNull();
      expect(after.events.some((e) => e.note.includes("100.00 → 110"))).toBe(
        true,
      );
      const current = after.accounts[0].phases[1];
      await saveProp({
        action: "status",
        accountId: accounts[0],
        phaseId: current.phase.id,
        status: "Passed",
        atLocal: "2026-10-04T12:00",
        note: "Explicit user action",
      });
      const ended = (await propData(accounts[0])).accounts[0].phases[1];
      expect(ended.phase.status).toBe("Passed");
      expect(ended.phase.endAt).not.toBeNull();
      await expect(
        saveProp({
          action: "status",
          accountId: accounts[0],
          phaseId: current.phase.id,
          status: "Active",
          atLocal: "2026-10-05T12:00",
          note: "",
        }),
      ).rejects.toThrow(/cannot be reopened/);
      await expect(
        saveTradingAccount(
          {
            displayName: "Fictional prop account",
            firmChoice: "Other",
            customFirm: "Custom test firm",
            platform: "Tradovate",
            brokerIdentifier: "",
            stage: "Funded",
            status: "Active",
            nominalSize: "50000",
            openingBalance: "",
            openingBalanceDate: "",
            currency: "USD",
            reportingTimezone: "Asia/Jerusalem",
            notes: "",
          },
          accounts[0],
        ),
      ).rejects.toThrow(/dated phase/);
      expect(
        await db
          .select()
          .from(schema.balanceAdjustments)
          .where(eq(schema.balanceAdjustments.ownerId, users[0])),
      ).toHaveLength(0);
    }, 90000);
  },
);
