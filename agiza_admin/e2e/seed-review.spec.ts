import { expect, test } from "@playwright/test";

/**
 * Checks the Shipping Engine screens show the seeded Figma examples
 * (requires `manage.py seed_demo_data`). Skips if the demo data isn't loaded.
 */
const SHOTS = process.env.E2E_SCREENSHOTS;

test("seeded Shipping Engine data appears on every screen", async ({ page, isMobile }) => {
  const zones = await (await page.request.get("/api/proxy/shipping-engine/zones?search=Zone%20A")).json();
  test.skip(!zones.count, "Demo data not loaded");
  await page.goto("/shipping-engine/zones");

  await expect(page.getByRole("heading", { name: "Zone C — Long Distance" })).toBeVisible();
  await expect(page.getByText("Kagera").first()).toBeVisible();
  if (SHOTS && !isMobile) await page.screenshot({ path: `${SHOTS}/seed-zones.png`, fullPage: true });

  await page.goto("/shipping-engine/profiles");
  await expect(page.getByRole("heading", { name: "Drone — Special Air Cargo" })).toBeVisible();
  await expect(page.getByText("Contains battery").first()).toBeVisible();

  await page.goto("/shipping-engine/carriers");
  await expect(page.getByRole("heading", { name: "Emirates Air Cargo" })).toBeVisible();

  await page.goto("/shipping-engine/methods");
  await expect(page.getByText("Air Cargo — Sensitive", { exact: true })).toBeVisible();
  await expect(page.getByText("50 KG")).toBeVisible();

  await page.goto("/shipping-engine/routes?tab=international");
  await expect(page.getByRole("row").filter({ hasText: "China" }).filter({ hasText: "Tanzania" })).toHaveCount(1);

  await page.goto("/shipping-engine/rules?tab=international");
  await expect(page.getByRole("cell", { name: "$50/Item" }).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "$280/CBM" })).toBeVisible();
  if (SHOTS && !isMobile) await page.screenshot({ path: `${SHOTS}/seed-rules.png`, fullPage: true });

  await page.goto("/shipping-engine/overrides");
  await expect(page.getByText("Carrier price increase for Kagera region")).toBeVisible();
  await expect(page.getByText("Scheduled").first()).toBeVisible(); // Q4 promo starts 1 Oct 2026
  if (SHOTS && !isMobile) await page.screenshot({ path: `${SHOTS}/seed-overrides.png`, fullPage: true });

  // The Figma Test Rate example, now computed by Django.
  await page.goto("/shipping-engine/test-rate");
  await page.getByLabel("Origin").selectOption({ label: "China" });
  await page.getByLabel("Destination").selectOption({ label: "Tanzania" });
  await page.getByLabel("Shipping Method").selectOption({ label: "Air Cargo" });
  await page.getByLabel("Shipping Profile / Product").selectOption({ label: "Drone — Special Air Cargo" });
  await page.getByRole("button", { name: "Calculate Shipping" }).click();
  const result = page.getByTestId("rate-result");
  await expect(result.getByText("TSh 127,500")).toBeVisible();
  await expect(result.getByText("SF Express")).toBeVisible();
  if (SHOTS && !isMobile) await page.screenshot({ path: `${SHOTS}/seed-test-rate.png`, fullPage: true });

  await page.goto("/shipping-engine/overview");
  await expect(page.getByText("Dar es Salaam").first()).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/seed-overview-${isMobile ? "mobile" : "desktop"}.png`, fullPage: !isMobile });
});
