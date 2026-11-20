// Disposable local UI fixture. All fee writes and import requests are mocked.
import { mkdir, writeFile, unlink, rmdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const root = process.cwd(), route = resolve(root, "app/import-fees-ui-check"), output = resolve(root, "artifacts/settings/import-fees");
const origin = "http://127.0.0.1:3124", one = "00000000-0000-4000-8000-000000000001", two = "00000000-0000-4000-8000-000000000002";
let server, browser, page, created = false, logs = "";
try {
  await mkdir(route); created = true; await mkdir(output, { recursive: true });
  await writeFile(resolve(route, "page.tsx"), `"use client";
import { notFound } from "next/navigation";
import { ImportPage } from "@/components/imports/import-page";
import type { TradingAccount } from "@/lib/accounts/types";
const accounts=[{id:"${one}",displayName:"Practice one",platform:"Tradovate",status:"Active",brokerIdentifier:null},{id:"${two}",displayName:"Practice two",platform:"Tradovate",status:"Active",brokerIdentifier:null}] as TradingAccount[];
export default function Page(){if(process.env.NODE_ENV!=="development")notFound();return <main className="main-region"><ImportPage accounts={accounts} displayTimezone="Asia/Jerusalem" lastTimezones={{}} feeSettings={{"${one}":{perSide:"0.52",contractOverrides:{MNQZ6:"0.52"}}}}/></main>}`);
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "3124"], {
    cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "development", NODE_DISABLE_COMPILE_CACHE: "1", MSJOURNAL_BILLING_UI_CHECK: "true", MSJOURNAL_WHOP_SANDBOX: "false", WHOP_CHECKOUT_ENABLED: "false", WHOP_LIVE_VERIFIED: "false" },
  });
  for (const stream of [server.stdout, server.stderr]) stream.on("data", c => { logs = (logs + c).slice(-18000); });
  const deadline = Date.now() + 90000;
  while (!logs.includes("Ready")) { if (server.exitCode !== null || Date.now() > deadline) throw Error("Import preview could not start"); await new Promise(r => setTimeout(r, 400)); }
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, reducedMotion: "reduce" });
  await page.route("**/api/**", r => r.fulfill({ status: 503, json: { message: "Unmocked fixture request withheld" } }));
  let saved, bodies = [];
  await page.route("**/api/journal/fees", r => { saved = r.request().postDataJSON(); return r.fulfill({ json: { status: "Ready" } }); });
  const overlap = "These records overlap part of an existing fee total. Edit that total in Fees, or choose a wider range containing all its records. No fees were changed.";
  await page.route("**/api/imports/preview", r => { bodies.push(r.request().postData()); return r.fulfill({ status: 409, json: { message: bodies.length === 1 ? overlap : "Fixture review received without a report total" } }); });
  await page.goto(origin + "/import-fees-ui-check", { waitUntil: "networkidle", timeout: 120000 });
  console.log("Import fixture loaded; checking rate setup.");
  const headers = "symbol,_priceFormat,_priceFormatType,_tickSize,buyFillId,sellFillId,qty,buyPrice,sellPrice,pnl,boughtTimestamp,soldTimestamp,duration";
  await page.locator('input[type="file"]').first().setInputFiles({ name: "Performance.csv", mimeType: "text/csv", buffer: Buffer.from(headers + "\nMNQZ6,-2,0,0.25,1,2,1,20000,20001,2,11/17/2026 10:00:00,11/17/2026 10:01:00,1min") });
  await page.getByText("Saved estimate: $0.52", { exact: false }).waitFor();
  await page.getByText("Change automatic fee estimate", { exact: true }).click();
  const rate = page.getByLabel("Estimated all-in fee per contract, per side (USD)");
  await rate.fill("0.62");
  await page.getByText("$1.24 estimated fees", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Save fee settings", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Fee settings saved" }).waitFor();
  assert.deepEqual(saved, { accountId: one, perSide: "0.62", contractOverrides: { MNQZ6: "0.52" }, applyExisting: false });
  await page.getByText("Saved estimate: $0.62", { exact: false }).waitFor();
  await page.getByRole("combobox", { name: /Trading account/ }).selectOption(two);
  await page.getByText("No rate is assumed.", { exact: false }).waitFor();
  assert.equal(await page.getByText("Saved estimate: $0.62", { exact: false }).count(), 0);
  await page.getByRole("combobox", { name: /Trading account/ }).selectOption(one);
  await page.getByText("Saved estimate: $0.62", { exact: false }).waitFor();
  const total = page.getByLabel("Total fees for this Performance report (USD)");
  await total.fill("12.48");
  await page.getByLabel("I confirm these fees apply", { exact: false }).check();
  await page.getByRole("button", { name: "Review import", exact: true }).click();
  await page.getByRole("button", { name: "Keep existing fees and use saved estimates for new trades" }).click();
  assert.equal(await total.inputValue(), "");
  await page.getByRole("button", { name: "Review import", exact: true }).click();
  await page.getByText("Fixture review received without a report total", { exact: true }).waitFor();
  assert.match(bodies[0], /name="feeTotal"/); assert.doesNotMatch(bodies[1], /name="feeTotal"/);
  for (const theme of ["light", "dark"]) for (const width of [1440, 390]) {
    await page.evaluate(t => { document.documentElement.classList.remove("dark", "light"); document.documentElement.classList.add(t); }, theme);
    await page.setViewportSize({ width, height: 1100 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: resolve(output, `${theme}-${width}.png`), fullPage: true });
  }
  console.log("Passed: account-isolated estimate setup, exact rate example, preserved contract overrides, explicit save, overlap recovery, omitted report total, both themes/mobile.");
} catch (error) {
  if (page) await page.screenshot({ path: resolve(output, "failure.png"), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser?.close();
  if (server?.pid) { try { execFileSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }); } catch {} }
  if (created) { await unlink(resolve(route, "page.tsx")); await rmdir(route); }
  await mkdir(output, { recursive: true }); await writeFile(resolve(output, "server.log"), logs);
}
