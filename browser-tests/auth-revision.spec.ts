import { test, expect } from "@playwright/test";
import { betterAuth } from "better-auth";
import { createAuth } from "../lib/auth-options";
import { closePool } from "../db/client";
import { disposableUser, cleanupUsers, fillPassword } from "./fixture-users";
test.afterEach(async () => {
  await cleanupUsers();
  await closePool();
});
test("signup, refresh, legacy credentials, two-user isolation, logout and supported reset flow", async ({
  page,
  browser,
}) => {
  test.skip(
    process.env.MSJOURNAL_TEST_DISPOSABLE !== "true" ||
      process.env.AUTH_REQUIRE_EMAIL_VERIFICATION === "true",
    "Disposable development users and local verification disabled are required.",
  );
  test.setTimeout(120000);
  const first = disposableUser(),
    second = disposableUser();
  await page.goto("/signup");
  await page.getByLabel("Name", { exact: true }).fill(first.name);
  await page.getByLabel("Email", { exact: true }).fill(first.email);
  await fillPassword(page, "Password", first.password);
  await fillPassword(page, "Confirm password", first.password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(
    page.getByRole("heading", { name: "Add your first trading account" }),
  ).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/welcome$/);
  const origin = new URL(page.url()).origin;
  const accountData = {
    displayName: "Private first-user account",
    firmChoice: "",
    customFirm: "",
    platform: "Tradovate",
    brokerIdentifier: "000-shared-fixture",
    stage: "Personal",
    status: "Active",
    nominalSize: "50000.01",
    openingBalance: "",
    openingBalanceDate: "",
    currency: "USD",
    reportingTimezone: "Asia/Jerusalem",
    notes: "",
  };
  const created = await page.request.post("/api/trading-accounts", {
    headers: { Origin: origin },
    data: accountData,
  });
  expect(created.status()).toBe(201);
  const id = (await created.json()).account.id;
  expect(
    (
      await page.request.patch("/api/preferences", {
        headers: { Origin: origin },
        data: {
          displayName: "First user only",
          displayTimezone: "America/New_York",
          currency: "USD",
        },
      })
    ).status(),
  ).toBe(200);
  // A supported pre-existing credential record, created before this user's login.
  const options = createAuth().options;
  await betterAuth({
    ...options,
    emailAndPassword: {
      ...options.emailAndPassword,
      enabled: true,
      autoSignIn: false,
    },
  }).api.signUpEmail({ body: second });
  const secondContext = await browser.newContext();
  const other = await secondContext.newPage();
  try {
    await other.goto(`${origin}/login`);
    await other.getByLabel("Email", { exact: true }).fill(second.email);
    await fillPassword(other, "Password", second.password);
    await other.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(other).toHaveURL(`${origin}/`);
    expect(
      (await (await other.request.get(`${origin}/api/trading-accounts`)).json())
        .accounts,
    ).toEqual([]);
    expect(
      (
        await other.request.get(`${origin}/api/trading-accounts/${id}`)
      ).status(),
    ).toBe(404);
    for (const data of [{ archived: true }, { archived: false }, accountData])
      expect(
        (
          await other.request.patch(`${origin}/api/trading-accounts/${id}`, {
            headers: { Origin: origin },
            data,
          })
        ).status(),
      ).toBe(404);
    expect(
      (
        await other.request.patch(`${origin}/api/preferences`, {
          headers: { Origin: origin },
          data: {
            displayName: "Forged",
            displayTimezone: "UTC",
            currency: "USD",
            userId: "another-user",
          },
        })
      ).status(),
    ).toBe(400);
    expect(
      (await (await other.request.get(`${origin}/api/preferences`)).json())
        .preferences.displayTimezone,
    ).toBe("Asia/Jerusalem");
    expect(
      (
        await other.request.post(`${origin}/api/trading-accounts`, {
          headers: { Origin: origin },
          data: accountData,
        })
      ).status(),
    ).toBe(201);
    await other.goto(`${origin}/?accounts=${id}`);
    await expect(other).not.toHaveURL(new RegExp(id));
    expect(
      (await (await page.request.get("/api/trading-accounts")).json())
        .accounts[0].archivedAt,
    ).toBeNull();
    expect(
      (await (await page.request.get("/api/preferences")).json()).preferences
        .displayTimezone,
    ).toBe("America/New_York");
    await page.goto("/settings");
    await page
      .getByRole("button", { name: "Sign out", exact: true })
      .last()
      .click();
    await expect(page).toHaveURL(/\/login$/);
    expect((await page.request.get("/api/preferences")).status()).toBe(401);
    await page.getByLabel("Email", { exact: true }).fill(first.email);
    await fillPassword(page, "Password", first.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(`${origin}/`);
    await page.reload();
    expect((await page.request.get("/api/preferences")).status()).toBe(200);
    // Verify the library token lifecycle with an in-process email callback. This
    // checks reset/session logic, not real Resend delivery; tokens never print.
    let resetLink = "";
    const resetAuth = betterAuth({
      ...options,
      emailAndPassword: {
        ...options.emailAndPassword,
        enabled: true,
        sendResetPassword: async ({ url }) => {
          resetLink = url;
        },
      },
    });
    await resetAuth.api.requestPasswordReset({
      body: { email: first.email, redirectTo: `${origin}/reset-password` },
    });
    expect(!!resetLink).toBe(true);
    await page.goto(resetLink).catch(() => {
      throw new Error("Unable to open the disposable reset link.");
    });
    const newPassword = second.password;
    await fillPassword(page, "New password", newPassword);
    await fillPassword(page, "Confirm password", newPassword);
    await page
      .getByRole("button", { name: "Reset password", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Your password has been reset",
    );
    expect((await page.request.get("/api/preferences")).status()).toBe(401);
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(first.email);
    await fillPassword(page, "Password", first.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.locator(".login-card [role='alert']")).toHaveText(
      "The email or password is incorrect.",
    );
    await fillPassword(page, "Password", newPassword);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(`${origin}/`);
    expect(
      (await other.request.get(`${origin}/api/preferences`)).status(),
    ).toBe(200);
  } finally {
    await secondContext.close();
  }
});
test("responsive standard auth screens, validation and invalid recovery links", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/signup");
  await expect(page.locator(".login-card")).toHaveCSS("opacity", "1");
  await page.screenshot({
    path: "artifacts/auth-signup-light.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Choose appearance" }).click();
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator(".login-card")).toHaveCSS("opacity", "1");
  await page.screenshot({
    path: "artifacts/auth-signup-dark.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "artifacts/auth-signup-mobile.png",
    fullPage: true,
  });
  for (const route of [
    "/signup",
    "/login",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
  ]) {
    await page.goto(route);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.goto("/reset-password?error=INVALID_TOKEN");
  await expect(page.locator(".login-card [role='alert']")).toContainText(
    "invalid or expired",
  );
  if (!process.env.RESEND_API_KEY) {
    const response = await page.request.post(
      "/api/auth/request-password-reset",
      {
        data: {
          email: "anybody@example.invalid",
          redirectTo: "/reset-password",
        },
      },
    );
    expect(response.status()).toBe(503);
    expect((await response.json()).code).toBe("EMAIL_UNAVAILABLE");
  }
});
