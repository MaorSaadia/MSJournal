// Disposable, development-only UI fixture. All account requests are mocked.
import { mkdir, writeFile, unlink, rmdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";

const root = process.cwd(), route = resolve(root, "app/settings-ui-check");
const output = resolve(root, "artifacts/settings/ui"), origin = "http://127.0.0.1:3124";
const preferences = { displayName: "Demo Trader", email: "trader@example.invalid", displayTimezone: "Asia/Jerusalem", currency: "USD", weekStartsOn: 0 };
const entitlement = { userId: "settings-fixture", plan: "Pro", usage: 2, freeAccountId: null, needsSelection: false, accounts: [] };
let created = false, server, browser, page, logs = "";
try {
  await mkdir(route); created = true;
  await mkdir(output, { recursive: true });
  await writeFile(resolve(route, "page.tsx"), `"use client";
import { notFound } from "next/navigation";
import { SettingsForm } from "@/components/settings/settings-form";
import { BillingAccess } from "@/components/billing/access";
export default function Page(){if(process.env.NODE_ENV!=="development")notFound();return <main className="main-region"><BillingAccess initial={${JSON.stringify(entitlement)}} userId="settings-fixture"><SettingsForm preferences={${JSON.stringify(preferences)}}/></BillingAccess></main>}`);
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "3124"], {
    cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "development", NODE_DISABLE_COMPILE_CACHE: "1", MSJOURNAL_BILLING_UI_CHECK: "true", MSJOURNAL_WHOP_SANDBOX: "false", WHOP_CHECKOUT_ENABLED: "false", WHOP_LIVE_VERIFIED: "false" },
  });
  for (const stream of [server.stdout, server.stderr]) stream.on("data", c => { logs = (logs + c).slice(-18000); });
  const deadline = Date.now() + 90000;
  while (!logs.includes("Ready")) {
    if (server.exitCode !== null || Date.now() > deadline) throw Error("Settings preview could not start.");
    await new Promise(r => setTimeout(r, 400));
  }
  console.log("Settings fixture ready; checking themes, mobile and form behavior.");
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, reducedMotion: "reduce" });
  await page.route("**/api/billing", r => r.fulfill({ json: entitlement }));
  await page.route("**/api/auth/**", r => r.fulfill({ status: 503, json: { message: "Fixture authentication withheld." } }));
  let saved = null;
  await page.route("**/api/preferences", r => {
    assert.equal(r.request().method(), "PATCH"); saved = r.request().postDataJSON();
    return r.fulfill({ json: { ...saved, email: preferences.email } });
  });
  const response = await page.goto(origin + "/settings-ui-check", { waitUntil: "networkidle", timeout: 120000 });
  assert.equal(response.status(), 200);
  await page.getByRole("heading", { name: "Profile & display", exact: true }).waitFor();
  assert.equal(await page.getByText("Data & backups", { exact: true }).count(), 0);
  assert.equal(await page.getByRole("link", { name: "Manage plan & billing", exact: true }).getAttribute("href"), "/settings/billing");
  assert.equal(await page.getByLabel("Email", { exact: false }).getAttribute("readonly"), "");
  assert.equal(await page.getByRole("button", { name: "Save preferences" }).isDisabled(), true);
  const name = page.getByLabel("Display name", { exact: false });
  await page.waitForFunction(() => document.querySelector('input[autocomplete="name"]')?.value === "Demo Trader");
  await name.fill("My review workspace");
  assert.equal(await name.inputValue(), "My review workspace");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await page.getByText("Preferences saved.", { exact: true }).waitFor();
  assert.equal(saved.displayName, "My review workspace");
  assert.equal(saved.displayTimezone, "Asia/Jerusalem");
  await name.fill("Unsaved display name");
  await page.getByRole("button", { name: "Choose appearance", exact: true }).click();
  await page.getByRole("button", { name: "Dark", exact: false }).click();
  await page.keyboard.press("Escape");
  assert.equal(await name.inputValue(), "Unsaved display name");
  assert.equal(await page.getByText("Preferences saved.", { exact: true }).count(), 0);
  assert.equal(await page.getByLabel("Current password", { exact: true }).getAttribute("type"), "password");
  for (const [theme, width, height] of [["light",1440,1080],["dark",1440,1080],["light",390,844],["dark",390,844]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(theme => document.documentElement.classList.toggle("dark", theme === "dark"), theme);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${theme} ${width}: horizontal overflow`);
    await page.screenshot({ path: resolve(output, `settings-${theme}-${width}.png`), fullPage: true });
  }
  console.log("Passed: billing navigation, removed backup section, preference save, preserved draft across theme change, password fields, light/dark desktop/mobile and no overflow.");
} catch (error) {
  if (page) await page.screenshot({ path: resolve(output, "failure.png"), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser?.close();
  if (server?.pid) {
    if (process.platform === "win32") { try { execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }); } catch {} }
    else server.kill("SIGTERM");
  }
  if (created) { await unlink(resolve(route,"page.tsx")); await rmdir(route); }
  await mkdir(output,{ recursive: true }); await writeFile(resolve(output,"server.log"),logs);
}
