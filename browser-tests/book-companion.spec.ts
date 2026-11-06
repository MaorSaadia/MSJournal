import { test,expect as baseExpect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { disposableUser,cleanupUsers,fillPassword } from "./fixture-users";
import { templates, legacyTemplates } from "../lib/book/templates";
import { emptyFields, type WorksheetData } from "../lib/book/model";
const origin=process.env.MSJOURNAL_BROWSER_ORIGIN ?? "http://localhost:3000";
const authOrigin=process.env.MSJOURNAL_TEST_AUTH_ORIGIN ?? origin;
const expect=baseExpect.configure({timeout:30000});
test.use({baseURL:origin});
test.afterEach(()=>cleanupUsers());

test("public book pages, temporary drafts, all blank downloads and mobile themes",async({page,request})=>{
  test.setTimeout(180000);
  page.setDefaultNavigationTimeout(60000);
  await mkdir("artifacts/book/browser",{recursive:true});
  await page.emulateMedia({reducedMotion:"reduce"});
  const response=await page.goto("/book");expect(response?.status()).toBe(200);
  expect(await response!.text()).toContain("No subscription required");
  await expect(page.locator(".book-card")).toHaveCount(4);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href","https://ms-journal.vercel.app/book");
  await expect(page.getByRole("searchbox")).toHaveCount(0);
  for(const theme of ["light","dark"]){await page.evaluate(t=>{localStorage.setItem("theme",t);document.documentElement.classList.toggle("dark",t==="dark");},theme);for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.screenshot({path:`artifacts/book/browser/directory-${theme}-${width}.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}}
  const t=templates[0];await page.goto(`/book/${t.slug}`);
  await page.getByLabel("My setup, market, and trading hours",{exact:true}).fill("A missed entry after preparation");
  await page.getByRole("link",{name:"Back to worksheets",exact:false}).click();
  await page.goto(`/book/${t.slug}`);await expect(page.getByLabel("My setup, market, and trading hours",{exact:true})).toHaveValue("A missed entry after preparation");
  expect(page.url()).not.toContain("missed%20entry");
  await page.screenshot({path:"artifacts/book/browser/reset-mobile.png",fullPage:true});
  for(const t of templates){const pdf=await request.get(`/book/downloads/${t.slug}.pdf`);expect(pdf.status()).toBe(200);expect(pdf.headers()["content-type"]).toContain("application/pdf");expect(pdf.headers()["x-robots-tag"]).toContain("noindex");}
  const workbook=await request.get("/book/downloads/workbook.pdf");expect(workbook.status()).toBe(200);
  expect((await request.get("/book/not-a-worksheet")).status()).toBe(404);
  expect((await request.get("/api/worksheets")).status()).toBe(401);
});

test("session estimate, reset navigation, count feedback and unclipped guest printing",async({page})=>{
  test.setTimeout(120000);page.setDefaultTimeout(30000);
  await page.goto("/book/my-trading-session-sheet");
  await page.getByLabel("Estimated risk per unit",{exact:true}).fill("12.5");
  await expect(page.getByLabel("Estimated total",{exact:true})).toHaveValue("");
  await page.getByLabel("Units",{exact:true}).fill("3");
  await expect(page.getByLabel("Estimated total",{exact:true})).toHaveValue("37.5");
  await page.getByRole("radio",{name:"Observe only",exact:true}).check();
  await expect(page.getByRole("radio",{name:"Trade my plan",exact:true})).not.toBeChecked();
  await page.getByRole("link",{name:"reset card in Appendix C",exact:false}).click();
  await expect(page.locator(".reset-instruction")).toHaveCount(4);
  await page.goto("/book/my-trading-session-sheet");
  await expect(page.getByLabel("Estimated total",{exact:true})).toHaveValue("37.5");
  await page.getByLabel("Estimated risk per unit",{exact:true}).clear();
  await expect(page.getByLabel("Estimated total",{exact:true})).toHaveValue("");
  await page.goto("/book/review-one-pattern-practice-one-change");
  await page.getByLabel("Times the trigger occurred",{exact:true}).fill("0");
  await expect(page.locator(".worksheet-validation")).toContainText("No opportunity to practice.");
  await page.getByLabel("I followed my rule",{exact:true}).fill("-1");
  await expect(page.locator(".worksheet-count-warning")).toContainText("nonnegative whole");
  await page.reload();await expect(page.getByLabel("I followed my rule",{exact:true})).toHaveValue("-1");
  const long="A detailed reflection with complete context and qualifications. ".repeat(55)+" End of long answer.";
  await page.getByLabel("My reason",{exact:true}).fill(long);
  await page.emulateMedia({media:"print"});
  await expect(page.locator(".book-local-print")).toBeVisible();
  await expect(page.locator(".worksheet-print")).toContainText("End of long answer.");
  for(const format of ["A4","Letter"] as const)await page.pdf({path:`artifacts/book/browser/current-completed-${format}.pdf`,format,printBackground:true});
  await page.emulateMedia({media:"screen"});
  for(const slug of ["my-personal-trading-plan","my-trading-session-sheet","after-a-missed-trade-or-loss","review-one-pattern-practice-one-change"]){
    await page.goto(`/book/${slug}`);
    for(const theme of ["light","dark"]){await page.evaluate(t=>document.documentElement.classList.toggle("dark",t==="dark"),theme);for(const width of [1440,390]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`artifacts/book/browser/current-${slug}-${theme}-${width}.png`,fullPage:true});}}
  }
  await page.goto("/book/account-and-prop-firm-fact-sheet");await expect(page.getByText("PREVIOUS EDITION",{exact:true})).toBeVisible();
});

test("guest transfer, failed-save recovery, completed revisions, privacy and owned links",async({page,browser})=>{
  test.skip(process.env.MSJOURNAL_TEST_DISPOSABLE!=="true" || process.env.AUTH_REQUIRE_EMAIL_VERIFICATION==="true","Disposable users with verification disabled only");
  test.setTimeout(240000);page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(60000);
  // Local production-mode verification uses a production-style auth origin;
  // the real deployed app uses its own origin and needs no interception.
  if(authOrigin!==origin)await page.route("**/api/**",async route=>{if(!["GET","HEAD"].includes(route.request().method())){const response=await route.fetch({headers:{...route.request().headers(),origin:authOrigin}});await route.fulfill({response});}else await route.fallback();});
  const t=templates[0];
  await page.goto(`/book/${t.slug}`);
  await page.getByLabel("My setup, market, and trading hours",{exact:true}).fill("Prepared response from the book");
  const user=disposableUser();
  // Exercise the existing signup flow and its safe return destination.
  await page.goto(`/signup?next=${encodeURIComponent(`/book/${t.slug}`)}`);
  await page.getByLabel("Name",{exact:true}).fill(user.name);
  await page.getByLabel("Email",{exact:true}).fill(user.email);
  await fillPassword(page,"Password",user.password);
  await fillPassword(page,"Confirm password",user.password);
  const signupResult=page.waitForResponse(r=>new URL(r.url()).pathname==="/api/auth/sign-up/email" && r.request().method()==="POST");
  await page.getByRole("button",{name:"Create account",exact:false}).click();
  const signupResponse=await signupResult;if(signupResponse.status()!==200){const error=await signupResponse.json();throw new Error(`Disposable signup rejected: status ${signupResponse.status()}, code ${error.code ?? "unknown"}`);}
  await expect(page).toHaveURL(new RegExp(`/book/${t.slug}`),{timeout:30000});
  await expect(page.getByText("A temporary draft is ready",{exact:true})).toBeVisible();
  let fail=true;
  await page.route("**/api/worksheets",async route=>{if(route.request().method()==="POST" && fail){await route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({message:"Temporary failure; your draft is kept."})});}else await route.fallback();});
  await page.getByRole("button",{name:"Save browser draft to my account",exact:true}).click();
  await page.getByRole("button",{name:"Save new entry",exact:true}).click();
  await expect(page.locator(".worksheet-error")).toContainText("Temporary failure");
  expect(await page.evaluate(slug=>sessionStorage.getItem(`msjournal.book.guest.v1.${slug}`)!==null,t.slug)).toBe(true);
  fail=false;await page.getByRole("button",{name:"Retry save",exact:true}).click();
  await expect(page).toHaveURL(/\/worksheets\/[0-9a-f-]+$/,{timeout:30000});
  await expect(page.getByLabel("My setup, market, and trading hours",{exact:true})).toHaveValue("Prepared response from the book");
  expect(await page.evaluate(slug=>sessionStorage.getItem(`msjournal.book.guest.v1.${slug}`)===null,t.slug)).toBe(true);
  const id=new URL(page.url()).pathname.split("/").pop()!;
  // A failed existing-entry save also survives a full reload, scoped to its owner.
  await page.route(`**/api/worksheets/${id}`,async route=>{if(route.request().method()==="PATCH")await route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({message:"Temporary update failure"})});else await route.fallback();});
  await page.getByLabel("My setup, market, and trading hours",{exact:true}).fill("Recovered after an interrupted save");
  await expect(page.locator(".worksheet-error")).toContainText("Temporary update failure",{timeout:30000});
  await page.unroute(`**/api/worksheets/${id}`);await page.reload();
  await page.getByRole("button",{name:"Restore unsaved edits",exact:true}).click();
  await expect(page.locator('.worksheet-toolbar [role="status"]')).toContainText("Saved");
  await expect(page.getByLabel("My setup, market, and trading hours",{exact:true})).toHaveValue("Recovered after an interrupted save");
  await page.locator(".worksheet-menu>summary").filter({hasText:"More"}).click();
  await page.getByRole("button",{name:"Mark complete",exact:true}).click();
  await expect(page.locator('.worksheet-toolbar [role="status"]')).toContainText("Saved");
  await page.locator(".worksheet-menu>summary").filter({hasText:"More"}).click();
  let first=await (await page.request.get(`/api/worksheets/${id}`)).json() as WorksheetData;
  await page.getByLabel("My setup, market, and trading hours",{exact:true}).fill("Revised after a completed version");
  await page.getByRole("button",{name:"Save now",exact:true}).click();await expect(page.locator('.worksheet-toolbar [role="status"]')).toContainText("Saved");
  const next=await (await page.request.get(`/api/worksheets/${id}`)).json() as WorksheetData;
  expect(next.revision).toBeGreaterThan(first.revision);expect(next.status).toBe("draft");
  const history=await (await page.request.get(`/api/worksheets/${id}?history=1`)).json();expect(history.some((r:{status:string;revision:number})=>r.status==="reviewed" && r.revision===first.revision)).toBe(true);
  const stale=await page.request.patch(`/api/worksheets/${id}`,{headers:{Origin:authOrigin},data:{revision:first.revision,fields:first.fields,status:"draft"}});expect(stale.status()).toBe(409);
  // Save the same create request twice: one entry, never an overwritten payload.
  const create={templateId:templates[0].id,clientId:randomUUID(),fields:emptyFields(templates[0]),status:"draft"};
  const created=await (await page.request.post("/api/worksheets",{headers:{Origin:authOrigin},data:create})).json();
  const retried=await (await page.request.post("/api/worksheets",{headers:{Origin:authOrigin},data:create})).json();expect(retried.id).toBe(created.id);
  expect((await page.request.post("/api/worksheets",{headers:{Origin:authOrigin},data:{...create,fields:{...create.fields,title:"Different retry"}}})).status()).toBe(409);
  const outsider=await browser.newContext({baseURL:origin});
  try{
    expect((await outsider.request.post("/api/auth/sign-up/email",{headers:{Origin:authOrigin},data:disposableUser()})).status()).toBe(200);
    for(const method of ["get","patch","delete","post"] as const){const resp=await outsider.request[method](`/api/worksheets/${id}`,{headers:{Origin:authOrigin},...(method==="patch"?{data:{revision:next.revision,fields:next.fields,status:"draft"}}:method==="delete"?{data:{revision:next.revision}}:{})});expect(resp.status()).toBe(404);}
    const print=await outsider.request.get(`/worksheets/${id}/print?revision=${first.revision}`);expect(print.status()).toBe(404);expect(await print.text()).not.toContain("Prepared response from the book");
    const account=await (await page.request.post("/api/trading-accounts",{headers:{Origin:authOrigin},data:{displayName:"Worksheet link fixture",firmChoice:"Apex Trader Funding",customFirm:"",platform:"Tradovate",brokerIdentifier:"",stage:"Evaluation",status:"Active",nominalSize:"50000",openingBalance:"",openingBalanceDate:"",currency:"USD",reportingTimezone:"Asia/Jerusalem",notes:""}})).json();
    expect(account.account?.id).toBeTruthy();
    const linked={...emptyFields(legacyTemplates[1]),link:{kind:"account",id:account.account.id}};
    expect((await outsider.request.post("/api/worksheets",{headers:{Origin:authOrigin},data:{templateId:"B-1",clientId:randomUUID(),fields:linked,status:"draft"}})).status()).toBe(404);
    expect((await page.request.post("/api/worksheets",{headers:{Origin:authOrigin},data:{templateId:"B-1",clientId:randomUUID(),fields:linked,status:"draft"}})).status()).toBe(201);
  }finally{await outsider.close();}
  // Completed print expands long answers and repeated rows, on both paper sizes.
  const f=legacyTemplates[5],fields=emptyFields(f);fields.title="Long print fixture";fields.retrospective=true;fields.retrospectiveNote="Reconstruction clearly labeled";
  const table=f.blocks.find(b=>b.id==="f-1988");expect(table?.kind).toBe("table");
  if(table?.kind==="table")fields.answers[table.id]={rows:Array.from({length:12},(_,i)=>({id:randomUUID(),cells:Object.fromEntries(table.columns.map(c=>[c.id,{state:"value" as const,value:c.id==="c4"?"Retrospective":`Record ${i+1}: `+"Detailed decision evidence and uncertainty. ".repeat(12)}]))}))};
  const printable=await (await page.request.post("/api/worksheets",{headers:{Origin:authOrigin},data:{templateId:f.id,clientId:randomUUID(),fields,status:"reviewed"}})).json();
  await page.goto(`/worksheets/${printable.id}/print?revision=1`);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content","noindex, nofollow");
  await expect(page.locator(".worksheet-print")).toContainText("Record 12:");
  await mkdir("artifacts/book/browser",{recursive:true});
  for(const format of ["A4","Letter"] as const)await page.pdf({path:`artifacts/book/browser/completed-${format}.pdf`,format,printBackground:true});
  const oldEntry=await (await page.request.get(`/api/worksheets/${printable.id}`)).json();
  expect(oldEntry.template.id).toBe(f.id);expect(oldEntry.fields.title).toBe("Long print fixture");
  await page.goto("/worksheets");
  await expect(page.getByRole("heading",{name:"Previous edition",exact:true})).toBeVisible();
  await expect(page.getByRole("link",{name:"Long print fixture",exact:true})).toBeVisible();
  first=next;
  expect((await page.request.delete(`/api/worksheets/${id}`,{headers:{Origin:authOrigin},data:{revision:first.revision}})).status()).toBe(200);
  expect((await page.request.get(`/api/worksheets/${id}`)).status()).toBe(404);
});


test("personalized reset reading view and compact keyboard menus",async({page})=>{
  test.skip(process.env.MSJOURNAL_TEST_DISPOSABLE!=="true" || process.env.AUTH_REQUIRE_EMAIL_VERIFICATION==="true","Disposable users only");
  test.setTimeout(90000);
  expect((await page.request.post("/api/auth/sign-up/email",{headers:{Origin:authOrigin},data:disposableUser()})).status()).toBe(200);
  const t=templates[2],fields=emptyFields(t);fields.title="My personal reset";
  fields.answers["first-sign"]={state:"value",value:"I start chasing a missed entry"};
  fields.answers.pause={state:"value",value:"Step away and check open orders"};
  fields.answers.done={state:"value",value:"My session limit is reached"};
  const response=await page.request.post("/api/worksheets",{headers:{Origin:authOrigin},data:{templateId:t.id,clientId:randomUUID(),fields,status:"draft"}});
  expect(response.status()).toBe(201);const entry=await response.json();
  await page.goto(`/worksheets/${entry.id}`);
  await expect(page.locator("#worksheet-prepare-reset .reset-personal-rule")).toHaveCount(3);
  await expect(page.locator(".reset-instruction")).toHaveCount(4);
  await expect(page.locator(".reset-personal-rule").getByText("Step away and check open orders",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Edit",exact:true}).click();
  await expect(page.getByLabel("When I notice it, I’ll pause by",{exact:true})).toHaveValue("Step away and check open orders");
  await page.locator(".worksheet-menu>summary").filter({hasText:"More"}).click();
  await page.getByRole("button",{name:"Rename",exact:true}).click();
  await expect(page.getByLabel("Entry title",{exact:true})).toBeFocused();
  await expect(page.locator(".worksheet-menu[open]")).toHaveCount(0);
  const print=page.locator(".worksheet-menu>summary").filter({hasText:"Print / PDF"});
  await print.focus();await page.keyboard.press("Enter");
  await expect(page.getByRole("button",{name:"Print my answers",exact:true})).toBeVisible();
  await page.keyboard.press("Escape");await expect(print).toBeFocused();
});

test("saved worksheet blank printing excludes the workspace heading and leading page",async({page})=>{
  test.skip(process.env.MSJOURNAL_TEST_DISPOSABLE!=="true" || process.env.AUTH_REQUIRE_EMAIL_VERIFICATION==="true","Disposable users only");
  test.setTimeout(90000);
  expect((await page.request.post("/api/auth/sign-up/email",{headers:{Origin:authOrigin},data:disposableUser()})).status()).toBe(200);
  const template=templates[0];
  const created=await page.request.post("/api/worksheets",{headers:{Origin:authOrigin},data:{templateId:template.id,clientId:randomUUID(),fields:emptyFields(template),status:"draft"}});
  expect(created.status()).toBe(201);
  const entry=await created.json();await page.goto(`/worksheets/${entry.id}`);
  await expect(page.locator(".worksheets-workspace>.page-header")).toBeVisible();
  await page.evaluate(()=>{window.print=()=>{};});
  await page.locator(".worksheet-menu>summary").filter({hasText:"Print / PDF"}).click();
  await page.getByRole("button",{name:"Print blank",exact:true}).click();
  await page.emulateMedia({media:"print"});
  await expect(page.locator(".worksheets-workspace>.page-header")).toBeHidden();
  await expect(page.locator(".desktop-sidebar")).toBeHidden();
  await expect(page.locator(".skip-link")).toBeHidden();
  await expect(page.locator(".book-local-print .companion-print")).toBeVisible();
  await mkdir("artifacts/book/browser",{recursive:true});
  for(const format of ["A4","Letter"] as const)await page.pdf({path:`artifacts/book/browser/saved-blank-${format}.pdf`,format,printBackground:true,preferCSSPageSize:true});
});
