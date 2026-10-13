import { test, expect } from "@playwright/test";
import { disposableUser, cleanupUsers } from "./fixture-users";
const origin = process.env.MSJOURNAL_BROWSER_ORIGIN ?? "http://127.0.0.1:3100";
test.use({ baseURL: origin });
test.afterEach(() => cleanupUsers());

test("styled confirmations protect writing, history and nested dialogs", async ({
  page,
}, info) => {
  test.skip(
    process.env.MSJOURNAL_TEST_DISPOSABLE !== "true",
    "Disposable fixtures only",
  );
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", async (dialog) => {
    if (dialog.type() === "confirm")
      errors.push("Unexpected native confirmation");
    await dialog.dismiss();
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    (
      await page.request.post("/api/auth/sign-up/email", {
        headers: { Origin: origin },
        data: disposableUser(),
      })
    ).status(),
  ).toBe(200);
  await page.goto("/notebook");
  await page
    .getByRole("link", { name: "Start today's entry", exact: true })
    .click();
  await page.getByLabel("Journal date").fill("2026-10-10");
  await expect(page).toHaveURL(/day-view\?date=2026-10-10/);
  await page.route("**/api/daily", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ message: "Synthetic blocked save" }),
        })
      : route.continue(),
  );
  await page.getByLabel("Today's focus").fill("Synthetic writing to protect");
  await page.getByRole("button", { name: "Save now", exact: true }).click();
  await expect(page.locator(".daily-workspace [role=alert]")).toContainText(
    "Synthetic blocked save",
  );
  await page
    .getByRole("link", { name: "Notebook", exact: true })
    .last()
    .click();
  const confirmation = page.getByRole("dialog", {
    name: "Leave without saving?",
    exact: true,
  });
  await expect(confirmation).toBeVisible();
  await expect(
    confirmation.getByRole("button", { name: "Keep editing" }),
  ).toBeFocused();
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => {
      document.documentElement.classList.toggle("dark", t === "dark");
      document.documentElement.classList.toggle("light", t === "light");
    }, theme);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await expect(async () => {
        const box = await confirmation.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      }).toPass({ timeout: 5000 });
      await page.screenshot({
        path: info.outputPath(`confirmation-${theme}-${width}.png`),
      });
    }
  }
  await confirmation.getByRole("button", { name: "Keep editing" }).click();
  await expect(confirmation).not.toBeVisible();
  await expect(page.getByLabel("Today's focus")).toHaveValue(
    "Synthetic writing to protect",
  );
  await expect(page).toHaveURL(/day-view\?date=2026-10-10/);
  await page.evaluate(() => window.history.back());
  await expect(confirmation).toBeVisible();
  await expect(page.getByLabel("Today's focus")).toHaveValue(
    "Synthetic writing to protect",
  );
  await page.keyboard.press("Escape");
  await expect(confirmation).not.toBeVisible();
  await expect(page).toHaveURL(/day-view\?date=2026-10-10/);
  await page.screenshot({
    path: info.outputPath("after-history-cancel.png"),
    fullPage: true,
  });
  await expect(page.getByLabel("Today's focus")).toHaveValue(
    "Synthetic writing to protect",
  );
  await page
    .getByRole("link", { name: "Notebook", exact: true })
    .last()
    .click();
  await confirmation.getByRole("button", { name: "Discard changes" }).click();
  await expect(page).toHaveURL(/notebook$/);
  expect(
    (await (await page.request.get("/api/daily?date=2026-10-10")).json()).id,
  ).toBeNull();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/strategies");
  await page.getByRole("button", { name: "New strategy", exact: true }).click();
  const builder = page.getByRole("dialog", {
    name: "Build your strategy",
    exact: true,
  });
  await builder.getByRole("button", { name: /Create your own/ }).click();
  await builder
    .getByLabel("New strategy name")
    .fill("Synthetic unfinished strategy");
  await builder.getByRole("button", { name: "Cancel", exact: true }).click();
  const nested = page.getByRole("dialog", {
    name: "You have unsaved changes",
    exact: true,
  });
  await expect(nested).toBeVisible();
  await nested.getByRole("button", { name: "Keep editing" }).click();
  await expect(builder.getByLabel("New strategy name")).toHaveValue(
    "Synthetic unfinished strategy",
  );
  await builder.getByRole("button", { name: "Cancel", exact: true }).click();
  await nested.getByRole("button", { name: "Discard changes" }).click();
  await expect(builder).not.toBeVisible();
  await page.getByRole("button", { name: "My templates", exact: true }).click();
  await page.getByRole("button", { name: "New template", exact: true }).click();
  const template = page.getByRole("dialog", {
    name: "Create a personal template",
    exact: true,
  });
  await template
    .getByLabel("Template name")
    .fill("Synthetic removable template");
  await template
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  await expect(template).not.toBeVisible({ timeout: 20000 });
  await page
    .getByRole("button", { name: "Delete template", exact: true })
    .click();
  const removal = page.getByRole("dialog", {
    name: "Remove this item?",
    exact: true,
  });
  await removal.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Synthetic removable template" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delete template", exact: true })
    .click();
  await removal.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(
    page.getByText("Your own starting points", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
