import { expect, test } from "@playwright/test";
import { disposableUser, cleanupUsers, fillPassword } from "./fixture-users";
test.afterEach(async () => {
  await cleanupUsers();
});
test("private access, admin endpoint rejection, and responsive sign-in without credentials", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ colorScheme: "light" });
  for (const path of [
    "/",
    "/?mode=demo",
    "/prop-accounts",
    "/settings",
    "/reports",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole("heading", { name: "Welcome back." }),
    ).toBeVisible();
  }
  for (const path of [
    "/api/trading-accounts",
    "/api/preferences",
    "/api/trading-accounts/020ff9cd-a993-4c4f-b942-911e6b80dbde",
  ]) {
    const response = await request.get(path);
    expect(response.status()).toBe(401);
    expect(response.headers()["cache-control"]).toBe("private, no-store");
  }
  expect(
    (
      await request.post("/api/auth/admin/create-user", {
        data: {
          email: "outsider@example.com",
          password: "not-a-real-password",
          name: "Outsider",
        },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/trading-accounts", {
        data: { ownerId: "forged" },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.patch(
        "/api/trading-accounts/020ff9cd-a993-4c4f-b942-911e6b80dbde",
        { data: { archived: true, ownerId: "forged" } },
      )
    ).status(),
  ).toBe(401);
  await expect(page.locator(".login-card")).toHaveCSS("opacity", "1");
  await page.screenshot({
    path: "artifacts/day-two-login-light.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Choose appearance" }).click();
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator(".login-card")).toHaveCSS("opacity", "1");
  await page.screenshot({
    path: "artifacts/day-two-login-dark.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/day-two-login-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("disposable database account lifecycle, persistence, selection, demo separation, and logout", async ({
  page,
  request,
}) => {
  test.skip(
    process.env.MSJOURNAL_TEST_DISPOSABLE !== "true" ||
      process.env.AUTH_REQUIRE_EMAIL_VERIFICATION === "true",
    "Use a disposable Neon development database with verification disabled.",
  );
  const marker = `Day 2 fixture ${Date.now()}`;
  let fixtureId: string | undefined;
  const user = disposableUser();
  await page.goto("/signup");
  await page.getByLabel("Name", { exact: true }).fill(user.name);
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await fillPassword(page, "Password", user.password);
  await fillPassword(page, "Confirm password", user.password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.waitForURL("/welcome");
  const base = new URL(page.url()).origin;
  try {
    await page.goto("/prop-accounts");
    await page
      .getByRole("button", { name: "Add Account", exact: true })
      .first()
      .click();
    await page.getByLabel("Display name *", { exact: true }).fill(marker);
    await page.getByLabel("Stage", { exact: true }).selectOption("Personal");
    await page
      .getByLabel("Nominal account size (USD) *", { exact: true })
      .fill("50000.01");
    await page
      .getByPlaceholder("Exact Tradovate account identifier")
      .fill(`000-${marker}`);
    await page
      .getByRole("button", { name: "Save account", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("saved");
    await page.reload();
    await expect(
      page.getByRole("heading", { name: marker, exact: true }),
    ).toBeVisible();
    const account = (
      await (await page.request.get("/api/trading-accounts")).json()
    ).accounts.find((a: { displayName: string }) => a.displayName === marker);
    fixtureId = account.id;
    expect(account.nominalSize).toBe("50000.01");
    expect(account.brokerIdentifier).toBe(`000-${marker}`);
    const duplicate = await page.request.post("/api/trading-accounts", {
      headers: { Origin: base },
      data: {
        displayName: "Duplicate",
        firmChoice: "",
        customFirm: "",
        platform: "Tradovate",
        brokerIdentifier: account.brokerIdentifier,
        stage: "Personal",
        status: "Active",
        nominalSize: "5",
        openingBalance: "",
        openingBalanceDate: "",
        currency: "USD",
        reportingTimezone: "UTC",
        notes: "",
      },
    });
    expect(duplicate.status()).toBe(409);
    const card = page.locator(".managed-account-card").filter({
      has: page.getByRole("heading", { name: marker, exact: true }),
    });
    await card.getByRole("button", { name: "Edit", exact: true }).click();
    await page
      .getByLabel("Nominal account size (USD) *", { exact: true })
      .fill("75000.02");
    await page
      .getByRole("button", { name: "Save account", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("saved");
    await page.reload();
    await expect(card).toContainText("$75,000.02");
    await card.getByRole("button", { name: "Archive", exact: true }).click();
    await page
      .getByRole("button", { name: "Archive account", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("archived");
    await page.getByRole("button", { name: /^Archived/ }).click();
    await card.getByRole("button", { name: "Restore", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("restored");
    await page.goto(`/?accounts=${fixtureId},demo-apex,forged`);
    await expect(page).not.toHaveURL(/demo-apex|forged/);
    await expect(page.locator(".metric-net .metric-value")).toHaveCount(0);
    await expect(page.locator(".metric-card .metric-value").first()).toHaveText(
      "—",
    );
    await expect(
      page.getByText("No trades imported yet", { exact: true }).first(),
    ).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(new RegExp(fixtureId!));
    await page.goto("/?mode=demo");
    await expect(page.locator(".demo-indicator")).toContainText("Demo data");
    await expect(page.locator(".metric-net .metric-value")).not.toHaveText("—");
    await page
      .getByRole("button", { name: "All accounts", exact: true })
      .click();
    await expect(page.locator(".accounts-popover")).not.toContainText(marker);
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/prop-accounts");
    await page
      .getByRole("button", { name: "Add Account", exact: true })
      .first()
      .click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "artifacts/day-two-account-form-mobile.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
  } finally {
    if (fixtureId)
      await page.request.patch(`/api/trading-accounts/${fixtureId}`, {
        headers: { Origin: base },
        data: { archived: true },
      });
  }
  await page.goto("/settings");
  await page
    .getByRole("button", { name: "Sign out", exact: true })
    .last()
    .click();
  await page.waitForURL("/login");
  expect((await page.request.get("/api/trading-accounts")).status()).toBe(401);
  await page.goto("/?mode=demo");
  await expect(page).toHaveURL(/\/login$/);
  expect((await request.get("/api/trading-accounts")).status()).toBe(401);
});
