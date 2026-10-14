import { test, expect } from "@playwright/test";
import { randomUUID, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Pool } from "pg";
import Papa from "papaparse";
import { disposableUser, cleanupUsers } from "./fixture-users";
import { csv, performance } from "../tests/fixtures/tradovate";
import { emptyPlaybook } from "../lib/strategies/model";
import { emptyDaily } from "../lib/daily/model";
const origin = process.env.MSJOURNAL_BROWSER_ORIGIN ?? "http://127.0.0.1:3100";
test.use({ baseURL: origin });
test.afterEach(() => cleanupUsers());
function openZip(bytes: Buffer) {
  const result = spawnSync(
    "python",
    [
      "-c",
      "import sys,io,zipfile,json; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); assert z.testzip() is None; print(json.dumps({p:json.loads(z.read(p)) for p in z.namelist() if p.endswith('.json')}))",
    ],
    { input: bytes, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  );
  expect(result.status).toBe(0);
  return JSON.parse(result.stdout);
}
test("private complete filtered CSV and consistent portable archive; responsive pages", async ({
  page,
  browser,
}, info) => {
  test.skip(
    process.env.MSJOURNAL_TEST_DISPOSABLE !== "true",
    "Disposable fixtures only",
  );
  test.setTimeout(480000);
  const headers = { Origin: origin };
  const signup = await page.request.post("/api/auth/sign-up/email", {
    headers,
    data: disposableUser(),
  });
  expect(signup.status()).toBe(200);
  const owner = (await signup.json()).user.id;
  expect(
    (
      await page.request.patch("/api/preferences", {
        headers,
        data: {
          displayName: "Synthetic export user",
          displayTimezone: "UTC",
          currency: "USD",
          weekStartsOn: 0,
        },
      })
    ).status(),
  ).toBe(200);
  const accountResponse = await page.request.post("/api/trading-accounts", {
    headers,
    data: {
      displayName: '=Synthetic, "export" account',
      firmChoice: "",
      customFirm: "",
      platform: "Tradovate",
      brokerIdentifier: "",
      stage: "Personal",
      status: "Active",
      nominalSize: "50000",
      openingBalance: "",
      openingBalanceDate: "",
      currency: "USD",
      reportingTimezone: "UTC",
      notes: "Synthetic account note",
    },
  });
  expect(accountResponse.status()).toBe(201);
  const accountId = (await accountResponse.json()).account.id;
  const portions = Array.from({ length: 12 }, (_, index) =>
    performance({
      buyFillId: `export-buy-${index}`,
      sellFillId: `export-sell-${index}`,
      boughtTimestamp: `10/01/2026 10:${String(index).padStart(2, "0")}:00`,
      soldTimestamp: `10/01/2026 11:${String(index).padStart(2, "0")}:00`,
      pnl: "-1.00000001",
    }),
  );
  portions.push(
    performance({
      buyFillId: "export-shared",
      sellFillId: "export-first",
      boughtTimestamp: "10/01/2026 12:00:00",
      soldTimestamp: "10/01/2026 13:00:00",
      pnl: "10.12345678",
    }),
    performance({
      buyFillId: "export-shared",
      sellFillId: "export-second",
      boughtTimestamp: "10/01/2026 12:00:00",
      soldTimestamp: "10/02/2026 13:00:00",
      pnl: "4.87654323",
    }),
  );
  const multipart = {
    accountId,
    timezone: "UTC",
    confirmPerformance: "true",
    confirmOrders: "false",
    performance: {
      name: "synthetic-export.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv("performance", portions)),
    },
  };
  const preview = await page.request.post("/api/imports/preview", {
    headers,
    multipart,
  });
  expect(preview.status()).toBe(200);
  expect(
    (
      await page.request.post("/api/imports/confirm", {
        headers,
        multipart: { ...multipart, token: (await preview.json()).token },
      })
    ).status(),
  ).toBe(200);
  const query = `accounts=${accountId}&size=10&page=1&outcomeBasis=portions&basis=gross`;
  const journal = await (
    await page.request.get(`/api/journal?${query}`)
  ).json();
  expect(journal.rows).toHaveLength(10);
  expect(journal.summary.count).toBe(13);
  const response = await page.request.get(`/api/exports/trades?${query}`);
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("private, no-store");
  const exported = Papa.parse<Record<string, string>>(await response.text(), {
    header: true,
    skipEmptyLines: true,
  }).data;
  expect(exported).toHaveLength(13);
  expect(new Set(exported.map((r) => r.record_id)).size).toBe(13);
  expect(exported[0].account_name).toBe('\'=Synthetic, "export" account');
  expect(
    exported.every((r) => r.selected_net_pnl === "" && r.selected_fees === ""),
  ).toBe(true);
  expect(exported.some((r) => r.selected_gross_pnl === "-1.00000001")).toBe(
    true,
  );
  const activity = `accounts=${accountId}&dateBasis=activity&start=2026-10-01&end=2026-10-01&outcomeBasis=portions&outcome=profit`;
  const selected = Papa.parse<Record<string, string>>(
    await (await page.request.get(`/api/exports/trades?${activity}`)).text(),
    { header: true, skipEmptyLines: true },
  ).data;
  expect(selected).toHaveLength(1);
  expect(selected[0].selected_gross_pnl).toBe("10.12345678");
  expect(selected[0].full_record_gross_pnl).toBe("15.00000001");
  expect(selected[0].partial_record).toBe("true");
  const recordId = selected[0].record_id;
  const strategy = await page.request.post("/api/strategies", {
    headers,
    data: {
      revision: 0,
      fields: {
        ...emptyPlaybook(),
        name: "Synthetic backup strategy",
        entry: "Synthetic entry rule",
        checklist: [{ id: randomUUID(), text: "Synthetic confirmation" }],
      },
    },
  });
  expect(strategy.status()).toBe(200);
  const book = await strategy.json();
  expect(
    (
      await page.request.post("/api/strategies/templates", {
        headers,
        data: { revision: 0, fields: book.fields },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.post("/api/strategies/assignment", {
        headers,
        data: { recordId, revision: 0, strategyId: book.id, answers: {} },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.post("/api/daily", {
        headers,
        data: {
          date: "2026-10-01",
          timezone: "UTC",
          revision: 0,
          status: "draft",
          fields: {
            ...emptyDaily(),
            focus: "Synthetic daily writing",
            plannedStrategies: [
              { strategyId: book.id, revision: book.revision },
            ],
          },
        },
      })
    ).status(),
  ).toBe(200);
  const classified = Papa.parse<Record<string, string>>(
    await (
      await page.request.get(`/api/exports/trades?${query}&strategy=${book.id}`)
    ).text(),
    { header: true, skipEmptyLines: true },
  ).data;
  expect(classified).toHaveLength(1);
  expect(classified[0].strategy_name).toBe("Synthetic backup strategy");
  expect(
    Papa.parse<Record<string, string>>(
      await (
        await page.request.get(`/api/exports/trades?${query}&type=trade`)
      ).text(),
      { header: true, skipEmptyLines: true },
    ).data,
  ).toEqual([]);
  const imageId = randomUUID(),
    key = `strategies/${randomUUID()}/${imageId}`;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  pool.on("error", () => {});
  try {
    await pool.query(
      "insert into strategy_images(id,owner_id,strategy_id,object_key,thumbnail_key,mime,bytes,width,height,position,state) values($1,$2,$3,$4,$5,'image/png',3,1,1,0,'ready')",
      [imageId, owner, book.id, key, key + "-thumb"],
    );
  } finally {
    await pool.end();
  }
  const archive = await page.request.post("/api/exports/backup", {
    headers,
    data: { includeImages: false },
  });
  expect(archive.status()).toBe(200);
  expect(archive.headers()["cache-control"]).toBe("private, no-store");
  const bytes = await archive.body(),
    zip = openZip(bytes),
    manifest = zip["manifest.json"];
  expect(manifest.version).toBe(3);
  expect(manifest.images.requested).toBe(false);
  expect(manifest.images.includedObjectCount).toBe(0);
  for (const category of manifest.categories) {
    expect(zip[category.path]).toHaveLength(category.count);
    // Hashes refer to the exact pretty-printed JSON bytes, including final newline.
    expect(
      createHash("sha256")
        .update(JSON.stringify(zip[category.path], null, 2) + "\n")
        .digest("hex"),
    ).toBe(category.sha256);
    for (const row of zip[category.path])
      if (row.owner_id) expect(row.owner_id).toBe(owner);
  }
  expect(zip["data/tradovate_performance_records.json"]).toHaveLength(14);
  expect(zip["data/journal_records.json"]).toHaveLength(13);
  expect(zip["data/strategy_templates.json"]).toHaveLength(1);
  expect(zip["data/daily_entries.json"][0].entry_date).toBe("2026-10-01");
  expect(
    zip["data/daily_entries.json"][0].fields.plannedStrategies[0].strategyId,
  ).toBe(book.id);
  expect(
    Object.keys(zip).some((path) =>
      /auth_sessions|auth_accounts|auth_verifications/.test(path),
    ),
  ).toBe(false);
  expect(zip["data/auth_users.json"][0]).not.toHaveProperty("password");
  expect(zip["data/auth_users.json"][0]).not.toHaveProperty("email_verified");
  const missing = await page.request.post("/api/exports/backup", {
    headers,
    data: { includeImages: true },
  });
  expect(missing.status()).toBe(409);
  expect((await missing.json()).code).toBe("MISSING_IMAGES");
  const partial = await page.request.post("/api/exports/backup", {
    headers,
    data: { includeImages: true, allowPartial: true },
  });
  expect(partial.status()).toBe(200);
  const partialZip = openZip(await partial.body());
  expect(partialZip["manifest.json"].images.missingFiles).toHaveLength(2);
  expect(partialZip["manifest.json"].images.partialAccepted).toBe(true);
  const other = await browser.newContext({ baseURL: origin });
  try {
    expect(
      (
        await other.request.post("/api/auth/sign-up/email", {
          headers,
          data: disposableUser(),
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await other.request.get(`/api/exports/trades?accounts=${accountId}`)
      ).status(),
    ).toBe(404);
    expect(
      (
        await other.request.get(`/api/exports/trades?strategy=${book.id}`)
      ).status(),
    ).toBe(404);
    const foreignZip = openZip(
      await (
        await other.request.post("/api/exports/backup", {
          headers,
          data: { includeImages: false },
        })
      ).body(),
    );
    expect(foreignZip["data/trading_accounts.json"]).toEqual([]);
    expect(JSON.stringify(foreignZip)).not.toContain("Synthetic daily writing");
    expect(
      (
        await other.request.post("/api/exports/backup", {
          headers,
          data: { includeImages: false, ownerId: owner },
        })
      ).status(),
    ).toBe(400);
  } finally {
    await other.close();
  }
  const anonymous = await browser.newContext({ baseURL: origin });
  try {
    expect((await anonymous.request.get("/api/exports/trades")).status()).toBe(
      401,
    );
    expect(
      (
        await anonymous.request.post("/api/exports/backup", {
          headers,
          data: { includeImages: false },
        })
      ).status(),
    ).toBe(401);
  } finally {
    await anonymous.close();
  }
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => localStorage.setItem("theme", t), theme);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of [
      "/",
      "/calendar",
      `/trade-view?${query}`,
      `/trade-view/${recordId}`,
      "/day-view?date=2026-10-01",
      "/notebook",
      "/strategies",
      `/strategies/${book.id}`,
      "/reports",
      "/prop-accounts",
      "/settings",
    ]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(
        page.locator('main [role="status"]').filter({ hasText: /^Loading / }),
      ).toHaveCount(0, { timeout: 30000 });
      await expect(
        page.getByLabel("Loading calendar", { exact: true }),
      ).toHaveCount(0, { timeout: 30000 });
      await expect(page.locator("#main-content > *").first()).toHaveCSS(
        "opacity",
        "1",
        { timeout: 30000 },
      );
      await page.evaluate((t) => {
        document.documentElement.classList.toggle("dark", t === "dark");
        document.documentElement.classList.toggle("light", t === "light");
      }, theme);
      await expect(async () => {
        expect(
          await page.evaluate(() => ({
            width: innerWidth,
            scroll: document.documentElement.scrollWidth,
          })),
        ).toEqual({ width: 390, scroll: 390 });
      }).toPass({ timeout: 10000 });
      await page.screenshot({
        path: info.outputPath(
          `mobile-${theme}-${path.split("?")[0].replaceAll("/", "_") || "dashboard"}.png`,
        ),
        fullPage: true,
      });
    }
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Navigation", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const path of ["/settings", `/trade-view?${query}`, "/"]) {
      await page.goto(path);
      await expect(page.locator("#main-content > *").first()).toHaveCSS(
        "opacity",
        "1",
        { timeout: 30000 },
      );
      await page.evaluate((t) => {
        document.documentElement.classList.toggle("dark", t === "dark");
        document.documentElement.classList.toggle("light", t === "light");
      }, theme);
      await page.screenshot({
        path: info.outputPath(
          `desktop-${theme}-${path.split("?")[0].replaceAll("/", "_") || "dashboard"}.png`,
        ),
        fullPage: true,
      });
    }
  }
  await page.goto(`/trade-view?${query}`);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(
    /msjournal-real-trades.*\.csv/,
  );
  await page.goto("/settings");
  const backupDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download my data", exact: true })
    .click();
  expect((await backupDownload).suggestedFilename()).toMatch(
    /msjournal-data-v3.*\.zip/,
  );
});
