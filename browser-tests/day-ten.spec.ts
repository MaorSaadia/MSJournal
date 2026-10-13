import { test, expect } from "@playwright/test";
import { disposableUser, cleanupUsers } from "./fixture-users";
import { csv, performance } from "../tests/fixtures/tradovate";
const origin = process.env.MSJOURNAL_BROWSER_ORIGIN ?? "http://127.0.0.1:3100";
test.use({ baseURL: origin });
test.afterEach(() => cleanupUsers());
test("Daily preparation, resilient writing, observations, review and Notebook", async ({
  page,
  browser,
}, info) => {
  test.skip(
    process.env.MSJOURNAL_TEST_DISPOSABLE !== "true",
    "Disposable fixtures only",
  );
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  expect(
    (
      await page.request.post("/api/auth/sign-up/email", {
        headers: { Origin: origin },
        data: disposableUser(),
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.patch("/api/preferences", {
        headers: { Origin: origin },
        data: {
          displayName: "Disposable journal user",
          displayTimezone: "UTC",
          currency: "USD",
          weekStartsOn: 0,
        },
      })
    ).status(),
  ).toBe(200);
  await page.goto("/day-view?date=2026-10-01");
  await expect(page.getByLabel("Today's focus")).toBeVisible();
  let saved = await (
    await page.request.get("/api/daily?date=2026-10-01")
  ).json();
  expect(saved.id).toBeNull();
  await page.getByLabel("Today's focus").fill("Wait for my fictional setup");
  await page.getByRole("button", { name: "Save now", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: /^Saved$/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Session notes", exact: true })
    .click();
  await page.route("**/api/daily", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ message: "Fictional failed save" }),
        })
      : route.continue(),
  );
  await page
    .getByLabel("Session notes", { exact: true })
    .fill("Writing retained after a failed save");
  await page.getByRole("button", { name: "Save now", exact: true }).click();
  await expect(page.locator(".daily-workspace [role=alert]")).toContainText(
    "Fictional failed save",
  );
  await expect(page.getByLabel("Session notes", { exact: true })).toHaveValue(
    "Writing retained after a failed save",
  );
  await page
    .getByRole("link", { name: "Notebook", exact: true })
    .last()
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Keep editing", exact: true })
    .click();
  await expect(page).toHaveURL(/day-view/);
  await page.unroute("**/api/daily");
  await page.getByRole("button", { name: "Save now", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: /^Saved$/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add observation", exact: true })
    .click();
  await page.getByLabel("Observation 1 event time").fill("2026-10-01T09:30");
  await page
    .getByLabel("Observation 1: What happened")
    .fill("Missed the entry");
  await page
    .getByLabel("Observation 1: How I responded")
    .fill("Waited for another setup");
  await page.getByRole("button", { name: "Save now", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: /^Saved$/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Daily review", exact: true }).click();
  await page.getByLabel("What went well?").fill("I followed the plan");
  await page.getByLabel("Chose not to trade", { exact: true }).check();
  await page.getByRole("button", { name: "Mark day reviewed" }).click();
  await expect(
    page.getByRole("button", { name: "Reopen daily review" }),
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: /^Saved$/ }),
  ).toBeVisible();
  saved = await (await page.request.get("/api/daily?date=2026-10-01")).json();
  expect(saved.status).toBe("reviewed");
  // Import updates results while leaving all written content and revision intact.
  const account = await page.request.post("/api/trading-accounts", {
    headers: { Origin: origin },
    data: {
      displayName: "Fictional daily account",
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
      reportingTimezone: "UTC",
      notes: "",
    },
  });
  expect(account.status()).toBe(201);
  const accountId = (await account.json()).account.id;
  const multipart = {
    accountId,
    timezone: "UTC",
    confirmPerformance: "true",
    confirmOrders: "false",
    performance: {
      name: "fictional-daily.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        csv("performance", [
          performance({
            buyFillId: "daily1",
            sellFillId: "daily2",
            pnl: "10",
            boughtTimestamp: "10/01/2026 00:15:00",
            soldTimestamp: "10/01/2026 00:30:00",
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
  expect(
    (
      await page.request.post("/api/imports/confirm", {
        headers: { Origin: origin },
        multipart: { ...multipart, token: (await preview.json()).token },
      })
    ).status(),
  ).toBe(200);
  expect(
    (await (await page.request.get("/api/daily?date=2026-10-01")).json())
      .fields,
  ).toEqual(saved.fields);
  expect(
    (
      await page.request.patch("/api/preferences", {
        headers: { Origin: origin },
        data: {
          displayName: "Disposable journal user",
          displayTimezone: "America/New_York",
          currency: "USD",
          weekStartsOn: 0,
        },
      })
    ).status(),
  ).toBe(200);
  await page.reload();
  await expect(page.locator(".daily-context").first()).toContainText(
    "retains UTC",
  );
  await expect(page.locator(".daily-results-summary")).toContainText("+$10.00");
  await expect(page.locator(".daily-results")).toContainText(
    "Both are preserved",
  );
  const results = await (
    await page.request.get("/api/daily/results?date=2026-10-01")
  ).json();
  expect(results.results.timezone).toBe("UTC");
  expect(results.results.records).toHaveLength(1);
  // A stale revision cannot overwrite another tab's saved writing.
  const changed = await page.request.post("/api/daily", {
    headers: { Origin: origin },
    data: {
      date: saved.date,
      timezone: saved.timezone,
      revision: saved.revision,
      status: saved.status,
      fields: { ...saved.fields, focus: "Other tab's newer writing" },
    },
  });
  expect(changed.status()).toBe(200);
  await page.getByLabel("Today's focus").fill("My conflicting draft");
  await page.getByRole("button", { name: "Save now", exact: true }).click();
  await expect(page.locator(".daily-workspace [role=alert]")).toContainText(
    "another tab",
  );
  await expect(page.getByLabel("Today's focus")).toHaveValue(
    "My conflicting draft",
  );
  await page.getByRole("button", { name: "Compare saved version" }).click();
  await expect(page.locator(".daily-comparison")).toContainText(
    "Saved version",
  );
  await page
    .getByRole("button", { name: "Use saved version", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(page.getByLabel("Today's focus")).toHaveValue(
    "Other tab's newer writing",
  );
  const other = await browser.newContext({ baseURL: origin });
  expect(
    (
      await other.request.post("/api/auth/sign-up/email", {
        headers: { Origin: origin },
        data: disposableUser(),
      })
    ).status(),
  ).toBe(200);
  const privateDay = await (
    await other.request.get("/api/daily?date=2026-10-01")
  ).json();
  expect(privateDay.id).toBeNull();
  expect(privateDay.fields.focus).toBe("");
  const foreignLink = {
    id: crypto.randomUUID(),
    eventLocal: "2026-10-01T12:00",
    happened: "Foreign link",
    response: "",
    recordId: results.results.records[0].id,
  };
  expect(
    (
      await other.request.post("/api/daily", {
        headers: { Origin: origin },
        data: {
          date: privateDay.date,
          timezone: privateDay.timezone,
          revision: 0,
          status: "draft",
          fields: { ...privateDay.fields, observations: [foreignLink] },
        },
      })
    ).status(),
  ).toBe(404);
  await other.close();
  await page
    .getByRole("link", { name: "Notebook", exact: true })
    .last()
    .click();
  await page.getByLabel("Search daily writing").fill("Missed the entry");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".notebook-entry")).toHaveCount(1);
  await page.locator(".notebook-entry").click();
  await expect(page.getByLabel("Today's focus")).toHaveValue(
    "Other tab's newer writing",
  );
  await page.getByRole("button", { name: "Daily review", exact: true }).click();
  await page.getByRole("button", { name: "Reopen daily review" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: /^Saved$/ }),
  ).toBeVisible();
  const template = await (await page.request.get("/api/daily/template")).json();
  expect(
    (
      await page.request.post("/api/daily/template", {
        headers: { Origin: origin },
        data: {
          revision: template.revision,
          items: [
            {
              id: crypto.randomUUID(),
              text: "Fictional new default",
              checked: true,
            },
          ],
        },
      })
    ).status(),
  ).toBe(200);
  const existing = await (
      await page.request.get("/api/daily?date=2026-10-01")
    ).json(),
    fresh = await (await page.request.get("/api/daily?date=2026-10-02")).json();
  expect(existing.fields.checklist).toEqual(saved.fields.checklist);
  expect(fresh.fields.checklist[0]).toMatchObject({
    text: "Fictional new default",
    checked: false,
  });
  expect(fresh.id).toBeNull();
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => {
      document.documentElement.classList.toggle("dark", t === "dark");
      document.documentElement.classList.toggle("light", t === "light");
    }, theme);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: info.outputPath(`daily-desktop-${theme}.png`),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`daily-mobile-${theme}.png`),
      fullPage: true,
    });
  }
  expect(errors).toEqual([]);
});
