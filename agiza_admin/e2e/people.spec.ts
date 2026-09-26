import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/** Phase 6 — People & Support: people, customer detail, tags, campaigns, tag rules, chat. */
const SHOTS = process.env.E2E_SCREENSHOTS;

test("People & Support screens render real data", async ({ page, isMobile }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const [path, title, shot] of [
    ["/people", "People Management", "people-customers"],
    ["/people?tab=staff", "People Management", "people-staff"],
    ["/people?tab=driver", "People Management", "people-drivers"],
    ["/people?tab=shipper", "People Management", "people-shippers"],
    ["/people?tab=shop_vendor", "People Management", "people-vendors"],
    ["/people?tab=service_provider", "People Management", "people-providers"],
    ["/chat", "Transaction Chat", "chat"],
    ["/settings", "Settings", "settings"],
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.locator("main .animate-pulse")).toHaveCount(0, { timeout: 10_000 });
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/p6-${shot}-${isMobile ? "mobile" : "desktop"}.png`, fullPage: !isMobile });
  }
  expect(errors).toEqual([]);
});

const S = Date.now().toString(36).toLowerCase().slice(-5);
async function apiJson(api: APIRequestContext, method: "get" | "post", path: string, data?: unknown) {
  const res = await api[method](`/api/proxy/${path}`, data ? { data } : undefined);
  expect(res.ok(), `${method} ${path}: ${res.status()} ${await res.text()}`).toBeTruthy();
  return res.json();
}
const toast = (page: Page, text: string | RegExp) =>
  expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible();

test.describe("people & support workflows", () => {
  test.describe.configure({ mode: "serial" });
  const tag = `e2e-vip-${S}`;
  let customer: { id: number; full_name: string };

  test("customer detail: add a manual tag, campaign audience counts it", async ({ page }) => {
    customer = await apiJson(page.request, "post", "customers/", { full_name: `E2E Person ${S}`, phone: `+2557${Date.now().toString().slice(-8)}` });
    await page.goto(`/people?search=${encodeURIComponent(customer.full_name)}`);
    await page.getByRole("button", { name: /View details/i }).first().click();
    const modal = page.getByRole("dialog").last();
    await expect(modal.getByText(customer.full_name).first()).toBeVisible();
    await modal.getByRole("tab", { name: "Interests & Tags" }).click();
    await modal.getByPlaceholder("Add tag...").fill(tag);
    await modal.getByPlaceholder("Add tag...").press("Enter");
    await expect(modal.getByText(tag)).toBeVisible();

    // The backend now counts the customer in the tag's audience.
    const est = await apiJson(page.request, "post", "crm/campaigns/estimate/", { tags: [tag] });
    expect(est.total).toBe(1);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Send Campaign" }).first().click();
    const campaign = page.getByRole("dialog").last();
    await campaign.getByRole("button", { name: tag }).click();
    await expect(campaign.getByText(/1 reachable by/)).toBeVisible();
  });

  test("settings: a tag rule is evaluated against real customers", async ({ page, isMobile }) => {
    const S2 = `${S}${isMobile ? "m" : "d"}`;
    await page.goto("/settings");
    await page.getByRole("button", { name: "Add Rule" }).first().click();
    const modal = page.getByRole("dialog").last();
    await modal.getByPlaceholder("e.g. VIP Customers").fill(`E2E rule ${S2}`);
    await modal.getByPlaceholder("e.g., VIP, high_value, at_risk").fill(`e2e-rule-${S2}`);
    await modal.getByRole("spinbutton", { name: /Condition 1 value/ }).fill("0");
    await modal.getByRole("button", { name: "Save Rule" }).click();
    await toast(page, /now matches \d/);
    await expect(page.locator("main").getByText(`E2E rule ${S2}`, { exact: true })).toBeVisible();
  });

  test("chat: reply, internal note, release and take over", async ({ page, isMobile }) => {
    await page.goto("/chat");
    await page.getByText("Fatuma Hassan").first().click();
    const box = page.getByPlaceholder("Type your message...");
    const reply = `E2E reply ${S}${isMobile ? "m" : "d"}`;
    await box.fill(reply);
    await box.press("Enter");
    await expect(page.getByText(reply)).toBeVisible();

    await page.getByRole("button", { name: "Toggle internal note" }).click();
    const note = `E2E note ${S}${isMobile ? "m" : "d"}`;
    const noteBox = page.getByPlaceholder("Add internal note (staff only)...");
    await noteBox.fill(note);
    await noteBox.press("Enter");
    await expect(page.getByText(note)).toBeVisible();

    const release = page.getByRole("button", { name: /^Release/ });
    if (await release.isVisible()) {
      await release.click();
      await expect(page.getByRole("button", { name: /^Take Over/ }).first()).toBeVisible();
    }
    await page.getByRole("button", { name: /^Take Over/ }).first().click();
    await expect(page.getByRole("button", { name: /^Release/ })).toBeVisible();
  });
});
