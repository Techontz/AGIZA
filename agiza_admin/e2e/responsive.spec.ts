import { expect, test } from "@playwright/test";

/** Every screen fits its viewport: phone (Pixel 7), tablet (820px) and large desktop (1920px). */const PAGES = ["/intake-quotes", "/orders/international", "/orders/express", "/orders/ecommerce", "/orders/equipment-support",
  "/deliveries", "/returns", "/tasks?view=all", "/procurement", "/shipping", "/shipping?tab=shipments", "/shipping?tab=waiting", "/chat", "/ecommerce",
  "/ecommerce?section=products", "/ecommerce?section=vendors", "/people", "/people?tab=staff", "/people?tab=shipper", "/finance/payments",
  "/finance/invoices", "/finance/wallets", "/warehouse", "/warehouse?tab=inventory", "/warehouse?tab=shop", "/shipping-engine/overview", "/shipping-engine/methods",
  "/shipping-engine/carriers", "/shipping-engine/profiles", "/shipping-engine/zones", "/shipping-engine/routes", "/shipping-engine/rules",
  "/shipping-engine/overrides", "/shipping-engine/test-rate", "/shipping-engine/settings", "/audit-logs", "/settings"];
for (const [name, width] of [["phone", 0], ["tablet", 820], ["large", 1920]] as const) {
  test(`no horizontal page overflow (${name})`, async ({ page, isMobile }) => {
    test.skip(name === "phone" ? !isMobile : isMobile);
    test.setTimeout(180_000);
    if (width) await page.setViewportSize({ width, height: 1000 });
    const bad: string[] = [];
    for (const path of PAGES) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const [sw, vw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      if (sw > vw + 1) bad.push(`${path}: ${sw}>${vw}`);
    }
    expect(bad).toEqual([]);
  });
}
