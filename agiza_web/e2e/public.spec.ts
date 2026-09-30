import { expect, test } from "@playwright/test";

// Uses the demo catalogue (seed_demo_data): "Levi's 501 Original Jeans" sold by Fashion Forward.

test("anyone can browse without an account", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: /sign in/i }).first()).toBeVisible();
  await page.goto("/shop");
  await expect(page.getByText(/\d+ products?/).first()).toBeVisible();
  await page.goto("/stores");
  await expect(page.getByRole("heading", { name: "Stores on AGIZA" })).toBeVisible();
});

test("search ignores punctuation: levis finds Levi's", async ({ page }) => {
  await page.goto("/shop?q=levis");
  await expect(page.getByRole("link", { name: /Levi's 501 Original Jeans/ })).toBeVisible();
});

test("product pages are indexable, show the seller and link to the store", async ({ page }) => {
  await page.goto("/shop?q=levis");
  await page.getByRole("link", { name: /Levi's 501 Original Jeans/ }).first().click();
  await expect(page).toHaveURL(/\/product\/\d+\/levis-501-original-jeans$/);
  await page.goto(page.url()); // as a crawler sees it: a fresh server-rendered load
  await expect(page.getByText("Sold by")).toBeVisible();
  const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
  expect(canonical).toMatch(/\/product\/\d+\/levis-501-original-jeans$/);
  const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
  const product = ld.map((t) => JSON.parse(t)).find((d) => d["@type"] === "Product");
  expect(product.offers.priceCurrency).toBe("TZS");
  expect(product.offers.seller.name).toBe("Fashion Forward");
  await page.getByRole("link", { name: /visit store/i }).first().click();
  await expect(page).toHaveURL(/\/store\/fashion-forward/);
});

test("a visitor's cart is priced by the server and checkout asks to sign in", async ({ page }) => {
  await page.goto("/shop?q=levis");
  await page.getByRole("link", { name: /Levi's 501 Original Jeans/ }).first().click();
  await page.getByRole("button", { name: /add to cart/i }).click();
  await expect(page.getByText("Added to your cart").first()).toBeVisible();
  await page.goto("/cart");
  await expect(page.getByText("Fashion Forward").first()).toBeVisible();
  await expect(page.getByText("Order summary")).toBeVisible();
  await page.getByRole("link", { name: /sign in to check out/i }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fcheckout|\/login\?next=\/checkout/);
});

test("account and checkout pages need a session", async ({ page }) => {
  for (const path of ["/account", "/checkout"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login\?next=/);
  }
});

test("robots.txt and sitemap.xml are served", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Sitemap:");
  expect(robots).toContain("Disallow: /checkout");
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/product/");
  expect(sitemap).toContain("/store/");
});

test("no horizontal scrolling on key pages", async ({ page }) => {
  for (const path of ["/", "/shop", "/stores", "/sell", "/cart"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
