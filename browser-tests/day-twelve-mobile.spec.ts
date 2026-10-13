import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { disposableUser, cleanupUsers } from "./fixture-users";
import { emptyPlaybook } from "../lib/strategies/model";
const origin = process.env.MSJOURNAL_BROWSER_ORIGIN ?? "http://127.0.0.1:3100";
test.use({ baseURL: origin });
test.afterEach(() => cleanupUsers());
test("loaded backup settings, short navigation and reachable mobile writing/image controls", async ({
  page,
}, info) => {
  test.skip(
    process.env.MSJOURNAL_TEST_DISPOSABLE !== "true",
    "Disposable fixtures only",
  );
  test.setTimeout(300000);
  const headers = { Origin: origin };
  const signup = await page.request.post("/api/auth/sign-up/email", {
    headers,
    data: disposableUser(),
  });
  expect(signup.status()).toBe(200);
  const owner = (await signup.json()).user.id;
  await page.emulateMedia({ reducedMotion: "reduce" });
  const book = await (
    await page.request.post("/api/strategies", {
      headers,
      data: {
        revision: 0,
        fields: { ...emptyPlaybook(), name: "Synthetic mobile playbook" },
      },
    })
  ).json();
  const id = randomUUID(),
    key = `strategies/${randomUUID()}/${id}`;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  pool.on("error", () => {});
  try {
    await pool.query(
      "insert into strategy_images(id,owner_id,strategy_id,object_key,thumbnail_key,mime,bytes,width,height,position,state,caption) values($1,$2,$3,$4,$5,'image/png',3,1,1,0,'ready','Synthetic example')",
      [id, owner, book.id, key, key + "-thumb"],
    );
  } finally {
    await pool.end();
  }
  // Mock only fixture image transport; this is a viewer check, not live S3 verification.
  await page.route(`**/api/strategies/images/${id}*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
  for (const theme of ["light", "dark"]) {
    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => localStorage.setItem("theme", t), theme);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveClass(new RegExp(theme));
    await expect(page.locator(".settings-page")).toHaveCSS("opacity", "1", {
      timeout: 30000,
    });
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await expect(async () =>
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBe(width),
      ).toPass({ timeout: 5000 });
      await page.screenshot({
        path: info.outputPath(`settings-${theme}-${width}.png`),
        fullPage: true,
      });
    }
    await page.setViewportSize({ width: 390, height: 430 });
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    const drawer = page.getByRole("dialog", {
      name: "Navigation",
      exact: true,
    });
    await expect(drawer).toHaveCSS("overflow-y", "auto");
    await drawer
      .getByRole("link", { name: "Settings", exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      drawer.getByRole("link", { name: "Settings", exact: true }),
    ).toBeInViewport();
    await page.screenshot({
      path: info.outputPath(`drawer-short-${theme}.png`),
    });
    await page.keyboard.press("Escape");
    await page.goto("/day-view?date=2026-10-05", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("load");
    await expect(
      page.locator('main [role="status"]').filter({ hasText: /^Loading / }),
    ).toHaveCount(0, { timeout: 30000 });
    await page.getByLabel("Today's focus").focus();
    await page
      .getByRole("button", { name: "Session notes", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Session notes", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page
      .getByLabel("Session notes", { exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByRole("button", { name: "Save daily entry", exact: true }),
    ).toBeInViewport();
    await page.screenshot({
      path: info.outputPath(`writing-short-${theme}.png`),
    });
    await page.goto(`/strategies/${book.id}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("load");
    await expect(
      page.getByRole("button", { name: "Save playbook", exact: true }),
    ).toBeInViewport();
    await page.getByRole("button", { name: "Examples", exact: true }).click();
    await page
      .getByRole("button", { name: "View screenshot 1", exact: true })
      .click();
    const viewer = page.getByRole("dialog", {
      name: "Synthetic example",
      exact: true,
    });
    await expect(viewer).toBeVisible();
    await expect(async () => {
      const box = await viewer.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.height).toBeLessThanOrEqual(430);
    }).toPass({ timeout: 5000 });
    await viewer.getByLabel("Screenshot zoom").focus();
    await page.keyboard.press("ArrowRight");
    await expect(viewer).toContainText("Zoom 125%");
    await page.screenshot({
      path: info.outputPath(`viewer-short-${theme}.png`),
    });
    await page.keyboard.press("Escape");
  }
});
