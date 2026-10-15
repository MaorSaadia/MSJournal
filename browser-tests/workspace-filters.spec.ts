import { test, expect } from "@playwright/test";
import { disposableUser, cleanupUsers } from "./fixture-users";
import { csv, performance } from "../tests/fixtures/tradovate";

const origin = process.env.MSJOURNAL_BROWSER_ORIGIN ?? "http://127.0.0.1:3100";
test.use({ baseURL: origin });
test.afterEach(() => cleanupUsers());

test("selected accounts and net P&L follow private navigation", async ({
  page,
}) => {
  test.skip(
    process.env.MSJOURNAL_TEST_DISPOSABLE !== "true",
    "Disposable fixtures only",
  );
  test.setTimeout(90000);
  page.setDefaultTimeout(15000);
  const headers = { Origin: origin };
  expect(
    (
      await page.request.post("/api/auth/sign-up/email", {
        headers,
        data: disposableUser(),
      })
    ).status(),
  ).toBe(200);
  const ids: string[] = [];
  for (const displayName of ["Scope Alpha", "Scope Beta"]) {
    const response = await page.request.post("/api/trading-accounts", {
      headers,
      data: {
        displayName,
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
        reportingTimezone: "UTC",
        notes: "",
      },
    });
    expect(response.status()).toBe(201);
    ids.push((await response.json()).account.id);
  }
  const upload = {
    accountId: ids[0],
    timezone: "UTC",
    confirmPerformance: "true",
    confirmOrders: "false",
    feeTotal: "12.48",
    replaceFees: "false",
    performance: {
      name: "synthetic-scope.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        csv("performance", [
          performance({
            pnl: "100",
            boughtTimestamp: "10/06/2026 12:00:00",
            soldTimestamp: "10/06/2026 12:05:00",
          }),
        ]),
      ),
    },
  };
  const preview = await page.request.post("/api/imports/preview", {
    headers,
    multipart: upload,
  });
  expect(preview.status()).toBe(200);
  const quote = await preview.json();
  expect(
    (
      await page.request.post("/api/imports/confirm", {
        headers,
        multipart: {
          ...upload,
          token: quote.token,
          feeFingerprint: quote.feeReview.fingerprint,
        },
      })
    ).status(),
  ).toBe(200);
  const unknownFees = {
    accountId: ids[1],
    timezone: upload.timezone,
    confirmPerformance: upload.confirmPerformance,
    confirmOrders: upload.confirmOrders,
    performance: upload.performance,
  };
  const unknownPreview = await page.request.post("/api/imports/preview", {
    headers,
    multipart: unknownFees,
  });
  expect(unknownPreview.status()).toBe(200);
  const unknownQuote = await unknownPreview.json();
  expect(
    (
      await page.request.post("/api/imports/confirm", {
        headers,
        multipart: { ...unknownFees, token: unknownQuote.token },
      })
    ).status(),
  ).toBe(200);
  await page.goto("/?start=2026-10-01&end=2026-10-15");
  await page.getByRole("button", { name: "All accounts", exact: true }).click();
  await page.getByLabel("Scope Beta").uncheck();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("accounts"))
    .toBe(ids[0]);
  await page.keyboard.press("Escape");
  const nav = page.locator(".desktop-sidebar").getByRole("navigation");
  await nav.getByRole("link", { name: "Trade View", exact: true }).click();
  await expect(page.locator(".tv-summary")).toContainText("+$87.52");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("accounts"))
    .toBe(ids[0]);
  await expect(
    page.getByRole("combobox", { name: "P&L basis", exact: true }),
  ).toHaveValue("net");
  const accountMenu = page
    .locator(".tv-menu")
    .filter({ has: page.locator("summary", { hasText: /^Accounts/ }) });
  await accountMenu.locator("summary").click();
  await page.getByLabel("Scope Beta").check();
  await expect(page.locator(".tv-summary")).toContainText("Partial net P&L");
  await expect(page.locator(".tv-summary")).toContainText("+$87.52");
  await expect(page.locator(".tv-summary")).toContainText(
    "Gross P&L · remaining 1 record",
  );
  await expect(page.locator(".tv-summary")).toContainText("+$100.00");
  await expect(page.locator(".tv-summary")).not.toContainText("Unavailable");
  await page.getByLabel("Scope Alpha").uncheck();
  await expect(page.locator(".tv-summary")).toContainText(
    "Before fees · fees not recorded",
  );
  await expect(page.locator(".tv-summary")).not.toContainText("Unavailable");
  await page.getByLabel("Scope Alpha").check();
  await page.getByLabel("Scope Beta").uncheck();
  await expect(page.locator(".tv-summary")).not.toContainText(
    "Partial net P&L",
  );
  await accountMenu.locator("summary").click();
  await nav.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("accounts"))
    .toBe(ids[0]);
  await nav.getByRole("link", { name: "Trade View", exact: true }).click();
  await page
    .locator(".tv-menu")
    .filter({ has: page.locator("summary", { hasText: /^Accounts/ }) })
    .locator("summary")
    .click();
  await page.getByLabel("Scope Alpha").uncheck();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("accounts"))
    .toBe("");
  await nav.getByRole("link", { name: "Calendar", exact: true }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("accounts"))
    .toBe("");
  await nav.getByRole("link", { name: "Reports", exact: true }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("accounts"))
    .toBe("");
  await page.reload();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("accounts"))
    .toBe("");
});
