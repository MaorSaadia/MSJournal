// Focused visual/interaction fixture. No accounts, payments or database writes.
// The temporary development route is removed even if a browser assertion fails.
import { mkdir, writeFile, unlink, rmdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const root = process.cwd(),
  route = resolve(root, "app/billing-ui-check"),
  port = 3124;
let origin = `http://127.0.0.1:${port}`;
const output = resolve(root, "artifacts/billing/ui");
const initial = {
  userId: "fictional-billing-user",
  timezone: "Asia/Jerusalem",
  plan: "Free",
  usage: 2,
  freeAccountId: null,
  needsSelection: true,
  accounts: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Practice evaluation",
      archived: false,
      writable: false,
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      name: "Funded practice",
      archived: true,
      writable: false,
    },
  ],
  subscription: null,
  checkoutAvailable: false,
  linkingAvailable: false,
  plans: [],
};
let server,
  browser,
  created = false,
  logs = "";
try {
  // mkdir without recursive intentionally refuses to overwrite any existing route.
  await mkdir(route);
  created = true;
  await mkdir(output, { recursive: true });
  await writeFile(
    resolve(route, "page.tsx"),
    `"use client";
import { notFound } from "next/navigation";
import { BillingPage } from "@/components/billing/billing-page";
import { BillingAccess } from "@/components/billing/access";
import { Button } from "@/components/ui/button";
import type { BillingStatus } from "@/lib/billing/status";
const data:BillingStatus=${JSON.stringify(initial)};
export default function Page(){
 if(process.env.NODE_ENV!=="development")notFound();
 return <main className="main-region" style={{paddingTop:24}}><BillingAccess initial={data} userId={data.userId}><BillingPage initial={data}/><div style={{padding:24}}><label>Account label<input aria-label="Account label" defaultValue="My next account"/></label><Button onClick={()=>window.dispatchEvent(new Event("msjournal:upgrade-needed"))}>Attempt another account</Button></div></BillingAccess></main>;
}`,
  );
  let reuse = false;
  try {
    await fetch("http://localhost:3000/icon.svg", {
      signal: AbortSignal.timeout(3000),
    });
    reuse = true;
    origin = "http://localhost:3000";
  } catch {}
  if (!reuse) {
    server = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "dev",
        "--webpack",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(port),
      ],
      {
        cwd: root,
        windowsHide: true,
        env: {
          ...process.env,
          NODE_ENV: "development",
          NODE_DISABLE_COMPILE_CACHE: "1",
          WHOP_CHECKOUT_ENABLED: "false",
          WHOP_LIVE_VERIFIED: "false",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    server.stdout.on("data", (chunk) => {
      logs = (logs + chunk).slice(-18000);
    });
    server.stderr.on("data", (chunk) => {
      logs = (logs + chunk).slice(-18000);
    });
    const deadline = Date.now() + 120000;
    while (!logs.includes("Ready")) {
      if (server.exitCode !== null || Date.now() > deadline)
        throw Error(
          "Local preview did not start; inspect artifacts/billing/ui/server.log",
        );
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  console.log(
    "Local billing fixture ready; checking themes, mobile and keyboard interaction.",
  );
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    reducedMotion: "reduce",
  });
  let status = structuredClone(initial),
    refreshes = 0,
    checkoutOption = null;
  await page.route("**/api/billing", async (route) => {
    if (route.request().method() === "POST") {
      const action = route.request().postDataJSON();
      if (action.action === "checkout") {
        checkoutOption = action.option;
        return route.fulfill({
          status: 400,
          json: { message: "Fixture checkout withheld; no payment was made." },
        });
      }
      if (action.action === "refresh") {
        refreshes++;
        await new Promise((r) => setTimeout(r, 250));
        return route.fulfill({
          status: 503,
          json: { message: "Fixture refresh could not finish. Try again." },
        });
      }
      if (action.action === "select") {
        status = {
          ...status,
          needsSelection: false,
          freeAccountId: action.accountId,
          accounts: status.accounts.map((a) => ({
            ...a,
            writable: a.id === action.accountId,
          })),
        };
      }
    }
    await route.fulfill({ json: status });
  });
  const previewResponse=await page.goto(`${origin}/billing-ui-check`, {
    waitUntil: "networkidle",
    timeout: 120000,
  });
  if(previewResponse?.status()!==200){
    await page.screenshot({path:resolve(output,"preview-error.png"),fullPage:true});
    throw Error(`Temporary preview returned HTTP ${previewResponse?.status()}`);
  }
  try {await page.getByRole("heading",{name:"MSJournal Free"}).first().waitFor({timeout:60000});}
  catch {
    await page.screenshot({path:resolve(output,"preview-error.png"),fullPage:true});
    throw Error("Temporary preview did not render. Inspect artifacts/billing/ui/preview-error.png");
  }
  assert.equal(
    await page.getByRole("heading", { name: "MSJournal Free" }).count(),
    2,
  );
  await page.getByRole("button", { name: "Use this account" }).first().click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByText("Your Free account is selected.", { exact: false })
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Use this account" }).count(),
    0,
  );
  await page
    .getByRole("button", { name: "Refresh subscription status" })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Fixture refresh" })
    .waitFor();
  assert.equal(refreshes, 1);
  await page.getByLabel("Account label").fill("My preserved account details");
  await page.getByRole("button", { name: "Attempt another account" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  const upgrade = dialog.getByRole("link", { name: "Upgrade" });
  assert.equal(await upgrade.getAttribute("target"), "_blank");
  assert.equal(await upgrade.getAttribute("href"), "/settings/billing");
  await upgrade.focus();
  await page.keyboard.press("Tab");
  assert.equal(
    await dialog.evaluate((el) => el.contains(document.activeElement)),
    true,
  );
  await page.screenshot({ path: resolve(output, "upgrade-light.png") });
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert.equal(
    await page.getByLabel("Account label").inputValue(),
    "My preserved account details",
  );
  for (const [theme, width, height] of [
    ["light", 1440, 1100],
    ["dark", 1440, 1100],
    ["light", 390, 844],
    ["dark", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(
      (theme) =>
        document.documentElement.classList.toggle("dark", theme === "dark"),
      theme,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      `${theme} ${width}: horizontal overflow`,
    );
    await page.screenshot({
      path: resolve(output, `billing-${theme}-${width}.png`),
      fullPage: true,
    });
  }
  status = {
    ...status,
    checkoutAvailable: true,
    plans: [
      {
        option: 0,
        interval: "monthly",
        title: "Pro Monthly",
        price: "$9.99/month",
      },
    ],
  };
  await page.reload({ waitUntil: "networkidle" });
  await page
    .getByRole("button", { name: "Upgrade · Pro Monthly · $9.99/month" })
    .waitFor();
  assert.equal(
    await page.getByText("$89.99/year", { exact: false }).count(),
    0,
  );
  status.plans.push({
    option: 1,
    interval: "annual",
    title: "Pro Yearly",
    price: "$89.99/year",
  });
  await page.reload({ waitUntil: "networkidle" });
  await page
    .getByText("Save 25% compared with monthly billing.", { exact: true })
    .waitFor();
  await page
    .getByText("About $7.50/month, billed annually at $89.99.", { exact: true })
    .waitFor();
  await page.screenshot({
    path: resolve(output, "billing-verified-pricing.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Upgrade · Pro Yearly · $89.99/year" })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Fixture checkout withheld" })
    .waitFor();
  assert.equal(checkoutOption, 1);
  await page.goto(`${origin}/billing-ui-check?checkout=pending`, {
    waitUntil: "networkidle",
  });
  await page.getByText("Waiting for subscription confirmation").waitFor();
  assert.equal(
    await page.getByRole("heading", { name: "MSJournal Free" }).count(),
    2,
  );
  // Provider-like paid cancellation is a UI fixture, never a stored entitlement.
  status = {
    ...status,
    plan: "Pro",
    subscription: {
      status: "active",
      cancelAtPeriodEnd: true,
      periodEnd: "2026-12-01T12:00:00Z",
      expiresAt: null,
      verifiedAt: "2026-11-13T10:00:00Z",
      refreshFailed: false,
      manageUrl: "https://sandbox.whop.com/billing/manage/mber_fixture",
    },
    accounts: status.accounts.map((a) => ({ ...a, writable: true })),
  };
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "MSJournal Pro" }).first().waitFor();
  await page
    .getByText("Future renewal is canceled.", { exact: false })
    .waitFor();
  assert.match(
    await page
      .getByRole("link", { name: "Manage subscription" })
      .getAttribute("href"),
    /^https:\/\/sandbox\.whop\.com\/billing\//,
  );
  await page.screenshot({
    path: resolve(output, "billing-pro-cancellation.png"),
    fullPage: true,
  });
  assert.equal((await page.request.get(`${origin}/api/billing`)).status(), 401);
  assert.equal((await page.request.get(`${origin}/book`)).status(), 200);
  assert.equal((await page.request.get(`${origin}/books`)).status(), 200);
  console.log(
    "Passed: Free selection, pending/error behavior, upgrade focus/Escape, preserved form input, both themes/mobile, paid cancellation, private API denial and free public resources.",
  );
} finally {
  await browser?.close();
  if (server?.pid) {
    if (process.platform === "win32")
      try {
        execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
        });
      } catch {}
    else server.kill("SIGTERM");
  }
  if (created) {
    await unlink(resolve(route, "page.tsx"));
    await rmdir(route);
  }
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, "server.log"), logs);
}
