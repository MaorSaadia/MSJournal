import { test, expect } from "@playwright/test";
import { disposableUser, cleanupUsers } from "./fixture-users";
import { csv, performance } from "../tests/fixtures/tradovate";
import { Pool } from "pg";
const origin = process.env.MSJOURNAL_BROWSER_ORIGIN ?? "http://127.0.0.1:3100";
test.use({ baseURL: origin });
test.afterEach(() => cleanupUsers());
test("fee totals reconcile imports, duplicates, overlaps and edits without double charging", async ({
  page,
  playwright,
}, info) => {
  test.skip(
    process.env.MSJOURNAL_TEST_DISPOSABLE !== "true",
    "Disposable fixtures only",
  );
  test.setTimeout(420000);
  const headers = { Origin: origin };
  expect(
    (
      await page.request.post("/api/auth/sign-up/email", {
        headers,
        data: disposableUser(),
      })
    ).status(),
  ).toBe(200);
  const other = await playwright.request.newContext({ baseURL: origin });
  try {
    expect(
      (
        await other.post("/api/auth/sign-up/email", {
          headers,
          data: disposableUser(),
        })
      ).status(),
    ).toBe(200);
    const response = await page.request.post("/api/trading-accounts", {
      headers,
      data: {
        displayName: "Synthetic fee account",
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
    expect(response.status()).toBe(201);
    const accountId = (await response.json()).account.id;
    const rows = [
      performance({
        buyFillId: "fee-shared",
        sellFillId: "fee-exit-a",
        boughtTimestamp: "10/01/2026 12:00:00",
        soldTimestamp: "10/02/2026 12:00:00",
        qty: "1",
        pnl: "100.12345678",
      }),
      performance({
        buyFillId: "fee-shared",
        sellFillId: "fee-exit-b",
        boughtTimestamp: "10/01/2026 12:00:00",
        soldTimestamp: "10/03/2026 12:00:00",
        qty: "2",
        pnl: "161.37654322",
      }),
    ];
    function upload(selected = rows, feeTotal = "12.48") {
      return {
        accountId,
        timezone: "UTC",
        confirmPerformance: "true",
        confirmOrders: "false",
        feeTotal,
        replaceFees: "false",
        performance: {
          name: "synthetic-fees.csv",
          mimeType: "text/csv",
          buffer: Buffer.from(csv("performance", selected)),
        },
      };
    }
    async function preview(selected = rows, total = "12.48") {
      const r = await page.request.post("/api/imports/preview", {
        headers,
        multipart: upload(selected, total),
      });
      expect(r.status()).toBe(200);
      return r.json();
    }
    async function confirm(
      p: { token: string; feeReview: { fingerprint: string } },
      selected = rows,
      total = "12.48",
      replace = false,
    ) {
      return page.request.post("/api/imports/confirm", {
        headers,
        multipart: {
          ...upload(selected, total),
          replaceFees: String(replace),
          token: p.token,
          feeFingerprint: p.feeReview.fingerprint,
        },
      });
    }
    const first = await preview();
    expect(first.feeReview).toMatchObject({
      gross: "261.5",
      total: "12.48",
      net: "249.02",
      count: 2,
    });
    const saved = await confirm(first);
    expect(saved.status()).toBe(200);
    const retry = await confirm(first);
    expect(retry.status()).toBe(200);
    expect((await retry.json()).id).toBe((await saved.json()).id);
    const query = `accountId=${accountId}&start=2026-10-01&end=2026-10-31`;
    const dashboardQuery = `accounts=${accountId}&start=2026-10-01&end=2026-10-31&basis=net&outcomeBasis=portions`;
    const dash = await (
      await page.request.get(`/api/dashboard?${dashboardQuery}`)
    ).json();
    expect(dash.realizedSummary.total).toBe("249.02");
    expect(dash.allocatedFees).toBe(2);
    const repeated = await preview();
    expect(repeated.feeReview).toMatchObject({
      unchanged: true,
      replaceRequired: false,
    });
    expect((await confirm(repeated)).status()).toBe(200);
    let fees = await (await page.request.get(`/api/fees?${query}`)).json();
    expect(fees.history).toHaveLength(1);
    expect(
      (
        await page.request.post("/api/imports/preview", {
          headers,
          multipart: upload([rows[0]], "4"),
        })
      ).status(),
    ).toBe(409);
    expect((await other.get(`/api/fees?${query}`)).status()).toBe(404);
    const third = performance({
      buyFillId: "fee-third-entry",
      sellFillId: "fee-third-exit",
      boughtTimestamp: "10/04/2026 12:00:00",
      soldTimestamp: "10/04/2026 12:05:00",
      qty: "1",
      pnl: "10",
    });
    const cumulative = await preview([...rows, third], "15.5");
    expect(cumulative.feeReview).toMatchObject({
      existingTotals: 1,
      replaceRequired: true,
      count: 3,
    });
    expect((await confirm(cumulative, [...rows, third], "15.5")).status()).toBe(
      409,
    );
    expect(
      (await (await page.request.get(`/api/fees?${query}`)).json()).count,
    ).toBe(2);
    expect(
      (await confirm(cumulative, [...rows, third], "15.5", true)).status(),
    ).toBe(200);
    const scope = { accountId, start: "2026-10-01", end: "2026-10-31" };
    const managed = await page.request.post("/api/fees", {
      headers,
      data: {
        scope,
        total: "16",
        note: "Synthetic corrected broker fee total",
      },
    });
    expect(managed.status()).toBe(200);
    const quote = await managed.json(),
      body = {
        scope,
        total: "16",
        note: "Synthetic corrected broker fee total",
        fingerprint: quote.fingerprint,
        replace: true,
        confirmed: true,
      };
    expect(
      (await other.put("/api/fees", { headers, data: body })).status(),
    ).toBe(404);
    expect(
      (
        await page.request.put("/api/fees", {
          headers,
          data: { ...body, replace: false },
        })
      ).status(),
    ).toBe(409);
    expect(
      (await page.request.put("/api/fees", { headers, data: body })).status(),
    ).toBe(200);
    expect(
      (await page.request.put("/api/fees", { headers, data: body })).status(),
    ).toBe(409);
    expect(
      (
        await (
          await page.request.get(`/api/dashboard?${dashboardQuery}`)
        ).json()
      ).realizedSummary.total,
    ).toBe("255.5");
    expect(
      (
        await page.request.post("/api/journal/fees", {
          headers,
          data: {
            accountId,
            perSide: "99",
            contractOverrides: {},
            applyExisting: true,
          },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await (
          await page.request.get(`/api/dashboard?${dashboardQuery}`)
        ).json()
      ).realizedSummary.total,
    ).toBe("255.5");
    const journal = await (
      await page.request.get(
        `/api/journal?accounts=${accountId}&outcomeBasis=portions`,
      )
    ).json();
    expect(
      (
        await page.request.patch("/api/journal/fees", {
          headers,
          data: { recordId: journal.rows[0].id, total: "1" },
        })
      ).status(),
    ).toBe(409);
    fees = await (await page.request.get(`/api/fees?${query}`)).json();
    expect(fees.history).toHaveLength(3);
    expect(
      fees.history.filter((r: { active: boolean }) => r.active),
    ).toHaveLength(1);
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 10000,
    });
    pool.on("error", () => {});
    try {
      const actual = await pool.query(
        "select sum(amount)::text as total, count(*)::int as count from fee_reconciliation_sources where trading_account_id=$1 and active=true",
        [accountId],
      );
      expect(Number(actual.rows[0].total)).toBe(16);
      expect(actual.rows[0].count).toBe(3);
    } finally {
      await pool.end();
    }
    // Confirm the standard archive includes the new history tables; no private file is written.
    const backup = await page.request.post("/api/exports/backup", {
      headers,
      data: { includeImages: false, allowPartial: false },
    });
    expect(backup.status()).toBe(200);
    const zip = await backup.body();
    expect(zip.includes(Buffer.from("data/fee_reconciliations.json"))).toBe(
      true,
    );
    expect(
      zip.includes(Buffer.from("data/fee_reconciliation_sources.json")),
    ).toBe(true);
    await page.emulateMedia({ reducedMotion: "reduce" });
    // Legacy account links open the same combined, ownership-checked workspace.
    await page.goto(`/prop-accounts/${accountId}/fees`, { waitUntil: "load" });
    await expect(page).toHaveURL(new RegExp(`/fees\\?accountId=${accountId}$`));
    await page.getByText("Automatic fee estimates", { exact: false }).click();
    await expect(
      page.getByLabel("Estimated all-in fee per contract, per side (USD)"),
    ).toHaveValue(/^99(?:\.0+)?$/);
    await expect(
      page.getByRole("heading", { name: "Fee history", exact: true }),
    ).toBeVisible({ timeout: 60000 });
    await expect(
      page.getByText("Synthetic corrected broker fee total", { exact: true }),
    ).toBeVisible();
    for (const theme of ["light", "dark"]) {
      await page.evaluate((t) => {
        localStorage.setItem("theme", t);
        document.documentElement.classList.remove("dark", "light");
        document.documentElement.classList.add(t);
      }, theme);
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 950 });
        await expect(async () =>
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
          ).toBe(width),
        ).toPass();
        await page.screenshot({
          path: info.outputPath(`fees-${theme}-${width}.png`),
          fullPage: true,
        });
      }
    }
    await page.getByRole("button", { name: "Edit total", exact: true }).click();
    await page
      .getByLabel("Trading fees & commissions (USD)", { exact: true })
      .fill("17");
    await page.getByLabel(/I confirm this total applies/).check();
    await page
      .getByRole("button", { name: "Review fee total", exact: true })
      .click();
    await expect(page.getByText("+$254.50", { exact: true })).toBeVisible();
    await page.getByLabel(/Replace the existing fees shown/).check();
    await page
      .getByRole("button", { name: "Save fee total", exact: true })
      .click();
    await expect(page.getByText(/Fee total saved/)).toBeVisible();
    // Exercise the actual import form's optional fee step on a duplicate upload.
    await page.goto("/imports", { waitUntil: "load" });
    await page
      .getByLabel("Performance CSV", { exact: true })
      .setInputFiles({
        name: "synthetic-fees.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(csv("performance", [...rows, third])),
      });
    await page
      .getByText("Trading fees & commissions (optional)", { exact: true })
      .click();
    await page
      .getByLabel("Total fees for this Performance report (USD)", {
        exact: true,
      })
      .fill("17");
    await page.getByLabel(/I confirm these fees apply/).check();
    await page.getByLabel(/I confirm this Performance report belongs/).check();
    await page
      .getByRole("button", { name: "Review import", exact: true })
      .click();
    await expect(
      page.getByText("This same fee total is already recorded.", {
        exact: false,
      }),
    ).toBeVisible({ timeout: 30000 });
  } finally {
    await other.dispose();
  }
});


test("normalized Performance copies reuse saved portions and fees without double counting", async ({ page, playwright }) => {
  test.skip(process.env.MSJOURNAL_TEST_DISPOSABLE !== "true", "Disposable fixtures only");
  test.setTimeout(120000);
  const headers = { Origin: origin };
  expect((await page.request.post("/api/auth/sign-up/email", {headers,data:disposableUser()})).status()).toBe(200);
  const created = await page.request.post("/api/trading-accounts",{headers,data:{displayName:"Normalized overlap fixture",firmChoice:"",customFirm:"",platform:"Tradovate",brokerIdentifier:"",stage:"Personal",status:"Active",nominalSize:"50000",openingBalance:"",openingBalanceDate:"",currency:"USD",reportingTimezone:"UTC",notes:""}});
  expect(created.status()).toBe(201);
  const accountId = (await created.json()).account.id;
  async function preview(rows: Record<string,string>[], total?: string) {
    const multipart = {accountId,timezone:"UTC",confirmPerformance:"true",confirmOrders:"false",...(total === undefined ? {} : {feeTotal:total,replaceFees:"true"}),performance:{name:"Performance.csv",mimeType:"text/csv",buffer:Buffer.from(csv("performance",rows))}};
    const response = await page.request.post("/api/imports/preview",{headers,multipart});
    expect(response.status(),await response.text()).toBe(200);
    return { multipart, result:await response.json() };
  }
  async function confirm(p: Awaited<ReturnType<typeof preview>>) {
    const response = await page.request.post("/api/imports/confirm",{headers,multipart:{...p.multipart,token:p.result.token,...(p.result.feeReview ? {feeFingerprint:p.result.feeReview.fingerprint} : {})}});
    expect(response.status(),await response.text()).toBe(200);
    const result = await response.json();
    expect(result.processing.status).toBe("Ready");
    return result;
  }
  async function activity() { return (await (await page.request.get(`/api/prop-progress?accountId=${accountId}`)).json()).accounts[0].activity; }
  const initial = [performance(),performance({pnl:"-45",duration:"00:00:16"})];
  await confirm(await preview(initial,"2"));
  expect(await activity()).toMatchObject({count:2,gross:"-90",net:"-92"});
  const formatted = [performance({qty:"02",buyPrice:"20011.5000",pnl:"-45.0000",duration:"16 seconds"}),performance({qty:"02",buyPrice:"20011.5000",pnl:"-45.0000",duration:"16 seconds"})];
  const duplicate = await preview(formatted);
  expect(duplicate.result.counts).toMatchObject({duplicates:2,new:0,conflicts:0});
  expect(duplicate.result.canConfirm).toBe(true);
  expect((await confirm(duplicate)).added).toBe(0);
  expect(await activity()).toMatchObject({count:2,gross:"-90",net:"-92"});
  const mixed = [...formatted,performance({buyFillId:"new-fixture-buy",sellFillId:"new-fixture-sell",pnl:"10"})];
  const additional = await preview(mixed,"3");
  expect(additional.result.counts).toMatchObject({duplicates:2,new:1,conflicts:0});
  expect((await confirm(additional)).added).toBe(1);
  expect(await activity()).toMatchObject({count:3,gross:"-80",net:"-83"});
  expect((await confirm(await preview(mixed))).added).toBe(0);
  expect(await activity()).toMatchObject({count:3,gross:"-80",net:"-83"});
  const changed = await preview([performance({pnl:"-44"}),formatted[1],mixed[2]]);
  expect(changed.result.canConfirm).toBe(false);
  expect(changed.result.files[0].errors.some((e: {message:string}) => e.message.includes("gross P&L"))).toBe(true);
  expect(await activity()).toMatchObject({count:3,net:"-83"});
  const other = await playwright.request.newContext({baseURL:origin});
  try {
    expect((await other.post("/api/auth/sign-up/email",{headers,data:disposableUser()})).status()).toBe(200);
    expect((await other.post("/api/imports/preview",{headers,multipart:duplicate.multipart})).status()).toBe(404);
  } finally { await other.dispose(); }
});
