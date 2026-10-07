import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { disposableUser, cleanupUsers, fillPassword } from "./fixture-users";
import { csv, order, performance } from "../tests/fixtures/tradovate";
test.afterEach(async () => {
  await cleanupUsers();
});
test("Performance-first upload, immediate type errors, searchable source zones and separate journal presentation", async ({
  page,
}) => {
  test.skip(
    process.env.MSJOURNAL_TEST_DISPOSABLE !== "true" ||
      process.env.AUTH_REQUIRE_EMAIL_VERIFICATION === "true",
    "Disposable local users only.",
  );
  test.setTimeout(120000);
  const actor = disposableUser();
  const origin = "http://127.0.0.1:3100";
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
      displayName: "Performance-only fixture",
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
  await page.goto("/imports");
  await expect(page.locator(".import-advanced")).not.toHaveAttribute("open");
  await page.getByLabel("Performance CSV", { exact: true }).setInputFiles({
    name: "Performance.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv("orders", [order()])),
  });
  await expect(page.locator(".import-drop").getByRole("alert")).toHaveText(
    "This is a Tradovate Orders report. Select your Performance CSV, or use Advanced Orders import.",
  );
  await expect(
    page.getByRole("button", { name: "Review import", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("No valid date range", { exact: true }),
  ).toHaveCount(0);
  const file = {
    name: "arbitrary-name.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv("performance", [performance()])),
  };
  await page.getByLabel("Performance CSV", { exact: true }).setInputFiles(file);
  await page
    .getByRole("checkbox", { name: /I confirm this Performance report/ })
    .check();
  await expect(
    page.getByRole("checkbox", { name: /Orders source account/ }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Review import", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Confirm import", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", {
      name: "CSV source timezone: Asia/Jerusalem",
      exact: true,
    })
    .click();
  for (const id of [
    "America/New_York",
    "America/Chicago",
    "America/Los_Angeles",
    "Europe/London",
    "Europe/Berlin",
    "UTC",
    "Asia/Dubai",
    "Asia/Kolkata",
    "Asia/Tokyo",
    "Australia/Sydney",
  ])
    await expect(
      page.locator(".timezone-options").getByText(id, { exact: true }),
    ).toBeAttached();
  await page
    .getByRole("textbox", { name: "Search timezones" })
    .fill("New York");
  await page
    .locator(".timezone-options")
    .getByRole("button", { name: /New York/ })
    .click();
  await expect(
    page.getByRole("button", { name: "Confirm import", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Review import", exact: true })
    .click();
  await expect(page.locator(".import-table tbody tr")).toContainText(
    "23:52:15",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Choose appearance" }).first().click();
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: "artifacts/day-three-performance-light.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Choose appearance" }).first().click();
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: "artifacts/day-three-performance-dark.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: "artifacts/day-three-performance-mobile.png",
    fullPage: true,
  });
  // Journal preference is excluded from the confirmation identity, even if changed after preview.
  expect(
    (
      await page.request.patch("/api/preferences", {
        headers: { Origin: origin },
        data: {
          displayName: actor.name,
          displayTimezone: "UTC",
          currency: "USD",
        },
      })
    ).status(),
  ).toBe(200);
  await page
    .getByRole("button", { name: "Confirm import", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Imported performance records." }),
  ).toBeVisible();
  await expect(page.locator(".import-table tbody tr")).toContainText(
    "Sold: 2 Sept 2026, 20:52:15",
  );
  await page.goto("/imports");
  await expect(
    page.getByRole("button", {
      name: "CSV source timezone: America/New_York",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel("Performance CSV", { exact: true }).setInputFiles(file);
  await page
    .getByRole("checkbox", { name: /I confirm this Performance report/ })
    .check();
  await page
    .getByRole("button", { name: "Review import", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Confirm.*Already imported/ }),
  ).toBeEnabled();
  await page
    .getByRole("button", {
      name: "CSV source timezone: America/New_York",
      exact: true,
    })
    .click();
  await page.getByRole("textbox", { name: "Search timezones" }).fill("Israel");
  await page
    .locator(".timezone-options")
    .getByRole("button", { name: /Israel/ })
    .click();
  await page
    .getByRole("button", { name: "Review import", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Confirm import", exact: true }),
  ).toBeDisabled();
  await expect(
    page
      .getByText(
        /Changing its source timezone requires an explicit correction workflow/,
      )
      .first(),
  ).toBeVisible();
  await page.goto("/settings");
  await expect(
    page.getByRole("button", {
      name: "Journal display timezone: UTC",
      exact: true,
    }),
  ).toBeVisible();
});
test("import routes and mutations deny unauthenticated access", async ({
  page,
  request,
}) => {
  for (const path of [
    "/imports",
    "/imports/history",
    `/imports/${randomUUID()}`,
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
  for (const action of ["preview", "confirm"])
    expect(
      (
        await request.post(`/api/imports/${action}`, {
          headers: { Origin: "http://127.0.0.1:3100" },
        })
      ).status(),
    ).toBe(401);
});
test("private CSV preview, explicit mappings, persistence, overlaps, history, themes and mobile", async ({
  page,
  browser,
}) => {
  test.skip(
    process.env.MSJOURNAL_TEST_DISPOSABLE !== "true" ||
      process.env.AUTH_REQUIRE_EMAIL_VERIFICATION === "true",
    "Use disposable development fixtures with local verification disabled.",
  );
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const user = disposableUser();
  await page.goto("/signup");
  await page.getByLabel("Name", { exact: true }).fill(user.name);
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await fillPassword(page, "Password", user.password);
  await fillPassword(page, "Confirm password", user.password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page).toHaveURL(/\/welcome$/);
  const origin = new URL(page.url()).origin;
  const created = await page.request.post("/api/trading-accounts", {
    headers: { Origin: origin },
    data: {
      displayName: "Synthetic CSV account",
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
  const orders = Buffer.from(csv("orders", [order()]));
  const portions = Buffer.from(
    csv("performance", [performance(), performance()]),
  );
  await page.goto("/imports");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByText("Advanced: import Orders report", { exact: true })
    .click();
  await page.getByLabel("Orders CSV", { exact: true }).setInputFiles({
    name: "renamed-source.csv",
    mimeType: "text/csv",
    buffer: orders,
  });
  await page.getByLabel("Performance CSV", { exact: true }).setInputFiles({
    name: "matched-portions.csv",
    mimeType: "text/csv",
    buffer: portions,
  });
  await page
    .getByRole("button", { name: "Review import", exact: true })
    .click();
  await expect(
    page.getByText("Resolve the errors above", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("SYNTHETIC-ACCOUNT", { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: /I confirm the Orders source account/ })
    .check();
  await page
    .getByRole("checkbox", { name: /I confirm this Performance report/ })
    .check();
  await page
    .getByRole("button", { name: "Review import", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Confirm import", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Choose appearance" }).first().click();
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await expect(page.locator(".imports-page")).toHaveCSS("opacity", "1");
  await page.screenshot({
    path: "artifacts/day-three-import-light.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Choose appearance" }).first().click();
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.screenshot({
    path: "artifacts/day-three-import-dark.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/day-three-import-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Confirm import", exact: true })
    .click();
  await expect(page).toHaveURL(/\/imports\/[0-9a-f-]+\?saved=1$/);
  await expect(
    page.getByRole("heading", { name: "Source records imported." }),
  ).toBeVisible();
  const batchId = new URL(page.url()).pathname.split("/").at(-1)!;
  await page.reload();
  await expect(
    page.getByText("3 new records · 0 duplicates", { exact: false }),
  ).toBeVisible();
  await page.getByRole("link", { name: "All imports", exact: true }).click();
  await expect(page).toHaveURL(/\/imports\/history$/);
  await expect(
    page.getByText("renamed-source.csv", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("matched-portions.csv", { exact: false }),
  ).toBeVisible();
  const upload = (extra: Record<string, unknown> = {}) => ({
    accountId,
    timezone: "Asia/Jerusalem",
    confirmOrders: "true",
    confirmPerformance: "true",
    orders: {
      name: "renamed-source.csv",
      mimeType: "text/csv",
      buffer: orders,
    },
    performance: {
      name: "matched-portions.csv",
      mimeType: "text/csv",
      buffer: portions,
    },
    ...extra,
  });
  const preview = await page.request.post("/api/imports/preview", {
    headers: { Origin: origin },
    multipart: upload(),
  });
  expect(preview.status()).toBe(200);
  const duplicate = await preview.json();
  expect(duplicate.counts.duplicates).toBe(3);
  expect(duplicate.counts.new).toBe(0);
  const confirmation = await page.request.post("/api/imports/confirm", {
    headers: { Origin: origin },
    multipart: upload({ token: duplicate.token }),
  });
  expect(confirmation.status()).toBe(200);
  const result = await confirmation.json();
  expect(result.outcome).toBe("Already imported");
  expect(result.added).toBe(0);
  expect(
    (
      await (
        await page.request.post("/api/imports/confirm", {
          headers: { Origin: origin },
          multipart: upload({ token: duplicate.token }),
        })
      ).json()
    ).id,
  ).toBe(result.id);
  const changed = await page.request.post("/api/imports/preview", {
    headers: { Origin: origin },
    multipart: upload({
      orders: {
        name: "changed.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(csv("orders", [order({ Text: "changed source" })])),
      },
    }),
  });
  expect(changed.status()).toBe(200);
  expect((await changed.json()).canConfirm).toBe(false);
  const ambiguous = await page.request.post("/api/imports/preview", {
    headers: { Origin: origin },
    multipart: upload({
      performance: {
        name: "ambiguous.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(csv("performance", [performance()])),
      },
    }),
  });
  expect((await ambiguous.json()).counts.conflicts).toBe(1);
  // Performance alone is supported, with an independent fill-ID pair and explicit mapping.
  const only = {
    accountId,
    timezone: "Asia/Jerusalem",
    confirmOrders: "false",
    confirmPerformance: "true",
    performance: {
      name: "one-report.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        csv("performance", [performance({ buyFillId: "new-pair" })]),
      ),
    },
  };
  const single = await (
    await page.request.post("/api/imports/preview", {
      headers: { Origin: origin },
      multipart: only,
    })
  ).json();
  expect(single.canConfirm).toBe(true);
  expect(
    (
      await (
        await page.request.post("/api/imports/confirm", {
          headers: { Origin: origin },
          multipart: { ...only, token: single.token },
        })
      ).json()
    ).added,
  ).toBe(1);
  const otherUser = disposableUser();
  const context = await browser.newContext();
  try {
    const response = await context.request.post(
      `${origin}/api/auth/sign-up/email`,
      { headers: { Origin: origin }, data: otherUser },
    );
    expect(response.status()).toBe(200);
    expect(
      (
        await context.request.post(`${origin}/api/imports/preview`, {
          headers: { Origin: origin },
          multipart: upload(),
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await context.request.post(`${origin}/api/imports/confirm`, {
          headers: { Origin: origin },
          multipart: upload({ token: duplicate.token }),
        })
      ).status(),
    ).toBe(409);
    const other = await context.newPage();
    expect((await other.goto(`${origin}/imports/${batchId}`))?.status()).toBe(
      404,
    );
    await other.goto(`${origin}/imports/history`);
    await expect(
      other.getByRole("heading", { name: "No source imports yet" }),
    ).toBeVisible();
    await expect(
      other.getByText("Synthetic CSV account", { exact: true }),
    ).toHaveCount(0);
  } finally {
    await context.close();
  }
  await page.goto("/");
  await expect(page.locator(".metric-value").first()).toHaveText("—");
  await expect(
    page.getByText("No trades imported yet", { exact: true }).first(),
  ).toBeVisible();
  await page.goto("/?mode=demo");
  await expect(page.locator(".demo-indicator")).toContainText("Demo data");
  expect(errors).toEqual([]);
});
