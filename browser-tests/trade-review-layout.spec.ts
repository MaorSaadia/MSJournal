import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { disposableUser, cleanupUsers } from "./fixture-users";
import { csv, performance } from "../tests/fixtures/tradovate";
const origin = process.env.MSJOURNAL_BROWSER_ORIGIN ?? "http://localhost:3000";
test.use({ baseURL: origin });
test.afterEach(() => cleanupUsers());
test("combined review preserves notes and shows fixture screenshots beside the assessment", async ({
  page,
  browser,
}, info) => {
  test.skip(
    process.env.MSJOURNAL_TEST_DISPOSABLE !== "true",
    "Disposable fixtures only",
  );
  test.setTimeout(180000);
  page.setDefaultNavigationTimeout(60000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const headers = { Origin: origin };
  expect(
    (
      await page.request.post("/api/auth/sign-up/email", {
        headers,
        data: disposableUser(),
      })
    ).status(),
  ).toBe(200);
  const account = await (
    await page.request.post("/api/trading-accounts", {
      headers,
      data: {
        displayName: "Review layout fixture",
        firmChoice: "Apex Trader Funding",
        customFirm: "",
        platform: "Tradovate",
        brokerIdentifier: "",
        stage: "Evaluation",
        status: "Active",
        nominalSize: "50000",
        openingBalance: "",
        openingBalanceDate: "",
        currency: "USD",
        reportingTimezone: "Asia/Jerusalem",
        notes: "",
      },
    })
  ).json();
  const input = {
    accountId: account.account.id,
    timezone: "UTC",
    confirmPerformance: "true",
    confirmOrders: "false",
    feeTotal: "1.04",
    performance: {
      name: "Performance.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        csv("performance", [
          performance(),
          performance({
            buyFillId: "890001",
            sellFillId: "890002",
            boughtTimestamp: "09/03/2026 16:52:32",
            soldTimestamp: "09/03/2026 16:52:15",
          }),
        ]),
      ),
    },
  };
  const preview = await (
    await page.request.post("/api/imports/preview", {
      headers,
      multipart: input,
    })
  ).json();
  expect(
    (
      await page.request.post("/api/imports/confirm", {
        headers,
        multipart: {
          ...input,
          token: preview.token,
          feeFingerprint: preview.feeReview.fingerprint,
        },
      })
    ).status(),
  ).toBe(200);
  const records = await (
    await page.request.get(
      `/api/journal?accounts=${account.account.id}&outcomeBasis=portions`,
    )
  ).json();
  const recordId = records.rows[0].id;
  // Images are local UI fixtures; no object storage is created or changed.
  let images = [1, 2].map((n) => ({
    id: `00000000-0000-4000-8000-00000000000${n}`,
    caption: n === 1 ? "Entry chart / fixture" : "Exit chart / fixture",
    stage: n === 1 ? "before" : "after",
    position: n - 1,
    width: 1200,
    height: 650,
    revision: 1,
  }));
  const png = await sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="650"><rect width="1200" height="650" fill="#111a23"/><path d="M40 530 L130 480 L210 505 L300 380 L400 420 L520 290 L640 340 L760 210 L900 260 L1040 130 L1160 160" fill="none" stroke="#36b995" stroke-width="5"/><text x="40" y="55" fill="#9cabbc" font-size="24">Synthetic chart / layout fixture</text></svg>`,
    ),
  )
    .png()
    .toBuffer();
  await page.route(/\/api\/reviews(?:\?|$)/, async (route) => {
    const response = await route.fetch();
    if (!response.ok()) {
      await route.fulfill({ response });
      return;
    }
    await route.fulfill({
      response,
      json: { ...(await response.json()), images, storageEnabled: true },
    });
  });
  let deletedId = "";
  await page.route("**/api/reviews/screenshots/*", async (route) => {
    if (route.request().method() === "DELETE") {
      deletedId = new URL(route.request().url()).pathname.split("/").at(-1)!;
      images = images.filter((image) => image.id !== deletedId);
      await route.fulfill({ json: { removed: true } });
    } else
      await route.fulfill({ status: 200, contentType: "image/png", body: png });
  });
  await page.goto(`/trade-view/${recordId}?tab=screenshots`, {
    waitUntil: "domcontentloaded",
  });
  await expect(
    page.getByRole("tab", { name: "Review", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".review-chart-image img")).toBeVisible({
    timeout: 30000,
  });
  const left = await page.locator(".review-assessment").boundingBox(),
    right = await page.locator(".review-visual-main").boundingBox();
  expect(left!.x + left!.width).toBeLessThan(right!.x);
  const chart = await page.locator(".review-chart-stage").boundingBox(),
    notes = await page.locator(".review-trade-notes").boundingBox();
  expect(notes!.y).toBeGreaterThan(chart!.y + chart!.height);
  await page
    .getByRole("textbox", { name: "Entry rationale", exact: true })
    .fill("Waited for the planned entry.\nKept the original risk.");
  await page
    .getByRole("tab", { name: "Lesson for next time", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Lesson for next time", exact: true })
    .fill("Keep the same process next time.");
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get(`/api/reviews?recordId=${recordId}`)
          ).json()
        ).fields.lesson,
    )
    .toBe("Keep the same process next time.");
  const saved = await (
    await page.request.get(`/api/reviews?recordId=${recordId}`)
  ).json();
  expect(saved.fields.entryRationale).toBe(
    "Waited for the planned entry.\nKept the original risk.",
  );
  await page
    .getByRole("textbox", {
      name: "Custom emotion before the trade",
      exact: true,
    })
    .fill("Patient");
  await page
    .getByRole("button", { name: "Add emotion before the trade", exact: true })
    .click();
  await expect(
    page
      .getByRole("group", { name: "Before the trade", exact: true })
      .getByRole("button", { name: "Patient", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get(`/api/reviews?recordId=${recordId}`)
          ).json()
        ).fields.emotions.before,
    )
    .toContain("Patient");
  await page
    .getByRole("textbox", {
      name: "Custom emotion during the trade",
      exact: true,
    })
    .fill("patient");
  await page
    .getByRole("button", { name: "Add emotion during the trade", exact: true })
    .click();
  await expect(
    page
      .getByRole("group", { name: "During the trade", exact: true })
      .getByRole("button", { name: "Patient", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get(`/api/reviews?recordId=${recordId}`)
          ).json()
        ).fields.emotions.during,
    )
    .toEqual(["Patient"]);
  const otherReview = await (
    await page.request.get(`/api/reviews?recordId=${records.rows[1].id}`)
  ).json();
  expect(otherReview.emotionChoices).toContain("Patient");
  const outsider = await browser.newContext({ baseURL: origin });
  expect(
    (
      await outsider.request.post("/api/auth/sign-up/email", {
        headers,
        data: disposableUser(),
      })
    ).status(),
  ).toBe(200);
  expect(
    (await outsider.request.get(`/api/reviews?recordId=${recordId}`)).status(),
  ).toBe(404);
  await outsider.close();
  await page
    .getByRole("button", { name: "Select screenshot 2", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Select screenshot 2", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Enlarge screenshot", exact: true })
    .click();
  await expect(page.locator(".review-image-viewer")).toBeVisible();
  await expect(page.locator(".review-image-viewer img")).toHaveAttribute(
    "src",
    new RegExp(images[1].id),
  );
  await page.keyboard.press("Escape");
  let releaseUpload!: () => void;
  const uploading = new Promise<void>((resolve) => {
    releaseUpload = resolve;
  });
  await page.route("**/api/reviews/screenshots?**", async (route) => {
    await uploading;
    images = [
      ...images,
      {
        ...images[0],
        id: "00000000-0000-4000-8000-000000000003",
        caption: "Uploaded fixture",
        position: 2,
      },
    ];
    const fresh = await (
      await page.request.get(`/api/reviews?recordId=${recordId}`)
    ).json();
    await route.fulfill({
      status: 201,
      json: { ...fresh, images, storageEnabled: true },
    });
  });
  await page.getByText("Manage screenshots", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Choose images", exact: true }),
  ).toBeEnabled();
  await page
    .getByLabel("Chart screenshot files")
    .setInputFiles({ name: "chart.png", mimeType: "image/png", buffer: png });
  await expect(
    page.getByRole("status").filter({ hasText: "Uploading screenshot" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Lesson for next time", exact: true }),
  ).toBeDisabled();
  await page
    .locator(".review-media-pending")
    .screenshot({ path: info.outputPath("screenshot-saving.png") });
  releaseUpload();
  await expect(
    page.getByRole("button", { name: "Select screenshot 3", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".review-media-pending")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Delete selected screenshot", exact: true })
    .click();
  const confirmation = page.getByRole("dialog", {
    name: "Delete this screenshot?",
    exact: true,
  });
  await expect(confirmation).toBeVisible();
  await confirmation
    .getByRole("button", { name: "Delete screenshot", exact: true })
    .click();
  await expect(confirmation).toBeHidden();
  expect(deletedId).toBe("00000000-0000-4000-8000-000000000002");
  await expect(page.locator(".review-chart-thumbnails button")).toHaveCount(2);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (theme) =>
        document.documentElement.classList.toggle("dark", theme === "dark"),
      theme,
    );
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.locator(".review-save-bar").scrollIntoViewIfNeeded();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        )
        .toBe(true);
      await page.screenshot({
        path: info.outputPath(`review-workspace-${theme}-${width}.png`),
      });
      await page
        .getByRole("button", { name: "Enlarge screenshot", exact: true })
        .click();
      const viewer = page.locator(".review-lightbox");
      await expect(viewer).toBeVisible();
      const canvasBox = await viewer
        .locator(".review-lightbox-viewport")
        .boundingBox();
      await expect(viewer.locator("img")).toBeVisible();
      const fitted = await viewer.locator("img").boundingBox();
      expect(fitted!.width).toBeLessThanOrEqual(canvasBox!.width);
      expect(fitted!.height).toBeLessThanOrEqual(canvasBox!.height);
      await viewer
        .getByRole("button", { name: "Actual size", exact: true })
        .click();
      await expect(viewer.locator("output")).toHaveText("100%");
      await viewer
        .getByRole("button", { name: "Zoom in", exact: true })
        .click();
      await expect(viewer.locator("output")).toHaveText("125%");
      if (width === 390) {
        const viewport = viewer.locator(".review-lightbox-viewport");
        const box = await viewport.boundingBox();
        await page.mouse.move(box!.x + 220, box!.y + 150);
        await page.mouse.down();
        await page.mouse.move(box!.x + 100, box!.y + 150, { steps: 4 });
        await page.mouse.up();
        expect(
          await viewport.evaluate((node) => node.scrollLeft),
        ).toBeGreaterThan(0);
        await viewport.focus();
        await page.keyboard.press("0");
        await expect(viewport).not.toHaveClass(/can-pan/);
      }
      await viewer
        .getByRole("button", { name: "Fit screen", exact: true })
        .click();
      await page.screenshot({
        path: info.outputPath(`viewer-${theme}-${width}.png`),
      });
      await page.keyboard.press("Escape");
    }
  }
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: "Entry rationale", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Entry rationale", exact: true }),
  ).toHaveValue(saved.fields.entryRationale);
});
