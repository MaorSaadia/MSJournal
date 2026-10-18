import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { disposableUser, cleanupUsers } from "./fixture-users";
import { emptyDaily } from "../lib/daily/model";
import { randomUUID } from "node:crypto";
const origin = process.env.MSJOURNAL_BROWSER_ORIGIN ?? "http://127.0.0.1:3100";
test.use({ baseURL: origin });
test.afterEach(() => cleanupUsers());
test("progress ownership, explicit completion, goal windows, backup inclusion and responsive themes", async ({
  page,
  playwright,
}, info) => {
  test.skip(
    process.env.MSJOURNAL_TEST_DISPOSABLE !== "true",
    "Guarded disposable fixtures only",
  );
  test.setTimeout(480000);
  const headers = { Origin: origin };
    page.on("pageerror", (error) => console.error("Progress UI error:", error.message));
    page.on("requestfailed", (request) => {
      if (new URL(request.url()).pathname.startsWith("/_next/"))
        console.error("Preview asset failed:", new URL(request.url()).pathname, request.failure()?.errorText);
    });
  const signup = await page.request.post("/api/auth/sign-up/email", {
    headers,
    data: disposableUser(),
  });
  expect(signup.status()).toBe(200);
  const owner = (await signup.json()).user.id;
  const other = await playwright.request.newContext({ baseURL: origin });
  const anon = await playwright.request.newContext({ baseURL: origin });
  try {
    expect(
      (
        await other.post("/api/auth/sign-up/email", {
          headers,
          data: disposableUser(),
        })
      ).status(),
    ).toBe(200);
    const fields = {
      name: "Synthetic process habit",
      type: "habit",
      start: "2026-10-01",
      end: "2026-10-31",
      target: 2,
      description: "Synthetic fixture only",
      archived: false,
    };
    const created = await page.request.post("/api/progress", {
      headers,
      data: { revision: 0, fields },
    });
    expect(created.status()).toBe(200);
    const goalId = (await created.json()).id;
    const checkin = {
      goalId,
      date: "2026-10-05",
      revision: 0,
      state: "done",
      note: "Synthetic note",
    };
    expect(
      (await other.put("/api/progress", { headers, data: checkin })).status(),
    ).toBe(404);
    expect(
      (
        await other.post("/api/progress", {
          headers,
          data: { id: goalId, revision: 1, fields },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await page.request.put("/api/progress", {
          headers,
          data: { ...checkin, date: "2026-11-01" },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await page.request.put("/api/progress", {
          headers,
          data: { ...checkin, date: "2026-10-31" },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await page.request.put("/api/progress", { headers, data: checkin })
      ).status(),
    ).toBe(200);
    expect(
      (
        await page.request.put("/api/progress", { headers, data: checkin })
      ).status(),
    ).toBe(409);
    expect(
      (
        await page.request.put("/api/progress", {
          headers,
          data: { ...checkin, revision: 1, state: "not-done" },
        })
      ).status(),
    ).toBe(200);
    const query = "start=2026-10-01&end=2026-10-07";
    expect((await anon.get(`/api/progress?${query}`)).status()).toBe(401);
    expect((await other.get(`/api/progress?${query}`)).status()).toBe(200);
    expect(
      (await (await other.get(`/api/progress?${query}`)).json()).goals,
    ).toHaveLength(0);
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 10000,
    });
    pool.on("error", () => {});
    try {
      const f = emptyDaily([
        { id: randomUUID(), text: "Synthetic checklist", checked: false },
      ]);
      f.checklist[0].checked = true;
      // The fixture has two source portions in one canonical record. The tracker
      // queries parents once and must never add the underlying portions again.
      await pool.query(
        "insert into daily_entries(owner_id,entry_date,timezone,status,fields) values($1,'2026-10-05','Asia/Jerusalem','reviewed',$2::jsonb)",
        [owner, JSON.stringify(f)],
      );
      const accountId = randomUUID(),
        recordId = randomUUID();
      await pool.query(
        "insert into trading_accounts(id,owner_id,display_name,stage,nominal_size) values($1,$2,'Synthetic process account','Personal',1000)",
        [accountId, owner],
      );
      await pool.query(
        "insert into journal_records(id,owner_id,trading_account_id,symbol,direction,status,explanation,exit_at,closed_quantity,gross_pnl,fee_kind,processing_version) values($1,$2,$3,'MNQZ6','long','Matched portions','Synthetic fixture','2026-10-05T12:00:00Z',2,5,'Unknown','performance-1.0')",
        [recordId, owner, accountId],
      );
      for (const exit of ["2026-10-04T12:00:00Z", "2026-10-05T12:00:00Z"]) {
        const sourceId = randomUUID();
        await pool.query(
          "insert into tradovate_performance_records(id,owner_id,trading_account_id,identity,buy_fill_id,sell_fill_id,fingerprint,occurrence,source_timezone,raw_values,symbol,quantity,buy_price,sell_price,gross_pnl,bought_at,sold_at,duration) values($1::uuid,$2,$3,$1::text,'shared-synthetic',$1::text,$1::text,1,'UTC','{}','MNQZ6',1,100,101,2.5,'2026-10-03T12:00:00Z',$4,'1day')",
          [sourceId, owner, accountId, exit],
        );
        await pool.query(
          "insert into journal_sources(owner_id,trading_account_id,record_id,source_id) values($1,$2,$3,$4)",
          [owner, accountId, recordId, sourceId],
        );
      }
      await pool.query(
        "insert into journal_reviews(owner_id,trading_account_id,record_id,original_record_id,original_symbol,original_source_ids,fields,status) values($1,$2,$3,$3,'MNQZ6','{}', $4::jsonb,'reviewed')",
        [
          owner,
          accountId,
          recordId,
          JSON.stringify({ mistakes: ["fomo", "fomo"], adherence: "partly" }),
        ],
      );
      const duplicate = await pool.query(
        "select count(*)::int as n from goal_checkins where goal_id=$1 and owner_id=$2 and entry_date='2026-10-05'",
        [goalId, owner],
      );
      expect(duplicate.rows[0].n).toBe(1);
      // Assert the database uniqueness itself without leaving any duplicate data.
      let duplicateRejected = false;
      try {
        await pool.query(
          "insert into goal_checkins(goal_id,owner_id,entry_date,state) values($1,$2,'2026-10-05','done')",
          [goalId, owner],
        );
      } catch (e) {
        duplicateRejected = (e as { code: string }).code === "23505";
      }
      expect(duplicateRejected).toBe(true);
    } finally {
      await pool.end();
    }
    const automatic = {
      ...fields,
      name: "Synthetic preparation goal",
      type: "preparation",
      start: "2026-10-01",
      end: "2026-10-05",
      target: 1,
    };
    expect(
      (
        await page.request.post("/api/progress", {
          headers,
          data: { revision: 0, fields: automatic },
        })
      ).status(),
    ).toBe(200);
    const response = await page.request.get(`/api/progress?${query}`);
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    const result = await response.json();
    expect(result.summary.preparation).toMatchObject({
      done: 1,
      total: 1,
      days: 1,
    });
    expect(result.summary.reviews).toEqual({ done: 1, total: 1 });
    expect(result.summary.adherence).toMatchObject({
      partly: 1,
      followed: 0,
      assessed: 1,
    });
    expect(result.summary.dailyReviews).toEqual({ done: 1, total: 2 });
    expect(result.recordedMistakes[0]).toMatchObject({
      count: 1,
      reviewed: 1,
      denominator: 1,
    });
    const narrow = await (
      await page.request.get("/api/progress?start=2026-10-06&end=2026-10-07")
    ).json();
    expect(narrow.summary.preparation.total).toBe(0);
    expect(
      narrow.goals.find((g: { type: string }) => g.type === "preparation")
        .count,
    ).toBe(1);
    const backup = await page.request.post("/api/exports/backup", {
      headers,
      data: { includeImages: false, allowPartial: false },
    });
    expect(backup.status()).toBe(200);
    // ZIP entries use the existing uncompressed writer. Parse local-file records
    // to inspect only synthetic fixture data without saving a private archive.
    const bytes = await backup.body(),
      files = new Map<string, Buffer>();
    for (let offset = 0; bytes.readUInt32LE(offset) === 0x04034b50;) {
      const size = bytes.readUInt32LE(offset + 18),
        nameLength = bytes.readUInt16LE(offset + 26),
        extra = bytes.readUInt16LE(offset + 28);
      const name = bytes
        .subarray(offset + 30, offset + 30 + nameLength)
        .toString();
      const start = offset + 30 + nameLength + extra;
      files.set(name, bytes.subarray(start, start + size));
      offset = start + size;
    }
    const manifest = JSON.parse(files.get("manifest.json")!.toString());
    expect(manifest.version).toBe(5);
    expect(
      JSON.parse(files.get("data/process_goals.json")!.toString()),
    ).toHaveLength(2);
    expect(
      JSON.parse(files.get("data/goal_checkins.json")!.toString()),
    ).toHaveLength(1);
    expect(
      manifest.categories.find(
        (c: { path: string }) => c.path === "data/goal_checkins.json",
      ).count,
    ).toBe(1);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/progress-tracker?${query}`, { waitUntil: "load", timeout: 60000 });
    await expect(
      page.getByRole("heading", { name: "Weekly consistency" }),
    ).toBeVisible({ timeout: 60000 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((t) => {
        localStorage.setItem("theme", t);
        document.documentElement.classList.remove("light", "dark");
        document.documentElement.classList.add(t);
      }, theme);
      for (const width of [1440, 390]) {
        await page.setViewportSize({
          width,
          height: width === 390 ? 844 : 1000,
        });
        await expect(async () =>
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
          ).toBe(width),
        ).toPass();
        await page.screenshot({
          path: info.outputPath(`progress-${theme}-${width}.png`),
          fullPage: true,
        });
      }
    }
    await page.getByRole("button", { name: "Check in", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByLabel("Check-in date", { exact: true }).fill("2026-10-05");
    await expect(page.getByLabel("Habit status")).toHaveValue("not-done");
    await page.getByLabel("Habit status").selectOption("done");
    await page
      .getByRole("button", { name: "Save check-in", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page
        .locator(".progress-goal")
        .filter({ hasText: "Synthetic process habit" }),
    ).toContainText("1 / 2");
    await page.getByRole("button", { name: "New goal", exact: true }).click();
    await page.getByLabel("Name", { exact: true }).fill("Synthetic UI goal");
    await page.getByRole("button", { name: "Save goal", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Synthetic UI goal", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: /^2026-10-05: Complete/ }).click();
    await expect(page).toHaveURL(/day-view\?date=2026-10-05/, { timeout: 60000 });
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Navigation", exact: true })
      .getByRole("link", { name: "Progress Tracker", exact: true })
      .click();
    await expect(page).toHaveURL(
      /progress-tracker\?start=2026-10-01&end=2026-10-07/,
    );
  } finally {
    await other.dispose();
    await anon.dispose();
  }
});
