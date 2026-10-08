import { test, expect } from "@playwright/test";
import { disposableUser, cleanupUsers } from "./fixture-users";
import { csv, performance } from "../tests/fixtures/tradovate";
test.afterEach(() => cleanupUsers());
test("calendar partial exits, honest fees, URL navigation, isolation and responsive themes", async ({
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
  const values = {
    displayName: "Calendar synthetic account",
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
  };
  const created = await page.request.post("/api/trading-accounts", {
    headers: { Origin: origin },
    data: values,
  });
  expect(created.status()).toBe(201);
  const accountId = (await created.json()).account.id;
  const errors: string[] = [];
  let simulatingServiceFailure = false;
  page.on("pageerror", (e) => errors.push(e.name));
  page.on("console", (m) => {
    if (
      m.type() === "error" &&
      !(simulatingServiceFailure && m.text().includes("503"))
    )
      errors.push("console.error");
  });
  const rows = [
    performance({
      buyFillId: "entry-a",
      sellFillId: "exit-a",
      qty: "2",
      pnl: "40",
      boughtTimestamp: "09/30/2026 23:55:00",
      soldTimestamp: "09/30/2026 23:59:40",
    }),
    performance({
      buyFillId: "entry-a",
      sellFillId: "exit-b",
      qty: "1",
      pnl: "30",
      boughtTimestamp: "09/30/2026 23:55:00",
      soldTimestamp: "10/01/2026 00:02:00",
    }),
    performance({
      buyFillId: "zero-entry",
      sellFillId: "zero-exit",
      qty: "1",
      pnl: "0",
      boughtTimestamp: "10/02/2026 16:00:00",
      soldTimestamp: "10/02/2026 16:01:00",
    }),
    performance({
      buyFillId: "loss-entry",
      sellFillId: "loss-exit",
      qty: "1",
      pnl: "$(5)",
      boughtTimestamp: "10/03/2026 16:00:00",
      soldTimestamp: "10/03/2026 16:01:00",
    }),
  ];
  await page.goto("/imports");
  await page.getByLabel("Performance CSV", { exact: true }).setInputFiles({
    name: "synthetic-calendar.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv("performance", rows)),
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
  await page.goto("/calendar?month=2026-10");
  await expect(page.locator(".calendar-month-summary")).toContainText(
    "+$25.00",
  );
  await expect(page.locator(".calendar-month-summary")).toContainText(
    "1 / 1 / 1",
  );
  await expect(
    page.getByLabel("Calendar P&L basis").locator('option[value="net"]'),
  ).toHaveJSProperty("disabled", true);
  await page
    .locator('.calendar-grid-view button[aria-label^="Thursday, October 1,"]')
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Partial daily contribution",
  );
  await expect(page.getByRole("dialog")).toContainText("+$30.00");
  await expect(page.getByRole("dialog")).toContainText(
    "Closed quantity this day: 1",
  );
  await expect(page.getByRole("dialog")).toContainText("Unavailable");
  const drawerBox = await page.getByRole("dialog").boundingBox();
  expect(drawerBox!.y).toBeGreaterThanOrEqual(0);
  await page.getByRole("button", { name: "Previous day", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Wednesday, September 30",
  );
  await expect(page.getByRole("dialog")).toContainText("+$40.00");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Choose month and year").fill("2026-10");
  await expect(page.locator(".calendar-month-summary")).toContainText(
    "+$25.00",
  );
  await page.reload();
  await expect(page.locator(".calendar-month-summary")).toContainText(
    "+$25.00",
  );
  await page
    .locator('.calendar-grid-view button[aria-label^="Friday, October 2,"]')
    .click();
  await expect(page.getByRole("dialog")).toContainText("Matched portions");
  await expect(page.getByRole("dialog")).toContainText("$0.00");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .locator('.calendar-grid-view button[aria-label^="Sunday, October 4,"]')
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "No imported realized records",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    (
      await page.request.post("/api/journal/fees", {
        headers: { Origin: origin },
        data: {
          accountId,
          perSide: "0.5",
          contractOverrides: {},
          applyExisting: true,
        },
      })
    ).status(),
  ).toBe(200);
  await page
    .getByRole("button", { name: "Refresh calendar", exact: true })
    .click();
  await expect(
    page.getByLabel("Calendar P&L basis").locator('option[value="net"]'),
  ).toHaveJSProperty("disabled", false);
  await page.getByLabel("Calendar P&L basis").selectOption("net");
  await expect(page.locator(".calendar-month-summary")).toContainText(
    "Estimated net P&L",
  );
  await expect(page.locator(".calendar-month-summary")).toContainText(
    "+$22.00",
  );
  // Saved week preference and display zone change grouping without editing sources.
  expect(
    (
      await page.request.patch("/api/preferences", {
        headers: { Origin: origin },
        data: {
          displayName: actor.name,
          displayTimezone: "America/New_York",
          currency: "USD",
          weekStartsOn: 1,
        },
      })
    ).status(),
  ).toBe(200);
  await page.reload();
  await expect(page.locator(".calendar-timezone")).toContainText(
    "America/New_York",
  );
  await expect(page.locator(".calendar-week-head > span").first()).toHaveText(
    "Mon",
  );
  await expect(page.locator(".calendar-month-summary")).toContainText("−$7.00");
  expect(
    (
      await page.request.patch("/api/preferences", {
        headers: { Origin: origin },
        data: {
          displayName: actor.name,
          displayTimezone: "Asia/Jerusalem",
          currency: "USD",
          weekStartsOn: 0,
        },
      })
    ).status(),
  ).toBe(200);
  await page.reload();
  await expect(page.locator(".calendar-month-summary")).toContainText(
    "+$22.00",
  );
  await page.getByRole("button", { name: "Next month", exact: true }).click();
  await expect(page.locator(".calendar-empty-note")).toContainText(
    "No imported realized records",
  );
  await page.goBack();
  await expect(page.locator(".calendar-month-summary")).toContainText(
    "+$22.00",
  );
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page.getByLabel("Choose month and year")).toHaveValue(
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Jerusalem",
      year: "numeric",
      month: "2-digit",
    }).format(new Date()),
  );
  await page.setViewportSize({ width: 1920, height: 1080 });
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => localStorage.setItem("theme", value), theme);
    await page.reload();
    await expect(page.locator("html")).toHaveClass(new RegExp(theme));
    await expect(page.locator(".calendar-month-summary")).toContainText(
      "+$22.00",
    );
    await page.screenshot({
      path: `artifacts/day-five-calendar-${theme}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
  await page
    .locator('.calendar-grid-view button[aria-label^="Thursday, October 1,"]')
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Partial daily contribution",
  );
  await page.screenshot({
    path: "artifacts/day-five-calendar-drawer.png",
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => localStorage.setItem("theme", value), theme);
    await page.reload();
    await expect(page.locator(".calendar-agenda-view")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `artifacts/day-five-calendar-mobile-${theme}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
  await page
    .locator('.calendar-agenda-view button[aria-label^="Thursday, October 1,"]')
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Closed quantity this day: 1",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/day-five-calendar-mobile-drawer.png",
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await page.goto("/?calMonth=2026-10");
  await expect(page.locator(".calendar-month-summary")).toContainText(
    "+$25.00",
  );
  await page.goto("/calendar?mode=demo&month=2026-03");
  await expect(page.locator(".demo-indicator")).toContainText("Demo data");
  await expect(page.locator(".calendar-month-summary")).toContainText(
    "Trades closed",
  );
  await page.goto("/calendar?month=2026-10");
  await expect(page.locator(".calendar-month-summary")).toContainText(
    "+$25.00",
  );
  await page.locator(".calendar-account-filter summary").click();
  await page
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  await expect(page.locator(".calendar-empty-note")).toContainText(
    "Select an account",
  );
  await page
    .getByRole("checkbox", { name: "Calendar synthetic account", exact: true })
    .check();
  await expect(page.locator(".calendar-month-summary")).toContainText(
    "+$25.00",
  );
  await page.locator(".calendar-account-filter summary").click();
  expect(
    (
      await page.request.patch(`/api/trading-accounts/${accountId}`, {
        headers: { Origin: origin },
        data: { archived: true },
      })
    ).status(),
  ).toBe(200);
  await page.goto("/calendar?month=2026-10");
  await expect(page.locator(".calendar-empty-note")).toContainText(
    "Select an account",
  );
  await page
    .getByRole("checkbox", { name: "Include archived accounts", exact: true })
    .check();
  await expect(page.locator(".calendar-month-summary")).toContainText(
    "+$25.00",
  );
  expect(
    (
      await page.request.patch(`/api/trading-accounts/${accountId}`, {
        headers: { Origin: origin },
        data: { archived: false },
      })
    ).status(),
  ).toBe(200);
  simulatingServiceFailure = true;
  await page.route("**/api/calendar?**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        message: "Calendar service temporarily unavailable.",
      }),
    }),
  );
  await page
    .getByRole("button", { name: "Refresh calendar", exact: true })
    .click();
  await expect(page.locator(".calendar-request-error")).toContainText(
    "Calendar could not be loaded",
  );
  await expect(page.locator(".calendar-empty-note")).toHaveCount(0);
  await page.unroute("**/api/calendar?**");
  simulatingServiceFailure = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.locator(".calendar-month-summary")).toContainText(
    "+$25.00",
  );
  const other = await browser.newContext();
  try {
    expect(
      (
        await other.request.post(`${origin}/api/auth/sign-up/email`, {
          headers: { Origin: origin },
          data: disposableUser(),
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await other.request.get(
          `${origin}/api/calendar?month=2026-10&accounts=${accountId}`,
        )
      ).status(),
    ).toBe(404);
    expect(
      (
        await other.request.get(
          `${origin}/api/calendar?month=2026-10&accounts=${accountId}&day=2026-10-01`,
        )
      ).status(),
    ).toBe(404);
    const empty = await other.request.get(
      `${origin}/api/calendar?month=2026-10`,
    );
    expect((await empty.json()).summary.count).toBe(0);
  } finally {
    await other.close();
  }
  const anonymous = await browser.newContext();
  try {
    expect(
      (
        await anonymous.request.get(`${origin}/api/calendar?month=2026-10`)
      ).status(),
    ).toBe(401);
  } finally {
    await anonymous.close();
  }
  expect(errors).toEqual([]);
});
