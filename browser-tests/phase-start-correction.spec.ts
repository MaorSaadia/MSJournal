import { test, expect } from "@playwright/test";
import { disposableUser, cleanupUsers } from "./fixture-users";
import { csv, performance } from "../tests/fixtures/tradovate";
import { customTrackingRules } from "../lib/props/tracking-rules";
import { toLegacyRules } from "../lib/props/presets";
const origin = process.env.MSJOURNAL_BROWSER_ORIGIN ?? "http://localhost:3000";
test.use({ baseURL: origin });
test.afterEach(() => cleanupUsers());
test("correct first evaluation cutoff with preview, ownership and audit protection", async ({ page, playwright }) => {
  test.skip(process.env.MSJOURNAL_TEST_DISPOSABLE !== "true", "Disposable fixtures only");
  test.setTimeout(150000);
  const headers = { Origin: origin };
  expect((await page.request.post("/api/auth/sign-up/email", { headers, data: disposableUser() })).status()).toBe(200);
  const created = await page.request.post("/api/trading-accounts", { headers, data: {
    displayName: "Synthetic earlier evaluation", firmChoice: "Apex Trader Funding", customFirm: "",
    platform: "Tradovate", brokerIdentifier: "", stage: "Evaluation", status: "Active",
    nominalSize: "50000", openingBalance: "", openingBalanceDate: "", currency: "USD", reportingTimezone: "UTC", notes: "",
  } });
  expect(created.status()).toBe(201);
  const accountId = (await created.json()).account.id;
  const r = customTrackingRules(); r.stage = "Evaluation"; r.ledgerStart = "50000";
  r.session.confirmed = true; r.manualConfirmed = true; r.drawdown.mode = "Static";
  r.drawdown.initialThreshold = "48000"; r.drawdown.highWater = "50000";
  const saved = await page.request.post("/api/prop-progress", { headers, data: {
    action: "phase", accountId, previousId: null, kind: "Evaluation", label: "Synthetic phase",
    startLocal: "2026-10-22T23:00:00", baseline: "50000", historyConfirmed: true, note: "", initialRules: toLegacyRules(r),
  } });
  expect(saved.status()).toBe(200);
  const phaseId = (await saved.json()).phaseId;
  const input = { accountId, timezone: "UTC", confirmPerformance: "true", confirmOrders: "false", feeTotal: "10", performance: {
    name: "synthetic-earlier.csv", mimeType: "text/csv", buffer: Buffer.from(csv("performance", [performance({
      pnl: "1000", boughtTimestamp: "10/16/2026 12:00:00", soldTimestamp: "10/16/2026 12:05:00",
    })])),
  } };
  const review = await page.request.post("/api/imports/preview", { headers, multipart: input });
  expect(review.status()).toBe(200);
  const preview = await review.json();
  expect((await page.request.post("/api/imports/confirm", { headers, multipart: { ...input, token: preview.token, feeFingerprint: preview.feeReview.fingerprint } })).status()).toBe(200);
  const data = await (await page.request.get(`/api/prop-progress?accountId=${accountId}`)).json();
  expect(data.accounts[0].activity.count).toBe(1);
  expect(data.accounts[0].phases[0].portionCount).toBe(0);
  const body = { action: "start-correction", accountId, phaseId, expectedStart: data.accounts[0].phases[0].phase.startAt,
    startLocal: "2026-10-16T12:00:00", baseline: "50000", historyConfirmed: true, confirmRules: true };
  const other = await playwright.request.newContext({ baseURL: origin });
  try {
    expect((await other.post("/api/auth/sign-up/email", { headers, data: disposableUser() })).status()).toBe(200);
    expect((await other.post("/api/prop-progress", { headers, data: body })).status()).toBe(404);
  } finally { await other.dispose(); }
  await page.goto(`/prop-accounts/${accountId}`);
  await expect(page.getByRole("heading", { name: "Imported trades fall before this evaluation" })).toBeVisible();
  await page.getByText("Review phase dates", { exact: true }).click();
  await expect(page.locator(".prop-start-repair").getByRole("status")).toContainText("1 source records fit this start");
  const form = page.locator(".prop-start-repair");
  await expect(form.getByLabel(/I confirm imported history/)).not.toBeChecked();
  await form.getByLabel(/I confirm imported history/).check();
  await form.getByLabel(/I reviewed this preview/).check();
  await form.getByRole("button", { name: "Correct evaluation start", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Imported trades fall before this evaluation" })).toHaveCount(0);
  const after = await (await page.request.get(`/api/prop-progress?accountId=${accountId}`)).json();
  const phase = after.accounts[0].phases[0];
  expect(phase.portionCount).toBe(1);
  expect(phase.tracking.phaseProfit).toBe("990");
  expect(phase.tracking.balance).toBe("50990");
  expect(phase.periods).toHaveLength(2);
  expect(after.events.some((event: { kind: string }) => event.kind === "Evaluation start corrected")).toBe(true);
  expect((await page.request.post("/api/prop-progress", { headers, data: body })).status()).toBe(409);
  expect((await page.request.post("/api/prop-progress", { headers, data: { ...body, expectedStart: phase.phase.startAt, startLocal: "2026-10-17T12:00:00" } })).status()).toBe(400);
  expect((await page.request.post("/api/prop-progress", { headers, data: {
    action: "snapshot", accountId, phaseId, asOfLocal: "2026-10-22T12:00:00",
    balance: "50990", threshold: "48000", qualifyingDays: "", note: "Synthetic confirmed anchor",
  } })).status()).toBe(200);
  expect((await page.request.post("/api/prop-progress", { headers, data: {
    ...body, expectedStart: phase.phase.startAt, startLocal: "2026-10-15T12:00:00",
  } })).status()).toBe(400);
});
