// Disposable, development-only UI fixture. All account requests are mocked.
import { mkdir, writeFile, unlink, rmdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";

const root = process.cwd(), route = resolve(root, "app/weekly-review-ui-check");
const output = resolve(root, "artifacts/settings/weekly-review"), origin = "http://127.0.0.1:3124";
let created = false, server, browser, page, logs = "";
try {
  await mkdir(route); created = true;
  await mkdir(output, { recursive: true });
  await writeFile(resolve(route, "page.tsx"), '"use client";import {CalendarCacheProvider} from "@/components/calendar/cache-provider";import {WeeklyReviewButton} from "@/components/calendar/weekly-review";export default function Page(){return <CalendarCacheProvider userId="fixture" timezone="Asia/Jerusalem" weekStartsOn={0}><main><WeeklyReviewButton query="month=2026-11&accounts=permitted&basis=gross" week="2026-11-15"/></main></CalendarCacheProvider>}');
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
  console.log("Weekly Review fixture ready; checking dialog and cache.");
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, reducedMotion: "reduce" });
  let requests=0;
  await page.route("**/api/weekly-review?**",r=>{requests++;return r.fulfill({json:{userId:"fixture",timezone:"Asia/Jerusalem",facts:{basis:"gross",estimated:false,summary:{count:8,activeDays:4,total:"40"}},wording:{observation:"Across 4 trading days and 8 closed trades, your strongest day returned +$50.00 gross P&L.",practice:"What decision will you practice?"},evidence:[{id:"trade",account:"Practice",symbol:"MNQZ6",exitAt:"2026-11-16",gross:"50",href:"/trade-view/trade"}],processing:{}}});});
  await page.goto(origin+"/weekly-review-ui-check",{waitUntil:"networkidle",timeout:120000});
  await page.getByRole("button",{name:/Review my week/}).click();
  await page.getByRole("heading",{name:"Your week",exact:true}).waitFor();
  assert.equal(await page.getByRole("link",{name:/Practice/}).getAttribute("href"),"/trade-view/trade");
  for(const theme of ["light","dark"])for(const width of [1440,390]){
    await page.evaluate(t=>{document.documentElement.classList.remove("light","dark");document.documentElement.classList.add(t);},theme);
    await page.setViewportSize({width,height:1000});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({path:resolve(output,theme+"-"+width+".png")});
  }
  await page.keyboard.press("Escape");await page.getByRole("button",{name:/Review my week/}).click();
  await page.getByRole("heading",{name:"Your week",exact:true}).waitFor();assert.equal(requests,1);
  console.log("Passed: weekly review opens, real trade destinations render, unchanged selection reuses private cache, Escape closes, both themes/mobile fit.");

} finally {
  await browser?.close();
  if (server?.pid) {
    if (process.platform === "win32") { try { execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }); } catch {} }
    else server.kill("SIGTERM");
  }
  if (created) { await unlink(resolve(route,"page.tsx")); await rmdir(route); }
  await mkdir(output,{ recursive: true }); await writeFile(resolve(output,"server.log"),logs);
}
