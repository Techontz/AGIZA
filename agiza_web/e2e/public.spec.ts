import { expect, test } from "@playwright/test";

// Uses the demo catalogue (seed_demo_data): "Levi's 501 Original Jeans" sold by Fashion Forward.

test("anyone can browse without an account", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: /^(login|my account)$/i }).filter({ visible: true }).first()).toBeVisible();
  await page.goto("/shop");
  await expect(page.getByText(/\d+ products? found/i).first()).toBeVisible();
  await page.goto("/stores");
  await expect(page.getByRole("heading", { name: "Our Stores" })).toBeVisible();
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
  await expect(page.getByText("Sold by").first()).toBeVisible();
  const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
  expect(canonical).toMatch(/\/product\/\d+\/levis-501-original-jeans$/);
  const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
  const product = ld.map((t) => JSON.parse(t)).find((d) => d["@type"] === "Product");
  expect(product.offers.priceCurrency).toBe("TZS");
  expect(product.offers.seller.name).toBe("Fashion Forward");
  await page.getByRole("link", { name: /visit store/i }).first().click();
  await expect(page).toHaveURL(/\/store\/fashion-forward/);
});

test("a visitor checks out as a guest and opens the order with its link", async ({ page }) => {
  await page.goto("/shop?q=levis");
  await page.getByRole("link", { name: /Levi's 501 Original Jeans/ }).first().click();
  await page.getByRole("button", { name: /add to cart/i }).click();
  await expect(page.getByText("Added to your cart").first()).toBeVisible();
  await page.goto("/cart");
  // Priced by the server after the page loads: allow for a slow machine.
  await expect(page.getByText("Fashion Forward").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Cart totals")).toBeVisible();
  await page.getByRole("link", { name: /proceed to checkout/i }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByText(/checking out as a guest/i)).toBeVisible();

  await page.getByLabel("Full name").fill("Guest Tester");
  await page.getByLabel("Phone number").fill("0754 000 111");
  await page.getByLabel("City").selectOption({ label: "Dar es Salaam" });
  await page.getByLabel("Street, building or landmark").fill("Plot 7, Sinza");
  await expect(page.getByText("Order summary")).toBeVisible();
  await page.getByRole("button", { name: /^place order$/i }).click();

  await expect(page).toHaveURL(/\/order\/[^/?]+\?token=/, { timeout: 20_000 }); // server-rendered order page
  await expect(page.getByText(/order placed — thank you/i)).toBeVisible();
  await expect(page.getByText("Levi's 501 Original Jeans").first()).toBeVisible();
  const forged = page.url().replace(/token=[^&]+/, "token=forged");
  await page.goto(forged);
  await expect(page.getByRole("alert")).toBeVisible(); // a wrong link never opens the order
});

test("imported products show where they ship from, price delivery with the Shipping Engine and are paid when ordered", async ({ page }) => {
  await page.goto("/shop?q=dji mini");
  await page.getByRole("link", { name: /DJI Mini 4 Pro/ }).first().click();
  await expect(page.getByText("Ships from China.").first()).toBeVisible();
  await page.getByLabel("Deliver to").selectOption({ label: "Dar es Salaam" });
  await expect(page.getByText(/Shipping from China to Dar es Salaam/)).toBeVisible();
  await expect(page.getByText("Air Cargo").first()).toBeVisible();

  await page.getByRole("button", { name: /add to cart/i }).click();
  await expect(page.getByText("Added to your cart").first()).toBeVisible();
  await page.goto("/checkout");
  await page.getByLabel("City").selectOption({ label: "Dar es Salaam" });
  await expect(page.getByRole("heading", { name: "Shipping to Tanzania" })).toBeVisible();
  await expect(page.getByText("Shipping to Tanzania").last()).toBeVisible(); // its line in the order summary
  await expect(page.getByText(/so it is paid when you order/)).toBeVisible();
  await expect(page.getByText("Pay later")).toHaveCount(0);
});

test("account pages need a session; checkout does not", async ({ page }) => {
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.goto("/checkout");
  await expect(page).toHaveURL(/\/checkout$/);
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
