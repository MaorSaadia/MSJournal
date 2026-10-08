import { test, expect } from "@playwright/test";
import { disposableUser, cleanupUsers } from "./fixture-users";
import { csv, performance } from "../tests/fixtures/tradovate";
test.afterEach(() => cleanupUsers());
test("private Performance-only journal, real dashboard, fee lifecycle, isolation and responsive themes", async ({
  page,
  browser,
}) => {
  test.skip(
    process.env.MSJOURNAL_TEST_DISPOSABLE !== "true" ||
      process.env.AUTH_REQUIRE_EMAIL_VERIFICATION === "true",
    "Disposable local fixtures only.",
  );
  test.setTimeout(180000);
  const origin = "http://127.0.0.1:3100",
    actor = disposableUser();
  expect(
    (
      await page.request.post("/api/auth/sign-up/email", {
        headers: { Origin: origin },
        data: actor,
      })
    ).status(),
  ).toBe(200);
  const created = await page.request.post("/api/trading-accounts", {
    headers: { Origin: origin },
    data: {
      displayName: "Day 4 synthetic account",
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
      reportingTimezone: "Asia/Jerusalem",
      notes: "",
    },
  });
  expect(created.status()).toBe(201);
  const accountId = (await created.json()).account.id;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.name));
  page.on("console", message=>{if(message.type()==="error")errors.push("console.error");});
  const source = [
    performance({
      buyFillId: "entry-a",
      sellFillId: "exit-a",
      qty: "1",
      buyPrice: "20000",
      sellPrice: "20001",
      pnl: "2",
      boughtTimestamp: "09/02/2026 16:00:00",
      soldTimestamp: "09/02/2026 16:01:00",
    }),
    performance({
      buyFillId: "entry-a",
      sellFillId: "exit-b",
      qty: "1",
      buyPrice: "20000",
      sellPrice: "20002",
      pnl: "4",
      boughtTimestamp: "09/02/2026 16:00:00",
      soldTimestamp: "09/02/2026 16:02:00",
    }),
    performance({
      buyFillId: "entry-short",
      sellFillId: "exit-short",
      qty: "1",
      buyPrice: "20002",
      sellPrice: "20001",
      pnl: "$(2)",
      boughtTimestamp: "09/02/2026 16:03:00",
      soldTimestamp: "09/02/2026 16:01:00",
    }),
  ];
  await page.goto("/imports");
  await page.getByLabel("Performance CSV", { exact: true }).setInputFiles({
    name: "synthetic-performance.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv("performance", source)),
  });
  await page
    .getByRole("checkbox", { name: /I confirm this Performance report/ })
    .check();
  await page
    .getByRole("button", { name: "Review import", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm import", exact: true })
    .click();
  await page.waitForURL(/\/imports\/[0-9a-f-]+\?/);
  await page
    .getByRole("link", { name: "Open Trade View", exact: true })
    .click();
  await expect(page.locator(".journal-table tbody tr")).toHaveCount(2);
  await expect(page.locator(".journal-totals")).toContainText("+$4.00");
  await expect(page.locator(".journal-totals")).toContainText(
    "fees known for 0/3",
  );
  await page.reload();
  await expect(page.locator(".journal-table tbody tr")).toHaveCount(2);
  await page
    .locator(".journal-table tbody tr")
    .filter({ hasText: "Long" })
    .getByRole("link", { name: "Inspect" })
    .click();
  await page.waitForURL(/\/trade-view\/[0-9a-f-]+$/);
  const detailPath = new URL(page.url()).pathname;
  const recordId = detailPath.split("/").at(-1)!;
  await expect(
    page.getByRole("heading", { name: "Contributing source portions" }),
  ).toBeVisible();
  await expect(page.locator(".journal-table tbody tr")).toHaveCount(2);
  await page.getByLabel("Manual total fees", { exact: true }).fill("0");
  await page
    .getByRole("button", { name: "Save manual fees", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Manual total saved");
  await page.reload();
  await expect(page.locator(".journal-summary")).toContainText("Fees · Manual");
  await page.goto(`/prop-accounts/${accountId}/fees`);
  await page
    .getByLabel("Estimated all-in fee per contract, per side (USD)")
    .fill("0.5");
  await page
    .getByRole("checkbox", {
      name: /Apply these settings to existing portions/,
    })
    .check();
  await page
    .getByRole("button", { name: "Save fee settings", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Manual overrides were preserved",
  );
  await page.goto("/");
  await expect(page.locator(".metric-grid").first()).toContainText("+$4.00");
  await expect(page.locator(".real-empty-banner")).toContainText(
    "Estimated net P&L: +$3.00",
  );
  await expect(page.locator(".metric-grid")).toContainText(
    "Complete-trade coverage unverified",
  );
  await expect(
    page.getByRole("heading", { name: "Cumulative realized gross P&L" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1920, height: 1080 });
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => localStorage.setItem("theme", value), theme);
    await page.reload();
    await expect(page.locator("html")).toHaveClass(new RegExp(theme));
    await expect(page.locator(".chart-daily")).toHaveAttribute(
      "data-entrance",
      "complete",
    );
    await page.screenshot({
      path: `artifacts/day-four-dashboard-${theme}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
  await page.goto("/trade-view");
  await page.locator(".journal-processing summary").click();
  await page
    .getByRole("button", { name: "Process / retry", exact: true })
    .click();
  await expect(
    page.locator(".journal-action").getByRole("status"),
  ).toContainText("Processed 3 portions into 2 journal records");
  await expect(page.locator(".journal-table tbody tr")).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/prop-accounts/${accountId}/fees`);
  await expect(
    page.getByRole("button", { name: "Save fee settings", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/day-four-fees-mobile.png",
    fullPage: true,
  });
  await page.goto(detailPath);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/day-four-record-mobile.png",
    fullPage: true,
  });
  await page.goto("/?mode=demo");
  await expect(page.locator(".demo-indicator")).toContainText("Demo data");
  const other = await browser.newContext();
  try {
    const person = disposableUser();
    expect(
      (
        await other.request.post(`${origin}/api/auth/sign-up/email`, {
          headers: { Origin: origin },
          data: person,
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await other.request.post(`${origin}/api/journal/process`, {
          headers: { Origin: origin },
          data: { accountId },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await other.request.patch(`${origin}/api/journal/fees`, {
          headers: { Origin: origin },
          data: { recordId, total: "0", userId: actor.email },
        })
      ).status(),
    ).toBe(404);
    const privatePage = await other.newPage();
    expect((await privatePage.goto(`${origin}${detailPath}`))?.status()).toBe(
      404,
    );
  } finally {
    await other.close();
  }
  const anonymous = await browser.newContext();
  try {
    expect(
      (
        await anonymous.request.post(`${origin}/api/journal/process`, {
          headers: { Origin: origin },
          data: { accountId },
        })
      ).status(),
    ).toBe(401);
  } finally {
    await anonymous.close();
  }
  expect(errors).toEqual([]);
});
