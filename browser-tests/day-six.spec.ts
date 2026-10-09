import { test, expect } from "@playwright/test";
import { disposableUser, cleanupUsers } from "./fixture-users";
import { csv, performance } from "../tests/fixtures/tradovate";
const previewOrigin =
  process.env.MSJOURNAL_BROWSER_ORIGIN ?? "http://localhost:3000";
test.use({ baseURL: previewOrigin });
test.afterEach(() => cleanupUsers());
test("Trade View queries, detail return, calendar reconciliation and responsive themes", async ({
  page,
  browser,
}) => {
  test.skip(
    process.env.MSJOURNAL_TEST_DISPOSABLE !== "true",
    "Disposable fixtures only",
  );
  test.setTimeout(180000);
  const origin = previewOrigin,
    actor = disposableUser();
  expect(
    (
      await page.request.post("/api/auth/sign-up/email", {
        headers: { Origin: origin },
        data: actor,
      })
    ).status(),
  ).toBe(200);
  const account = await page.request.post("/api/trading-accounts", {
    headers: { Origin: origin },
    data: {
      displayName: "Day six synthetic",
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
  expect(account.status()).toBe(201);
  const accountId = (await account.json()).account.id;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/imports");
  await page.getByLabel("Performance CSV", { exact: true }).setInputFiles({
    name: "synthetic-day-six.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      csv("performance", [
        performance({
          buyFillId: "entry-shared",
          sellFillId: "exit-one",
          qty: "2",
          pnl: "40",
          boughtTimestamp: "09/30/2026 23:55:00",
          soldTimestamp: "09/30/2026 23:59:40",
        }),
        performance({
          buyFillId: "entry-shared",
          sellFillId: "exit-two",
          qty: "1",
          pnl: "30",
          boughtTimestamp: "09/30/2026 23:55:00",
          soldTimestamp: "10/01/2026 00:02:00",
        }),
        ...Array.from({ length: 22 }, (_, i) =>
          performance({
            buyFillId: `entry-${i}`,
            sellFillId: `exit-${i}`,
            pnl: String(i),
            boughtTimestamp: `10/${String(i + 2).padStart(2, "0")}/2026 16:00:00`,
            soldTimestamp: `10/${String(i + 2).padStart(2, "0")}/2026 16:01:00`,
          }),
        ),
      ]),
    ),
  });
  await page
    .getByRole("checkbox", { name: /I confirm this Performance report/ })
    .check();
  await page
    .getByRole("button", { name: "Review import", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm import", exact: true })
    .click();
  await page.waitForURL(/\/imports\/[0-9a-f-]+\?/);
  await page.goto("/trade-view?size=10&sort=gross&order=desc");
  const listed = await page.request.get(
    "/api/journal?size=10&sort=gross&order=desc",
  );
  expect(listed.status()).toBe(200);
  expect((await listed.json()).summary.count).toBe(23);
  await expect(page.locator(".import-pagination")).toContainText("23 records", {
    timeout: 30000,
  });
  await expect(page.locator(".tv-summary")).toContainText("+$301.00");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator(".import-pagination")).toContainText("Page 2 of 3");
  const before = page.url();
  await page.locator(".tv-table a").first().click();
  await expect(page.locator(".tv-detail-nav")).toContainText("Record 11 of 23");
  await page.getByRole("link", { name: "Previous record" }).click();
  await expect(page.locator(".tv-detail-nav")).toContainText("Record 10 of 23");
  await page.getByRole("link", { name: "Next record" }).click();
  await expect(page.locator(".tv-detail-nav")).toContainText("Record 11 of 23");
  await page.route("**/api/journal?**", (route) => route.abort());
  await page
    .getByRole("link", { name: "Back to Trade View", exact: true })
    .click();
  await expect(page.locator(".import-pagination")).toContainText("Page 2 of 3");
  await expect(page.locator(".tv-table a")).toHaveCount(10);
  await expect(page.locator(".tv-skeleton")).toHaveCount(0);
  await page.unroute("**/api/journal?**");
  expect(page.url()).toContain("page=2");
  expect(before).toContain("page=2");
  await page.getByLabel("Search contract or account").fill("no-such-contract");
  await expect(
    page.getByRole("heading", { name: "No matching records" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear all", exact: true }).click();
  await expect(page.locator(".import-pagination")).toContainText("23 records");
  await page.getByText("Columns & density", { exact: true }).click();
  await page.getByRole("checkbox", { name: "Fees", exact: true }).uncheck();
  await page
    .getByRole("combobox", { name: "Density", exact: true })
    .selectOption("compact");
  await page.getByText("Columns & density", { exact: true }).click();
  await page.locator(".tv-table a").first().click();
  await page
    .getByRole("link", { name: "Back to Trade View", exact: true })
    .click();
  await expect(page.locator(".trade-view")).toHaveClass(/tv-compact/);
  await expect(
    page.locator(".tv-table th").filter({ hasText: /^Fees$/ }),
  ).toHaveCount(0);
  await page.getByText("Columns & density", { exact: true }).click();
  await page
    .getByRole("button", { name: "Reset to defaults", exact: true })
    .click();
  await page.getByText("Columns & density", { exact: true }).click();
  await page.goto("/calendar?month=2026-09");
  await page
    .locator(
      '.calendar-grid-view button[aria-label^="Wednesday, September 30,"]',
    )
    .click();
  await expect(page.getByRole("dialog")).toContainText("+$40.00");
  await page.getByRole("link", { name: "Open this day in Trade View" }).click();
  await expect(page.locator(".tv-summary")).toContainText("+$40.00");
  await expect(page.locator(".tv-summary")).toContainText("P&L in range");
  await page.locator(".tv-table a").first().click();
  await expect(
    page.getByRole("heading", { name: "P&L in range · selected contribution" }),
  ).toBeVisible();
  await expect(page.locator(".journal-summary").first()).toContainText(
    "+$70.00",
  );
  const recordId = page.url().split("/trade-view/")[1].split("?")[0];
  const context = await browser.newContext({ baseURL: origin });
  const other = disposableUser();
  expect(
    (
      await context.request.post("/api/auth/sign-up/email", {
        headers: { Origin: origin },
        data: other,
      })
    ).status(),
  ).toBe(200);
  expect(
    (await context.request.get(`/api/journal?accounts=${accountId}`)).status(),
  ).toBe(404);
  expect((await context.request.get(`/trade-view/${recordId}`)).status()).toBe(
    404,
  );
  await context.close();
  await page.goto("/trade-view?mode=demo&size=10");
  await expect(page.locator(".tv-summary")).toContainText("Trade win rate");
  for (const width of [1440, 390])
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(
        (value) => localStorage.setItem("theme", value),
        theme,
      );
      await page.reload();
      await expect(page.locator(".tv-summary")).toContainText("Trade win rate");
      await expect(page.locator(".tv-mobile a")).toHaveCount(10);
      await expect(
        width === 390
          ? page.locator(".tv-mobile")
          : page.locator(".tv-table-wrap"),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `artifacts/day-six-${width}-${theme}.png`,
        animations: "disabled",
      });
    }
  await page.locator(".tv-mobile a").first().click();
  await expect(page.getByText("Complete demo trade")).toBeVisible();
  expect(errors).toEqual([]);
});
