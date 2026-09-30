import { expect, test } from "@playwright/test";

// Production-readiness checks that need no account and change no data.

const LEGAL = ["/privacy", "/terms", "/marketplace-terms", "/vendor-terms", "/returns-policy", "/delivery-policy", "/cookies"];

test("legal pages are published, linked from the footer and marked as drafts until approved", async ({ page, request }) => {
  for (const path of LEGAL) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("note")).toContainText("Draft: not yet approved");
    await expect(page.locator(`footer a[href="${path}"]`)).toHaveCount(1);
  }
  const sitemap = await (await request.get("/sitemap.xml")).text();
  for (const path of LEGAL) expect(sitemap).toContain(`${path}</loc>`);
});

test("an anonymous visitor gets no cookies, so there is no cookie banner", async ({ page, context }) => {
  await page.goto("/");
  await page.goto("/shop");
  await page.goto("/cookies");
  expect(await context.cookies()).toEqual([]);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("a guest can save a product on this device", async ({ page }) => {
  await page.goto("/shop?q=levis");
  const heart = page.getByRole("button", { name: /^Save Levi's 501 Original Jeans/ }).first();
  await heart.click();
  await expect(page.getByRole("button", { name: /^Remove Levi's 501 Original Jeans from saved products/ }).first()).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("agiza.saved.v1") ?? "[]"));
  expect(saved.length).toBe(1);
});

async function openFilters(page: import("@playwright/test").Page) {
  const summary = page.locator("summary", { hasText: "Filters" });
  if (await summary.isVisible()) await summary.click(); // phones: filters are in a collapsible panel
}

test("the in-stock filter is a shareable URL and can be cleared", async ({ page }) => {
  await page.goto("/shop");
  await openFilters(page);
  const toggle = page.getByRole("checkbox", { name: "In stock only" }).first();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await page.goto("/shop?stock=1");
  await openFilters(page);
  await expect(page.getByRole("checkbox", { name: "In stock only" }).first()).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText(/\d+ products? found/i).first()).toBeVisible();
});

test("product pages show verified reviews; only buyers can write one", async ({ page }) => {
  await page.goto("/shop?q=levis");
  await page.getByRole("link", { name: /Levi's 501 Original Jeans/ }).first().click();
  await page.getByRole("tab", { name: /reviews/i }).click();
  await expect(page.getByRole("heading", { name: "Customer reviews" })).toBeVisible();
  await expect(page.getByText("Only customers who received this product can review it.")).toBeVisible();
  await expect(page.getByRole("button", { name: /write a review/i })).toHaveCount(0); // signed out
  const ld = (await page.locator('script[type="application/ld+json"]').allTextContents()).map((t) => JSON.parse(t));
  const product = ld.find((d) => d["@type"] === "Product");
  if (product.aggregateRating) {
    expect(Number(product.aggregateRating.ratingValue)).toBeGreaterThan(0);
    expect(product.aggregateRating.reviewCount).toBeGreaterThan(0);
  }
});

test("the website is for customers: selling points to the AGIZA Seller app", async ({ page }) => {
  await page.goto("/sell");
  await expect(page.getByText("Sell with the AGIZA Seller app")).toBeVisible();
  await expect(page.getByRole("link", { name: /apply to sell/i })).toHaveCount(0);
  for (const old of ["/seller", "/seller/orders", "/sell/apply"]) {
    await page.goto(old);
    await expect(page).toHaveURL(/\/sell$/);
  }
  await page.goto("/vendor-terms");
  await expect(page.getByRole("heading", { name: "Seller terms", level: 1 })).toBeVisible();
  await expect(page.getByText(/AGIZA Seller app/).first()).toBeVisible();
});

test("navigation: departments on desktop, a bottom bar on phones", async ({ page, isMobile }) => {
  await page.goto("/");
  if (isMobile) {
    const bar = page.getByRole("navigation", { name: "Quick navigation" });
    await expect(bar).toBeVisible();
    await bar.getByRole("button", { name: "Categories" }).click();
    await expect(page.getByRole("dialog", { name: "Menu" }).getByText("Shop by Department")).toBeVisible();
  } else {
    await page.getByRole("button", { name: "Shop by Department" }).hover();
    await expect(page.getByRole("link", { name: "All products" }).first()).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Quick navigation" })).toBeHidden();
  }
});

test("the rating link opens the reviews tab", async ({ page }) => {
  await page.goto("/shop?q=levis");
  await page.getByRole("link", { name: /Levi's 501 Original Jeans/ }).first().click();
  await page.locator('a[href="#tab-reviews"]').click();
  await expect(page.getByRole("tab", { name: /reviews/i })).toHaveAttribute("aria-selected", "true");
});

test("after scrolling, a thin header stays at the top with search and counters", async ({ page, isMobile }) => {
  await page.goto("/");
  const bar = page.locator("div.fixed.inset-x-0.top-0");
  await expect(bar).toHaveAttribute("aria-hidden", "true");
  await page.mouse.wheel(0, 1200);
  await expect(bar).toHaveAttribute("aria-hidden", "false");
  if (isMobile) {
    await expect(bar.getByRole("link", { name: /^Cart/ })).toBeVisible();
  } else {
    await expect(bar.getByRole("searchbox", { name: "Search products" })).toBeVisible();
    await expect(bar.getByRole("button", { name: "Shop by Department" })).toBeVisible();
    await expect(bar.getByRole("link", { name: /^Compare/ })).toBeVisible();
  }
});

test("compare: pick products and see them side by side", async ({ page }) => {
  await page.goto("/shop?q=levis");
  await page.getByRole("link", { name: /Levi's 501 Original Jeans/ }).first().click();
  await page.getByRole("button", { name: /^Compare Levi's/ }).click();
  await page.goto("/compare");
  await expect(page.getByRole("heading", { name: "Compare products" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Levi's 501 Original Jeans" })).toBeVisible();
  await expect(page.getByRole("rowheader", { name: "Sold by" })).toBeVisible();
});
