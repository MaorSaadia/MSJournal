import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { disposableUser, cleanupUsers, fillPassword } from "./fixture-users";
const origin = process.env.MSJOURNAL_BROWSER_ORIGIN ?? "http://localhost:3000";
test.use({ baseURL: origin });
test.afterEach(() => cleanupUsers());
test("Settings changes the signed-in password, rejects invalid attempts and revokes other sessions", async ({
  page,
  browser,
}, info) => {
  test.skip(
    process.env.MSJOURNAL_TEST_DISPOSABLE !== "true" ||
      process.env.AUTH_REQUIRE_EMAIL_VERIFICATION === "true",
    "Disposable development users with verification disabled only",
  );
  test.setTimeout(180000);
  page.setDefaultNavigationTimeout(60000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const headers = { Origin: origin },
    user = disposableUser(),
    nextPassword = randomBytes(24).toString("hex");
  expect(
    (
      await page.request.post("/api/auth/sign-up/email", {
        headers,
        data: user,
      })
    ).status(),
  ).toBe(200);
  const owner = (await (await page.request.get("/api/auth/get-session")).json())
    .user.id;
  const other = await browser.newContext({ baseURL: origin }),
    fresh = await browser.newContext({ baseURL: origin });
  try {
    expect(
      (
        await other.request.post("/api/auth/sign-in/email", {
          headers,
          data: { email: user.email, password: user.password },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await fresh.request.post("/api/auth/change-password", {
          headers,
          data: {
            currentPassword: user.password,
            newPassword: nextPassword,
            revokeOtherSessions: true,
          },
        })
      ).status(),
    ).toBe(401);
    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    const form = page.locator(".settings-password");
    await expect(form).toBeVisible();
    await expect(form.locator("form")).toHaveAttribute("method", "post");
    await expect(
      form.getByRole("button", { name: "Update password", exact: true }),
    ).toBeEnabled({ timeout: 30000 });
    const noJs = await browser.newContext({
      baseURL: origin,
      javaScriptEnabled: false,
      storageState: await page.context().storageState(),
    });
    try {
      const staticPage = await noJs.newPage();
      await staticPage.goto("/settings", { waitUntil: "domcontentloaded" });
      await expect(
        staticPage.locator(".settings-password form"),
      ).toHaveAttribute("method", "post");
      await expect(
        staticPage.locator('.settings-password button[type="submit"]'),
      ).toBeDisabled();
    } finally {
      await noJs.close();
    }
    await fillPassword(page, "Current password", user.password);
    await fillPassword(page, "New password", nextPassword);
    await fillPassword(page, "Confirm new password", "mismatched-confirmation");
    let changes = 0;
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/auth/change-password")
        changes++;
    });
    await form
      .getByRole("button", { name: "Update password", exact: true })
      .click();
    await expect(
      form.getByText("Passwords do not match.", { exact: true }),
    ).toBeVisible();
    expect(changes).toBe(0);
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/auth/change-password", async (route) => {
      const response = await route.fetch();
      await pending;
      await route.fulfill({ response });
    });
    await fillPassword(page, "Current password", "incorrect-current-password");
    await fillPassword(page, "Confirm new password", nextPassword);
    await form
      .getByRole("button", { name: "Update password", exact: true })
      .click();
    const busy = form.getByRole("button", {
      name: "Updating password",
      exact: true,
    });
    await expect(busy).toBeDisabled();
    await expect(busy).toHaveAttribute("aria-busy", "true");
    await expect(
      form.getByLabel("Current password", { exact: true }),
    ).toBeDisabled();
    expect(changes).toBe(1);
    release();
    await expect(
      form.getByText("Your current password is incorrect.", { exact: true }),
    ).toBeVisible({ timeout: 30000 });
    await page.unrouteAll({ behavior: "wait" });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (value) =>
          document.documentElement.classList.toggle("dark", value === "dark"),
        theme,
      );
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 950 });
        await form.scrollIntoViewIfNeeded();
        await expect
          .poll(() =>
            page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
          )
          .toBe(true);
        // Never store credentials in visual artifacts.
        await form.screenshot({
          path: info.outputPath(`change-password-${theme}-${width}.png`),
          mask: [form.locator("input")],
        });
      }
    }
    await fillPassword(page, "Current password", user.password);
    await form
      .getByRole("button", { name: "Update password", exact: true })
      .click();
    await expect(form.getByRole("status")).toContainText("Password updated.", {
      timeout: 30000,
    });
    expect(changes).toBe(2);
    for (const name of [
      "Current password",
      "New password",
      "Confirm new password",
    ])
      expect(
        await form
          .getByLabel(name, { exact: true })
          .evaluate((input) => (input as HTMLInputElement).value.length === 0),
      ).toBe(true);
    expect(
      (await (await page.request.get("/api/auth/get-session")).json()).user.id,
    ).toBe(owner);
    expect(
      await (await other.request.get("/api/auth/get-session")).json(),
    ).toBeNull();
    expect(
      (
        await fresh.request.post("/api/auth/sign-in/email", {
          headers,
          data: { email: user.email, password: user.password },
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await fresh.request.post("/api/auth/sign-in/email", {
          headers,
          data: { email: user.email, password: nextPassword },
        })
      ).status(),
    ).toBe(200);
    expect(
      (await (await fresh.request.get("/api/auth/get-session")).json()).user.id,
    ).toBe(owner);
  } finally {
    await other.close();
    await fresh.close();
  }
});
