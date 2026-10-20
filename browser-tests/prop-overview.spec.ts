import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { disposableUser, cleanupUsers } from "./fixture-users";
import { csv, performance } from "../tests/fixtures/tradovate";
import { customTrackingRules } from "../lib/props/tracking-rules";
import { toLegacyRules } from "../lib/props/presets";
import { journalMoney } from "../lib/journal/calculations";
const origin = process.env.MSJOURNAL_BROWSER_ORIGIN ?? "http://localhost:3000";
test.use({ baseURL: origin });
const check = expect.configure({ timeout: 30000 });
test.afterEach(() => cleanupUsers());
test("account overview agrees with progress, preserves dates and isolates account switches", async ({
  page,
}, info) => {
  test.skip(
    process.env.MSJOURNAL_TEST_DISPOSABLE !== "true",
    "Disposable accounts only",
  );
  test.setTimeout(240000);
  page.setDefaultTimeout(30000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const headers = { Origin: origin };
  check(
    (
      await page.request.post("/api/auth/sign-up/email", {
        headers,
        data: disposableUser(),
      })
    ).status(),
  ).toBe(200);
  async function create(
    name: string,
    stage: "Evaluation" | "Funded",
    sparse = false,
  ) {
    const response = await page.request.post("/api/trading-accounts", {
      headers,
      data: {
        displayName: name,
        firmChoice: "Other",
        customFirm: "Overview fixtures",
        platform: "Tradovate",
        brokerIdentifier: "",
        stage,
        status: "Active",
        nominalSize: "50000",
        openingBalance: "",
        openingBalanceDate: "",
        currency: "USD",
        reportingTimezone: "UTC",
        notes: "Synthetic fixture",
      },
    });
    check(response.status()).toBe(201);
    const account = (await response.json()).account;
    const r = customTrackingRules();
    r.stage = stage === "Evaluation" ? "Evaluation" : "Sim Funded";
    r.size = "50000";
    r.ledgerStart = stage === "Evaluation" ? "50000" : "0";
    r.session.timezone = "America/Chicago";
    r.session.reset = "17:00";
    r.session.close = "16:00";
    r.session.confirmed = true;
    r.manualConfirmed = true;
    r.consistency.status = "disabled";
    r.drawdown.mode = sparse
      ? "Intraday trailing"
      : stage === "Evaluation"
        ? "End-of-day trailing"
        : "Static";
    r.drawdown.distance = "2000";
    r.drawdown.initialThreshold = stage === "Evaluation" ? "48000" : "-500";
    r.drawdown.highWater = stage === "Evaluation" ? "50000" : "0";
    r.drawdown.cap = stage === "Evaluation" ? "50000" : "0";
    if (stage === "Evaluation") {
      r.evaluation.target = "3000";
      r.evaluation.tradingDays = 3;
    } else
      Object.assign(r.payout, {
        enabled: true,
        verified: true,
        minimum: "100",
        minimumBalanceToSubmit: "200",
        minimumBalanceAfter: "0",
        requiredDays: 0,
        dailyProfit: "0",
        caps: ["500"],
        split: "90",
        resetEvent: "paid",
      });
    const saved = await page.request.post("/api/prop-progress", {
      headers,
      data: {
        action: "phase",
        accountId: account.id,
        previousId: null,
        kind: stage,
        label: `${name} phase`,
        startLocal: "2026-10-01T00:00:00",
        baseline: stage === "Evaluation" ? "50000" : "0",
        historyConfirmed: stage === "Evaluation",
        note: "Synthetic",
        initialRules: toLegacyRules(r),
      },
    });
    check(saved.status(), await saved.text()).toBe(200);
    return { account, phaseId: (await saved.json()).phaseId };
  }
  const evaluation = await create("Overview Evaluation", "Evaluation"),
    funded = await create("Overview Funded", "Funded"),
    sparse = await create("Overview Sparse", "Funded", true);
  const file = {
    name: "overview-synthetic.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      csv("performance", [
        performance({
          pnl: "1000",
          boughtTimestamp: "10/02/2026 12:00:00",
          soldTimestamp: "10/02/2026 12:05:00",
        }),
      ]),
    ),
  };
  const input = {
    accountId: evaluation.account.id,
    timezone: "UTC",
    confirmPerformance: "true",
    confirmOrders: "false",
    feeTotal: "10",
    performance: file,
  };
  const previewResponse = await page.request.post("/api/imports/preview", {
    headers,
    multipart: input,
  });
  check(previewResponse.status()).toBe(200);
  const preview = await previewResponse.json();
  check(
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
  async function snapshot(
    target: typeof funded,
    at: string,
    balance: string,
    threshold: string,
  ) {
    const response = await page.request.post("/api/prop-progress", {
      headers,
      data: {
        action: "snapshot",
        accountId: target.account.id,
        phaseId: target.phaseId,
        asOfLocal: at,
        balance,
        threshold,
        qualifyingDays: "0",
        note: "Synthetic observation",
        details: {
          highWater: balance,
          phaseProfit: balance,
          cycleProfit: balance,
          bestDay: balance,
          tradingDays: 0,
          qualifyingDays: 0,
          cycleNumber: 1,
          payoutNumber: 1,
          openingConfirmed: true,
        },
      },
    });
    check(response.status(), await response.text()).toBe(200);
  }
  await snapshot(funded, "2026-10-03T12:00:00", "750", "-200");
  await snapshot(sparse, "2026-10-03T12:00:00", "1000", "500");
  await snapshot(sparse, "2026-10-05T12:00:00", "1200", "600");
  const payout = await page.request.post("/api/prop-progress/payouts", {
    headers,
    data: {
      accountId: funded.account.id,
      phaseId: funded.phaseId,
      id: randomUUID(),
      revision: 0,
      fields: {
        status: "Approved",
        requestedAmount: "100",
        requestedAt: "2026-10-03T13:00:00.000Z",
        approvedAmount: "100",
        approvedAt: "2026-10-04T12:00:00.000Z",
        deductionAmount: "100",
        deductedAt: "2026-10-04T13:00:00.000Z",
        receiptAmount: null,
        paidAt: null,
        note: "Synthetic payout",
      },
    },
  });
  check(payout.status(), await payout.text()).toBe(200);
  async function expected(id: string) {
    const response = await page.request.get(
      `/api/prop-progress?accountId=${id}`,
    );
    check(response.status()).toBe(200);
    return (await response.json()).accounts[0].phases[0].tracking;
  }
  const evaluationData = await expected(evaluation.account.id),
    fundedData = await expected(funded.account.id);
  const metric = (name: string) =>
    page
      .locator(".prop-overview-metrics section")
      .filter({ hasText: name })
      .locator("strong");
  const loaded = page.waitForResponse(
    (response) =>
      response
        .url()
        .includes("/api/prop-progress?accountId=" + evaluation.account.id),
    { timeout: 90000 },
  );
  await page.goto(`/prop-accounts/${evaluation.account.id}`, {
    timeout: 90000,
    waitUntil: "domcontentloaded",
  });
  check((await loaded).status()).toBe(200);
  await check(metric("Account balance")).toHaveText(
    journalMoney(evaluationData.balance),
  );
  await check(metric("Phase trading P&L")).toHaveText(
    journalMoney(evaluationData.phaseProfit, true),
  );
  await check(page.locator(".prop-overview-chart-canvas")).toBeVisible();
  await page
    .locator('.prop-session-calendar-grid button[aria-label^="2026-10-02,"]')
    .click();
  await check(page.locator(".prop-session-detail")).toContainText("$990.00");
  await check(
    page
      .locator(".prop-session-detail")
      .getByRole("link", { name: /Open journal record/ }),
  ).toHaveCount(1);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (t) => document.documentElement.classList.toggle("dark", t === "dark"),
      theme,
    );
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => scrollTo(0, 0));
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        )
        .toBe(true);
      await page.screenshot({
        path: info.outputPath(`evaluation-${theme}-${width}.png`),
        fullPage: true,
      });
    }
  }
  await page.getByRole("button", { name: "Custom", exact: true }).click();
  await page.getByLabel("Chart from date").fill("2026-10-01");
  await page.getByLabel("Chart through date").fill("2026-10-04");
  await page.getByLabel("Calendar month", { exact: true }).fill("2026-09");
  await page
    .getByLabel("Switch account", { exact: true })
    .selectOption(funded.account.id);
  await check(page.locator(".prop-workspace")).toHaveAttribute(
    "data-account-id",
    funded.account.id,
  );
  await check(metric("Account balance")).toHaveText(
    journalMoney(fundedData.balance),
  );
  await check(metric("Remaining loss buffer")).toHaveText(
    journalMoney(fundedData.buffer),
  );
  await check(page.locator(".prop-overview-metrics")).not.toContainText(
    journalMoney(evaluationData.balance),
  );
  await page.locator(".prop-overview-events summary").click();
  await check(page.locator(".prop-overview-events")).toContainText(
    "Payout 1 deducted",
  );
  await check(page.locator(".prop-overview-events")).toContainText(
    "4 Oct 2026",
  );
  await page.getByRole("button", { name: "Events", exact: true }).click();
  await check(
    page.locator(".prop-session-calendar-grid .prop-session-payout-event"),
  ).toHaveCount(3);
  await page.getByRole("button", { name: "P&L", exact: true }).click();

  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (t) => document.documentElement.classList.toggle("dark", t === "dark"),
      theme,
    );
    await page.setViewportSize({
      width: theme === "light" ? 1440 : 390,
      height: 1000,
    });
    await page.evaluate(() => scrollTo(0, 0));
    check(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`funded-${theme}.png`),
      fullPage: true,
    });
  }
  await page
    .getByLabel("Switch account", { exact: true })
    .selectOption(evaluation.account.id);
  await check(metric("Account balance")).toHaveText(
    journalMoney(evaluationData.balance),
  );
  await check(page.getByLabel("Chart from date")).toHaveValue("2026-10-01");
  await check(page.getByLabel("Chart through date")).toHaveValue("2026-10-04");
  await check(page.getByLabel("Calendar month", { exact: true })).toHaveValue(
    "2026-09",
  );
  await page
    .getByLabel("Switch account", { exact: true })
    .selectOption(sparse.account.id);
  await check(metric("Account balance")).toHaveText("$1,200.00");
  await check(page.locator(".prop-overview-chart-canvas")).toBeVisible();
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("sparse-dark-390.png"),
    fullPage: true,
  });
  await check(page.locator(".prop-account-overview")).toHaveAttribute(
    "data-phase-id",
    sparse.phaseId,
  );
});
