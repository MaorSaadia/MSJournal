import { test,expect as baseExpect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { disposableUser,cleanupUsers,fillPassword } from "./fixture-users";
import { templates } from "../lib/book/templates";
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
  await expect(page.locator(".book-card")).toHaveCount(12);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href","https://ms-journal.vercel.app/book");
  await page.getByLabel("Find a worksheet").fill("revenge");await expect(page.locator(".book-card")).toHaveCount(1);
  await page.getByLabel("Find a worksheet").clear();
  for(const theme of ["light","dark"]){await page.evaluate(t=>{localStorage.setItem("theme",t);document.documentElement.classList.toggle("dark",t==="dark");},theme);for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.screenshot({path:`artifacts/book/browser/directory-${theme}-${width}.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}}
  const t=templates[6];await page.goto(`/book/${t.slug}`);
  await page.getByLabel("My recurring cue",{exact:true}).fill("A missed entry after preparation");
  await page.getByRole("link",{name:"All companion worksheets",exact:false}).click();
  await page.goto(`/book/${t.slug}`);await expect(page.getByLabel("My recurring cue",{exact:true})).toHaveValue("A missed entry after preparation");
  expect(page.url()).not.toContain("missed%20entry");
  await page.screenshot({path:"artifacts/book/browser/reset-mobile.png",fullPage:true});
  for(const t of templates){const pdf=await request.get(`/book/downloads/${t.slug}.pdf`);expect(pdf.status()).toBe(200);expect(pdf.headers()["content-type"]).toContain("application/pdf");expect(pdf.headers()["x-robots-tag"]).toContain("noindex");}
  const workbook=await request.get("/book/downloads/workbook.pdf");expect(workbook.status()).toBe(200);
  expect((await request.get("/book/not-a-worksheet")).status()).toBe(404);
  expect((await request.get("/api/worksheets")).status()).toBe(401);
});

test("guest transfer, failed-save recovery, completed revisions, privacy and owned links",async({page,browser})=>{
  test.skip(process.env.MSJOURNAL_TEST_DISPOSABLE!=="true" || process.env.AUTH_REQUIRE_EMAIL_VERIFICATION==="true","Disposable users with verification disabled only");
  test.setTimeout(240000);page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(60000);
  // Local production-mode verification uses a production-style auth origin;
  // the real deployed app uses its own origin and needs no interception.
  if(authOrigin!==origin)await page.route("**/api/**",async route=>{if(!["GET","HEAD"].includes(route.request().method())){const response=await route.fetch({headers:{...route.request().headers(),origin:authOrigin}});await route.fulfill({response});}else await route.fallback();});
  const t=templates[6];
  await page.goto(`/book/${t.slug}`);
  await page.getByLabel("My recurring cue",{exact:true}).fill("Prepared response from the book");
  const user=disposableUser();
  // Exercise the existing signup flow and its safe return destination.
  await page.getByRole("link",{name:"create a free account",exact:true}).click();
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
  await expect(page.getByLabel("My recurring cue",{exact:true})).toHaveValue("Prepared response from the book");
  expect(await page.evaluate(slug=>sessionStorage.getItem(`msjournal.book.guest.v1.${slug}`)===null,t.slug)).toBe(true);
  const id=new URL(page.url()).pathname.split("/").pop()!;
  // A failed existing-entry save also survives a full reload, scoped to its owner.
  await page.route(`**/api/worksheets/${id}`,async route=>{if(route.request().method()==="PATCH")await route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({message:"Temporary update failure"})});else await route.fallback();});
  await page.getByLabel("My recurring cue",{exact:true}).fill("Recovered after an interrupted save");
  await expect(page.locator(".worksheet-error")).toContainText("Temporary update failure",{timeout:30000});
  await page.unroute(`**/api/worksheets/${id}`);await page.reload();
  await page.getByRole("button",{name:"Restore unsaved edits",exact:true}).click();
  await expect(page.locator('.worksheet-toolbar [role="status"]')).toContainText("Saved");
  await expect(page.getByLabel("My recurring cue",{exact:true})).toHaveValue("Recovered after an interrupted save");
  await page.getByRole("button",{name:"Mark complete",exact:true}).click();await expect(page.getByText("Completed by you",{exact:true}).first()).toBeVisible();
  let first=await (await page.request.get(`/api/worksheets/${id}`)).json() as WorksheetData;
  await page.getByLabel("My recurring cue",{exact:true}).fill("Revised after a completed version");
  await page.getByRole("button",{name:"Save now",exact:true}).click();await expect(page.locator('.worksheet-toolbar [role="status"]')).toContainText("Saved");
  const next=await (await page.request.get(`/api/worksheets/${id}`)).json() as WorksheetData;
  expect(next.revision).toBeGreaterThan(first.revision);expect(next.status).toBe("draft");
  const history=await (await page.request.get(`/api/worksheets/${id}?history=1`)).json();expect(history.some((r:{status:string;revision:number})=>r.status==="reviewed" && r.revision===first.revision)).toBe(true);
  const stale=await page.request.patch(`/api/worksheets/${id}`,{headers:{Origin:authOrigin},data:{revision:first.revision,fields:first.fields,status:"draft"}});expect(stale.status()).toBe(409);
  // Save the same create request twice: one entry, never an overwritten payload.
  const create={templateId:"A-1",clientId:randomUUID(),fields:emptyFields(templates[0]),status:"draft"};
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
    const linked={...emptyFields(templates[1]),link:{kind:"account",id:account.account.id}};
    expect((await outsider.request.post("/api/worksheets",{headers:{Origin:authOrigin},data:{templateId:"B-1",clientId:randomUUID(),fields:linked,status:"draft"}})).status()).toBe(404);
    expect((await page.request.post("/api/worksheets",{headers:{Origin:authOrigin},data:{templateId:"B-1",clientId:randomUUID(),fields:linked,status:"draft"}})).status()).toBe(201);
  }finally{await outsider.close();}
  // Completed print expands long answers and repeated rows, on both paper sizes.
  const f=templates[5],fields=emptyFields(f);fields.title="Long print fixture";fields.retrospective=true;fields.retrospectiveNote="Reconstruction clearly labeled";
  const table=f.blocks.find(b=>b.id==="f-1988");expect(table?.kind).toBe("table");
  if(table?.kind==="table")fields.answers[table.id]={rows:Array.from({length:12},(_,i)=>({id:randomUUID(),cells:Object.fromEntries(table.columns.map(c=>[c.id,{state:"value" as const,value:c.id==="c4"?"Retrospective":`Record ${i+1}: `+"Detailed decision evidence and uncertainty. ".repeat(12)}]))}))};
  const printable=await (await page.request.post("/api/worksheets",{headers:{Origin:authOrigin},data:{templateId:f.id,clientId:randomUUID(),fields,status:"reviewed"}})).json();
  await page.goto(`/worksheets/${printable.id}/print?revision=1`);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content","noindex, nofollow");
  await expect(page.locator(".worksheet-print")).toContainText("Record 12:");
  await mkdir("artifacts/book/browser",{recursive:true});
  for(const format of ["A4","Letter"] as const)await page.pdf({path:`artifacts/book/browser/completed-${format}.pdf`,format,printBackground:true});
  first=next;
  expect((await page.request.delete(`/api/worksheets/${id}`,{headers:{Origin:authOrigin},data:{revision:first.revision}})).status()).toBe(200);
  expect((await page.request.get(`/api/worksheets/${id}`)).status()).toBe(404);
});
