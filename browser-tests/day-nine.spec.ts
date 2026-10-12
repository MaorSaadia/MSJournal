import { test, expect } from "@playwright/test";
import { disposableUser, cleanupUsers } from "./fixture-users";
import { csv, performance } from "../tests/fixtures/tradovate";
import { emptyRules } from "../lib/props/validation";
const origin = process.env.MSJOURNAL_BROWSER_ORIGIN ?? "http://127.0.0.1:3100";
test.use({ baseURL: origin });
test.afterEach(() => cleanupUsers());
test("Day 9 owned prop setup, imports, snapshots, rule versions and responsive history", async ({
  page,
}, info) => {
  test.skip(
    process.env.MSJOURNAL_TEST_DISPOSABLE !== "true",
    "Disposable fixtures only",
  );
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
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
  const created = await page.request.post("/api/trading-accounts", {
    headers: { Origin: origin },
    data: {
      displayName: "Fictional Day 9 account",
      firmChoice: "Other",
      customFirm: "Fictional verification firm",
      platform: "Tradovate",
      brokerIdentifier: "",
      programName: "Fictional evaluation",
      startDate: "2026-10-01",
      stage: "Evaluation",
      status: "Active",
      nominalSize: "50000",
      openingBalance: "100",
      openingBalanceDate: "2026-10-01",
      currency: "USD",
      reportingTimezone: "UTC",
      notes: "Synthetic fixture only",
    },
  });
  expect(created.status()).toBe(201);
  const id = (await created.json()).account.id;
  const multipart = {
    accountId: id,
    timezone: "UTC",
    confirmPerformance: "true",
    confirmOrders: "false",
    performance: {
      name: "fictional-day-nine.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        csv("performance", [
          performance({
            buyFillId: "a1",
            sellFillId: "b1",
            pnl: "10",
            boughtTimestamp: "10/01/2026 00:15:00",
            soldTimestamp: "10/01/2026 00:30:00",
          }),
          performance({
            buyFillId: "a2",
            sellFillId: "b2",
            pnl: "-5",
            boughtTimestamp: "10/02/2026 10:00:00",
            soldTimestamp: "10/02/2026 12:00:00",
          }),
          performance({
            buyFillId: "a3",
            sellFillId: "b3",
            pnl: "0",
            boughtTimestamp: "10/03/2026 10:00:00",
            soldTimestamp: "10/03/2026 12:00:00",
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
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/prop-accounts/${id}`);
  const phase = page.getByRole("form", { name: "Tracking phase" });
  await expect(phase).toBeVisible();
  await phase.locator('[name="historyConfirmed"]').check();
  await phase.getByRole("button", { name: "Save tracking phase" }).click();
  await expect(
    page.getByRole("button", { name: "Rules", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Rules", exact: true }).click();
  const rules = page.getByRole("form", { name: "Custom prop rules" });
  await rules.locator('[name="profitTarget"]').fill("10");
  await rules.locator('[name="minimumDays"]').fill("2");
  await rules.locator('[name="staticFloor"]').fill("90");
  await rules.locator('[name="timezone"]').fill("UTC");
  await rules.locator('[name="resetTime"]').fill("00:00");
  await rules.locator('[name="dayLabel"]').selectOption("start");
  await rules.locator('[name="daySettingsConfirmed"]').check();
  await rules.getByRole("button", { name: "Save rule version" }).click();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(page.locator(".prop-metrics").first()).toContainText("+$5.00");
  await expect(page.locator(".prop-requirements")).toContainText(
    "Incomplete data",
  );
  let data = (
    await (await page.request.get(`/api/prop-progress?accountId=${id}`)).json()
  ).accounts[0].phases[0];
  expect(data.current.qualifying).toBe(3);
  expect(data.current.lastBalance).toBeNull();
  expect(
    (
      await page.request.post("/api/journal/fees", {
        headers: { Origin: origin },
        data: {
          accountId: id,
          perSide: "0",
          contractOverrides: {},
          applyExisting: true,
        },
      })
    ).status(),
  ).toBe(200);
  // Refresh picks up mutation invalidation made through APIRequestContext, which bypasses browser events.
  await page.getByRole("button", { name: "Refresh progress" }).click();
  await expect(page.locator(".prop-metrics")).toContainText("+$15.00");
  await page
    .getByText("Record a manual dashboard snapshot", { exact: true })
    .click();
  const snapshot = page.getByRole("form", {
    name: "Manual prop dashboard snapshot",
  });
  await snapshot.locator('[name="asOfLocal"]').fill("2026-10-04T12:00");
  await snapshot.locator('[name="balance"]').fill("120");
  await snapshot.locator('[name="threshold"]').fill("95");
  await snapshot.locator('[name="qualifyingDays"]').fill("3");
  await snapshot.locator('[name="note"]').fill("Fictional manual observation");
  await snapshot.getByRole("button", { name: "Save snapshot" }).click();
  await expect(page.locator(".prop-manual")).toContainText("$120.00");
  data = (
    await (await page.request.get(`/api/prop-progress?accountId=${id}`)).json()
  ).accounts[0].phases[0];
  expect(data.gross).toBe("5");
  expect(data.current.lastBalance).toBe("105");
  expect(data.phase.baseline).toBe("100.00");
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
  const timezoneIndependent = (
    await (await page.request.get(`/api/prop-progress?accountId=${id}`)).json()
  ).accounts[0].phases[0];
  expect(timezoneIndependent.current.qualifying).toBe(3);
  expect(timezoneIndependent.current.total).toBe("5");
  expect(timezoneIndependent.current.days[0].date).toBe("2026-10-01");
  await page.reload();
  await expect(page.locator(".prop-metrics")).toContainText("+$5.00");
  await page.getByRole("button", { name: "Account settings" }).click();
  await expect(page.getByLabel("Stage", { exact: true })).toBeDisabled();
  await page
    .getByRole("dialog")
    .locator('[name="programName"]')
    .fill("Fictional updated program");
  await page.getByRole("button", { name: "Save account", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".page-description")).toContainText(
    "Fictional updated program",
  );
  await page.mouse.move(0, 0);
  await expect(
    page.locator(".prop-chart .recharts-scatter-symbol"),
  ).toHaveCount(2);
  for (const theme of ["light", "dark"]) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate((t) => {
      document.documentElement.classList.toggle("dark", t === "dark");
      document.documentElement.classList.toggle("light", t === "light");
      localStorage.setItem("theme", t);
    }, theme);
    await page.screenshot({
      path: info.outputPath(`prop-desktop-${theme}.png`),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: info.outputPath(`prop-mobile-${theme}.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(page.locator(".prop-history")).toContainText(
    "Fictional manual observation",
  );
  await expect(page.locator(".prop-history")).toContainText(
    "Immutable rule versions",
  );
  await page.screenshot({
    path: info.outputPath("prop-history.png"),
    fullPage: true,
  });
  await page.goto("/prop-accounts");
  await expect(page.locator(".prop-card-progress")).toContainText("$120.00");
  await page.getByLabel("Filter status").selectOption("Paused");
  await expect(page.getByText("No active accounts match")).toBeVisible();
  await page.getByLabel("Filter status").selectOption("all");
  await page.goto(`/prop-accounts/${id}`);
  await expect(page.locator(".prop-metrics")).toContainText("+$5.00");
  await page
    .getByRole("button", { name: "Archive account", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Restore", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Archive account", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "MSJournal dashboard", exact: true })
    .click();
  await expect(page.locator(".metric-grid")).toContainText("+$5.00");
  await page.getByRole("link", { name: "Prop Accounts", exact: true }).click();
  await page
    .getByRole("link", { name: "Fictional Day 9 account", exact: true })
    .click();
  await expect(page.locator(".prop-metrics")).toContainText("+$5.00");
  await page
    .getByText("Record a manual dashboard snapshot", { exact: true })
    .click();
  const laterSnapshot = page.getByRole("form", {
    name: "Manual prop dashboard snapshot",
  });
  await laterSnapshot.locator('[name="asOfLocal"]').fill("2026-10-05T12:00");
  await laterSnapshot.locator('[name="balance"]').fill("122");
  await laterSnapshot.locator('[name="threshold"]').fill("95");
  await laterSnapshot.getByRole("button", { name: "Save snapshot" }).click();
  await expect(page.locator(".prop-manual")).toContainText("$122.00");
  await page.route("**/api/dashboard?**", (route) => route.abort());
  await page
    .getByRole("link", { name: "MSJournal dashboard", exact: true })
    .click();
  await expect(page.locator(".metric-grid")).toContainText("+$5.00");
  await page.unroute("**/api/dashboard?**");
  const newVersion = await page.request.post("/api/prop-progress", {
    headers: { Origin: origin },
    data: {
      action: "rules",
      accountId: id,
      phaseId: data.phase.id,
      effectiveLocal: "2026-10-04T13:00",
      rules: {
        ...emptyRules,
        profitTarget: "25",
        timezone: "UTC",
        resetTime: "00:00",
        dayLabel: "start",
        daySettingsConfirmed: true,
      },
    },
  });
  expect(newVersion.status()).toBe(200);
  expect(
    (
      await (
        await page.request.get(`/api/prop-progress?accountId=${id}`)
      ).json()
    ).accounts[0].phases[0].periods,
  ).toHaveLength(2);
  const afterRevision = (
    await (await page.request.get(`/api/prop-progress?accountId=${id}`)).json()
  ).accounts[0].phases[0];
  expect(afterRevision.current.total).toBe("5");
  expect(afterRevision.current.qualifying).toBe(3);
  expect(errors).toEqual([]);
});
