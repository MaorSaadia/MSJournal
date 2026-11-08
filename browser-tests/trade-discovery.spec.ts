import { test, expect } from "@playwright/test";
import { disposableUser, cleanupUsers } from "./fixture-users";
import { csv, performance } from "../tests/fixtures/tradovate";
import { emptyPlaybook } from "../lib/strategies/model";
import Decimal from "decimal.js";
const origin = process.env.MSJOURNAL_BROWSER_ORIGIN ?? "http://localhost:3000";
test.use({ baseURL: origin });
test.afterEach(() => cleanupUsers());
test("confirmation tags and combined filters preserve totals and owner isolation", async ({page, browser}, info) => {
  test.skip(process.env.MSJOURNAL_TEST_DISPOSABLE !== "true", "Disposable fixtures only");
  test.setTimeout(180000);
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(90000);
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
  const account = await (
    await page.request.post("/api/trading-accounts", {
      headers,
      data: {
        displayName: "Discovery fixture",
        firmChoice: "Apex Trader Funding",
        customFirm: "",
        platform: "Tradovate",
        brokerIdentifier: "",
        stage: "Evaluation",
        status: "Active",
        nominalSize: "50000",
        openingBalance: "",
        openingBalanceDate: "",
        currency: "USD",
        reportingTimezone: "Asia/Jerusalem",
        notes: "",
      },
    })
  ).json();
  const input = {
    accountId: account.account.id,
    timezone: "UTC",
    confirmPerformance: "true",
    confirmOrders: "false",
    feeTotal: "1.04",
    performance: {
      name: "Performance.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        csv("performance", [
          performance(),
          performance({
            buyFillId: "890001",
            sellFillId: "890002",
            boughtTimestamp: "09/03/2026 16:52:32",
            soldTimestamp: "09/03/2026 16:52:15",
          }),
        ]),
      ),
    },
  };
  const preview = await (
    await page.request.post("/api/imports/preview", {
      headers,
      multipart: input,
    })
  ).json();
  expect(
    (
      await page.request.post("/api/imports/confirm", {
        headers,
        multipart: {
          ...input,
          token: preview.token,
          feeFingerprint: preview.feeReview.fingerprint,
        },
      })
    ).status(),
  ).toBe(200);
  const records = await (
    await page.request.get(
      `/api/journal?accounts=${account.account.id}&outcomeBasis=portions`,
    )
  ).json();
  const recordId = records.rows[0].id;

  await page.goto(`/trade-view/${recordId}?tab=review`, {waitUntil:"load"});
  const tags = page.locator(".trade-confirmations");
  await tags.getByRole("button", {name:"FVG",exact:true}).click();
  await tags.getByRole("textbox", {name:"Custom confirmation"}).fill("Fixture retest");
  await tags.getByRole("button", {name:"Add confirmation",exact:true}).click();
  await expect.poll(async () => (await (await page.request.get(`/api/reviews?recordId=${recordId}`)).json()).fields.confirmations).toEqual(["FVG","Fixture retest"]);
  const saved = await (await page.request.get(`/api/reviews?recordId=${recordId}`)).json();
  expect((await page.request.post("/api/reviews", {headers,data:{recordId,revision:saved.revision,status:"draft",fields:{...saved.fields,emotions:{before:["Patient fixture"],during:[],after:[]}}}})).status()).toBe(200);
  const strategy = await (await page.request.post("/api/strategies", {headers,data:{revision:0,fields:{...emptyPlaybook(),name:"Fixture strategy"}}})).json();
  expect(strategy.id).toBeTruthy();
  expect((await page.request.post("/api/strategies/assignment",{headers,data:{recordId,revision:0,strategyId:strategy.id}})).status()).toBe(200);
  const opts = await (await page.request.get("/api/reviews/filter-options")).json();
  expect(opts.confirmations).toContain("Fixture retest"); expect(opts.emotions).toContain("Patient fixture");
  const scope = new URLSearchParams({accounts:account.account.id,start:"2026-09-01",end:"2026-09-30",basis:"net",outcomeBasis:"portions",confirmation:"Fixture retest",emotion:"Patient fixture",strategy:strategy.id});
  const dashResponse = await page.request.get(`/api/dashboard?${scope}`);
  expect(dashResponse.status()).toBe(200);
  const dashboard = await dashResponse.json();
  expect(dashboard.portionCount).toBe(1);
  const list = await (await page.request.get(`/api/journal?${scope}&dateBasis=activity`)).json();
  expect(list.rows).toHaveLength(1);
  expect(new Decimal(dashboard.outcomes.total).eq(list.rows[0].net)).toBe(true);
  expect((await (await page.request.get(`/api/dashboard?${scope}&hour=0`)).json()).portionCount).toBe(0);
  await page.goto(`/?${scope}`, {waitUntil:"load"});
  // The local Next.js dev indicator overlaps the sidebar theme control.
  await page.addStyleTag({content:"nextjs-portal { display: none !important; }"});
  await page.getByRole("button",{name:/^Filters/}).click();
  await expect(page.getByRole("combobox", {name:"Confirmation",exact:true})).toHaveValue("Fixture retest");
  await expect(page.getByRole("combobox", {name:"Emotion",exact:true})).toHaveValue("Patient fixture");
  await page.keyboard.press("Escape");
  await expect(page.locator(".dashboard-analysis-scope")).toBeVisible();
  await expect(page.locator(".metric-pnl .metric-value")).toHaveText("−$45.52", {timeout:60000});
  await page.screenshot({path:info.outputPath("dashboard-filtered.png")});
  await page.getByRole("button", {name:"Choose appearance"}).first().click();
  await page.locator(".theme-menu .menu-option").filter({hasText:"Dark"}).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button",{name:/^Filters/}).click();
  await page.getByRole("combobox",{name:"Confirmation",exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:info.outputPath("dashboard-filters-dark.png")});
  await page.keyboard.press("Escape");
  await page.goto(`/trade-view?${scope}&dateBasis=activity`,{waitUntil:"load"});
  await page.getByText("More filters",{exact:true}).click();
  await expect(page.getByRole("combobox",{name:"Confirmation",exact:true})).toHaveValue("Fixture retest");
  await page.setViewportSize({width:390,height:844});
  await page.getByRole("combobox",{name:"Confirmation",exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:info.outputPath("trade-filters-mobile.png")});
  const other = await browser.newContext({baseURL:origin});
  try {
    expect((await other.request.post("/api/auth/sign-up/email",{headers,data:disposableUser()})).status()).toBe(200);
    const privateChoices = await (await other.request.get("/api/reviews/filter-options")).json();
    expect(privateChoices.confirmations).not.toContain("Fixture retest");
    expect(privateChoices.emotions).not.toContain("Patient fixture");
    expect(privateChoices.strategies).toEqual([]);
    expect((await other.request.get(`/api/dashboard?${scope}`)).status()).toBe(404);
    expect((await other.request.post("/api/reviews",{headers,data:{recordId,revision:saved.revision,fields:saved.fields,status:"draft"}})).status()).toBe(404);
  } finally { await other.close(); }
});
