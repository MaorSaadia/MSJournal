import { test, expect } from "@playwright/test";
import { disposableUser, cleanupUsers } from "./fixture-users";

const origin = process.env.MSJOURNAL_BROWSER_ORIGIN ?? "http://localhost:3000";
test.use({ baseURL: origin });
test.afterEach(() => cleanupUsers());

test("public SEO, genuine 404s, sharing assets and responsive landing", async ({ page, request }, info) => {
  test.setTimeout(120000);
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle("MSJournal | Futures Trading Journal & Analytics");
  // Next normalizes the homepage canonical by omitting its trailing slash.
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /^https:\/\/ms-journal\.vercel\.app\/?$/);
  const source = await response!.text();
  expect(source).toContain("From CSV to a clearer record");
  expect(source).toContain('application/ld+json');
  expect(source).not.toContain("Disposable journal user");
  expect(await page.locator("h1").count()).toBe(1);
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain("Sitemap: https://ms-journal.vercel.app/sitemap.xml");
  expect(await robots.text()).not.toContain("Disallow: /login");
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  expect(xml).not.toMatch(/login|trade-view|calendar|settings|lastmod/);
  // Production checks run against a local production-mode server.
  if (process.env.MSJOURNAL_SEO_PRODUCTION === "true") {
    expect(xml).toContain("<loc>https://ms-journal.vercel.app/</loc>");
    expect(response?.headers()["x-robots-tag"]).toBeUndefined();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index, follow");
  } else {
    expect(response?.headers()["x-robots-tag"]).toContain("noindex");
  }
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /^https:\/\/ms-journal\.vercel\.app\/opengraph-image/);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
  const image = await request.get("/opengraph-image");
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toContain("image/png");
  const sharp = (await import("sharp")).default;
  const dimensions = await sharp(await image.body()).metadata();
  expect([dimensions.width, dimensions.height]).toEqual([1200, 630]);
  await info.attach("sharing-image", { body: await image.body(), contentType: "image/png" });
  const apple = await request.get("/apple-icon.png");
  expect(apple.status()).toBe(200);
  for (const route of ["/login", "/signup", "/forgot-password", "/reset-password", "/verify-email"]) {
    const auth = await request.get(route);
    expect(auth.status()).toBe(200);
    expect(auth.headers()["x-robots-tag"]).toContain("noindex");
    expect(await auth.text()).toContain('name="robots" content="noindex, nofollow"');
  }
  const privatePage = await request.get("/settings", { maxRedirects: 0 });
  expect([303, 307]).toContain(privatePage.status());
  expect(privatePage.headers().location).toContain("/login");
  expect(privatePage.headers()["x-robots-tag"]).toContain("noindex");
  const forged = await request.get("/settings", { maxRedirects: 0, headers: { "x-msjournal-pathname": "/" } });
  expect([303, 307]).toContain(forged.status());
  expect(forged.headers().location).toContain("/login");
  const privateApi = await request.get("/api/dashboard");
  expect(privateApi.status()).toBe(401);
  expect(privateApi.headers()["x-robots-tag"]).toContain("noindex");
  for (const path of ["/no-such-msjournal-page", "/no-such-msjournal-page/nested"]) {
    expect((await request.get(path)).status()).toBe(404);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => { localStorage.setItem("theme", value); document.documentElement.className = value; }, theme);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`landing-${theme}-${width}.png`), fullPage: true });
    }
  }
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
});

test("signed-in homepage retains private dashboard and does not share or cache account data", async ({ page }) => {
  test.skip(process.env.MSJOURNAL_TEST_DISPOSABLE !== "true", "Disposable account only");
  test.setTimeout(120000);
  expect((await page.request.post("/api/auth/sign-up/email", { headers: { Origin: process.env.MSJOURNAL_TEST_AUTH_ORIGIN ?? origin }, data: disposableUser() })).status()).toBe(200);
  const response = await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  await expect(page).toHaveTitle("Dashboard | MSJournal");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  expect(await page.locator('link[rel="canonical"]').count()).toBe(0);
  expect(response?.headers()["cache-control"]).toMatch(/no-store|no-cache/);
  expect(await page.locator('script[type="application/ld+json"]').count()).toBe(0);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", "MSJournal | Futures Trading Journal & Analytics");
  await page.getByLabel("Dashboard P&L basis", { exact: true }).selectOption("gross");
  await expect(page.getByText("Realized gross P&L", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Calendar", exact: true }).first()).toHaveAttribute("href", /basis=gross/);
  await page.getByRole("link", { name: "Calendar", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Calendar", exact: false })).toBeVisible({ timeout: 30000 });
  await page.getByRole("link", { name: "Dashboard", exact: true }).first().click();
  await expect(page.getByLabel("Dashboard P&L basis", { exact: true })).toHaveValue("gross");
  const anonymous = await page.context().browser()!.newContext({ baseURL: origin });
  try {
    const fresh = await anonymous.newPage();
    await fresh.goto("/");
    await expect(fresh.getByRole("heading", { level: 1 })).toContainText("Your trades. Your habits.");
    expect(await fresh.locator("body").innerText()).not.toContain("Disposable journal user");
  } finally { await anonymous.close(); }
});
