import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { disposableUser, cleanupUsers } from "./fixture-users";
import { csv, performance } from "../tests/fixtures/tradovate";
const origin = process.env.MSJOURNAL_BROWSER_ORIGIN ?? "http://localhost:3000";
test.use({ baseURL: origin });
test.afterEach(() => cleanupUsers());
test("guided prop setup is atomic, private, reuses imports and fits both themes", async ({
  page,
  playwright,
}, info) => {
  test.skip(
    process.env.MSJOURNAL_TEST_DISPOSABLE !== "true",
    "Disposable accounts only",
  );
  test.setTimeout(300000);
  page.setDefaultTimeout(30000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const headers = { Origin: origin };
  expect(
    (
      await page.request.post("/api/auth/sign-up/email", {
        headers,
        data: disposableUser(),
      })
    ).status(),
  ).toBe(200);
  const hydrated = page.waitForResponse(
    (r) => r.url().includes("/api/prop-progress?") && r.status() === 200,
  );
  await page.goto("/prop-accounts", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await hydrated;
  await page
    .getByRole("button", { name: "Add Account", exact: true })
    .first()
    .click();
  let dialog = page.getByRole("dialog");
  await dialog
    .locator(".prop-firm-tiles button")
    .filter({ hasText: "Topstep" })
    .click();
  await dialog
    .getByRole("button", { name: "XFA Standard", exact: true })
    .click();
  await expect(dialog.getByLabel("Account stage")).toHaveValue("Sim Funded");
  await expect(dialog.locator(".prop-size-grid button")).toHaveCount(3);
  await dialog
    .locator(".prop-size-grid button")
    .filter({ hasText: "$50,000" })
    .click();
  await expect(dialog.getByLabel("Actual platform")).toHaveValue("TopstepX");
  await dialog.getByLabel("Account label").fill("Guided Topstep fixture");
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    dialog
      .locator(".prop-drawdown-options button")
      .filter({ hasText: "Intraday trailing" }),
  ).toBeDisabled();
  await dialog
    .getByRole("button", { name: "Customize rules", exact: true })
    .click();
  await dialog
    .locator(".prop-drawdown-options button")
    .filter({ hasText: "Static loss limit" })
    .click();
  await expect(
    dialog.getByText("Custom configuration", { exact: false }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Reset to selected preset", exact: true })
    .click();
  await dialog
    .getByRole("checkbox", { name: /I reviewed the applicable rules/ })
    .check();
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(dialog.getByLabel("Starting balance")).toHaveValue("0");
  await dialog
    .getByLabel("Phase start", { exact: true })
    .fill("2026-10-01T00:00");
  await dialog
    .getByRole("checkbox", { name: /I confirmed complete activity/ })
    .check();
  await dialog.getByLabel("Confirm activity preview").check();
  const request = page.waitForRequest(
    (r) =>
      r.url().endsWith("/api/prop-progress/setup") && r.method() === "POST",
  );
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/prop-progress/setup") &&
      r.request().method() === "POST",
  );
  await dialog
    .getByRole("button", { name: "Save account & tracking", exact: true })
    .click();
  const body = (await request).postDataJSON();
  const savedResponse = await response;
  expect(savedResponse.status(), await savedResponse.text()).toBe(200);
  const saved = await savedResponse.json();
  await expect(
    page.getByRole("status").filter({ hasText: "and tracking saved" }),
  ).toBeVisible();
  const duplicate = await page.request.post("/api/prop-progress/setup", {
    maxRetries: 1,
    headers,
    data: body,
  });
  expect(duplicate.status()).toBe(200);
  expect((await duplicate.json()).account.id).toBe(saved.account.id);
  let data = await (
    await page.request.get(`/api/prop-progress?accountId=${saved.account.id}`)
  ).json();
  expect(data.accounts[0].phases).toHaveLength(1);
  expect(data.accounts[0].phases[0].tracking.rules).toMatchObject({
    firm: "Topstep",
    product: "XFA Standard",
    size: "50000",
    platform: "TopstepX",
    drawdown: { mode: "End-of-day trailing" },
  });
  const invalid = {
    ...body,
    requestId: randomUUID(),
    startLocal: "2099-10-01T00:00:00",
    account: { ...body.account, displayName: "Rollback fixture" },
  };
  expect(
    (
      await page.request.post("/api/prop-progress/setup", {
        headers,
        data: invalid,
      })
    ).status(),
  ).toBe(400);
  expect(
    (await (await page.request.get("/api/trading-accounts")).json()).accounts,
  ).toHaveLength(1);
  const other = await playwright.request.newContext({ baseURL: origin });
  try {
    expect(
      (
        await other.post("/api/auth/sign-up/email", {
          headers,
          data: disposableUser(),
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await other.get(
          `/api/prop-progress/setup?${new URLSearchParams({ accountId: saved.account.id, startLocal: body.startLocal })}`,
        )
      ).status(),
    ).toBe(404);
    const forged = { ...body, requestId: randomUUID(), phaseId: saved.phaseId };
    expect(
      (
        await other.post("/api/prop-progress/setup", { headers, data: forged })
      ).status(),
    ).toBe(404);
    expect(
      (await (await other.get("/api/trading-accounts")).json()).accounts,
    ).toHaveLength(0);
  } finally {
    await other.dispose();
  }
  const identity = {
    ...body.account,
    displayName: "Existing Apex fixture",
    firmChoice: "Apex Trader Funding",
    programName: "",
    platform: "Tradovate",
    stage: "Evaluation",
    reportingTimezone: "UTC",
  };
  const old = await page.request.post("/api/trading-accounts", {
    headers,
    data: identity,
  });
  expect(old.status()).toBe(201);
  const oldAccount = (await old.json()).account;
  const input = {
    accountId: oldAccount.id,
    timezone: "UTC",
    confirmPerformance: "true",
    confirmOrders: "false",
    feeTotal: "1",
    performance: {
      name: "synthetic-prop.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        csv("performance", [
          performance({
            pnl: "100",
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
  expect(
    (
      await page.request.post("/api/imports/confirm", {
        headers,
        multipart: {
          ...input,
          token: preview.token,
          feeFingerprint: preview.feeReview.fingerprint,
        },
      })
    ).status(),
  ).toBe(200);
  await page.goto("/prop-accounts", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  const card = page.locator(".prop-progress-card").filter({
    has: page.getByRole("heading", {
      name: "Existing Apex fixture",
      exact: true,
    }),
  });
  await card.getByRole("button", { name: /Finish setup/ }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "EOD", exact: true }).click();
  await dialog
    .locator(".prop-size-grid button")
    .filter({ hasText: "$50,000" })
    .click();
  await expect(dialog.getByLabel("Account label")).toHaveValue(
    "Existing Apex fixture",
  );
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => {
      localStorage.setItem("theme", t);
      document.documentElement.classList.toggle("dark", t === "dark");
    }, theme);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 950 });
      await dialog.locator(".prop-setup-body").evaluate((e) => {
        e.scrollTop = 0;
      });
      await page.screenshot({
        path: info.outputPath(`setup-${theme}-${width}.png`),
      });
      expect(
        await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
      ).toBe(true);
    }
  }
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await dialog
    .getByRole("checkbox", { name: /I reviewed the applicable rules/ })
    .check();
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    dialog.getByText(/1 source records fit this phase cutoff/),
  ).toBeVisible();
  await dialog.locator(".prop-setup-body").evaluate((e) => {
    e.scrollTop = 0;
  });
  await page.screenshot({
    path: info.outputPath("starting-point-dark-390.png"),
  });
  await dialog
    .getByRole("checkbox", { name: /I confirmed complete activity/ })
    .check();
  await dialog.getByLabel("Confirm activity preview").check();
  await dialog
    .getByRole("button", { name: "Save account & tracking", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  data = await (
    await page.request.get(`/api/prop-progress?accountId=${oldAccount.id}`)
  ).json();
  expect(data.accounts[0].activity.count).toBe(1);
  expect(data.accounts[0].phases).toHaveLength(1);
  expect(data.accounts[0].phases[0].tracking).toMatchObject({
    phaseProfit: "99",
    balance: "50099",
  });
  expect(
    (
      await page.request.post("/api/trading-accounts", {
        headers,
        data: { ...identity, displayName: "Incomplete history fixture" },
      })
    ).status(),
  ).toBe(201);
  await page.goto("/prop-accounts", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await expect(page.locator(".prop-progress-card")).toHaveCount(3);
  await expect(
    page.getByText("Profit target / net", { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await expect(
    page.getByText("Loading account progress...", { exact: true }),
  ).toHaveCount(0);
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => {
      localStorage.setItem("theme", t);
      document.documentElement.classList.toggle("dark", t === "dark");
    }, theme);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 950 });
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        )
        .toBe(true);
      await page.screenshot({
        path: info.outputPath(`cards-${theme}-${width}.png`),
        fullPage: true,
      });
    }
  }
});
