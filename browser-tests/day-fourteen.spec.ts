import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { disposableUser, cleanupUsers } from "./fixture-users";
import { csv, performance } from "../tests/fixtures/tradovate";
import {
  customTrackingRules,
  type PayoutFields,
} from "../lib/props/tracking-rules";
import { toLegacyRules } from "../lib/props/presets";
const origin = process.env.MSJOURNAL_BROWSER_ORIGIN ?? "http://127.0.0.1:3100";
test.use({ baseURL: origin });
test.afterEach(() => cleanupUsers());
test("Day 14 private phases, snapshot cutoffs, payout revisions, archive and focused responsive screens", async ({
  page,
  playwright,
}, info) => {
  test.skip(
    process.env.MSJOURNAL_TEST_DISPOSABLE !== "true",
    "Disposable fixtures only",
  );
  test.setTimeout(300000);
  page.setDefaultTimeout(15000);
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
  async function account(
    api: APIRequestContext,
    name: string,
    stage = "Funded",
  ) {
    const response = await api.post("/api/trading-accounts", {
      headers,
      data: {
        displayName: name,
        firmChoice: "Other",
        customFirm: "Disposable Day 14",
        platform: "Tradovate",
        brokerIdentifier: "",
        stage,
        status: "Active",
        nominalSize: "10000",
        openingBalance: "",
        openingBalanceDate: "",
        currency: "USD",
        reportingTimezone: "UTC",
        notes: "Synthetic only",
      },
    });
    expect(response.status()).toBe(201);
    return (await response.json()).account.id as string;
  }
  const evalId = await account(page.request, "Day 14 Evaluation", "Evaluation"),
    fundedId = await account(page.request, "Day 14 Funded"),
    partialId = await account(page.request, "Day 14 Incomplete");
  const config = customTrackingRules();
  config.stage = "Sim Funded";
  config.size = "10000";
  config.ledgerStart = "0";
  config.drawdown.initialThreshold = "-500";
  config.drawdown.highWater = "0";
  config.drawdown.distance = "500";
  config.session.confirmed = true;
  config.manualConfirmed = true;
  Object.assign(config.payout, {
    enabled: true,
    verified: true,
    minimum: "100",
    minimumBalanceAfter: "0",
    requiredDays: 0,
    dailyProfit: "0",
    resetEvent: "approved",
    caps: ["500"],
    split: "80",
  });
  async function phase(
    id: string,
    kind: "Evaluation" | "Funded",
    partial = false,
  ) {
    const r = structuredClone(config);
    r.stage = kind === "Evaluation" ? "Evaluation" : "Sim Funded";
    if (kind === "Evaluation") {
      r.evaluation.target = "1000";
      r.payout.enabled = false;
    }
    if (partial) {
      r.drawdown.mode = "Intraday trailing";
      r.drawdown.initialThreshold = "500";
      r.drawdown.highWater = "2000";
      r.manualConfirmed = false;
      r.payout.verified = false;
    }
    const response = await page.request.post("/api/prop-progress", {
      headers,
      data: {
        action: "phase",
        accountId: id,
        previousId: null,
        kind,
        label: partial ? "Snapshot-based partial phase" : `Synthetic ${kind}`,
        startLocal: "2026-10-01T00:00:00",
        baseline: "0",
        historyConfirmed: !partial,
        note: "Disposable fixture",
        initialRules: toLegacyRules(r),
      },
    });
    expect(response.status()).toBe(200);
    return (await response.json()).phaseId as string;
  }
  const evalPhase = await phase(evalId, "Evaluation"),
    fundedPhase = await phase(fundedId, "Funded"),
    partialPhase = await phase(partialId, "Funded", true);
  async function upload(
    id: string,
    feeTotal: string,
    rows = [
      performance({
        pnl: "1000",
        boughtTimestamp: "10/02/2026 12:00:00",
        soldTimestamp: "10/02/2026 12:05:00",
      }),
    ],
  ) {
    const input = {
      accountId: id,
      timezone: "UTC",
      confirmPerformance: "true",
      confirmOrders: "false",
      feeTotal,
      performance: {
        name: "day14-synthetic.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(csv("performance", rows)),
      },
    };
    const preview = await page.request.post("/api/imports/preview", {
      headers,
      multipart: input,
    });
    expect(preview.status()).toBe(200);
    const p = await preview.json();
    expect(
      (
        await page.request.post("/api/imports/confirm", {
          headers,
          multipart: {
            ...input,
            token: p.token,
            feeFingerprint: p.feeReview.fingerprint,
          },
        })
      ).status(),
    ).toBe(200);
  }
  await upload(evalId, "10");
  await upload(fundedId, "0");
  await upload(fundedId, "0");
  await upload(partialId, "0", [
    performance({
      pnl: "1000",
      buyFillId: "old",
      sellFillId: "old-exit",
      boughtTimestamp: "10/02/2026 12:00:00",
      soldTimestamp: "10/02/2026 12:05:00",
    }),
    performance({
      pnl: "100",
      buyFillId: "later",
      sellFillId: "later-exit",
      boughtTimestamp: "10/04/2026 12:00:00",
      soldTimestamp: "10/04/2026 12:05:00",
    }),
  ]);
  expect(
    (
      await page.request.post("/api/prop-progress", {
        headers,
        data: {
          action: "snapshot",
          accountId: partialId,
          phaseId: partialPhase,
          asOfLocal: "2026-10-03T16:00:00",
          balance: "1500",
          threshold: "500",
          qualifyingDays: "2",
          note: "Observed firm dashboard; partial history",
          details: {
            highWater: "2000",
            phaseProfit: "1500",
            cycleProfit: "1500",
            bestDay: "1000",
            tradingDays: 2,
            qualifyingDays: 2,
            cycleNumber: 2,
            payoutNumber: 2,
            openingConfirmed: true,
            coverageThrough: "2026-10-05T23:00:00.000Z",
          },
        },
      })
    ).status(),
  ).toBe(200);
  async function progress(id: string) {
    const response = await page.request.get(
      `/api/prop-progress?accountId=${id}`,
    );
    expect(
      response.status(),
      `Progress API status ${response.status()} (${response.headers()["content-type"] ?? "unknown content type"})`,
    ).toBe(200);
    return response.json();
  }
  const evalData = await progress(evalId);
  expect(evalData.accounts[0].phases[0].tracking).toMatchObject({
    phaseProfit: "990",
    remainingProfit: "10",
  });
  expect(
    (await progress(fundedId)).accounts[0].phases[0].tracking,
  ).toMatchObject({ phaseProfit: "1000", balance: "1000" });
  expect(
    (await progress(partialId)).accounts[0].phases[0].tracking,
  ).toMatchObject({ balance: "1600", phaseProfit: "1600", threshold: null });
  const payoutId = randomUUID();
  let fields: PayoutFields = {
    status: "Requested",
    requestedAmount: "500",
    requestedAt: "2026-10-03T12:00:00.000Z",
    approvedAmount: null,
    approvedAt: null,
    deductionAmount: null,
    deductedAt: null,
    receiptAmount: null,
    paidAt: null,
    note: "Disposable request",
  };
  const save = async (revision: number, api = page.request, overrides = {}) =>
    api.post("/api/prop-progress/payouts", {
      headers,
      data: {
        accountId: fundedId,
        phaseId: fundedPhase,
        id: payoutId,
        revision,
        fields,
        ...overrides,
      },
    });
  expect((await save(0)).status()).toBe(200);
  expect(
    (await progress(fundedId)).accounts[0].phases[0].tracking,
  ).toMatchObject({
    cycleNumber: 1,
    balance: "1000",
    payout: { reserved: "500" },
  });
  fields = {
    ...fields,
    status: "Approved",
    approvedAmount: "500",
    approvedAt: "2026-10-04T12:00:00.000Z",
    deductionAmount: "500",
    deductedAt: "2026-10-04T12:01:00.000Z",
  };
  expect((await save(1)).status()).toBe(200);
  let funded = await progress(fundedId);
  expect(funded.accounts[0].phases[0].tracking).toMatchObject({
    cycleNumber: 2,
    balance: "500",
    phaseProfit: "1000",
  });
  fields = {
    ...fields,
    status: "Paid",
    receiptAmount: "400",
    paidAt: "2026-10-05T12:00:00.000Z",
  };
  expect((await save(2)).status()).toBe(200);
  expect((await save(2)).status()).toBe(200);
  funded = await progress(fundedId);
  expect(funded.accounts[0].phases[0].tracking.balance).toBe("500");
  expect(funded.payoutAudit).toHaveLength(3);
  fields = {
    ...fields,
    deductionAmount: "400",
    note: "Correction to actual ledger deduction",
  };
  expect((await save(3)).status()).toBe(200);
  funded = await progress(fundedId);
  expect(funded.accounts[0].phases[0].tracking.balance).toBe("600");
  expect(funded.payoutAudit).toHaveLength(4);
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
    const otherId = await account(other, "Other user's fixture");
    expect(
      (await other.get(`/api/prop-progress?accountId=${fundedId}`)).status(),
    ).toBe(404);
    expect((await save(4, other, { accountId: otherId })).status()).toBe(404);
    expect(
      (
        await other.post("/api/prop-progress", {
          headers,
          data: {
            action: "snapshot",
            accountId: otherId,
            phaseId: fundedPhase,
            asOfLocal: "2026-10-05T12:00",
            balance: "1",
            threshold: "0",
            qualifyingDays: "",
            note: "",
          },
        })
      ).status(),
    ).toBe(404);
  } finally {
    await other.dispose();
  }
  const backup = await page.request.post("/api/exports/backup", {
    headers,
    data: { includeImages: false, allowPartial: false },
  });
  expect(backup.status()).toBe(200);
  const unzipped = spawnSync(
    "python",
    [
      "-c",
      "import sys,io,zipfile,json;z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()));assert z.testzip() is None;print(json.dumps({p:json.loads(z.read(p)) for p in z.namelist() if p.endswith('.json')}))",
    ],
    {
      input: await backup.body(),
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  expect(unzipped.status).toBe(0);
  const files = JSON.parse(unzipped.stdout);
  expect(files["manifest.json"].version).toBe(4);
  expect(files["data/prop_payouts.json"]).toHaveLength(1);
  expect(files["data/prop_payout_events.json"]).toHaveLength(4);
  expect(
    files["data/account_balance_adjustments.json"].filter(
      (a: { id: string }) => a.id === funded.payouts[0].deductionId,
    ),
  ).toHaveLength(1);
  for (const theme of ["light", "dark"]) {
    await page.goto(`/prop-accounts/${evalId}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.evaluate((t) => {
      localStorage.setItem("theme", t);
      document.documentElement.classList.toggle("dark", t === "dark");
    }, theme);
    for (const [id, label] of [
      [evalId, "evaluation"],
      [fundedId, "funded"],
      [partialId, "partial"],
    ]) {
      await page.goto(`/prop-accounts/${id}`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await expect(
        page.getByRole("heading", { name: "Requirements & next action" }),
      ).toBeVisible({ timeout: 30000 });
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 950 });
        await expect
          .poll(() =>
            page.evaluate(
              () =>
                document.documentElement.scrollWidth <= window.innerWidth + 1,
            ),
          )
          .toBe(true);
        await page.screenshot({
          path: info.outputPath(`${label}-${theme}-${width}.png`),
          fullPage: true,
        });
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto(`/prop-accounts/${fundedId}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.getByRole("button", { name: "Payouts", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Account payout log" }),
  ).toBeVisible();
  await expect(
    page.getByText("$400.00", { exact: true }).first(),
  ).toBeVisible();
  await page.goto(`/prop-accounts/${evalId}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.getByRole("button", { name: "Rules", exact: true }).click();
  const setup = page.getByRole("region", {
    name: "Configure progress tracking",
  });
  await expect(setup).toBeVisible({ timeout: 30000 });
  for (let i = 0; i < 4; i++)
    await setup.getByRole("button", { name: "Continue", exact: true }).click();
  await setup
    .getByRole("button", { name: "Save tracking configuration", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved. Progress reflects" }),
  ).toBeVisible({ timeout: 30000 });
  expect(
    (await progress(evalId)).accounts[0].phases[0].tracking.phaseProfit,
  ).toBe("990");
  // Keep the evaluation phase reference in the archive; no phase/source reassignment.
  expect(
    files["data/prop_phases.json"].some(
      (p: { id: string }) => p.id === evalPhase,
    ),
  ).toBe(true);
});
