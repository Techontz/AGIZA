import { expect, test } from "@playwright/test";

const EMAIL = process.env.E2E_EMAIL ?? "";
const PASSWORD = process.env.E2E_PASSWORD ?? "";
const SHOTS = process.env.E2E_SCREENSHOTS;

test.describe("login flow (fresh browser, no session)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("signed-out visitors are sent to login and returned afterwards", async ({ page, isMobile }) => {
    await page.goto("/audit-logs?action=login");
    await expect(page).toHaveURL(/\/login\?next=%2Faudit-logs/);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/login-${isMobile ? "mobile" : "desktop"}.png` });
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/audit-logs\?action=login/);
    await expect(page.getByRole("heading", { level: 1, name: "Reporting & Audit Logs" })).toBeVisible();
  });

  test("wrong password shows an error and stays on login", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password", { exact: true }).fill("definitely-wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator('form [role="alert"]')).toContainText("Invalid email or password");
    await expect(page).toHaveURL(/\/login/);
  });

  test("sign out ends the session", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/orders/express");
    await page.locator("header").getByRole("button", { expanded: false }).last().click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await page.waitForURL("**/login");
    await page.goto("/orders/express");
    await expect(page).toHaveURL(/\/login/);
  });
});

test("shell renders the Figma layout with the real user; tokens are not readable by JS", async ({ page, isMobile }) => {
  await page.goto("/");
  await page.waitForURL("**/orders/express");
  await expect(page.getByRole("heading", { level: 1, name: "Express Delivery Management" })).toBeVisible();
  await expect(page.getByText("Waiting Quote").first()).toBeVisible(); // real stat card (no longer a placeholder)

  const cookies = await page.evaluate(() => document.cookie);
  expect(cookies).not.toContain("agiza_at");
  expect(cookies).not.toContain("agiza_rt");

  if (isMobile) await page.getByRole("button", { name: "Show navigation" }).click();
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(nav.getByRole("link", { name: "Express Delivery Management" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Equipment Support Orders" })).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/shell-${isMobile ? "mobile" : "desktop"}.png` });

  await nav.getByRole("button", { name: "Shipping Engine" }).click();
  await nav.getByRole("link", { name: "Test Rate" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Test Shipping Rate" })).toBeVisible();
});

test("audit log lists real events with working filters and details", async ({ page, isMobile }) => {
  await page.goto("/audit-logs");
  const table = page.locator("table").first();
  await expect(table.getByText("Logged in").first()).toBeVisible();

  await page.getByLabel("Filter by action").selectOption("login_failed");
  await expect(page).toHaveURL(/action=login_failed/);
  await expect(table.getByText("Failed login").first()).toBeVisible();
  await expect(table.getByText("Logged in")).toHaveCount(0);

  await table.getByRole("button", { name: "Details" }).first().click();
  await expect(table.getByText("Device")).toBeVisible();

  await page.getByLabel("Search audit logs").fill("zzz-no-such-record");
  await expect(page.getByText("No activity found")).toBeVisible();

  if (SHOTS) {
    await page.goto("/audit-logs");
    await expect(table.getByText("Logged in").first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/audit-${isMobile ? "mobile" : "desktop"}.png`, fullPage: !isMobile });
  }
});
