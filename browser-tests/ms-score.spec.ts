import { test, expect } from "@playwright/test";
import { disposableUser, cleanupUsers } from "./fixture-users";
import { csv, performance } from "../tests/fixtures/tradovate";
const origin = process.env.MSJOURNAL_BROWSER_ORIGIN ?? "http://localhost:3000";
test.use({ baseURL: origin });
test.afterEach(() => cleanupUsers());
test("MS Score follows account scope and trade wording stays clear", async ({
  page,
}, info) => {
  test.skip(
    process.env.MSJOURNAL_TEST_DISPOSABLE !== "true",
    "Disposable fixtures only",
  );
  test.setTimeout(180000);
  page.setDefaultNavigationTimeout(60000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const headers = { Origin: origin };
  expect(
    (
      await page.request.post("/api/auth/sign-up/email", {
        headers,
        data: disposableUser(),
      })
    ).status(),
  ).toBe(200);
  async function create(name: string, losing = false) {
    const created = await page.request.post("/api/trading-accounts", {
      headers,
      data: {
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
      },
    });
    expect(created.status()).toBe(201);
    const account = (await created.json()).account;
    const rows = Array.from({ length: losing ? 1 : 6 }, (_, i) =>
      performance({
        buyFillId: String(9000 + i * 2),
        sellFillId: String(9001 + i * 2),
        qty: "1",
        pnl: losing ? "-50" : i % 2 === 0 ? "120" : "-40",
        boughtTimestamp: `10/0${2 + Math.floor(i / 2)}/2026 12:00:00`,
        soldTimestamp: `10/0${2 + Math.floor(i / 2)}/2026 12:${i % 2 === 0 ? "05" : "10"}:00`,
      }),
    );
    const input = {
      accountId: account.id,
      timezone: "UTC",
      confirmPerformance: "true",
      confirmOrders: "false",
      ...(losing ? {} : { feeTotal: "0" }),
      performance: {
        name: "Performance.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(csv("performance", rows)),
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
            ...(preview.feeReview
              ? { feeFingerprint: preview.feeReview.fingerprint }
              : {}),
          },
        })
      ).status(),
    ).toBe(200);
    return account;
  }
  const a = await create("Score account A"),
    b = await create("Score account B", true);
  const query = (id: string) =>
    `accounts=${id}&start=2026-10-01&end=2026-10-10&outcomeBasis=portions&basis=net`;
  await page.goto(`/?${query(a.id)}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".ms-score-footer strong")).toContainText("91.67", {
    timeout: 30000,
  });
  await expect(
    page.locator(".metric-label").filter({ hasText: "Trade Win" }),
  ).toBeVisible();
  await expect(page.locator(".dashboard-coverage")).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText(/\bportions?\b/i);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (value) =>
        document.documentElement.classList.toggle("dark", value === "dark"),
      theme,
    );
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.locator(".ms-score").scrollIntoViewIfNeeded();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        )
        .toBe(true);
      await page.screenshot({
        path: info.outputPath(`ms-score-${theme}-${width}.png`),
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(
    (query) => window.history.pushState(null, "", `/?${query}`),
    query(b.id),
  );
  await expect(page.locator(".ms-score-footer strong")).toContainText("0.00");
  await expect(page.locator(".ms-score-context")).toContainText(
    "gross P&L / fees incomplete",
  );
  await expect(page.locator("main")).not.toContainText(
    /gross fallback|verified complete trades|\bportions?\b/i,
  );
  await page.goto(`/trade-view?${query(a.id)}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator(".tv-summary")).toContainText("+$240.00", {
    timeout: 30000,
  });
  await expect(page.locator("main")).not.toContainText(/\bportions?\b/i);
  await page
    .locator(".tv-table tbody tr")
    .first()
    .getByRole("link", { name: /Open/ })
    .click();
  await expect(
    page.getByRole("heading", { name: /Trade record/ }),
  ).toBeVisible();
  await expect(page.locator("main")).not.toContainText(/\bportions?\b/i);
  await page.goto(
    `/reports?${query(a.id).replace("outcomeBasis=portions", "analysis=portions")}`,
    { waitUntil: "domcontentloaded" },
  );
  await expect(page.locator(".report-metrics")).toBeVisible({ timeout: 30000 });
  await expect(page.locator("main")).not.toContainText(/\bportions?\b/i);
});
