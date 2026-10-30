import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { disposableUser, cleanupUsers } from "./fixture-users";
import { csv, performance } from "../tests/fixtures/tradovate";
const origin = process.env.MSJOURNAL_BROWSER_ORIGIN ?? "http://localhost:3000";
test.use({ baseURL: origin });
test.afterEach(() => cleanupUsers());
const identity = (name: string) => ({
  displayName: name,
  firmChoice: "Apex Trader Funding",
  customFirm: "",
  platform: "Tradovate",
  brokerIdentifier: "",
  stage: "Evaluation",
  status: "Active",
  nominalSize: "50000",
  openingBalance: "",
  openingBalanceDate: "",
  currency: "USD",
  reportingTimezone: "Asia/Jerusalem",
  notes: "",
});
async function signIn(page: Page) {
  expect(
    (
      await page.request.post("/api/auth/sign-up/email", {
        headers: { Origin: origin },
        data: disposableUser(),
      })
    ).status(),
  ).toBe(200);
}
async function createAccount(page: Page, name: string, pnl: string) {
  const headers = { Origin: origin };
  const created = await page.request.post("/api/trading-accounts", {
    headers,
    data: identity(name),
  });
  expect(created.status()).toBe(201);
  const account = (await created.json()).account;
  const input = {
    accountId: account.id,
    timezone: "UTC",
    confirmPerformance: "true",
    confirmOrders: "false",
    feeTotal: "0",
    performance: {
      name: "Performance.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        csv("performance", [
          performance({
            pnl,
            boughtTimestamp: "10/02/2026 12:00:00",
            soldTimestamp: "10/02/2026 12:05:00",
          }),
        ]),
      ),
    },
  };
  const preview = await (
    await page.request.post("/api/imports/preview", {
      headers,
      multipart: input,
    })
  ).json();
  const saved = await page.request.post("/api/imports/confirm", {
    headers,
    multipart: {
      ...input,
      token: preview.token,
      feeFingerprint: preview.feeReview.fingerprint,
    },
  });
  expect(saved.status(), await saved.text()).toBe(200);
  return account;
}
async function defer(
  page: Page,
  path: string,
  predicate: (url: URL) => boolean = () => true,
  fail = false,
) {
  let started!: () => void;
  const entered = new Promise<void>((r) => {
    started = r;
  });
  let release!: () => void;
  const promise = new Promise<void>((r) => {
    release = r;
  });
  let active = true;
  const pattern = `**${path}?**`;
  const handler = async (route: import("@playwright/test").Route) => {
    if (!active || !predicate(new URL(route.request().url()))) {
      await route.continue();
      return;
    }
    started();
    const response = fail ? null : await route.fetch();
    await promise;
    if (response) await route.fulfill({ response });
    else
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Loading fixture unavailable" }),
      });
  };
  await page.route(pattern, handler);
  return {
    started: entered,
    release: () => {
      active = false;
      release();
    },
    stop: () => page.unrouteAll({ behavior: "wait" }),
  };
}
async function capture(
  page: Page,
  info: import("@playwright/test").TestInfo,
  name: string,
) {
  for (const [theme, width] of [
    ["light", 1440],
    ["dark", 1440],
    ["light", 390],
    ["dark", 390],
  ] as const) {
    await page.setViewportSize({ width, height: 950 });
    await page.evaluate(
      (theme) =>
        document.documentElement.classList.toggle("dark", theme === "dark"),
      theme,
    );
    await page.screenshot({
      path: info.outputPath(`${name}-${theme}-${width}.png`),
    });
    expect(
      await page.evaluate(() =>
        Array.from(document.querySelectorAll("main *"))
          .filter(
            (e) =>
              e.getBoundingClientRect().right > innerWidth + 1 &&
              getComputedStyle(e).position !== "absolute",
          )
          .slice(0, 8)
          .map((e) => e.tagName + "." + e.className),
      ),
    ).toEqual([]);
  }
  await page.setViewportSize({ width: 1440, height: 950 });
}

test("loading skeletons respect scope, cache, refresh, errors and reduced motion", async ({
  page,
}, info) => {
  test.skip(
    process.env.MSJOURNAL_TEST_DISPOSABLE !== "true",
    "Disposable fixtures only",
  );
  test.setTimeout(240000);
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(60000);
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await signIn(page);
  const a = await createAccount(page, "Loading account A", "100");
  const b = await createAccount(page, "Loading account B", "200");
  const query = (id: string) =>
    `accounts=${id}&start=2026-10-01&end=2026-10-29`;
  const first = await defer(page, "/api/dashboard");
  await page.goto(`/?${query(a.id)}`, { waitUntil: "domcontentloaded" });
  const skeleton = page.locator(".app-loading-dashboard").last();
  await expect(skeleton).toBeVisible();
  await expect(page.locator(".account-trigger")).toBeEnabled();
  await expect(skeleton.locator(".app-skeleton-value")).toHaveCount(5);
  expect(
    await skeleton
      .locator(".app-skeleton")
      .first()
      .evaluate((e) => getComputedStyle(e, "::after").animationName),
  ).toBe("app-loading-shimmer");
  await capture(page, info, "dashboard-loading");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await skeleton
      .locator(".app-skeleton")
      .first()
      .evaluate((e) => getComputedStyle(e, "::after").display),
  ).toBe("none");
  first.release();
  await expect(page.locator(".metric-card").first()).toContainText("+$100.00");
  await first.stop();
  const changed = await defer(
    page,
    "/api/dashboard",
    (url) => url.searchParams.get("accounts")?.includes(b.id) ?? false,
  );
  await page.locator(".account-trigger").click();
  await page
    .locator(".account-option")
    .filter({ hasText: "Loading account B" })
    .getByRole("checkbox")
    .check();
  await page
    .locator(".account-option")
    .filter({ hasText: "Loading account A" })
    .getByRole("checkbox")
    .uncheck();
  await expect(page.locator(".app-loading-dashboard")).toBeVisible();
  await expect(page.locator(".metric-card")).toHaveCount(0);
  await page.keyboard.press("Escape");
  changed.release();
  await expect(page.locator(".metric-card").first()).toContainText("+$200.00");
  await changed.stop();
  const refresh = await defer(page, "/api/dashboard");
  await page
    .getByRole("button", { name: "Refresh dashboard", exact: true })
    .click();
  await expect(
    page
      .locator(".app-loading-indicator")
      .filter({ hasText: "Updating" })
      .first(),
  ).toBeVisible();
  await expect(page.locator(".metric-card").first()).toContainText("+$200.00");
  await expect(page.locator(".app-loading-dashboard")).toHaveCount(0);
  refresh.release();
  await refresh.stop();
  // A query change can reuse its own cached values without a loading flash.
  await page.locator(".account-trigger").click();
  await page
    .locator(".account-option")
    .filter({ hasText: "Loading account A" })
    .getByRole("checkbox")
    .check();
  await page
    .locator(".account-option")
    .filter({ hasText: "Loading account B" })
    .getByRole("checkbox")
    .uncheck();
  await page.keyboard.press("Escape");
  await expect(page.locator(".metric-card").first()).toContainText("+$100.00");
  const catalog = (await (await page.request.get("/api/prop-presets")).json())
    .presets;
  const rules = structuredClone(
    catalog.find((p: { id: string }) => p.id === "apex-eod-50-eval").rules,
  );
  rules.manualConfirmed = true;
  rules.session.confirmed = true;
  const configured = await page.request.post("/api/prop-progress/setup", {
    headers: { Origin: origin },
    data: {
      requestId: randomUUID(),
      accountId: a.id,
      phaseId: null,
      account: identity(a.displayName),
      rules,
      origin: "start",
      automaticStart: true,
      startLocal: "2026-10-01T00:00:00",
      snapshotLocal: null,
      baseline: "50000",
      historyConfirmed: false,
      opening: {},
      confirmActivity: true,
    },
  });
  expect(configured.status(), await configured.text()).toBe(200);
  for (const [path, endpoint, selector] of [
    [`/trade-view?${query(a.id)}`, "/api/journal", ".tv-skeleton"],
    [
      `/calendar?month=2026-10&accounts=${a.id}`,
      "/api/calendar",
      ".calendar-skeleton",
    ],
    [`/prop-accounts/${a.id}`, "/api/prop-progress", ".app-loading-account"],
  ]) {
    const gate = await defer(page, endpoint);
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await expect(page.locator(selector).first()).toBeVisible();
    await capture(page, info, endpoint.split("/").at(-1)!);
    gate.release();
    await expect(page.locator(selector)).toHaveCount(0);
    await gate.stop();
  }
  const failure = await defer(page, "/api/dashboard", () => true, true);
  await page.goto(`/?${query(a.id)}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".app-loading-dashboard")).toBeVisible();
  await failure.started;
  failure.release();
  await expect(
    page.getByRole("alert").filter({ hasText: "Loading fixture unavailable" }),
  ).toBeVisible();
  await expect(page.locator(".app-loading-dashboard")).toHaveCount(0);
  await failure.stop();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.locator(".metric-card").first()).toContainText("+$100.00");
  await page.evaluate(
    (id) =>
      window.history.pushState(
        null,
        "",
        `/?accounts=${id}&start=2026-10-28&end=2026-10-29`,
      ),
    a.id,
  );
  await expect(
    page.getByText("No published records contribute to this selection.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".app-loading-dashboard")).toHaveCount(0);
  await page.locator(".account-trigger").focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Select all", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".account-trigger")).toBeFocused();
  expect(pageErrors).toEqual([]);
});

test("setup shimmer and save feedback preserve unsaved form input", async ({
  page,
}, info) => {
  test.skip(
    process.env.MSJOURNAL_TEST_DISPOSABLE !== "true",
    "Disposable fixtures only",
  );
  test.setTimeout(90000);
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(60000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page);
  let release!: () => void;
  const pending = new Promise<void>((r) => {
    release = r;
  });
  await page.route("**/api/prop-presets", async (route) => {
    const response = await route.fetch();
    await pending;
    await route.fulfill({ response });
  });
  await page.goto("/prop-accounts?add=1", { waitUntil: "domcontentloaded" });
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".app-loading-options")).toBeVisible();
  await capture(page, info, "setup-options");
  release();
  await dialog
    .locator(".prop-firm-tiles button")
    .filter({ hasText: "Apex Trader Funding" })
    .click();
  await dialog.getByLabel("Account label").fill("Unsaved loading fixture");
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await dialog
    .getByRole("checkbox", { name: /I reviewed the applicable rules/ })
    .check();
  let fail!: () => void;
  const saving = new Promise<void>((r) => {
    fail = r;
  });
  await page.route("**/api/prop-progress/setup", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await saving;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Temporary save fixture" }),
    });
  });
  await dialog
    .getByRole("button", { name: "Save account & tracking", exact: true })
    .click();
  const button = dialog.getByRole("button", { name: "Saving", exact: true });
  await expect(button).toBeDisabled();
  await expect(button).toHaveAttribute("aria-busy", "true");
  await expect(button.locator(".app-loading-spinner")).toBeVisible();
  expect(
    await button
      .locator(".app-loading-spinner")
      .evaluate((e) => getComputedStyle(e).animationName),
  ).toBe("none");
  fail();
  await expect(dialog.getByRole("alert")).toContainText(
    "Temporary save fixture",
  );
  await dialog.getByRole("button", { name: "Back", exact: true }).click();
  await expect(dialog.getByLabel("Account label")).toHaveValue(
    "Unsaved loading fixture",
  );
});

test("page loading preserves the sidebar and its navigation state", async ({
  page,
}, info) => {
  test.skip(
    process.env.MSJOURNAL_TEST_DISPOSABLE !== "true",
    "Disposable fixtures only",
  );
  test.setTimeout(90000);
  page.setDefaultNavigationTimeout(60000);
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page);
  await page.goto("/trade-view", { waitUntil: "domcontentloaded" });
  const sidebar = page.locator(".desktop-sidebar");
  await expect(sidebar).toBeVisible();
  await page
    .getByRole("button", { name: "Collapse sidebar", exact: true })
    .click();
  await expect(sidebar).toHaveClass(/collapsed/);
  await page
    .getByRole("button", { name: "Expand sidebar", exact: true })
    .click();
  await expect(sidebar).not.toHaveClass(/collapsed/);
  await sidebar.evaluate((node) => {
    node.setAttribute("data-loading-fixture", "preserved");
  });
  const gate = await defer(page, "/api/dashboard");
  await sidebar.getByRole("link", { name: "Dashboard", exact: true }).click();
  await gate.started;
  await expect(page.locator("main .app-loading-dashboard")).toBeVisible();
  await expect(sidebar).toHaveAttribute("data-loading-fixture", "preserved");
  await expect(
    sidebar.getByRole("link", { name: "Import Trades", exact: true }),
  ).toBeEnabled();
  await expect(sidebar.locator(".app-skeleton")).toHaveCount(0);
  await expect(
    page
      .locator(".app-loading-state")
      .filter({ has: page.locator(".desktop-sidebar") }),
  ).toHaveCount(0);
  const title = page.getByRole("heading", { name: "Dashboard", exact: true });
  await expect(title).toHaveCSS("font-size", "24px");
  const mainBox = await page.locator("main").boundingBox();
  const titleBox = await title.boundingBox();
  expect(titleBox!.x - mainBox!.x).toBeGreaterThanOrEqual(16);
  expect(titleBox!.y - mainBox!.y).toBeGreaterThanOrEqual(14);
  await page.screenshot({
    path: info.outputPath("sidebar-with-page-loading.png"),
  });
  await page
    .getByRole("button", { name: "Collapse sidebar", exact: true })
    .click();
  await expect(sidebar).toHaveClass(/collapsed/);
  gate.release();
  await expect(page.locator("main .app-loading-dashboard")).toHaveCount(0);
  await gate.stop();
  const reports = await defer(page, "/api/reports");
  await sidebar.getByRole("link", { name: "Reports", exact: true }).click();
  await reports.started;
  await expect(page.locator("main .app-loading-report")).toBeVisible();
  await expect(sidebar).toHaveClass(/collapsed/);
  await expect(sidebar).toHaveAttribute("data-loading-fixture", "preserved");
  reports.release();
  await expect(page.locator("main .app-loading-report")).toHaveCount(0);
  await reports.stop();
  await expect(
    page.getByRole("button", { name: "Expand sidebar", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Expand sidebar", exact: true })
    .click();
  await sidebar.getByRole("link", { name: "Day View", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Day View", exact: true }),
  ).toHaveCSS("font-size", "24px");
  await capture(page, info, "day-view-title");
  await page.setViewportSize({ width: 390, height: 950 });
  await expect(
    page.getByRole("heading", { name: "Day View", exact: true }),
  ).toHaveCSS("font-size", "22px");
});
