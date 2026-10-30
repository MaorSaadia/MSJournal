import { test, expect } from "@playwright/test";
import { disposableUser, cleanupUsers } from "./fixture-users";
import { csv, performance } from "../tests/fixtures/tradovate";
const origin = process.env.MSJOURNAL_BROWSER_ORIGIN ?? "http://localhost:3000";
test.use({ baseURL: origin });
test.afterEach(() => cleanupUsers());
test("partial exits show individual net results without the manual fee form", async ({
  page,
}, info) => {
  test.skip(
    process.env.MSJOURNAL_TEST_DISPOSABLE !== "true",
    "Disposable fixtures only",
  );
  test.setTimeout(120000);
  page.setDefaultNavigationTimeout(60000);
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
  const created = await page.request.post("/api/trading-accounts", {
    headers,
    data: {
      displayName: "Partial exits fixture",
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
  const rows = ["21.5", "96", "81.5", "61", "120.5"].map((pnl, i) =>
    performance({
      buyFillId: "70001",
      sellFillId: String(70002 + i),
      qty: "1",
      buyPrice: "29695.5",
      sellPrice: ["29706.25", "29743.5", "29736.25", "29726", "29755.75"][i],
      pnl,
      boughtTimestamp: "10/20/2026 05:12:49",
      soldTimestamp: `10/20/2026 05:${String(15 + i * 5).padStart(2, "0")}:00`,
    }),
  );
  const input = {
    accountId: account.id,
    timezone: "UTC",
    confirmPerformance: "true",
    confirmOrders: "false",
    feeTotal: "5.20",
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
  const saved = await page.request.post("/api/imports/confirm", {
    headers,
    multipart: {
      ...input,
      token: preview.token,
      feeFingerprint: preview.feeReview.fingerprint,
    },
  });
  expect(saved.status(), await saved.text()).toBe(200);
  const journal = await (
    await page.request.get(
      `/api/journal?accounts=${account.id}&outcomeBasis=portions`,
    )
  ).json();
  expect(journal.rows).toHaveLength(1);
  expect(Number(journal.rows[0].net)).toBe(375.3);
  await page.goto(`/trade-view/${journal.rows[0].id}`, {
    waitUntil: "domcontentloaded",
  });
  const exits = page.locator(".trade-exits");
  await expect(exits).toBeVisible();
  await expect(exits.locator("li")).toHaveCount(5);
  await expect(exits).toContainText("5 contracts closed");
  await expect(exits.locator("li").first()).toContainText("+$20.46");
  await expect(exits.locator("li").last()).toContainText("+$119.46");
  await expect(
    page.getByText("Explicit fee adjustment", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".trade-exit-sources")).not.toHaveAttribute(
    "open",
    "",
  );
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (theme) =>
        document.documentElement.classList.toggle("dark", theme === "dark"),
      theme,
    );
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await exits.scrollIntoViewIfNeeded();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        )
        .toBe(true);
      await exits.screenshot({
        path: info.outputPath(`partial-exits-${theme}-${width}.png`),
      });
    }
  }
  await page.getByText("Source records & imports", { exact: true }).click();
  await expect(page.locator(".trade-exit-sources tbody tr")).toHaveCount(5);
});
