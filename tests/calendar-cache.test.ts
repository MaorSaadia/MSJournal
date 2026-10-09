import { describe, it, expect, vi } from "vitest";
import { CalendarQueryCache } from "@/lib/calendar/client-cache";
describe("private calendar cache lifecycle", () => {
  it("deduplicates requests, reuses fresh results on return, and revalidates stale selections in place", async () => {
    let now = 1000;
    const cache = new CalendarQueryCache(() => now),
      load = vi.fn(async () => ({ month: "2026-09", total: "40" }));
    await Promise.all([
      cache.fetch("user-a|Israel|USD|Sep", load),
      cache.fetch("user-a|Israel|USD|Sep", load),
    ]);
    expect(load).toHaveBeenCalledTimes(1);
    await cache.fetch("user-a|Israel|USD|Sep", load);
    expect(load).toHaveBeenCalledTimes(1);
    now += 31000;
    let resolve!: (value: unknown) => void;
    const updating = cache.fetch(
      "user-a|Israel|USD|Sep",
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    await Promise.resolve();
    expect(cache.read("user-a|Israel|USD|Sep").data).toEqual({
      month: "2026-09",
      total: "40",
    });
    expect(cache.read("user-a|Israel|USD|Sep").pending).toBe(true);
    resolve({ month: "2026-09", total: "42" });
    await updating;
    expect(cache.read("user-a|Israel|USD|Sep").data).toEqual({
      month: "2026-09",
      total: "42",
    });
  });
  it("keeps same-selection data after a background failure and never shows another selection’s data", async () => {
    const cache = new CalendarQueryCache();
    await cache.fetch("user-a|Sep", async () => "September results");
    await cache.fetch(
      "user-a|Sep",
      async () => {
        throw new Error("Service unavailable");
      },
      true,
    );
    expect(cache.read("user-a|Sep")).toMatchObject({
      data: "September results",
      error: "Service unavailable",
      invalid: true,
    });
    expect(cache.read("user-a|Oct").data).toBeUndefined();
    expect(cache.read("user-b|Sep").data).toBeUndefined();
  });
  it("invalidates after writes, rejects obsolete responses, bounds retention, and clears on logout", async () => {
    let now = 1000;
    const cache = new CalendarQueryCache(() => now, 30, 100, 2);
    let oldResolve!: (v: unknown) => void;
    const old = cache.fetch(
      "a",
      () =>
        new Promise((r) => {
          oldResolve = r;
        }),
    );
    await Promise.resolve();
    cache.invalidate();
    await cache.fetch("a", async () => "new");
    oldResolve("obsolete");
    await old;
    expect(cache.read("a").data).toBe("new");
    await cache.fetch("b", async () => "b");
    await cache.fetch("c", async () => "c");
    expect(cache.read("a").data).toBeUndefined();
    now += 101;
    expect(cache.read("b").data).toBeUndefined();
    cache.clear();
    expect(cache.read("c").data).toBeUndefined();
  });
});
