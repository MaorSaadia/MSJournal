import { test, expect } from "@playwright/test";
import { disposableUser, cleanupUsers } from "./fixture-users";

const origin = process.env.MSJOURNAL_BROWSER_ORIGIN ?? "http://127.0.0.1:3100";
test.use({ baseURL: origin });
test.afterEach(() => cleanupUsers());

test("private reusable templates preserve independent strategies and failed writing", async ({
  page,
  browser,
}, info) => {
  test.skip(
    process.env.MSJOURNAL_TEST_DISPOSABLE !== "true",
    "Disposable fixtures only",
  );
  test.setTimeout(180000);
  const headers = { Origin: origin };
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    (
      await page.request.post("/api/auth/sign-up/email", {
        headers,
        data: disposableUser(),
      })
    ).status(),
  ).toBe(200);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/strategies");
  await page.getByRole("button", { name: "New strategy", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".builder-template")).toHaveCount(13);
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => {
      document.documentElement.classList.toggle("dark", t === "dark");
      document.documentElement.classList.toggle("light", t === "light");
    }, theme);
    await page.screenshot({ path: info.outputPath(`library-${theme}.png`) });
  }
  await dialog
    .getByRole("button", { name: "Use Silver Bullet template", exact: true })
    .click();
  await dialog.getByLabel("New strategy name").fill("Synthetic first setup");
  await dialog
    .getByLabel("Custom confirmation")
    .fill("Synthetic personal confirmation");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => {
      document.documentElement.classList.toggle("dark", t === "dark");
      document.documentElement.classList.toggle("light", t === "light");
    }, theme);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await dialog.evaluate((el) => {
        el.scrollTop = 0;
      });
      await expect(async () => {
        const box = await dialog.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }).toPass({ timeout: 5000 });
      await page.screenshot({
        path: info.outputPath(`builder-${width}-${theme}.png`),
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await dialog
    .getByRole("button", { name: "Create strategy", exact: true })
    .click();
  await expect(page).toHaveURL(/strategies\/[0-9a-f-]+$/);
  const firstId = page.url().split("/").at(-1)!;
  const first = await (
    await page.request.get(`/api/strategies?id=${firstId}`)
  ).json();
  expect(first.fields.checklist).toHaveLength(4);
  expect(first.fields.context).toContain("session window");
  await page
    .getByRole("button", { name: "Save as template", exact: true })
    .click();
  await dialog.getByLabel("Template name").fill("Synthetic reusable template");
  await page.route("**/api/strategies/templates", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ message: "Synthetic failed template save" }),
        })
      : route.continue(),
  );
  await dialog
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Synthetic failed template save",
  );
  await expect(dialog.getByLabel("Template name")).toHaveValue(
    "Synthetic reusable template",
  );
  await page.unroute("**/api/strategies/templates");
  await dialog
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  await expect(dialog).not.toBeVisible({ timeout: 20000 });
  let list = await (await page.request.get("/api/strategies/templates")).json();
  expect(list.templates).toHaveLength(1);
  const original = list.templates[0];
  await page.goto("/strategies");
  await page.getByRole("button", { name: "My templates", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit template", exact: true })
    .click();
  await dialog
    .getByLabel("Strategy description")
    .fill("Synthetic template edited independently");
  await dialog
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  await expect(dialog).not.toBeVisible({ timeout: 20000 });
  list = await (await page.request.get("/api/strategies/templates")).json();
  const latest = list.templates[0];
  expect(latest.revision).toBe(2);
  expect(
    (
      await page.request.post("/api/strategies/templates", {
        headers,
        data: {
          id: original.id,
          revision: original.revision,
          fields: original.fields,
        },
      })
    ).status(),
  ).toBe(409);
  expect(
    (await (await page.request.get(`/api/strategies?id=${firstId}`)).json())
      .fields,
  ).toEqual(first.fields);
  const other = await browser.newContext({ baseURL: origin });
  try {
    expect(
      (
        await other.request.post("/api/auth/sign-up/email", {
          headers,
          data: disposableUser(),
        })
      ).status(),
    ).toBe(200);
    expect(
      (await (await other.request.get("/api/strategies/templates")).json())
        .templates,
    ).toEqual([]);
    expect(
      (
        await other.request.post("/api/strategies/templates", {
          headers,
          data: {
            id: latest.id,
            revision: latest.revision,
            fields: latest.fields,
          },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await other.request.delete("/api/strategies/templates", {
          headers,
          data: { id: latest.id, revision: latest.revision, confirmed: true },
        })
      ).status(),
    ).toBe(404);
  } finally {
    await other.close();
  }
  await page.getByRole("button", { name: "Use template", exact: true }).click();
  await dialog.getByLabel("New strategy name").fill("Synthetic second setup");
  await dialog
    .getByRole("button", { name: "Create strategy", exact: true })
    .click();
  await expect(page).toHaveURL(/strategies\/[0-9a-f-]+$/);
  const secondId = page.url().split("/").at(-1)!;
  expect(secondId).not.toBe(firstId);
  const second = await (
    await page.request.get(`/api/strategies?id=${secondId}`)
  ).json();
  expect(second.fields.description).toBe(latest.fields.description);
  expect(second.fields.checklist[0].id).not.toBe(latest.fields.checklist[0].id);
  await page.goto("/strategies");
  await page.getByRole("button", { name: "My templates", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete template", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Remove this item?", exact: true })
    .getByRole("button", { name: "Remove", exact: true })
    .click();
  await expect(
    page.getByText("Your own starting points", { exact: true }),
  ).toBeVisible();
  expect(
    (await (await page.request.get(`/api/strategies?id=${firstId}`)).json())
      .fields,
  ).toEqual(first.fields);
  expect(
    (await (await page.request.get(`/api/strategies?id=${secondId}`)).json())
      .fields,
  ).toEqual(second.fields);
  await page.getByRole("button", { name: "New template", exact: true }).click();
  await dialog
    .getByLabel("Template name")
    .fill("Synthetic blank custom template");
  await dialog
    .getByLabel("Custom confirmation")
    .fill("Synthetic rule from scratch");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  await expect(dialog).not.toBeVisible({ timeout: 20000 });
  list = await (await page.request.get("/api/strategies/templates")).json();
  expect(list.templates[0].fields.checklist[0].text).toBe(
    "Synthetic rule from scratch",
  );
  await page.getByRole("button", { name: "New strategy", exact: true }).click();
  await dialog.getByRole("button", { name: /Create your own/ }).click();
  await dialog
    .getByLabel("New strategy name")
    .fill("Synthetic name-only strategy");
  await dialog
    .getByRole("button", { name: "Create strategy", exact: true })
    .click();
  await expect(page).toHaveURL(/strategies\/[0-9a-f-]+$/);
  const customId = page.url().split("/").at(-1)!;
  const custom = await (
    await page.request.get(`/api/strategies?id=${customId}`)
  ).json();
  expect(custom.fields.name).toBe("Synthetic name-only strategy");
  expect(custom.fields.checklist).toEqual([]);
  expect(errors).toEqual([]);
});
