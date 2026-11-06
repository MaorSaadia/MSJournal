import {test,expect} from "@playwright/test";
import {mkdir} from "node:fs/promises";
const origin=process.env.MSJOURNAL_BROWSER_ORIGIN ?? "http://localhost:3000";
test.use({baseURL:origin});

test("premium landing previews, keyboard viewer, theme layouts and reduced motion",async({page})=>{
  test.setTimeout(120000);await mkdir("artifacts/marketing/review",{recursive:true});
  await page.emulateMedia({reducedMotion:"reduce"});
  const requested:string[]=[];page.on("request",req=>{if(/\/marketing\/.+\.webp/.test(req.url()))requested.push(req.url());});
  await page.goto("/");
  await expect(page.getByRole("heading",{level:1})).toContainText("Your trades. Your habits.");
  const image=page.locator(".marketing-preview-image img");
  await expect(image).toHaveJSProperty("complete",true);
  expect(await image.evaluate((el:HTMLImageElement)=>el.naturalWidth)).toBeGreaterThan(0);
  expect(requested.some(url=>/\/calendar\.webp/.test(url))).toBe(false);
  expect(requested.some(url=>/\/review\.webp/.test(url))).toBe(false);
  expect(requested.some(url=>/\/prop-accounts\.webp/.test(url))).toBe(false);
  await expect(page.getByRole("button",{name:"Enlarge Dashboard screenshot",exact:true})).toBeEnabled({timeout:30000});
  await page.getByRole("tab",{name:"Dashboard",exact:true}).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab",{name:"Calendar",exact:true})).toHaveAttribute("aria-selected","true");
  await expect(page.getByRole("tabpanel",{name:"Calendar",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Enlarge Calendar screenshot",exact:true}).click();
  await expect(page.getByRole("dialog")).toBeVisible();await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Enlarge Calendar screenshot",exact:true})).toBeFocused();
  for(const label of ["Trade Review","Prop Accounts","Dashboard"])await page.getByRole("tab",{name:label,exact:true}).click();
  await expect(page.locator(".marketing-preview-depth")).toHaveCSS("transform","none");
  for(const img of await page.locator(".marketing-feature-preview picture img").all()){await img.scrollIntoViewIfNeeded();await expect(img).toHaveJSProperty("complete",true);expect(await img.evaluate((el:HTMLImageElement)=>el.naturalWidth)).toBeGreaterThan(0);}
  for(const img of await page.locator(".marketing-feature-preview picture img").all()){const ratio=await img.evaluate((el:HTMLImageElement)=>({rendered:el.getBoundingClientRect().width/el.getBoundingClientRect().height,natural:el.naturalWidth/el.naturalHeight}));expect(Math.abs(ratio.rendered-ratio.natural)).toBeLessThan(.01);}
  const feature=page.getByRole("button",{name:"Inspect Trade review preview",exact:true});await feature.click();await expect(page.getByRole("dialog")).toBeVisible();await page.keyboard.press("Escape");await expect(feature).toBeFocused();
  for(const card of await page.locator(".marketing-feature-row").all()){const frame=await card.boundingBox(),heading=await card.locator("h3").boundingBox();expect(heading!.x).toBeGreaterThanOrEqual(frame!.x);}
  for(const theme of ["dark","light"]){
    await page.getByRole("button",{name:"Choose appearance",exact:true}).click();
    await page.locator(".theme-menu .menu-option").filter({hasText:theme === "light" ? "Light":"Dark"}).click();
    await page.keyboard.press("Escape");
    await expect(page.locator(".marketing-preview-image picture")).toHaveAttribute("data-theme",theme);
    for(const width of [1440,390]){
      await page.setViewportSize({width,height:1000});await page.evaluate(()=>window.scrollTo(0,0));
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await page.screenshot({path:`artifacts/marketing/review/landing-${theme}-${width}.png`,fullPage:true});
      await page.screenshot({path:`artifacts/marketing/review/hero-${theme}-${width}.png`});
    }
  }
  await page.getByLabel("Open navigation",{exact:true}).click();
  await expect(page.getByRole("navigation",{name:"Mobile navigation",exact:true})).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("navigation",{name:"Mobile navigation",exact:true})).toBeHidden();
  await expect(page.getByLabel("Open navigation",{exact:true})).toBeFocused();
  await page.getByRole("link",{name:"Explore the workspace",exact:true}).click();
  await expect(page).toHaveURL(/#workspace$/);
});

test("desktop depth is progressive and coarse/mobile layouts stay still",async({page})=>{
  await page.setViewportSize({width:1440,height:1000});await page.emulateMedia({reducedMotion:"no-preference"});await page.goto("/");
  await expect(page.locator(".marketing-preview-depth")).not.toHaveCSS("transform","none");
  await page.setViewportSize({width:390,height:900});await expect(page.locator(".marketing-preview-depth")).toHaveCSS("transform","none");
  await page.emulateMedia({reducedMotion:"reduce"});await expect(page.locator(".marketing-preview-depth")).toHaveCSS("transform","none");
});

test("landing copy and initial preview remain useful without JavaScript",async({browser})=>{
  const context=await browser.newContext({baseURL:origin,javaScriptEnabled:false,viewport:{width:390,height:900}});
  try{const page=await context.newPage();await page.goto("/");
    await expect(page.getByRole("heading",{level:1})).toBeVisible();
    await expect(page.getByRole("link",{name:"Start your journal",exact:true})).toHaveAttribute("href","/signup");
    await expect(page.locator(".marketing-preview-image img")).toBeVisible();
    await expect(page.locator(".marketing-preview-image img")).toHaveJSProperty("complete",true);
    await page.getByLabel("Open navigation",{exact:true}).click();
    await expect(page.getByRole("navigation",{name:"Mobile navigation",exact:true})).toBeVisible();
  }finally{await context.close();}
});
