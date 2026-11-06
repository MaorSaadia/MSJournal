import {test,expect} from "@playwright/test";
import {mkdir} from "node:fs/promises";
const origin=process.env.MSJOURNAL_BROWSER_ORIGIN ?? "http://localhost:3000";
test.use({baseURL:origin});

test("calendar feature and every preview follow the selected light/dark appearance",async({page})=>{
  test.setTimeout(120000);await mkdir("artifacts/marketing/themes",{recursive:true});
  await page.emulateMedia({reducedMotion:"reduce"});await page.goto("/");
  await expect(page.getByRole("button",{name:"Inspect Trading calendar preview",exact:true})).toBeEnabled({timeout:30000});
  expect(await page.locator(".marketing-feature-row").first().getByRole("img").getAttribute("alt")).toContain("calendar");
  for(const theme of ["light","dark"]){
    await page.getByRole("button",{name:"Choose appearance",exact:true}).click();
    await page.locator(".theme-menu .menu-option").filter({hasText:theme === "light" ? "Light":"Dark"}).click();await page.keyboard.press("Escape");
    for(const label of ["Dashboard","Calendar","Trade Review","Prop Accounts"]){
      await page.getByRole("tab",{name:label,exact:true}).click();
      const image=page.locator(".marketing-preview-image img");
      await expect(page.locator(".marketing-preview-image picture")).toHaveAttribute("data-theme",theme);
      await expect.poll(()=>image.evaluate((img:HTMLImageElement)=>img.currentSrc)).toMatch(theme === "light" ? /-light\.webp$/:/(?<!-light)\.webp$/);
      await expect(image).toHaveJSProperty("complete",true);expect(await image.evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBeGreaterThan(0);
    }
    for(const button of await page.locator(".marketing-feature-preview").all()){
      await button.scrollIntoViewIfNeeded();const img=button.locator("img");
      await expect(button.locator("picture")).toHaveAttribute("data-theme",theme);
      await expect.poll(()=>img.evaluate((node:HTMLImageElement)=>node.currentSrc)).toMatch(theme === "light" ? /-light-feature\.webp$/:/(?<!-light)-feature\.webp$/);
      await expect(img).toHaveJSProperty("complete",true);expect(await img.evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBeGreaterThan(0);
    }
    await page.getByRole("button",{name:"Inspect Trading calendar preview",exact:true}).click();
    await expect(page.locator(".marketing-lightbox picture")).toHaveAttribute("data-theme",theme);
    await expect.poll(()=>page.locator(".marketing-lightbox img").evaluate((node:HTMLImageElement)=>node.currentSrc)).toMatch(theme === "light" ? /calendar-light\.webp$/:/calendar\.webp$/);
    await page.keyboard.press("Escape");
    await page.getByRole("tab",{name:"Dashboard",exact:true}).click();
    for(const width of [1440,390]){
      await page.setViewportSize({width,height:1000});await page.evaluate(()=>scrollTo(0,0));
      await expect.poll(()=>page.locator(".marketing-preview-image img").evaluate((node:HTMLImageElement)=>node.currentSrc)).toMatch(new RegExp(`dashboard${theme === "light" ? "-light":""}${width===390 ? "-mobile":""}\\.webp$`));
      await page.screenshot({path:`artifacts/marketing/themes/landing-${theme}-${width}.png`,fullPage:true});
    }
    await page.setViewportSize({width:1440,height:1000});
  }
});
