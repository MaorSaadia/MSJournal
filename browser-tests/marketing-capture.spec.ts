import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import sharp from "sharp";
import { disposableUser, cleanupUsers } from "./fixture-users";
import { csv, performance } from "../tests/fixtures/tradovate";
import { customTrackingRules } from "../lib/props/tracking-rules";
import { toLegacyRules } from "../lib/props/presets";
import { emptyFields } from "../lib/reviews/model";

const origin=process.env.MSJOURNAL_BROWSER_ORIGIN ?? "http://localhost:3000";
test.use({baseURL:origin});test.afterEach(()=>cleanupUsers());
test("capture current product screens with one isolated illustrative account",async({page})=>{
  test.skip(process.env.MSJOURNAL_CAPTURE_MARKETING!=="true","Explicit asset-generation task only");
  test.setTimeout(300000);page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(60000);
  await mkdir("artifacts/marketing/raw",{recursive:true});await mkdir("public/marketing",{recursive:true});
  await page.emulateMedia({colorScheme:"dark",reducedMotion:"reduce"});
  await page.addInitScript(()=>localStorage.setItem("theme","dark"));
  const headers={Origin:origin};
  expect((await page.request.post("/api/auth/sign-up/email",{headers,data:{...disposableUser(),name:"Demo Trader"}})).status()).toBe(200);
  const created=await page.request.post("/api/trading-accounts",{headers,data:{displayName:"Evergreen Evaluation",firmChoice:"Other",customFirm:"Evergreen Demo",platform:"Tradovate",brokerIdentifier:"",stage:"Evaluation",status:"Active",nominalSize:"50000",openingBalance:"50000",openingBalanceDate:"2026-10-01",currency:"USD",reportingTimezone:"UTC",notes:"Illustrative marketing data"}});
  expect(created.status()).toBe(201);const account=(await created.json()).account;
  expect((await page.request.post("/api/balances",{headers,data:{action:"baseline",accountId:account.id,amount:"50000",date:"2026-09-30"}})).status()).toBe(200);
  const rules=customTrackingRules();rules.product="50K Evaluation";rules.size="50000";rules.ledgerStart="50000";rules.manualConfirmed=true;
  Object.assign(rules.session,{timezone:"America/Chicago",reset:"17:00",close:"16:00",confirmed:true});
  Object.assign(rules.drawdown,{mode:"End-of-day trailing",distance:"2000",initialThreshold:"48000",highWater:"50000",cap:"50000"});
  rules.consistency.status="disabled";rules.evaluation.target="3000";rules.evaluation.tradingDays=5;
  expect((await page.request.post("/api/prop-progress",{headers,data:{action:"phase",accountId:account.id,previousId:null,kind:"Evaluation",label:"Evergreen evaluation",startLocal:"2026-10-01T00:00:00",baseline:"50000",historyConfirmed:true,note:"Illustrative demo data",initialRules:toLegacyRules(rules)}})).status()).toBe(200);
  const days=[1,2,5,6,7,8,9,12,13,14,15,16,19,20,21,22,23,26,27,28,29,30];
  const profits=[125,-85,210,45,-110,180,-60,245,90,-130,155,75,-95,260,120,-70,185,35,-145,230,100,65];
  const rows=days.map((day,i)=>performance({symbol:"MNQZ6",buyFillId:String(780000+i*2),sellFillId:String(780001+i*2),qty:"1",buyPrice:"20000",sellPrice:String(20000+profits[i]/2),pnl:String(profits[i]),boughtTimestamp:`10/${String(day).padStart(2,"0")}/2026 14:35:00`,soldTimestamp:`10/${String(day).padStart(2,"0")}/2026 14:42:00`,duration:"7min"}));
  const input={accountId:account.id,timezone:"UTC",confirmPerformance:"true",confirmOrders:"false",feeTotal:"45.76",performance:{name:"illustrative-performance.csv",mimeType:"text/csv",buffer:Buffer.from(csv("performance",rows))}};
  const previewResponse=await page.request.post("/api/imports/preview",{headers,multipart:input});expect(previewResponse.status()).toBe(200);const preview=await previewResponse.json();
  expect((await page.request.post("/api/imports/confirm",{headers,multipart:{...input,token:preview.token,feeFingerprint:preview.feeReview.fingerprint}})).status()).toBe(200);
  const journal=await (await page.request.get(`/api/journal?accounts=${account.id}&outcomeBasis=portions`)).json();const record=journal.rows[0];expect(record.id).toBeTruthy();
  const notes=emptyFields();notes.entryRationale="Waited for price to return to the planned level. The entry qualified before I placed the order.";notes.management="Kept the original stop. Followed the planned exit without adding risk.";notes.wentWell="Patient entry. Size stayed within my session plan.";notes.lesson="Repeat the preparation. Let the next setup come to me.";notes.adherence="followed";notes.emotions={before:["Focused"],during:["Calm"],after:["Calm"]};
  expect((await page.request.post("/api/reviews",{headers,data:{recordId:record.id,revision:0,status:"reviewed",fields:notes}})).status()).toBe(200);
  // Original local chart illustration. No market-data provider or object storage.
  const candles=Array.from({length:64},(_,i)=>{const close=360-i*3.2+Math.sin(i*.65)*24,open=close+Math.sin(i*2.2)*13,x=60+i*16;return `<line x1="${x}" x2="${x}" y1="${Math.min(open,close)-13}" y2="${Math.max(open,close)+15}" stroke="${close<open ? '#37cda4':'#dd6c7b'}"/><rect x="${x-4}" y="${Math.min(open,close)}" width="8" height="${Math.max(3,Math.abs(close-open))}" fill="${close<open ? '#37cda4':'#dd6c7b'}"/><rect x="${x-4}" y="${495-(i%7)*5}" width="8" height="${25+(i%7)*5}" fill="#37cda4" opacity=".14"/>`;}).join("");
  const grid=Array.from({length:6},(_,i)=>`<line x1="35" x2="1165" y1="${85+i*70}" y2="${85+i*70}" stroke="#263238"/><text x="1170" y="${90+i*70}" fill="#7e9699" font-size="12">${20100-i*25}</text>`).join("");
  const chart=await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="560"><rect width="1240" height="560" fill="#101a1e"/><text x="35" y="35" font-family="Arial" font-size="17" fill="#b7cacb">MNQ · Illustrative trade chart</text>${grid}${candles}<line x1="35" x2="1165" y1="345" y2="345" stroke="#bd9ef6" stroke-dasharray="5 5"/><text x="45" y="337" fill="#bd9ef6" font-family="Arial" font-size="12">Planned entry</text><text x="35" y="545" fill="#7e9699" font-family="Arial" font-size="12">14:30                         14:35                         14:40                         14:45</text></svg>`)).png().toBuffer();
  const lightGrid=grid.replaceAll("#263238","#dce5df").replaceAll("#7e9699","#61796c");
  const lightChart=await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="560"><rect width="1240" height="560" fill="#fbfdfc"/><text x="35" y="35" font-family="Arial" font-size="17" fill="#39584a">MNQ · Illustrative trade chart</text>${lightGrid}${candles.replaceAll("#37cda4","#119568")}<line x1="35" x2="1165" y1="345" y2="345" stroke="#8a61c0" stroke-dasharray="5 5"/><text x="45" y="337" fill="#8a61c0" font-family="Arial" font-size="12">Planned entry</text><text x="35" y="545" fill="#61796c" font-family="Arial" font-size="12">14:30                         14:35                         14:40                         14:45</text></svg>`)).png().toBuffer();
  let captureTheme:"dark"|"light"="dark";
  await page.route(/\/api\/reviews(?:\?|$)/,async route=>{const response=await route.fetch();const json=await response.json();await route.fulfill({response,json:{...json,storageEnabled:true,images:[{id:"00000000-0000-4000-8000-000000000001",caption:"Planned entry and trade management · Demo",stage:"after",position:0,width:1240,height:560,revision:1}]}});});
  await page.route("**/api/reviews/screenshots/*",route=>route.fulfill({status:200,contentType:"image/png",body:captureTheme === "light" ? lightChart:chart}));
  async function capture(name:string,url:string,ready:string){
    console.log(`Capturing ${captureTheme} ${name}`);
    await page.setViewportSize({width:1600,height:1050});await page.goto(url,{waitUntil:"load",timeout:120000});await expect(page.locator(ready).first()).toBeVisible({timeout:90000});
    await page.addStyleTag({content:"nextjs-portal{display:none!important}*,*::before,*::after{animation:none!important;transition:none!important}"});
    await page.getByRole("button",{name:"Choose appearance",exact:true}).first().click();
    await page.locator(".theme-menu .menu-option").filter({hasText:captureTheme === "light" ? "Light":"Dark"}).click();
    await page.keyboard.press("Escape");
    await expect(page.locator("html")).toHaveClass(captureTheme === "dark" ? /dark/:/light/);
    if(name === "review")await page.locator(".review-chart-image img").evaluate((img:HTMLImageElement)=>{img.src=img.src.split("?")[0]+`?capture=${Date.now()}`;});
    if(name === "review")await expect(page.locator(".review-chart-image img")).toHaveJSProperty("complete",true);
    await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();});
    await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(500);
    if(name === "review")await page.evaluate(()=>window.scrollTo(0,400));
    const suffix=captureTheme === "light" ? "-light":"";
    const raw=await page.screenshot({path:`artifacts/marketing/raw/${name}${suffix}.png`,animations:"disabled"});
    await sharp(raw).resize(1600,1050).webp({quality:86}).toFile(`public/marketing/${name}${suffix}.webp`);
    // Tighter real desktop composition; no fabricated replacement UI.
    const crops={dashboard:{left:250,top:150,width:750,height:570},calendar:{left:425,top:240,width:750,height:570},review:{left:580,top:110,width:1000,height:760},"prop-accounts":{left:250,top:175,width:975,height:741}};
    await sharp(raw).extract(crops[name as keyof typeof crops]).resize(920,698,{fit:"cover"}).webp({quality:86}).toFile(`public/marketing/${name}${suffix}-mobile.webp`);
  }
  for(const theme of ["dark","light"] as const){captureTheme=theme;
  await capture("dashboard",`/?accounts=${account.id}&start=2026-10-01&end=2026-10-31&basis=net`,".dashboard-connected .metric-card");
  await capture("calendar",`/calendar?accounts=${account.id}&month=2026-10&basis=net&view=grid`,".calendar-day.winning-day");
  await capture("review",`/trade-view/${record.id}?tab=review`,".review-chart-image img");
  await capture("prop-accounts",`/prop-accounts/${account.id}`,".prop-overview-chart, .prop-overview-chart-panel, .prop-account-overview");
  }
});
