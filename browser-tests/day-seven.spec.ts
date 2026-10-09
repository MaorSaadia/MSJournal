import { test, expect } from "@playwright/test";
import { disposableUser, cleanupUsers } from "./fixture-users";
import { csv, performance } from "../tests/fixtures/tradovate";
const origin = process.env.MSJOURNAL_BROWSER_ORIGIN ?? "http://127.0.0.1:3100";
test.use({ baseURL: origin });
test.afterEach(() => cleanupUsers());
test("private trade review, save failures and conflicts, calendar return, responsive themes and demo", async ({
  page,
  context,
  browser,
}) => {
  test.skip(
    process.env.MSJOURNAL_TEST_DISPOSABLE !== "true",
    "Disposable fixtures only",
  );
  test.setTimeout(240000);
  const actor = disposableUser();
  expect(
    (
      await page.request.post("/api/auth/sign-up/email", {
        headers: { Origin: origin },
        data: actor,
      })
    ).status(),
  ).toBe(200);
  const account = await page.request.post("/api/trading-accounts", {
    headers: { Origin: origin },
    data: {
      displayName: "Day seven synthetic",
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
  expect(account.status()).toBe(201);
  const accountId = (await account.json()).account.id;
  const multipart = {
    accountId,
    timezone: "Asia/Jerusalem",
    confirmPerformance: "true",
    confirmOrders: "false",
    performance: {
      name: "synthetic-day-seven.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        csv("performance", [
          performance({
            buyFillId: "day7-entry",
            sellFillId: "day7-exit",
            pnl: "-12",
            boughtTimestamp: "10/06/2026 14:00:00",
            soldTimestamp: "10/06/2026 14:01:00",
          }),
        ]),
      ),
    },
  };
  const preview = await page.request.post("/api/imports/preview", {
    headers: { Origin: origin },
    multipart,
  });
  expect(preview.status()).toBe(200);
  const token = (await preview.json()).token;
  expect(
    (
      await page.request.post("/api/imports/confirm", {
        headers: { Origin: origin },
        multipart: { ...multipart, token },
      })
    ).status(),
  ).toBe(200);
  const rows = await page.request.get(`/api/journal?accounts=${accountId}`);
  expect(rows.status()).toBe(200);
  const id = (await rows.json()).rows[0].id;
  const href = `/trade-view/${id}?accounts=${accountId}&tab=review&from=${encodeURIComponent(`/trade-view?accounts=${accountId}&page=1`)}`;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(href);
  await expect(
    page.getByRole("tab", { name: "Review", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  expect(
    (await (await page.request.get(`/api/reviews?recordId=${id}`)).json()).id,
  ).toBeNull();
  const lesson = page.getByLabel("Lesson for next time", { exact: true });
  await lesson.fill("Wait patiently.\n\nAccept the planned risk.");
  await page.getByRole("button", { name: "Save now", exact: true }).click();
  await expect(page.locator(".review-save-actions [role=status]")).toHaveText(
    "Saved",
  );
  await page.reload();
  await expect(lesson).toHaveValue(
    "Wait patiently.\n\nAccept the planned risk.",
  );
  await page
    .getByLabel("Plan adherence", { exact: true })
    .selectOption("followed");
  await page
    .locator("fieldset")
    .first()
    .getByRole("button", { name: "Calm", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Mark reviewed", exact: true })
    .click();
  await expect(page.locator(".review-status")).toHaveText("reviewed");
  await expect(page.locator(".review-save-actions [role=status]")).toHaveText(
    "Saved",
  );
  await page.getByText("Manage my mistake tags", { exact: true }).click();
  await page
    .getByLabel("Custom mistake tag name")
    .fill("Wait for confirmation");
  await page.getByRole("button", { name: "Create tag" }).click();
  await page
    .getByRole("button", { name: "Wait for confirmation", exact: true })
    .click();
  await page.getByRole("button", { name: "Save now", exact: true }).click();
  await expect(page.locator(".review-save-actions [role=status]")).toHaveText(
    "Saved",
  );
  await page.route("**/api/reviews", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ message: "Temporary save failure" }),
        })
      : route.continue(),
  );
  await lesson.fill("Keep this unsaved reflection");
  await page.getByRole("button", { name: "Save now", exact: true }).click();
  await expect(page.locator(".review-error")).toContainText(
    "Temporary save failure",
  );
  await expect(lesson).toHaveValue("Keep this unsaved reflection");
  await page.unroute("**/api/reviews");
  await page.getByRole("button", { name: "Retry save" }).click();
  await expect(page.locator(".review-save-actions [role=status]")).toHaveText(
    "Saved",
  );
  const second = await context.newPage();
  await second.goto(href);
  await second
    .getByLabel("Lesson for next time", { exact: true })
    .fill("Saved by another tab");
  await second.getByRole("button", { name: "Save now", exact: true }).click();
  await expect(second.locator(".review-save-actions [role=status]")).toHaveText(
    "Saved",
  );
  await lesson.fill("My newest reflection");
  await page.getByRole("button", { name: "Save now", exact: true }).click();
  await expect(page.locator(".review-error")).toContainText("changed");
  await expect(lesson).toHaveValue("My newest reflection");
  await page.getByRole("button", { name: "Compare saved version" }).click();
  await expect(page.locator(".review-conflict")).toContainText(
    "Saved by another tab",
  );
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Save my version instead" }).click();
  await expect(page.locator(".review-save-actions [role=status]")).toHaveText(
    "Saved",
  );
  await second.close();
  await page.getByRole("tab", { name: "Screenshots", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Private screenshot storage needs setup",
    }),
  ).toBeVisible();
  for (const width of [1440, 390])
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate((v) => localStorage.setItem("theme", v), theme);
      await page.reload();
      await page.getByRole("tab", { name: "Review", exact: true }).click();
      await expect(lesson).toHaveValue("My newest reflection");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `artifacts/day-seven-${width}-${theme}.png`,
        fullPage: true,
      });
    }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(
    `/trade-view?accounts=${accountId}&review=reviewed&emotion=Calm&emotionStage=before&adherence=followed`,
  );
  await expect(page.locator(".tv-table tbody tr")).toHaveCount(1);
  await expect(
    page.locator(".tv-table").getByLabel("Has trade notes"),
  ).toBeVisible();
  await page.goto(`/calendar?month=2026-10&accounts=${accountId}`);
  await expect(page.locator(".calendar-review-dot:visible")).toBeVisible();
  await page
    .locator(".calendar-day:visible[aria-label^='Tuesday, October 6']")
    .click();
  await page.getByRole("link", { name: "Review →", exact: true }).click();
  await expect(lesson).toHaveValue("My newest reflection");
  await page
    .getByRole("link", { name: "Back to Calendar", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(page.url()).toContain("day=2026-10-06");
  const stranger = await browser.newContext({ baseURL: origin });
  const other = disposableUser();
  expect(
    (
      await stranger.request.post("/api/auth/sign-up/email", {
        headers: { Origin: origin },
        data: other,
      })
    ).status(),
  ).toBe(200);
  expect(
    (await stranger.request.get(`/api/reviews?recordId=${id}`)).status(),
  ).toBe(404);
  expect(
    await (await stranger.request.get("/api/reviews/tags")).json(),
  ).toEqual({ tags: [] });
  await stranger.close();
  await page.goto("/trade-view?mode=demo&review=reviewed&size=10");
  await expect(page.locator(".tv-table tbody tr")).toHaveCount(3);
  await page.locator(".tv-table a").first().click();
  await page.getByRole("tab", { name: "Review", exact: true }).click();
  await expect(page.locator(".review-save-bar")).toContainText("read-only");
  await expect(
    page.getByLabel("Entry rationale", { exact: true }),
  ).toBeDisabled();
  expect(errors).toEqual([]);
});
