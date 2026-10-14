import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  summarizeProgress,
  progressDashboard,
  goalProgress,
  goalFields,
  rangeSchema,
  presetRange,
  type Daily,
  type RecordReview,
  type Goal,
  type Checkin,
} from "@/lib/progress/model";
import { localDay } from "@/lib/journal/calculations";
import { backupCatalog, validateBackup } from "@/lib/exports/catalog";
import { getTableConfig } from "drizzle-orm/pg-core";
import { goalCheckins } from "@/db/schema";
const window = { start: "2026-10-01", end: "2026-10-07" };
const daily: Daily[] = [
  {
    date: "2026-10-01",
    total: 2,
    completed: 2,
    reviewed: true,
    updatedAt: "2026-10-09T12:00:00Z",
  },
  {
    date: "2026-10-02",
    total: 8,
    completed: 2,
    reviewed: false,
    updatedAt: "2026-10-09T12:00:00Z",
  },
  {
    date: "2026-10-03",
    total: 0,
    completed: 0,
    reviewed: true,
    updatedAt: "2026-10-09T12:00:00Z",
  },
];
const records: RecordReview[] = [
  {
    id: "parent",
    date: "2026-10-01",
    reviewed: true,
    adherence: "partly",
    mistakes: ["fomo", "fomo"],
    updatedAt: "2026-10-09T12:00:00Z",
  },
  {
    id: "other",
    date: "2026-10-02",
    reviewed: false,
    adherence: null,
    mistakes: ["fomo"],
    updatedAt: null,
  },
  {
    id: "previous",
    date: "2026-09-27",
    reviewed: true,
    adherence: "followed",
    mistakes: [],
    updatedAt: null,
  },
];
describe("personal process progress", () => {
  it("preserves missing denominators, deduplicates canonical records and counts relevant dates once", () => {
    const s = summarizeProgress(
      daily,
      [...records, records[0]],
      ["2026-10-01", "2026-10-01", "2026-10-04"],
      window,
    );
    expect(s.preparation).toMatchObject({
      done: 4,
      total: 10,
      days: 2,
      missing: 1,
      activityWithoutEntry: 1,
    });
    expect(s.reviews).toEqual({ done: 1, total: 2 });
    expect(s.adherence).toMatchObject({
      followed: 0,
      partly: 1,
      unassessed: 1,
      assessed: 1,
    });
    expect(s.dailyReviews).toEqual({ done: 2, total: 4 });
    const empty = summarizeProgress([], [], [], window);
    expect(empty.preparation.total).toBe(0);
    expect(empty.dailyReviews.total).toBe(0);
  });
  it("weights weekly completion by items and compares recorded tag rates with reviewed-only sample counts", () => {
    const d = progressDashboard(
      daily,
      [...records, records[0]],
      [],
      window,
      [],
      0,
    );
    expect(d.weeks.reduce((n, w) => n + w.preparation.done, 0)).toBe(4);
    expect(d.weeks.reduce((n, w) => n + w.preparation.total, 0)).toBe(10);
    expect(d.recordedMistakes[0]).toMatchObject({
      count: 2,
      reviewed: 1,
      denominator: 1,
      previousDenominator: 1,
      change: 100,
    });
    expect(
      progressDashboard([], [records[1]], [], window, [], 0).recordedMistakes[0]
        .change,
    ).toBeNull();
    expect(
      d.days.find((day) => day.date === "2026-10-03")?.preparation.total,
    ).toBe(0);
  });
  it("uses goal windows independently of range and counts explicit completion without empty checklists or future habit completions", () => {
    const goal: Goal = {
      id: "g",
      revision: 1,
      timezone: "Asia/Jerusalem",
      name: "Practice",
      type: "preparation",
      ...window,
      target: 1,
      description: "",
      archived: false,
    };
    expect(goalProgress(goal, daily, records, [], "2026-10-08")).toMatchObject({
      count: 1,
      status: "Achieved",
    });
    expect(
      goalProgress(
        { ...goal, type: "daily-review" },
        daily,
        records,
        [],
        "2026-10-02",
      ).count,
    ).toBe(2);
    expect(
      goalProgress(
        { ...goal, type: "trade-review" },
        daily,
        [...records, records[0]],
        [],
        "2026-10-08",
      ).count,
    ).toBe(1);
    const checkins: Checkin[] = ["2026-10-01", "2026-10-02", "2026-10-08"].map(
      (date) => ({
        goalId: "g",
        date,
        revision: 1,
        note: "",
        state: "done",
        updatedAt: "2026-10-09T12:00:00Z",
      }),
    );
    expect(
      goalProgress(
        { ...goal, type: "habit", target: 3 },
        daily,
        records,
        [...checkins, checkins[0]],
        "2026-10-01",
      ),
    ).toMatchObject({ count: 1, status: "Active" });
    expect(
      goalProgress(
        { ...goal, type: "habit", target: 3 },
        daily,
        records,
        [],
        "2026-10-08",
      ).status,
    ).toBe("Ended");
    expect(goalProgress(goal, [], [], [], "2026-09-01").status).toBe(
      "Upcoming",
    );
    const fields = {
      name: goal.name,
      type: goal.type,
      start: goal.start,
      end: goal.end,
      target: goal.target,
      description: goal.description,
      archived: goal.archived,
    };
    expect(goalFields.safeParse(fields).success).toBe(true);
    expect(goalFields.safeParse({ ...fields, target: 0 }).success).toBe(false);
    expect(
      rangeSchema.safeParse({ start: "2026-10-07", end: "2026-10-01" }).success,
    ).toBe(false);
  });
  it("keeps journal civil dates unchanged and resolves close dates across DST using the existing timezone helper", () => {
    expect(localDay("2026-11-01T05:30:00Z", "America/New_York")).toBe(
      "2026-11-01",
    );
    expect(localDay("2026-11-01T06:30:00Z", "America/New_York")).toBe(
      "2026-11-01",
    );
    expect(localDay("2026-10-01T22:30:00Z", "Asia/Jerusalem")).toBe(
      "2026-10-02",
    );
    expect(summarizeProgress(daily, [], [], window).dailyReviews.done).toBe(2);
    expect(presetRange("week", "2026-11-01", 1)).toEqual({
      start: "2026-10-26",
      end: "2026-11-01",
    });
    expect(
      rangeSchema.safeParse({ start: "2026-02-30", end: "2026-03-01" }).success,
    ).toBe(false);
  });
  it("backs up goals and check-ins with ownership-safe relationships and a unique per-goal civil date", () => {
    expect(backupCatalog.map((c) => c.name)).toEqual(
      expect.arrayContaining(["process_goals", "goal_checkins"]),
    );
    const data = {
      auth_users: [{ id: "u" }],
      process_goals: [{ id: "g", owner_id: "u" }],
      goal_checkins: [{ id: "c", owner_id: "u", goal_id: "g" }],
    };
    expect(() => validateBackup(data, "u")).not.toThrow();
    expect(() =>
      validateBackup(
        {
          ...data,
          goal_checkins: [{ id: "c", owner_id: "u", goal_id: "foreign" }],
        },
        "u",
      ),
    ).toThrow();
    expect(() => validateBackup(data, "other")).toThrow();
    const unique = getTableConfig(goalCheckins).indexes.find(
      (i) => i.config.name === "goal_checkins_daily",
    );
    expect(unique?.config.unique).toBe(true);
  });
});
