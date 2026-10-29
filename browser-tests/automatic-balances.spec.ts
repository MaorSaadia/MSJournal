import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { disposableUser, cleanupUsers } from "./fixture-users";
import { customTrackingRules } from "../lib/props/tracking-rules";
const origin = process.env.MSJOURNAL_BROWSER_ORIGIN ?? "http://localhost:3000";
test.use({ baseURL: origin });
test.afterEach(() => cleanupUsers());

test("dashboard automatically starts a 50K account at 50,000 and keeps configured zero ledgers", async ({
  page,
}, info) => {
  test.skip(
    process.env.MSJOURNAL_TEST_DISPOSABLE !== "true",
    "Disposable fixtures only",
  );
  test.setTimeout(90000);
  page.setDefaultTimeout(20000);
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
  const identity = {
    displayName: "Automatic 50K fixture",
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
  };
  const created = await page.request.post("/api/trading-accounts", {
    headers,
    data: identity,
  });
  expect(created.status()).toBe(201);
  const account = (await created.json()).account;
  const query = `start=2026-10-01&end=2026-10-29&accounts=${account.id}`;
  const dashboard = await page.request.get(`/api/dashboard?${query}`);
  expect(dashboard.status()).toBe(200);
  const payload = await dashboard.json();
  expect(payload.balances.combined, JSON.stringify(payload.balances)).toMatchObject({
    entering: "50000",
    ending: "50000",
  });
  await page.goto(`/?${query}`);
  const panel = page.locator(".dashboard-balance-panel");
  await expect(panel.locator(".panel-value")).toHaveText("$50,000.00");
  await expect(
    panel.getByText(/Set a starting balance for each selected account/),
  ).toHaveCount(0);
  await panel
    .getByText("Balance settings & adjustments", { exact: true })
    .click();
  await expect(panel.getByText(/automatic from account size/)).toBeVisible();
  await expect(
    panel.getByText("Starting balance needed", { exact: true }),
  ).toHaveCount(0);
  for (const [theme, width] of [
    ["light", 1440],
    ["dark", 390],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(
      (theme) =>
        document.documentElement.classList.toggle("dark", theme === "dark"),
      theme,
    );
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath(`automatic-balance-${theme}-${width}.png`),
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
  // A dashboard read must not persist a guessed manual balance.
  expect(
    (
      await (
        await page.request.get(`/api/trading-accounts/${account.id}`)
      ).json()
    ).account.openingBalance,
  ).toBeNull();
  const rules = customTrackingRules();
  rules.stage = "Sim Funded";
  rules.ledgerStart = "0";
  rules.drawdown.initialThreshold = "-2000";
  rules.manualConfirmed = true;
  const saved = await page.request.post("/api/prop-progress/setup", {
    headers,
    data: {
      requestId: randomUUID(),
      accountId: null,
      phaseId: null,
      account: {
        ...identity,
        displayName: "Zero ledger fixture",
        firmChoice: "Other",
        customFirm: "Balance fixtures",
        stage: "Funded",
      },
      rules,
      origin: "start",
      automaticStart: true,
      startLocal: "2026-10-10T12:00:00",
      snapshotLocal: null,
      baseline: "0",
      historyConfirmed: false,
      opening: {},
      confirmActivity: true,
    },
  });
  expect(saved.status(), await saved.text()).toBe(200);
  const zeroAccount = (await saved.json()).account;
  const zero = await page.request.get(
    `/api/dashboard?start=2026-10-01&end=2026-10-29&accounts=${zeroAccount.id}`,
  );
  expect(zero.status()).toBe(200);
  const result = (await zero.json()).balances;
  expect(result.accounts[0]).toMatchObject({
    baseline: "0.00",
    baselineSource: "phase",
    ending: "0",
  });
  expect(result.combined.ending).toBe("0");
  expect(result.combined.points[0].value).toBeNull();
});
