import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Shipping Engine end-to-end: builds a configuration through the real UI,
 * checks Test Rate results computed by Django, then removes what it created.
 */
const S = Date.now().toString(36).toUpperCase().slice(-6);
const N = {
  air: `E2E Air ${S}`,
  bus: `E2E Bus ${S}`,
  carrier: `E2E Carrier ${S}`,
  profile: `E2E Drone ${S}`,
  zone: `E2E Zone ${S}`,
};
const SHOTS = process.env.E2E_SCREENSHOTS;

const PAGES: [string, string][] = [
  ["/shipping-engine/overview", "Shipping Engine"],
  ["/shipping-engine/routes", "Routes"],
  ["/shipping-engine/zones", "Shipping Zones"],
  ["/shipping-engine/profiles", "Shipping Profiles"],
  ["/shipping-engine/rules", "Shipping Rules"],
  ["/shipping-engine/carriers", "Carriers"],
  ["/shipping-engine/overrides", "Overrides"],
  ["/shipping-engine/test-rate", "Test Shipping Rate"],
  ["/shipping-engine/methods", "Shipping Methods"],
  ["/shipping-engine/settings", "Shipping Engine Settings"],
];

test("every Shipping Engine page renders from the API", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const [path, title] of PAGES) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test.describe("configure and price shipments", () => {
  test.describe.configure({ mode: "serial" });

  const dialog = (page: Page) => page.getByRole("dialog");
  const saved = (page: Page, text: string | RegExp) => expect(page.getByText(text).first()).toBeVisible();

  test("create methods, carrier, profile and zone", async ({ page }) => {
    await page.goto("/shipping-engine/methods");
    for (const [name, code, cat, max] of [
      [N.air, `EA${S}`, "air", ""],
      [N.bus, `EB${S}`, "land", "50"],
    ]) {
      await page.getByRole("button", { name: "Add Method" }).first().click();
      await dialog(page).getByLabel("Method Name").fill(name);
      await dialog(page).getByLabel("Code").fill(code);
      await dialog(page).getByLabel("Category").selectOption(cat);
      if (max) await dialog(page).getByLabel("Max Weight (KG)").fill(max);
      await dialog(page).getByRole("button", { name: "Add Method" }).click();
      await saved(page, "Shipping method added");
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    }

    await page.goto("/shipping-engine/carriers");
    await page.getByRole("button", { name: "Add Carrier" }).click();
    await dialog(page).getByLabel("Carrier Name").fill(N.carrier);
    await dialog(page).getByLabel("China").first().check();
    await dialog(page).getByPlaceholder("e.g. Electronics, Restricted goods, Oversized...").fill("Electronics, Drones");
    await dialog(page).getByRole("button", { name: "Add Carrier" }).click();
    await saved(page, "Carrier added");
    await expect(page.getByRole("heading", { name: N.carrier })).toBeVisible();

    await page.goto("/shipping-engine/profiles");
    await page.getByRole("button", { name: "Create Profile" }).click();
    await dialog(page).getByLabel("Profile Name").fill(N.profile);
    await dialog(page).getByRole("combobox").first().selectOption("restricted");
    await dialog(page).getByLabel("Contains battery").check();
    await dialog(page).getByLabel("Special documentation").check();
    await dialog(page).getByRole("button", { name: "Create Profile" }).click();
    await saved(page, "Profile created");
    await expect(page.getByRole("heading", { name: N.profile })).toBeVisible();

    await page.goto("/shipping-engine/zones");
    await page.getByRole("button", { name: "Create Zone" }).click();
    await dialog(page).getByLabel("Zone Name").fill(N.zone);
    await dialog(page).getByLabel("Filter destinations").fill("Bukoba");
    await dialog(page).getByLabel("Bukoba").check();
    await expect(dialog(page).getByText("Selected (1)")).toBeVisible();
    await dialog(page).getByRole("button", { name: "Create Zone" }).click();
    await saved(page, "Zone created");
    await expect(page.getByRole("heading", { name: N.zone })).toBeVisible();
  });

  test("create routes and rules", async ({ page }) => {
    await page.goto("/shipping-engine/routes?tab=international");
    await page.getByRole("button", { name: "Add Route" }).click();
    await dialog(page).getByRole("button", { name: "International Shipping" }).click();
    await dialog(page).getByLabel("Origin").selectOption({ label: "China" });
    await dialog(page).getByLabel("Destination").selectOption({ label: "Kenya" });
    await dialog(page).getByLabel(N.air).check();
    await dialog(page).getByRole("button", { name: "Create Route" }).click();
    await saved(page, "Route created");

    await page.goto("/shipping-engine/routes?tab=local");
    await page.getByRole("button", { name: "Add Route" }).click();
    await dialog(page).getByLabel("Origin").selectOption({ label: "Dar es Salaam" });
    await dialog(page).getByLabel("Destination").selectOption({ label: N.zone });
    await dialog(page).getByLabel(N.bus).check();
    await dialog(page).getByRole("button", { name: "Create Route" }).click();
    await saved(page, "Route created");
    await expect(page.getByText(N.zone).first()).toBeVisible();

    // International general rule: $12/KG, min $30, 7–14 days.
    await page.goto("/shipping-engine/rules?tab=international");
    await page.getByRole("button", { name: "Create Rule" }).click();
    const d = dialog(page);
    await d.getByLabel("Origin").selectOption({ label: "China" });
    await d.getByLabel("Destination / Zone").selectOption({ label: "Kenya" });
    await d.getByLabel("Shipping method").selectOption({ label: N.air });
    await d.getByRole("button", { name: "General Route" }).click();
    await d.getByLabel("Currency").selectOption("USD");
    await d.getByLabel("Rate", { exact: true }).fill("12");
    await d.getByLabel("Minimum charge").fill("30");
    await d.getByLabel("Minimum days").fill("7");
    await d.getByLabel("Maximum days").fill("14");
    await expect(d.getByText("Displayed to customer as: 7–14 days")).toBeVisible();
    await d.getByLabel("Carrier").selectOption({ label: N.carrier });
    await d.getByRole("button", { name: "Save & Add Another" }).click();
    await saved(page, /Rule SR-\d+ created/);

    // Same route & method, drone profile: $50/Item, min $50.
    await d.getByRole("button", { name: "Shipping Profile" }).click();
    await d.getByLabel("Shipping Profile").selectOption({ label: N.profile });
    await d.getByRole("button", { name: "Per Item" }).click();
    await d.getByLabel("Rate", { exact: true }).fill("50");
    await d.getByLabel("Minimum charge").fill("50");
    await d.getByRole("button", { name: "Save Rule" }).click();
    await expect(d).toBeHidden();
    await expect(page.getByText(`China → Kenya ${N.air} (${N.profile})`)).toHaveCount(0); // list shows route chips, not names
    await expect(page.getByRole("cell", { name: "$50/Item" }).first()).toBeVisible();

    // Local zone rule: TSh 1,500/KG, min TSh 3,000.
    await page.goto("/shipping-engine/rules?tab=local");
    await page.getByRole("button", { name: "Create Rule" }).click();
    await d.getByLabel("Origin").selectOption({ label: "Dar es Salaam" });
    await d.getByLabel("Destination / Zone").selectOption({ label: N.zone });
    await d.getByLabel("Shipping method").selectOption({ label: N.bus });
    await d.getByRole("button", { name: "General Route" }).click();
    await d.getByLabel("Rate", { exact: true }).fill("1500");
    await d.getByLabel("Minimum charge").fill("3000");
    await d.getByRole("button", { name: "Save Rule" }).click();
    await expect(page.getByRole("row").filter({ hasText: N.zone }).getByText("TSh 1,500/KG")).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/se-rules.png`, fullPage: true });
  });

  test("set the exchange rate", async ({ page }) => {
    await page.goto("/shipping-engine/settings");
    const usd = page.getByPlaceholder("e.g. 2,550");
    await expect(usd).toBeEnabled();
    await usd.fill("2550");
    const save = page.getByRole("button", { name: "Save Settings" });
    // Disabled when 2550 is already the current rate (nothing changed).
    if (await save.isEnabled()) {
      await save.click();
      await saved(page, "Shipping Engine settings saved");
    }
  });

  test("Test Rate prices shipments with Django and explains why", async ({ page }) => {
    await page.goto("/shipping-engine/test-rate");
    await expect(page.getByText("Enter shipment details and click Calculate")).toBeVisible();
    await expect(page.getByLabel("CBM (auto-calculated)")).toHaveValue("0.01125");

    await page.getByLabel("Origin").selectOption({ label: "China" });
    await page.getByLabel("Destination").selectOption({ label: "Kenya" });
    await page.getByLabel("Shipping Method").selectOption({ label: N.air });
    await page.getByLabel("Shipping Profile / Product").selectOption({ label: N.profile });
    await page.getByRole("button", { name: "Calculate Shipping" }).click();

    const result = page.getByTestId("rate-result");
    await expect(result.getByText("Rule Matched")).toBeVisible();
    await expect(result.getByText("TSh 127,500")).toBeVisible();
    await expect(result.getByText("$50.00").first()).toBeVisible();
    await expect(result.getByText("Contains battery, Special documentation", { exact: true })).toBeVisible();
    await expect(result.getByText(/Shipping Profile rule \(priority 2\) selected over/)).toBeVisible();
    await expect(result.getByText("Other Rules Considered (Not Applied)")).toBeVisible();
    await expect(result.getByText(/Lower priority — general route rule/)).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/se-test-rate.png`, fullPage: true });

    // No profile → general rule; 1.5 KG × $12 = $18, raised to the $30 minimum.
    await page.getByLabel("Shipping Profile / Product").selectOption("");
    await page.getByRole("button", { name: "Calculate Shipping" }).click();
    await expect(result.getByText("Raised to minimum charge")).toBeVisible();
    await expect(result.getByText("TSh 76,500")).toBeVisible();

    // Local via zone: Dar → Bukoba (in the E2E zone), 2 KG × TSh 1,500.
    await page.getByLabel("Origin").selectOption({ label: "Dar es Salaam" });
    await page.getByLabel("Destination").selectOption({ label: "Bukoba" });
    await page.getByLabel("Shipping Method").selectOption({ label: N.bus });
    await page.getByLabel("Weight (KG)").fill("2");
    await page.getByRole("button", { name: "Calculate Shipping" }).click();
    await expect(result.getByText(`Destination resolved: Bukoba → ${N.zone}`)).toBeVisible();
    await expect(result.getByText("TSh 3,000").first()).toBeVisible();

    // Over the bus method's 50 KG limit.
    await page.getByLabel("Weight (KG)").fill("60");
    await page.getByRole("button", { name: "Calculate Shipping" }).click();
    await expect(result.getByText("Shipment Blocked")).toBeVisible();

    // Invalid input is rejected in the form.
    await page.getByLabel("Weight (KG)").fill("0");
    await page.getByRole("button", { name: "Calculate Shipping" }).click();
    await expect(page.getByText("Weight must be greater than zero")).toBeVisible();
  });

  test("an override changes the price for its destination", async ({ page }) => {
    await page.goto("/shipping-engine/overrides");
    await page.getByRole("button", { name: "Create Override" }).click();
    const d = dialog(page);
    await d.getByLabel("Route").selectOption({ label: `Dar es Salaam → ${N.zone}` });
    await d.getByLabel("Specific Destination").selectOption({ label: "Bukoba" });
    await expect(d.getByPlaceholder("Select a route")).toHaveValue(/TSh 1,500\/KG/);
    await d.getByLabel("Override price").fill("2000");
    await d.getByPlaceholder("Explain why this override is needed...").fill("Fuel surcharge (E2E)");
    const end = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    await d.locator('input[type="date"]').nth(1).fill(end);
    await d.getByRole("button", { name: "Create Override" }).click();
    await saved(page, "Override created");
    await expect(page.getByRole("row").filter({ hasText: "Fuel surcharge (E2E)" }).getByText("TSh 2,000/KG")).toBeVisible();

    await page.goto("/shipping-engine/test-rate");
    await page.getByLabel("Origin").selectOption({ label: "Dar es Salaam" });
    await page.getByLabel("Destination").selectOption({ label: "Bukoba" });
    await page.getByLabel("Shipping Method").selectOption({ label: N.bus });
    await page.getByLabel("Weight (KG)").fill("2");
    await page.getByRole("button", { name: "Calculate Shipping" }).click();
    const result = page.getByTestId("rate-result");
    await expect(result.getByText(/Override OV-\d+ applied/).first()).toBeVisible();
    await expect(result.getByText("TSh 4,000").first()).toBeVisible();
  });

  test("overview reflects the configuration", async ({ page }) => {
    await page.goto("/shipping-engine/overview?tab=international");
    await expect(page.getByText(/China → Kenya/).first()).toBeVisible();
    await expect(page.getByRole("cell", { name: "$50/Item" }).first()).toBeVisible();
  });

  test.afterAll(async ({ playwright, browser }) => {
    // Remove everything this run created (via the same authenticated proxy).
    const ctx = await browser.newContext({ storageState: "e2e/.auth/admin.json", baseURL: process.env.E2E_BASE_URL });
    const api: APIRequestContext = ctx.request;
    const list = async (path: string) => ((await (await api.get(`/api/proxy/shipping-engine/${path}`)).json()).results ?? []) as Record<string, unknown>[];
    const del = (path: string, id: unknown) => api.delete(`/api/proxy/shipping-engine/${path}/${id}/`);

    const routes = (await list("routes?page_size=100")).filter((r) =>
      (r.method_names as string[]).some((m) => m === N.air || m === N.bus),
    );
    for (const r of routes) {
      for (const o of await list(`overrides?route=${r.id}&page_size=100`)) await del("overrides", o.id);
      for (const rule of await list(`rules?route=${r.id}&page_size=100`)) await del("rules", rule.id);
      await del("routes", r.id);
    }
    for (const [path, name] of [["zones", N.zone], ["profiles", N.profile], ["methods", N.air], ["methods", N.bus], ["carriers", N.carrier]]) {
      for (const row of await list(`${path}?search=${encodeURIComponent(name)}&page_size=100`)) if (row.name === name) await del(path, row.id);
    }
    await ctx.close();
    void playwright;
  });
});
