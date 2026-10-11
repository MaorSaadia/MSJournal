import { test, expect } from "@playwright/test";
import { disposableUser, cleanupUsers } from "./fixture-users";
import { csv, performance } from "../tests/fixtures/tradovate";
const origin = process.env.MSJOURNAL_BROWSER_ORIGIN ?? "http://127.0.0.1:3100";
test.use({ baseURL: origin });
test.afterEach(() => cleanupUsers());
test("Finish Day 8 dashboard portions, balances, navigation, themes and mobile", async ({
  page,
}, testInfo) => {
  test.skip(
    process.env.MSJOURNAL_TEST_DISPOSABLE !== "true",
    "Disposable fixtures only",
  );
  test.setTimeout(240000);
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
            buyFillId: "shortbuy",
            sellFillId: "shortsell",
            pnl: "0",
            boughtTimestamp: "10/04/2026 12:05:00",
            soldTimestamp: "10/04/2026 12:00:00",
          }),
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
  const q = new URLSearchParams({
    accounts: accountId,
    start: "2026-10-01",
    end: "2026-10-04",
    calMonth: "2026-10",
    basis: "net",
    outcomeBasis: "portions",
  });
  const endpoint = `/api/dashboard?${q.toString().replace(/&calMonth=[^&]*/, "")}`;
  const api = await page.request.get(endpoint);
  expect(api.status()).toBe(200);
  const data = await api.json();
  expect(data.basis).toBe("gross");
  expect(data.portionCount).toBe(3);
  expect(data.outcomes.winRate).toBe("33.3");
  expect(
    data.timePoints.find((p: { direction: string }) => p.direction === "short")
      .entry,
  ).toBe("2026-10-04T09:00:00.000Z");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/?${q}`);
  await expect(page.locator(".dashboard-connected")).toContainText("33.3%");
  await expect(page.locator(".dashboard-connected")).toContainText("0.50");
  await expect(page.locator(".dashboard-connected")).toContainText(
    "used because fees are incomplete",
  );
  await expect(page.locator(".calendar-day-count").first()).toHaveText(
    "1 portion",
  );
  await expect(page.locator(".calendar-day-count")).not.toContainText([
    "trades",
  ]);
  await expect(page.locator(".heat-flat")).toHaveCount(1);
  await expect(page.locator(".dashboard-connected")).not.toContainText(
    "Nothing here yet",
  );
  await page.locator(".heat-cell[aria-label^='2026-10-02']").click();
  await expect(page.locator(".tv-summary")).toContainText("−$10.00");
  await page.route("**/api/dashboard?**", (route) => route.abort());
  await page.getByRole("link", { name: /Back to dashboard$/ }).click();
  await page.unroute("**/api/dashboard?**");
  await expect(page.locator(".heat-flat")).toHaveCount(1);
  await page
    .getByLabel("Statistics basis", { exact: true })
    .selectOption("complete");
  await expect(
    page.getByRole("button", { name: "Use closed-portion statistics" }),
  ).toBeVisible();
  await expect(page.locator(".heat-flat")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Use closed-portion statistics" })
    .click();
  await page.getByText("Set starting balance", { exact: true }).click();
  const baseline = page.getByRole("form", {
    name: "Starting balance for Day eight synthetic",
  });
  await baseline.locator('[name="amount"]').fill("100");
  await baseline.locator('[name="date"]').fill("2026-10-01");
  await baseline.getByRole("button", { name: "Save starting balance" }).click();
  await expect(page.locator(".balance-account-heading")).toContainText(
    "$95.00",
  );
  await expect(page.locator(".balance-account")).toContainText(
    "Balance before unrecorded fees",
  );
  await page.getByText("Change starting balance", { exact: true }).click();
  await page.getByText("Add balance adjustment", { exact: true }).click();
  await page.getByLabel("Adjustment amount").fill("20");
  await page.getByLabel("Adjustment local time").fill("2026-10-02T10:00");
  await page.getByRole("button", { name: "Save adjustment" }).click();
  await expect(page.locator(".balance-account-heading")).toContainText(
    "$115.00",
  );
  await page.getByLabel("Adjustment type").selectOption("withdrawal");
  await page.getByLabel("Adjustment amount").fill("3");
  await page.getByLabel("Adjustment local time").fill("2026-10-03T10:00");
  await page.getByRole("button", { name: "Save adjustment" }).click();
  await expect(page.locator(".balance-account-heading")).toContainText(
    "$112.00",
  );
  await page.locator(".balance-account details[open] summary").click();
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByLabel("Direction", { exact: true }).selectOption("short");
  await page.keyboard.press("Escape");
  await expect(page.locator(".dashboard-scope-note")).toContainText(
    "1 closed portions",
  );
  await expect(page.locator(".balance-account-heading")).toContainText(
    "$112.00",
  );
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByLabel("Direction", { exact: true }).selectOption("all");
  await page.keyboard.press("Escape");
  await expect(page.locator(".dashboard-scope-note")).toContainText(
    "3 closed portions",
  );
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByLabel("Direction", { exact: true }).selectOption("unknown");
  await page.keyboard.press("Escape");
  await expect(page.locator(".dashboard-scope-note")).toContainText(
    "0 closed portions",
  );
  await expect(page.locator(".balance-account-heading")).toContainText(
    "$112.00",
  );
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByLabel("Direction", { exact: true }).selectOption("all");
  await page.keyboard.press("Escape");
  await expect(page.locator(".dashboard-scope-note")).toContainText(
    "3 closed portions",
  );
  await page.locator(".recharts-scatter-symbol").first().click();
  await expect(
    page.getByRole("link", { name: /Back to dashboard$/ }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Back to dashboard$/ }).click();
  await expect(page.locator(".balance-account-heading")).toContainText(
    "$112.00",
  );
  const returnTo = page.url();
  await page.getByRole("link", { name: "Inspect in Reports" }).click();
  await expect(page.locator(".report-metrics")).toContainText(
    "Closed portions",
  );
  await expect(page.locator(".report-metrics")).toContainText("33.3%");
  await page.goto(returnTo);
  await expect(page.locator(".balance-account-heading")).toContainText(
    "$112.00",
  );
  await expect(page.locator(".calendar-day-count").first()).toHaveText(
    "1 portion",
  );
  for (const theme of ["light", "dark"]) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate((t) => {
      document.documentElement.classList.toggle("dark", t === "dark");
      document.documentElement.classList.toggle("light", t === "light");
      document.documentElement.style.colorScheme = t;
      localStorage.setItem("theme", t);
    }, theme);
    await page.screenshot({
      path: testInfo.outputPath(`dashboard-${theme}.png`),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: testInfo.outputPath(`dashboard-mobile-${theme}.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: testInfo.outputPath("dashboard-mobile.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
