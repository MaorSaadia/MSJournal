import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { orderedBooks } from "../lib/books/catalog";
const origin = process.env.MSJOURNAL_BROWSER_ORIGIN ?? "http://localhost:3000";
test.use({baseURL:origin});

test("book catalog, filters, details and both theme layouts", async ({page}) => {
  test.setTimeout(180000);
  page.setDefaultNavigationTimeout(90000);
  page.setDefaultTimeout(15000);
  await mkdir("artifacts/books/review",{recursive:true});
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto("/books",{waitUntil:"domcontentloaded"});
  await page.addStyleTag({content:"nextjs-portal {display:none !important}"});
  await expect(page.locator("h1")).toHaveText("Your next chapterin trading.");
  await expect(page.locator(".books-catalog .books-card")).toHaveCount(9);
  await expect(page.getByRole("link",{name:/View on Amazon/})).toHaveCount(8);
  for (const category of ["Psychology","Foundations","Strategies","All"]) {
    const link = page.getByRole("navigation",{name:"Book categories"}).getByRole("link",{name:category,exact:true});
    await link.focus(); await page.keyboard.press("Enter");
    await expect(page.locator(".books-catalog .books-card")).toHaveCount(category === "All" ? 9 : category === "Strategies" ? 5 : 2);
    await expect(page.getByRole("navigation",{name:"Book categories"}).getByRole("link",{name:category,exact:true})).toHaveAttribute("aria-current","page");
  }
  for (const theme of ["light","dark"]) {
    await page.getByRole("button",{name:"Choose appearance"}).click();
    await page.locator(".theme-menu .menu-option").filter({hasText:theme === "light" ? "Light" : "Dark"}).click();
    await page.keyboard.press("Escape");
    for (const width of [1440,390]) {
      await page.setViewportSize({width,height:1000}); await page.evaluate(() => scrollTo(0,0));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({path:`artifacts/books/review/catalog-${theme}-${width}.png`});
    }
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.goto("/books/the-institutional-operator-book-1",{waitUntil:"domcontentloaded"});
  await expect(page.locator("h1")).toHaveText("The Institutional Operator");
  await expect(page.locator(".books-detail-intro")).toContainText("From Zero to Funded: The Complete ICT & Smart Money Masterclass");
  for (const theme of ["light","dark"]) {
    await page.getByRole("button",{name:"Choose appearance"}).click();
    await page.locator(".theme-menu .menu-option").filter({hasText:theme === "light" ? "Light" : "Dark"}).click(); await page.keyboard.press("Escape");
    for (const width of [1440,390]) {
      await page.setViewportSize({width,height:1000}); await page.evaluate(() => scrollTo(0,0));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.locator(".books-detail-art img")).toHaveJSProperty("complete",true);
      const ratio=await page.locator(".books-detail-art img").evaluate((el:HTMLImageElement) => ({display:el.clientWidth/el.clientHeight,natural:el.naturalWidth/el.naturalHeight}));
      expect(Math.abs(ratio.display-ratio.natural)).toBeLessThan(.01);
      await page.screenshot({path:`artifacts/books/review/detail-${theme}-${width}.png`});
    }
  }
  await page.goto("/books/the-modern-ict-traders-masterclass",{waitUntil:"domcontentloaded"});
  await expect(page.locator(".books-overlap li")).toHaveCount(3);
  await page.goto("/books/the-consistent-day-trader",{waitUntil:"domcontentloaded"});
  await page.locator(".books-detail-actions").getByRole("link",{name:"Open the free worksheets"}).click();
  await expect(page).toHaveURL(/\/book$/);
  await expect(page.locator(".books-introduction")).toContainText("no book purchase required");
});

test("book HTML is crawlable without JS, with accurate metadata and true missing routes", async ({browser,request}) => {
  test.setTimeout(180000);
  for (const book of orderedBooks) {
    const response = await request.get(`/books/${book.slug}`);
    expect(response.status()).toBe(200);
    const html=await response.text();
    expect(html).toContain(`https://ms-journal.vercel.app/books/${book.slug}`);
    expect(html).toContain('"@type":"Book"');
    if (book.amazonUrl) expect(html).toContain(book.amazonUrl);
    if(book.cover) expect(html).toContain(encodeURIComponent(book.cover.path));
  }
  expect((await request.get("/books/no-such-book")).status()).toBe(404);
  const context=await browser.newContext({javaScriptEnabled:false,baseURL:origin});
  try {
    const page=await context.newPage();
    await page.goto("/books",{waitUntil:"domcontentloaded"});
    await expect(page.locator(".books-catalog .books-card")).toHaveCount(9);
    await page.getByRole("navigation",{name:"Book categories"}).getByRole("link",{name:"Psychology",exact:true}).click();
    await expect(page.locator(".books-catalog .books-card")).toHaveCount(2);
    await page.goto("/",{waitUntil:"domcontentloaded"});
    await expect(page.locator(".books-featured .books-card")).toHaveCount(3);
    await page.locator(".books-featured").getByRole("link",{name:"Browse all books"}).click();
    await expect(page).toHaveURL(/\/books$/);
  } finally { await context.close(); }
});
