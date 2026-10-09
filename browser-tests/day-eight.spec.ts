import { test, expect } from "@playwright/test";
import { disposableUser, cleanupUsers } from "./fixture-users";
import { csv, performance } from "../tests/fixtures/tradovate";
import { emptyFields } from "../lib/reviews/model";
const origin = process.env.MSJOURNAL_BROWSER_ORIGIN ?? "http://127.0.0.1:3100";
test.use({ baseURL: origin });
test.afterEach(() => cleanupUsers());
test("Reports real/demo bases, exact return, behavior privacy, themes and mobile", async ({
  page,
  context,
  browser,
}, testInfo) => {
  test.skip(
    process.env.MSJOURNAL_TEST_DISPOSABLE !== "true",
    "Disposable fixtures only",
  );
  test.setTimeout(180000);
  page.setDefaultTimeout(15000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  expect(
    (
      await page.request.post("/api/auth/sign-up/email", {
        headers: { Origin: origin },
        data: disposableUser(),
      })
    ).status(),
  ).toBe(200);
  const response = await page.request.post("/api/trading-accounts", {
    headers: { Origin: origin },
    data: {
      displayName: "Day eight synthetic",
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
      reportingTimezone: "Asia/Jerusalem",
      notes: "",
    },
  });
  expect(response.status()).toBe(201);
  const accountId = (await response.json()).account.id;
  const multipart = {
    accountId,
    timezone: "Asia/Jerusalem",
    confirmPerformance: "true",
    confirmOrders: "false",
    performance: {
      name: "synthetic-day-eight.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        csv("performance", [
          performance({
            buyFillId: "shared",
            sellFillId: "one",
            pnl: "-10",
            boughtTimestamp: "10/01/2026 23:00:00",
            soldTimestamp: "10/02/2026 00:05:00",
          }),
          performance({
            buyFillId: "shared",
            sellFillId: "two",
            pnl: "5",
            boughtTimestamp: "10/01/2026 23:00:00",
            soldTimestamp: "10/03/2026 12:00:00",
          }),
        ]),
      ),
    },
  };
  const preview = await page.request.post("/api/imports/preview", {
    headers: { Origin: origin },
    multipart,
  });
  expect(preview.status()).toBe(200);
  expect(
    (
      await page.request.post("/api/imports/confirm", {
        headers: { Origin: origin },
        multipart: { ...multipart, token: (await preview.json()).token },
      })
    ).status(),
  ).toBe(200);
  const records = await page.request.get(`/api/journal?accounts=${accountId}`);
  const record = (await records.json()).rows[0];
  expect(record).toBeTruthy();
  expect(
    (
      await page.request.post("/api/reviews", {
        headers: { Origin: origin },
        data: {
          recordId: record.id,
          revision: 0,
          status: "reviewed",
          fields: {
            ...emptyFields(),
            lesson: "Private synthetic lesson must stay out of Reports",
            mistakes: ["chased", "overtraded"],
            emotions: {
              before: ["Confident", "Calm"],
              during: [],
              after: ["Frustrated"],
            },
            adherence: "followed",
          },
        },
      })
    ).status(),
  ).toBe(200);
  const q = new URLSearchParams({
    accounts: accountId,
    start: "2026-10-01",
    end: "2026-10-04",
  });
  await page.goto(`/reports?${q}`);
  await expect(
    page.getByRole("heading", { name: "Daily realized P&L", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".report-metrics")).toContainText("−$5.00");
  let reportRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/reports") reportRequests++;
  });
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("msjournal:data-updated", {
        detail: { url: "/api/reviews" },
      }),
    ),
  );
  await page.waitForTimeout(250);
  expect(reportRequests).toBe(0);
  await page.locator(".recharts-bar-rectangle").first().click();
  await expect(page.locator(".tv-summary")).toContainText("−$10.00");
  await page.getByRole("link", { name: "Back to Reports" }).click();
  await expect(
    page.getByRole("heading", { name: "Daily realized P&L", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Breakdowns", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Results by account" }),
  ).toBeVisible();
  await page
    .getByLabel("Comparison", { exact: true })
    .selectOption("direction");
  await expect(page.locator(".report-table")).toContainText("−$5.00");
  await page.getByLabel("Analyze", { exact: true }).selectOption("complete");
  await expect(
    page.getByRole("heading", {
      name: "Complete trades aren’t available for this selection",
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "View realized activity", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Trading behavior", exact: true })
    .click();
  await page.getByLabel("Compare", { exact: true }).selectOption("records");
  await expect(page.locator(".report-table")).toContainText("Followed my plan");
  const beforeReviewRefresh = reportRequests;
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("msjournal:data-updated", {
        detail: { url: "/api/reviews/tags" },
      }),
    ),
  );
  await expect.poll(() => reportRequests).toBe(beforeReviewRefresh + 1);
  await expect(page.locator(".report-table")).toContainText("Followed my plan");
  expect(await page.locator("main").innerText()).not.toContain(
    "Private synthetic lesson",
  );
  expect(await page.locator("main").innerText()).not.toContain("Win rate");
  const reportApi = await page.request.get(
    `/api/reports?${q}&tab=behavior&behaviorBasis=records`,
  );
  expect(JSON.stringify(await reportApi.json())).not.toContain(
    "Private synthetic lesson",
  );
  const returnUrl = page.url();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const before = await page.evaluate(() => window.scrollY);
  await page
    .locator(".report-table")
    .getByRole("link", { name: "Followed my plan", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Back to Reports" }),
  ).toBeVisible();
  await expect(page.locator(".tv-summary")).toContainText("−$5.00");
  await page.route("**/api/reports?**", (route) => route.abort());
  await page.getByRole("link", { name: "Back to Reports" }).click();
  await expect(
    page.getByRole("heading", { name: "Results by plan adherence" }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThanOrEqual(Math.max(0, before - 40));
  expect(page.url()).toBe(returnUrl);
  await page.unroute("**/api/reports?**");
  await page.getByLabel("Report data").selectOption("demo");
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.getByLabel("Analyze", { exact: true }).selectOption("complete");
  await expect(page.getByText("Trade outcomes", { exact: true })).toBeVisible();
  await expect(page.locator(".report-metrics")).toContainText("Win rate");
  await page.getByRole("button", { name: "Breakdowns", exact: true }).click();
  await page.getByLabel("Comparison", { exact: true }).selectOption("duration");
  await expect(page.locator(".report-table")).toContainText("60+ minutes");
  await page
    .locator(".report-table")
    .getByRole("link", { name: "60+ minutes" })
    .click();
  await expect(page.locator(".tv-summary")).toContainText("Complete trades");
  await page.getByRole("link", { name: "Back to Reports" }).click();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.getByLabel("Analyze", { exact: true }).selectOption("activity");
  await expect(
    page.getByText("Cumulative realized P&L", { exact: true }),
  ).toBeVisible();
  for (const width of [1440, 390])
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate((theme) => {
        localStorage.setItem("theme", theme);
        document.documentElement.classList.toggle("dark", theme === "dark");
        document.documentElement.classList.toggle("light", theme === "light");
      }, theme);
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        )
        .toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`reports-${width}-${theme}.png`),
        fullPage: true,
      });
    }
  const stranger = await browser.newContext();
  const api = await stranger.request.get(`${origin}/api/reports?${q}`);
  expect(api.status()).toBe(401);
  await stranger.close();
  expect((await page.request.get(`/api/reports?${q}&unknown=1`)).status()).toBe(
    400,
  );
  await context.clearCookies();
  expect(errors).toEqual([]);
});
