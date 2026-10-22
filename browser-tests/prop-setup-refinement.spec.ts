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
  await page.getByRole("button", { name: "Add Firm", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog
    .locator(".prop-firm-tiles button")
    .filter({ hasText: "Topstep" })
    .click();
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (t) => document.documentElement.classList.toggle("dark", t === "dark"),
      theme,
    );
    await page.setViewportSize({
      width: theme === "light" ? 1440 : 390,
      height: 950,
    });
    await page.screenshot({ path: info.outputPath(`add-firm-${theme}.png`) });
    expect(
      await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
    ).toBe(true);
  }
  const firmSaved = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/prop-firms") && r.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Add Firm", exact: true }).click();
  const firmResponse = await firmSaved;
  expect(firmResponse.status(), await firmResponse.text()).toBe(200);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText("Your first account starts here", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Topstep", exact: true }),
  ).toBeVisible();
  expect(
    (
      await (
        await page.request.post("/api/prop-firms", {
          headers,
          data: { name: "Topstep" },
        })
      ).json()
    ).firms,
  ).toEqual(["Topstep"]);
  await page
    .locator(".prop-firm-group")
    .filter({
      has: page.getByRole("heading", { name: "Topstep", exact: true }),
    })
    .getByRole("button", { name: "+ Add account", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await expect(dialog.locator(".prop-firm-tiles")).toHaveCount(0);
  await expect(dialog.locator(".prop-setup-firm-context")).toContainText(
    "Topstep",
  );
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
    expect((await (await other.get("/api/prop-firms")).json()).firms).toEqual(
      [],
    );
    expect(
      (
        await (
          await other.post("/api/prop-firms", {
            headers,
            data: { name: "Lucid Trading" },
          })
        ).json()
      ).firms,
    ).toEqual(["Lucid Trading"]);
    expect(
      (await (await page.request.get("/api/prop-firms")).json()).firms,
    ).toEqual(["Topstep"]);
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

test("custom TPT account accepts an unlisted size and persists its own rules", async ({
  page,
}, info) => {
  test.skip(
    process.env.MSJOURNAL_TEST_DISPOSABLE !== "true",
    "Disposable accounts only",
  );
  test.setTimeout(180000);
  page.setDefaultTimeout(30000);
  const headers = { Origin: origin };
  expect(
    (
      await page.request.post("/api/auth/sign-up/email", {
        headers,
        data: disposableUser(),
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.post("/api/prop-firms", {
        headers,
        data: { name: "Take Profit Trader" },
      })
    ).status(),
  ).toBe(200);
  const hydrated = page.waitForResponse(
    (r) => r.url().includes("/api/prop-progress?") && r.status() === 200,
  );
  await page.goto("/prop-accounts");
  await hydrated;
  await page
    .getByRole("button", { name: "+ Add account", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".prop-size-grid button")).toHaveCount(5);
  await dialog
    .locator(".prop-size-grid button")
    .filter({ hasText: "$150,000" })
    .click();
  await expect(
    dialog.locator(".prop-size-grid button[aria-pressed=true]"),
  ).toContainText("$4,500");
  await dialog.getByRole("button", { name: /Custom account/ }).click();
  await dialog
    .getByLabel("Custom account size", { exact: true })
    .fill("200000");
  await dialog
    .getByLabel("Custom product", { exact: true })
    .fill("My purchased agreement");
  await dialog
    .getByLabel("Account label", { exact: true })
    .fill("Custom TPT fixture");
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (t) => document.documentElement.classList.toggle("dark", t === "dark"),
      theme,
    );
    await page.setViewportSize({
      width: theme === "light" ? 1440 : 390,
      height: 950,
    });
    await dialog
      .getByLabel("Custom account size", { exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath(`custom-account-${theme}.png`),
    });
    expect(
      await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
    ).toBe(true);
  }
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await dialog.getByLabel("Profit target", { exact: true }).fill("10000");
  await dialog.getByLabel("Drawdown distance", { exact: true }).fill("5000");
  await dialog
    .getByLabel("Initial / confirmed loss threshold", { exact: true })
    .fill("195000");
  await dialog
    .getByLabel("Confirmed high-water mark", { exact: true })
    .fill("200000");
  await dialog
    .getByRole("checkbox", { name: /I reviewed and explicitly confirmed/ })
    .check();
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    dialog.getByLabel("Starting balance", { exact: true }),
  ).toHaveValue("");
  await dialog.getByLabel("Starting balance", { exact: true }).fill("200000");
  await dialog.getByLabel("Confirm activity preview").check();
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/prop-progress/setup") &&
      r.request().method() === "POST",
  );
  await dialog
    .getByRole("button", { name: "Save account & tracking", exact: true })
    .click();
  const response = await saved;
  expect(response.status(), await response.text()).toBe(200);
  const account = (await response.json()).account;
  expect(account).toMatchObject({
    firm: "Take Profit Trader",
    nominalSize: "200000.00",
  });
  const progress = (
    await (
      await page.request.get(`/api/prop-progress?accountId=${account.id}`)
    ).json()
  ).accounts[0];
  expect(progress.phases[0].phase.baseline).toBe("200000.00");
  expect(progress.phases[0].tracking.rules).toMatchObject({
    firm: "Take Profit Trader",
    size: "200000",
    product: "My purchased agreement",
    preset: null,
    drawdown: { distance: "5000", initialThreshold: "195000" },
  });
});

test("empty firm deletion is private and preserves active and archived accounts", async ({ page, playwright }, info) => {
  test.skip(process.env.MSJOURNAL_TEST_DISPOSABLE !== "true", "Disposable accounts only");
  test.setTimeout(120000);
  const headers = { Origin: origin };
  expect((await page.request.post("/api/auth/sign-up/email", { headers, data: disposableUser() })).status()).toBe(200);
  const other = await playwright.request.newContext({ baseURL: origin });
  try {
    expect((await other.post("/api/auth/sign-up/email", { headers, data: disposableUser() })).status()).toBe(200);
    const name = "Take Profit Trader";
    expect((await page.request.post("/api/prop-firms", { headers, data: { name } })).status()).toBe(200);
    expect((await other.delete("/api/prop-firms", { headers, data: { name } })).status()).toBe(404);
    expect((await (await page.request.get("/api/prop-firms")).json()).firms).toContain(name);
    await page.goto("/prop-accounts");
    await page.getByRole("button", { name: `Delete ${name} firm`, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Delete firm?" })).toBeVisible();
    await page.screenshot({ path: info.outputPath("delete-empty-firm.png") });
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    await page.getByRole("button", { name: `Delete ${name} firm`, exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete firm", exact: true }).click();
    await expect(page.getByRole("heading", { name, exact: true })).toHaveCount(0);
    expect((await (await page.request.get("/api/prop-firms")).json()).firms).not.toContain(name);
    expect((await page.request.post("/api/prop-firms", { headers, data: { name } })).status()).toBe(200);
    const response = await page.request.post("/api/trading-accounts", { headers, data: {
      displayName: "Protected firm account", firmChoice: "Take Profit Trader", customFirm: "",
      platform: "Tradovate", brokerIdentifier: "", stage: "Evaluation", status: "Active",
      nominalSize: "50000", openingBalance: "", openingBalanceDate: "", currency: "USD",
      reportingTimezone: "UTC", notes: "",
    } });
    expect(response.status()).toBe(201);
    const accountId = (await response.json()).account.id;
    expect((await page.request.delete("/api/prop-firms", { headers, data: { name } })).status()).toBe(409);
    expect((await page.request.patch(`/api/trading-accounts/${accountId}`, { headers, data: { archived: true } })).status()).toBe(200);
    expect((await page.request.delete("/api/prop-firms", { headers, data: { name } })).status()).toBe(409);
    expect((await page.request.get(`/api/trading-accounts/${accountId}`)).status()).toBe(200);
    expect((await (await page.request.get("/api/prop-firms")).json()).firms).toContain(name);
  } finally { await other.dispose(); }
});
