import { test, expect } from "@playwright/test";
import { disposableUser, cleanupUsers } from "./fixture-users";
import { csv, performance } from "../tests/fixtures/tradovate";
import { emptyPlaybook } from "../lib/strategies/model";
const origin = process.env.MSJOURNAL_BROWSER_ORIGIN ?? "http://127.0.0.1:3100";
test.use({ baseURL: origin });
test.afterEach(() => cleanupUsers());
test("Day 11 owned playbook snapshots, assignment, results and ordinary reprocessing", async ({
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
  await page.emulateMedia({ reducedMotion: "reduce" });
  const headers = { Origin: origin };
  expect(
    (
      await page.request.post("/api/auth/sign-up/email", {
        headers,
        data: disposableUser(),
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.patch("/api/preferences", {
        headers,
        data: {
          displayName: "Disposable journal user",
          displayTimezone: "UTC",
          currency: "USD",
          weekStartsOn: 0,
        },
      })
    ).status(),
  ).toBe(200);
  await page.goto("/strategies");
  await page.getByRole("button", { name: "New strategy", exact: true }).click();
  await page.getByRole("button", { name: /Create your own/ }).click();
  await page.getByLabel("New strategy name").fill("Fictional Day 11 setup");
  await page
    .getByRole("button", { name: "Create strategy", exact: true })
    .click();
  await expect(page).toHaveURL(/strategies\/[0-9a-f-]+$/);
  const strategyId = page.url().split("/").at(-1)!;
  await page.route("**/api/strategies", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ message: "Fictional failed playbook save" }),
        })
      : route.continue(),
  );
  await page
    .getByLabel("Entry conditions", { exact: true })
    .fill("Fictional confirmation before entry");
  await page.getByRole("button", { name: "Save now", exact: true }).click();
  await expect(page.locator(".playbook-workspace [role=alert]")).toContainText(
    "Fictional failed playbook save",
  );
  await expect(
    page.getByLabel("Entry conditions", { exact: true }),
  ).toHaveValue("Fictional confirmation before entry");
  await page.unroute("**/api/strategies");
  await page
    .getByRole("button", { name: "Add checklist item", exact: true })
    .click();
  await page
    .getByLabel("Setup checklist item 1")
    .fill("Fictional confirmation observed");
  await page.getByRole("button", { name: "Save now", exact: true }).click();
  await expect(
    page
      .locator(".playbook-workspace [role=status]")
      .filter({ hasText: /^Saved$/ }),
  ).toBeVisible();
  const book = await (
    await page.request.get(`/api/strategies?id=${strategyId}`)
  ).json();
  const itemId = book.fields.checklist[0].id;
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => {
      document.documentElement.classList.toggle("dark", t === "dark");
      document.documentElement.classList.toggle("light", t === "light");
    }, theme);
    await page.waitForTimeout(250);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: info.outputPath(`playbook-desktop-${theme}.png`),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`playbook-mobile-${theme}.png`),
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Examples", exact: true }).click();
  if (!book.storageEnabled)
    await expect(
      page.getByText("Private screenshot storage needs setup", { exact: true }),
    ).toBeVisible();
  await page.goto("/day-view?date=2026-10-12");
  await page.getByLabel("Add planned strategy").selectOption(strategyId);
  await page
    .getByLabel("Today's focus")
    .fill("Plan only, not an automatic assignment");
  await page.getByRole("button", { name: "Save now", exact: true }).click();
  await expect(
    page
      .locator(".daily-workspace [role=status]")
      .filter({ hasText: /^Saved$/ }),
  ).toBeVisible();
  const account = await page.request.post("/api/trading-accounts", {
    headers,
    data: {
      displayName: "Fictional strategy account",
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
  const parts = [
    performance({
      buyFillId: "strategy-shared",
      sellFillId: "strategy-sell1",
      pnl: "10",
      boughtTimestamp: "10/12/2026 10:00:00",
      soldTimestamp: "10/12/2026 11:00:00",
    }),
    performance({
      buyFillId: "strategy-shared",
      sellFillId: "strategy-sell2",
      pnl: "-5",
      boughtTimestamp: "10/12/2026 10:00:00",
      soldTimestamp: "10/12/2026 12:00:00",
    }),
    performance({
      buyFillId: "strategy-other",
      sellFillId: "strategy-other-sell",
      pnl: "0",
      boughtTimestamp: "10/12/2026 13:00:00",
      soldTimestamp: "10/12/2026 14:00:00",
    }),
  ];
  async function importParts(values: typeof parts) {
    const multipart = {
      accountId,
      timezone: "UTC",
      confirmPerformance: "true",
      confirmOrders: "false",
      performance: {
        name: "fictional-strategy.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(csv("performance", values)),
      },
    };
    const preview = await page.request.post("/api/imports/preview", {
      headers,
      multipart,
    });
    expect(preview.status()).toBe(200);
    expect(
      (
        await page.request.post("/api/imports/confirm", {
          headers,
          multipart: { ...multipart, token: (await preview.json()).token },
        })
      ).status(),
    ).toBe(200);
  }
  await importParts(parts);
  const journal = await (
    await page.request.get(`/api/journal?accounts=${accountId}`)
  ).json();
  expect(journal.rows).toHaveLength(2);
  const recordId = journal.rows.find(
    (r: { gross: string }) => Number(r.gross) === 5,
  ).id;
  await page.goto(`/trade-view/${recordId}`);
  await page
    .getByLabel("Primary strategy", { exact: true })
    .selectOption(strategyId);
  await page
    .getByRole("button", { name: "Save strategy assignment", exact: true })
    .click();
  await expect(
    page
      .locator(".strategy-record [role=status]")
      .filter({ hasText: /^Saved$/ }),
  ).toBeVisible();
  await page
    .getByLabel("Checklist: Fictional confirmation observed")
    .selectOption("Met");
  await page
    .getByRole("button", { name: "Save strategy assignment", exact: true })
    .click();
  await expect(
    page
      .locator(".strategy-record [role=status]")
      .filter({ hasText: /^Saved$/ }),
  ).toBeVisible();
  let assigned = await (
    await page.request.get(`/api/strategies/assignment?recordId=${recordId}`)
  ).json();
  expect(assigned.assignment.playbookRevision).toBe(book.revision);
  expect(assigned.assignment.answers[itemId]).toBe("Met");
  const reportQuery = `start=2026-10-12&end=2026-10-12&accounts=${accountId}&analysis=portions&basis=gross`;
  let report = await (
    await page.request.get(`/api/reports?${reportQuery}&strategy=${strategyId}`)
  ).json();
  expect(report.summary.count).toBe(2);
  expect(report.summary.total).toBe("5");
  expect(
    report.strategyGroups.find((g: { id: string }) => g.id === strategyId)
      .records,
  ).toHaveLength(1);
  const all = await (
    await page.request.get(`/api/reports?${reportQuery}`)
  ).json();
  expect(
    all.strategyGroups.reduce(
      (n: number, g: { summary: { count: number } }) => n + g.summary.count,
      0,
    ),
  ).toBe(3);
  expect(
    all.strategyGroups.reduce(
      (n: number, g: { summary: { total: string } }) =>
        n + Number(g.summary.total),
      0,
    ),
  ).toBe(5);
  const complete = await (
    await page.request.get(
      `/api/reports?${reportQuery.replace("analysis=portions", "analysis=complete")}&strategy=${strategyId}`,
    )
  ).json();
  expect(complete.summary.count).toBe(0);
  const net = await (
    await page.request.get(
      `/api/reports?${reportQuery.replace("basis=gross", "basis=net")}&strategy=${strategyId}`,
    )
  ).json();
  expect(net.summary.total).toBeNull();
  expect(
    (
      await page.request.post("/api/journal/process", {
        headers,
        data: { accountId },
      })
    ).status(),
  ).toBe(200);
  await importParts(parts);
  assigned = await (
    await page.request.get(`/api/strategies/assignment?recordId=${recordId}`)
  ).json();
  expect(assigned.assignment.answers[itemId]).toBe("Met");
  expect(assigned.assignment.playbookRevision).toBe(book.revision);
  const edited = await page.request.post("/api/strategies", {
    headers,
    data: {
      id: strategyId,
      revision: book.revision,
      fields: {
        ...book.fields,
        entry: "New fictional instructions",
        checklist: [{ id: itemId, text: "New fictional checklist condition" }],
      },
    },
  });
  expect(edited.status()).toBe(200);
  const newer = await edited.json();
  assigned = await (
    await page.request.get(`/api/strategies/assignment?recordId=${recordId}`)
  ).json();
  expect(assigned.assignment.fields.entry).toBe(book.fields.entry);
  expect(assigned.assignment.answers[itemId]).toBe("Met");
  const daily = await (
    await page.request.get("/api/daily?date=2026-10-12")
  ).json();
  expect(daily.fields.plannedStrategies).toEqual([
    { strategyId, revision: book.revision },
  ]);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Adopt latest version" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Adopt latest version" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Adopt latest version", exact: true })
    .click();
  await expect(
    page.getByLabel("Checklist: New fictional checklist condition"),
  ).toHaveValue("Not assessed");
  // Private strategy, assignment, historical revision, and image access are owner-scoped.
  const other = await browser.newContext({ baseURL: origin });
  expect(
    (
      await other.request.post("/api/auth/sign-up/email", {
        headers,
        data: disposableUser(),
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await other.request.get(
        `/api/strategies?id=${strategyId}&revision=${book.revision}`,
      )
    ).status(),
  ).toBe(404);
  expect(
    (
      await other.request.get(`/api/strategies/assignment?recordId=${recordId}`)
    ).status(),
  ).toBe(404);
  expect(
    (
      await other.request.get(
        `/api/reports?${reportQuery}&strategy=${strategyId}`,
      )
    ).status(),
  ).toBe(404);
  assigned = await (
    await page.request.get(`/api/strategies/assignment?recordId=${recordId}`)
  ).json();
  const ownOther = await other.request.post("/api/strategies", {
    headers,
    data: {
      revision: 0,
      fields: { ...emptyPlaybook(), name: "Other user's fictional strategy" },
    },
  });
  expect(ownOther.status()).toBe(200);
  expect(
    (
      await page.request.post("/api/strategies/assignment", {
        headers,
        data: {
          recordId,
          revision: assigned.assignment.revision,
          strategyId: (await ownOther.json()).id,
          confirmReset: true,
        },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await other.request.post(
        "/api/strategies/images?strategyId=" + strategyId,
        {
          headers: { ...headers, "Content-Type": "image/png" },
          data: Buffer.from("not an image"),
        },
      )
    ).status(),
  ).toBe(404);
  await other.close();
  const filtered = await (
    await page.request.get(
      `/api/journal?accounts=${accountId}&strategy=${strategyId}`,
    )
  ).json();
  expect(filtered.rows).toHaveLength(1);
  expect(filtered.rows[0].strategyName).toBe(book.fields.name);
  // Adding a shared-fill portion changes the source signature and requires recovery.
  await importParts([
    ...parts,
    performance({
      buyFillId: "strategy-shared",
      sellFillId: "strategy-sell3",
      pnl: "1",
      boughtTimestamp: "10/12/2026 10:00:00",
      soldTimestamp: "10/12/2026 12:30:00",
    }),
  ]);
  const recovery = await (
    await page.request.get("/api/strategies/assignment?recovery=1")
  ).json();
  expect(recovery.rows).toHaveLength(1);
  report = await (
    await page.request.get(`/api/reports?${reportQuery}&strategy=${strategyId}`)
  ).json();
  expect(report.summary.count).toBe(0);
  expect(report.strategyUnresolved).toBe(1);
  const current = await (
    await page.request.get(`/api/journal?accounts=${accountId}`)
  ).json();
  const regroupedId = current.rows.find(
    (r: { gross: string }) => Number(r.gross) === 6,
  ).id;
  expect(
    (
      await page.request.post("/api/strategies/assignment", {
        headers,
        data: {
          recordId: regroupedId,
          revision: recovery.rows[0].revision,
          strategyId,
          recoverId: recovery.rows[0].id,
          confirmReset: true,
        },
      })
    ).status(),
  ).toBe(200);
  report = await (
    await page.request.get(`/api/reports?${reportQuery}&strategy=${strategyId}`)
  ).json();
  expect(report.summary.count).toBe(3);
  expect(report.summary.total).toBe("6");
  await page.goto(`/strategies/${strategyId}`);
  await page.getByRole("button", { name: "Results", exact: true }).click();
  await expect(
    page.getByText("Included portions", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".playbook-metrics")).toContainText("+$6.00");
  await page
    .getByRole("button", { name: "Archive strategy", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Archive strategy", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Restore strategy", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Restore strategy", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Archive strategy", exact: true }),
  ).toBeVisible();
  expect(
    (
      await (
        await page.request.get(
          `/api/strategies?id=${strategyId}&revision=${book.revision}`,
        )
      ).json()
    ).fields,
  ).toEqual(book.fields);
  expect(newer.revision).toBeGreaterThan(book.revision);
  expect(errors).toEqual([]);
});
