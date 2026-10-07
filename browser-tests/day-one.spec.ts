import { test, expect } from "@playwright/test";
import { disposableUser, cleanupUsers, fillPassword } from "./fixture-users";
test.afterEach(async () => {
  await cleanupUsers();
});
test.beforeEach(async ({ page }) => {
  test.skip(
    process.env.MSJOURNAL_TEST_DISPOSABLE !== "true" ||
      process.env.AUTH_REQUIRE_EMAIL_VERIFICATION === "true",
    "Authenticated design review requires a disposable development database with local verification disabled.",
  );
  const user = disposableUser();
  await page.goto("/signup");
  await page.getByLabel("Name", { exact: true }).fill(user.name);
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await fillPassword(page, "Password", user.password);
  await fillPassword(page, "Confirm password", user.password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.waitForURL("/welcome");
});
test("Day 1 dashboard, filters, navigation, themes, and responsive layouts", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || /hydration/i.test(message.text()))
      errors.push(message.text());
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/?mode=demo");
  await expect(page.getByRole("heading", { name: "Dashboard." })).toBeVisible();
  await page.locator(".recharts-surface").first().waitFor();
  await page.waitForTimeout(800);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/dashboard-light.png",
    fullPage: true,
  });
  const initialNet = await page
    .locator(".metric-net .metric-value")
    .innerText();
  const initialBalance = await page
    .locator(".analysis-grid .panel")
    .nth(5)
    .locator(".panel-value")
    .innerText();
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.getByLabel("Symbol", { exact: true }).selectOption("ES");
  await page.getByLabel("Direction", { exact: true }).selectOption("short");
  await page.keyboard.press("Escape");
  expect(await page.locator(".metric-net .metric-value").innerText()).not.toBe(
    initialNet,
  );
  expect(
    await page
      .locator(".analysis-grid .panel")
      .nth(5)
      .locator(".panel-value")
      .innerText(),
  ).toBe(initialBalance);
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByRole("button", { name: "Reset trade filters" }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".metric-net .metric-value")).toHaveText(
    initialNet,
  );
  await page.getByRole("button", { name: "Select date range" }).click();
  await page.getByLabel("From", { exact: true }).fill("2026-10-01");
  await page.getByLabel("To", { exact: true }).fill("2026-10-31");
  await page.getByRole("button", { name: "Apply range" }).click();
  await expect(page.locator(".metric-trade .metric-value")).toHaveText("—");
  await expect(page.locator(".metric-factor .metric-value")).toHaveText("—");
  await page.getByRole("button", { name: "Select date range" }).click();
  await page.getByRole("button", { name: "All demo dates" }).click();
  await expect(page.locator(".heatmap-summary strong")).not.toContainText(
    "71 closed trades",
  );
  await page.getByRole("button", { name: "Select date range" }).click();
  await page.getByRole("button", { name: "March demo" }).click();
  await expect(page.locator(".metric-net .metric-value")).toHaveText(
    initialNet,
  );
  await page.locator(".calendar-day:enabled").first().click();
  await expect(page.getByRole("dialog")).toContainText("Read-only demo trades");
  await expect(page.locator(".day-trades > div").first()).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Previous month" }).click();
  await expect(page.locator(".month-controls h3")).toHaveText("February 2026");
  await page.getByRole("button", { name: "Next month" }).click();
  await expect(page.locator(".month-controls h3")).toHaveText("March 2026");
  await page.getByRole("button", { name: "This month" }).click();
  const actualMonth = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    month: "long",
    year: "numeric",
  }).format(new Date());
  await expect(page.locator(".month-controls h3")).toHaveText(actualMonth);
  await expect(page.locator(".calendar-empty-note")).toBeVisible();
  await page.getByRole("button", { name: "All accounts", exact: true }).click();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".metric-trade .metric-value")).toHaveText("—");
  await expect(
    page.getByText("Select an account to see its balance."),
  ).toBeVisible();
  await page.getByRole("button", { name: "0 accounts", exact: true }).click();
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await page.keyboard.press("Escape");
  await page
    .getByLabel("Entry time display timezone")
    .selectOption("America/New_York");
  await expect(
    page.getByText("Entry time (America/New_York) · net P&L in USD"),
  ).toBeVisible();
  await page.getByText("View entry-time data", { exact: true }).click();
  await expect(page.locator(".chart-data-scroll")).toBeVisible();
  await page.getByText("View entry-time data", { exact: true }).click();
  await page
    .getByLabel("Entry time display timezone")
    .selectOption("Asia/Jerusalem");
  await page.getByRole("link", { name: "Import Trades", exact: true }).click();
  await expect(page).toHaveURL(/\/imports$/);
  await expect(
    page.getByRole("heading", { name: "Add your first account", exact: true }),
  ).toBeVisible();
  await page.goto("/?mode=demo");
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(
    page.getByRole("button", { name: "Expand sidebar" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await page.getByRole("link", { name: "Reports", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Reports is coming soon" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Reports", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "Back to Dashboard" }).click();
  await page.getByRole("link", { name: "Demo", exact: true }).click();
  await page.getByRole("button", { name: "Choose appearance" }).first().click();
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.waitForTimeout(800);
  await page.screenshot({
    path: "artifacts/dashboard-dark.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.waitForTimeout(300);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/dashboard-tablet.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/dashboard-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const drawer = await page.getByRole("dialog").boundingBox();
  expect(drawer?.x).toBeGreaterThanOrEqual(0);
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "Notebook", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Notebook is coming soon" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
