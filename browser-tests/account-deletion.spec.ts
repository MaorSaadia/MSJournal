import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { disposableUser, cleanupUsers } from "./fixture-users";
import { csv, performance } from "../tests/fixtures/tradovate";
import { customTrackingRules } from "../lib/props/tracking-rules";
import { toLegacyRules } from "../lib/props/presets";
import { emptyFields } from "../lib/reviews/model";
const origin = process.env.MSJOURNAL_BROWSER_ORIGIN ?? "http://localhost:3000";
test.use({ baseURL: origin });
test.afterEach(() => cleanupUsers());
test("only confirmed owned archived accounts can be deleted, with their full dependent history", async ({ page, playwright }, info) => {
  test.skip(process.env.MSJOURNAL_TEST_DISPOSABLE !== "true", "Disposable fixtures only");
  test.setTimeout(240000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const headers = { Origin: origin };
  expect((await page.request.post("/api/auth/sign-up/email", { headers, data: disposableUser() })).status()).toBe(200);
  async function create(name: string) {
    const result = await page.request.post("/api/trading-accounts", { headers, data: {
      displayName: name, firmChoice: "Apex Trader Funding", customFirm: "", platform: "Tradovate", brokerIdentifier: "",
      stage: "Evaluation", status: "Active", nominalSize: "50000", openingBalance: "", openingBalanceDate: "", currency: "USD", reportingTimezone: "UTC", notes: "",
    } });
    expect(result.status()).toBe(201); return (await result.json()).account.id as string;
  }
  const id = await create("Delete fixture"), keep = await create("Keep fixture");
  async function importRecord(accountId: string) {
    const input = { accountId, timezone: "UTC", confirmPerformance: "true", confirmOrders: "false", feeTotal: "10", performance: {
      name: "synthetic-deletion.csv", mimeType: "text/csv", buffer: Buffer.from(csv("performance", [performance({ pnl: "1000", boughtTimestamp: "10/02/2026 12:00:00", soldTimestamp: "10/02/2026 12:05:00" })])),
    } };
    const result = await page.request.post("/api/imports/preview", { headers, multipart: input });
    expect(result.status()).toBe(200); const preview = await result.json();
    expect((await page.request.post("/api/imports/confirm", { headers, multipart: { ...input, token: preview.token, feeFingerprint: preview.feeReview.fingerprint } })).status()).toBe(200);
  }
  await importRecord(id); await importRecord(keep);
  const record = (await (await page.request.get(`/api/journal?accounts=${id}`)).json()).rows[0].id;
  const review = await page.request.post("/api/reviews", { headers, data: { recordId: record, revision: 0, status: "draft", fields: { ...emptyFields(), lesson: "Synthetic account writing" } } });
  expect(review.status()).toBe(200);
  const r = customTrackingRules(); r.stage = "Evaluation"; r.ledgerStart = "50000"; r.session.confirmed = true;
  r.drawdown.mode = "Static"; r.drawdown.initialThreshold = "48000"; r.drawdown.highWater = "50000";
  const first = await page.request.post("/api/prop-progress", { headers, data: {
    action: "phase", accountId: id, previousId: null, kind: "Evaluation", label: "Evaluation fixture", startLocal: "2026-10-01T00:00:00",
    baseline: "50000", historyConfirmed: true, note: "", initialRules: toLegacyRules(r),
  } });
  expect(first.status()).toBe(200); const previousId = (await first.json()).phaseId;
  r.stage = "Sim Funded";
  const second = await page.request.post("/api/prop-progress", { headers, data: {
    action: "phase", accountId: id, previousId, kind: "Funded", label: "Funded fixture", startLocal: "2026-10-10T00:00:00",
    baseline: "50000", historyConfirmed: true, note: "", initialRules: toLegacyRules(r),
  } });
  expect(second.status()).toBe(200); const phaseId = (await second.json()).phaseId;
  expect((await page.request.post("/api/prop-progress", { headers, data: {
    action: "snapshot", accountId: id, phaseId, asOfLocal: "2026-10-11T00:00:00", balance: "50000", threshold: "48000", qualifyingDays: "0", note: "",
  } })).status()).toBe(200);
  expect((await page.request.post("/api/prop-progress/payouts", { headers, data: {
    accountId: id, phaseId, id: randomUUID(), revision: 0, fields: {
      status: "Approved", requestedAmount: "100", requestedAt: "2026-10-11T12:00:00.000Z", approvedAmount: "100", approvedAt: "2026-10-12T12:00:00.000Z",
      deductionAmount: "100", deductedAt: "2026-10-12T13:00:00.000Z", receiptAmount: null, paidAt: null, note: "Synthetic payout",
    },
  } })).status()).toBe(200);
  expect((await page.request.get(`/api/trading-accounts/${id}/deletion`)).status()).toBe(409);
  expect((await page.request.patch(`/api/trading-accounts/${id}`, { headers, data: { archived: true } })).status()).toBe(200);
  const plan = await (await page.request.get(`/api/trading-accounts/${id}/deletion`)).json();
  expect(plan.counts).toMatchObject({ imports: 1, sourceRecords: 1, reviews: 1, phases: 2, payouts: 1 });
  const input = { accountName: plan.accountName, fingerprint: plan.fingerprint, filesVersion: plan.filesVersion, confirmed: true };
  const other = await playwright.request.newContext({ baseURL: origin });
  try {
    expect((await other.post("/api/auth/sign-up/email", { headers, data: disposableUser() })).status()).toBe(200);
    expect((await other.get(`/api/trading-accounts/${id}/deletion`)).status()).toBe(404);
    expect((await other.delete(`/api/trading-accounts/${id}`, { headers, data: input })).status()).toBe(404);
  } finally { await other.dispose(); }
  expect((await page.request.delete(`/api/trading-accounts/${id}`, { headers, data: { ...input, accountName: "Wrong name" } })).status()).toBe(409);
  expect((await page.request.patch(`/api/trading-accounts/${id}`, { headers, data: { archived: false } })).status()).toBe(200);
  expect((await page.request.delete(`/api/trading-accounts/${id}`, { headers, data: input })).status()).toBe(409);
  expect((await page.request.patch(`/api/trading-accounts/${id}`, { headers, data: { archived: true } })).status()).toBe(200);
  expect((await page.request.delete(`/api/trading-accounts/${id}`, { headers, data: input })).status()).toBe(409);
  await page.goto("/prop-accounts?archived=1");
  const card = page.locator(".prop-progress-card").filter({ has: page.getByRole("heading", { name: "Delete fixture", exact: true }) });
  await expect(card.getByText("Archived", { exact: true })).toBeVisible();
  await card.getByLabel("Actions for Delete fixture").click();
  await card.getByRole("button", { name: "Delete permanently", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await expect(dialog.locator(".account-delete-summary")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Delete permanently", exact: true })).toBeDisabled();
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => { localStorage.setItem("theme", value); document.documentElement.classList.remove("light", "dark"); document.documentElement.classList.add(value); }, theme);
    await page.setViewportSize({ width: theme === "dark" ? 390 : 1440, height: 900 });
    await expect(async () => expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(theme === "dark" ? 390 : 1440)).toPass();
    await expect(dialog).toHaveCSS("background-color", theme === "dark" ? "rgb(21, 27, 35)" : "rgb(255, 255, 255)");
    await page.screenshot({ path: info.outputPath(`delete-${theme}.png`) });
  }
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await page.request.get(`/api/trading-accounts/${id}`)).status()).toBe(200);
  await card.getByRole("button", { name: "Delete permanently", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Account name to confirm deletion").fill("Delete fixture");
  await dialog.getByRole("button", { name: "Delete permanently", exact: true }).click();
  await expect(page.getByText("Delete fixture permanently deleted.", { exact: true })).toBeVisible();
  expect((await page.request.get(`/api/trading-accounts/${id}`)).status()).toBe(404);
  expect((await page.request.get(`/api/trading-accounts/${keep}`)).status()).toBe(200);
  const remaining = await (await page.request.get(`/api/journal?accounts=${keep}`)).json();
  expect(remaining.rows).toHaveLength(1);
  expect((await (await page.request.get(`/api/reviews?recordId=${record}`)).json()).id).toBeUndefined();
});
