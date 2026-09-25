import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Phase 3 workflows through the real UI and Django. Data is prefixed "E2E"
 * and orders created here are cancelled at the end (orders are never deleted).
 */
const S = Date.now().toString(36).toUpperCase().slice(-5);
const created: { kind: string; id: number }[] = [];
const SHOTS = process.env.E2E_SCREENSHOTS;

async function apiJson(api: APIRequestContext, method: "get" | "post", path: string, data?: unknown) {
  const res = await api[method](`/api/proxy/${path}`, data ? { data } : undefined);
  expect(res.ok(), `${method} ${path}: ${res.status()} ${await res.text()}`).toBeTruthy();
  return res.json();
}

async function driverId(api: APIRequestContext): Promise<number> {
  const drivers = await apiJson(api, "get", "orders/express/assignees?role=driver");
  if (drivers.length) return drivers[0].id;
  const u = await apiJson(api, "post", "staff/", {
    email: `e2e.driver.${S.toLowerCase()}@agiza.test`, full_name: `E2E Driver ${S}`, staff_level: "driver",
    department: "delivery", password: `Drv-${S}-Passw0rd!`,
  });
  return u.id;
}

async function tz(api: APIRequestContext) {
  const countries = await apiJson(api, "get", "countries");
  const tzId = countries.find((c: { iso2: string }) => c.iso2 === "TZ").id;
  const cities = await apiJson(api, "get", `cities?country=${tzId}`);
  const city = (n: string) => cities.find((c: { name: string }) => c.name === n).id as number;
  return { city };
}

const dialog = (page: Page) => page.getByRole("dialog").last();
const toast = (page: Page, text: string | RegExp) => expect(page.getByText(text).first()).toBeVisible();

test("Phase 3 screens render real data", async ({ page, isMobile }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const [path, title] of [
    ["/orders/express", "Express Delivery Management"],
    ["/intake-quotes", "Intake & Quotes"],
    ["/orders/international", "International Orders"],
    ["/orders/equipment-support", "Equipment Support Orders"],
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    // Skeletons gone (the red "needs attention" dot pulses on purpose).
    await expect(page.locator(".animate-pulse:not(.bg-red-500)")).toHaveCount(0, { timeout: 10_000 });
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/p3-${path.split("/").pop()}-${isMobile ? "mobile" : "desktop"}.png`, fullPage: !isMobile });
  }
  expect(errors).toEqual([]);
});

test.describe("workflows", () => {
  test.skip(({ isMobile }) => isMobile, "Workflows run on desktop");
  test.describe.configure({ mode: "serial" });

  test("intake: new quotation → respond → customer accepts → approve creates express order → deliver", async ({ page }) => {
    await page.goto("/intake-quotes");
    await page.getByRole("button", { name: "New Quotation" }).click();
    const d = dialog(page);
    await d.getByLabel("Search customer").fill(`E2E Customer ${S}`);
    await d.getByRole("button", { name: "New customer" }).click();
    await d.getByLabel("New customer phone").fill(`+2557${Date.now().toString().slice(-8)}`);
    await d.getByRole("button", { name: "Register customer" }).click();
    await expect(d.getByText(`E2E Customer ${S}`)).toBeVisible();
    await d.getByLabel("Service Type").selectOption("express");
    await d.getByLabel("Description").fill(`E2E documents ${S}`);
    await d.getByLabel("Origin").fill("Dar es Salaam");
    await d.getByLabel("Destination").fill("Arusha");
    await d.getByRole("button", { name: "Save Request" }).click();
    await toast(page, /Quotation Q-\d+-\d+ recorded/);

    const row = page.getByRole("row").filter({ hasText: `E2E documents ${S}` });
    await row.getByRole("button", { name: "Respond" }).click();
    await dialog(page).getByLabel("Quoted Amount (TSh)").fill("30000");
    await dialog(page).getByLabel("Estimated Delivery Date").fill("2026-12-01");
    await dialog(page).getByRole("button", { name: "Send Quotation" }).click();
    await toast(page, "Quotation sent to customer");

    await page.getByRole("tab", { name: /Waiting for Reply/ }).click();
    await page.getByRole("row").filter({ hasText: `E2E documents ${S}` }).getByRole("button", { name: "Accepted" }).click();
    await toast(page, "Customer acceptance recorded");

    await page.getByRole("tab", { name: /Answered Quotations/ }).click();
    await page.getByRole("row").filter({ hasText: `E2E documents ${S}` }).getByRole("button", { name: "Approve Order" }).click();
    const a = dialog(page);
    await expect(a.getByLabel("Pickup address")).toHaveValue("Dar es Salaam");
    await expect(a.getByLabel("Delivery city")).not.toHaveValue("");
    await a.getByRole("button", { name: "Approve & Create Order" }).click();
    await toast(page, /Order EXP-\d+ created/);

    // Lands on Express Delivery with the new order expanded.
    await page.waitForURL(/\/orders\/express\?open=\d+/);
    const id = Number(new URL(page.url()).searchParams.get("open"));
    created.push({ kind: "express", id });
    await expect(page.getByRole("button", { name: "Assign Driver" })).toBeVisible();

    // Assign a driver and walk the five tracking steps.
    await driverId(page.request);
    await page.getByRole("button", { name: "Assign Driver" }).click();
    await dialog(page).getByRole("radio").first().check();
    await dialog(page).getByRole("button", { name: "Assign" }).click();
    await toast(page, /is in progress/);
    for (const step of ["Picked Up", "In Transit", "Arrived", "Delivered"]) {
      const btn = page.getByRole("button", { name: step, exact: true });
      await expect(btn).toBeEnabled();
      await btn.click();
      await expect(btn).toHaveAttribute("aria-pressed", "true");
    }
    await page.getByRole("button", { name: "Show status history" }).click();
    for (const s of ["Accepted", "Driver Assigned", "Picked Up", "In Transit", "Delivered"]) {
      await expect(page.getByText(new RegExp(`${s}$`)).first()).toBeVisible();
    }
  });

  test("express: package size, quote with advance, reject/re-quote, payment gate", async ({ page }) => {
    const { city } = await tz(page.request);
    const customer = await apiJson(page.request, "post", "customers/", { full_name: `E2E Sender ${S}`, phone: `+2556${Date.now().toString().slice(-8)}` });
    const order = await apiJson(page.request, "post", "orders/express/", {
      customer: customer.id, item_details: `E2E Laptop box ${S}`, pickup_address: "Kariakoo", pickup_city: city("Dar es Salaam"),
      delivery_address: "Mwenge", delivery_city: city("Mwanza"), priority: "urgent", package_size: "small",
    });
    created.push({ kind: "express", id: order.id });

    await page.goto(`/orders/express?search=${order.reference}`);
    const row = page.getByRole("row").filter({ hasText: order.reference });
    await expect(row.getByText("Waiting Quote")).toBeVisible();
    await expect(row.getByText("URGENT")).toBeVisible();
    await row.getByRole("button", { name: /Show details/ }).click();

    await page.getByRole("tab", { name: /Package Size/ }).click();
    await page.getByRole("button", { name: /Large/ }).click();
    await toast(page, "Package size updated");
    await expect(page.getByText(/Package size updated to/)).toBeVisible();

    await page.getByRole("tab", { name: "Order Info" }).click();
    await page.getByRole("button", { name: "Generate Quote" }).click();
    await page.getByLabel("Full Price (TSh)").fill("40000");
    await page.getByLabel("Estimated Delivery Date").fill("2026-12-02T15:30");
    await page.getByLabel("Require Advance Payment").check();
    await page.getByLabel("Advance Payment Amount (TSh)").fill("15000");
    await expect(page.getByText("TSh 25,000")).toBeVisible(); // remaining balance preview
    await page.getByRole("button", { name: "Submit Quote" }).click();
    await toast(page, `Quote sent for ${order.reference}`);
    await expect(row.getByText("Quoted").first()).toBeVisible();

    // Customer rejects; staff edit the quote; customer accepts.
    await page.getByRole("button", { name: "Rejected", exact: true }).click();
    await toast(page, "Quote rejected");
    await page.getByRole("button", { name: "Edit Quote" }).click();
    await page.getByLabel("Full Price (TSh)").fill("38000");
    await page.getByRole("button", { name: "Update Quote" }).click();
    await toast(page, `Quote updated for ${order.reference}`);
    await page.getByRole("button", { name: "Accepted", exact: true }).click();
    await toast(page, "Quote accepted");

    // Driver assignment is refused until the advance is paid.
    await driverId(page.request);
    await page.getByRole("button", { name: "Assign Driver" }).click();
    await dialog(page).getByRole("radio").first().check();
    await dialog(page).getByRole("button", { name: "Assign" }).click();
    await toast(page, /advance payment of 15,000 TZS hasn't been received/);
    await dialog(page).getByRole("button", { name: "Cancel" }).click();

    await page.getByRole("button", { name: "Record payment" }).click();
    await expect(dialog(page).getByLabel("Amount (TSh)")).toHaveValue("15000");
    await dialog(page).getByRole("button", { name: "Record Payment" }).click();
    await toast(page, "Payment recorded");
    await page.getByRole("button", { name: "Assign Driver" }).click();
    await dialog(page).getByRole("radio").first().check();
    await dialog(page).getByRole("button", { name: "Assign" }).click();
    await toast(page, /is in progress/);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/p3-express-flow.png`, fullPage: true });
  });

  test("international: approve quotation → payment → status", async ({ page }) => {
    const customer = await apiJson(page.request, "post", "customers/", { full_name: `E2E Importer ${S}`, phone: `+2557${(Date.now() + 7).toString().slice(-8)}` });
    const q = await apiJson(page.request, "post", "quotes/", { customer_id: customer.id, service_type: "international",
      description: `E2E 20 phones ${S}`, origin: "China", destination: "Dar es Salaam" });
    await apiJson(page.request, "post", `quotes/${q.id}/respond/`, { quoted_amount: "2500000", estimated_delivery: "2026-12-20" });
    await apiJson(page.request, "post", `quotes/${q.id}/reply/`, { accepted: true });

    await page.goto("/intake-quotes?tab=answered");
    await page.getByRole("row").filter({ hasText: `E2E 20 phones ${S}` }).getByRole("button", { name: "Approve Order" }).click();
    await expect(dialog(page).getByLabel("Source origin")).not.toHaveValue("");
    await dialog(page).getByLabel("Order type").selectOption("bulk");
    await dialog(page).getByRole("button", { name: "Approve & Create Order" }).click();
    await page.waitForURL(/\/orders\/international\?open=\d+/);
    created.push({ kind: "international", id: Number(new URL(page.url()).searchParams.get("open")) });

    const modal = page.getByRole("dialog").filter({ hasText: "Payment Summary" });
    await expect(modal.getByText("TSh 2,500,000").first()).toBeVisible();
    await modal.getByRole("button", { name: "Record Payment" }).click();
    await dialog(page).getByLabel("Amount (TSh)").fill("1000000");
    await dialog(page).getByRole("button", { name: "Record Payment" }).click();
    await toast(page, "Payment recorded");
    await expect(modal.getByText("Partial")).toBeVisible();
    await expect(modal.getByText("TSh 1,500,000")).toBeVisible();

    await modal.getByRole("button", { name: "Update Status" }).click();
    await dialog(page).getByLabel("New status").selectOption("supplier_confirmed");
    await dialog(page).getByLabel("Note (optional)").fill("Supplier confirmed stock (E2E)");
    await dialog(page).getByRole("button", { name: "Update Status" }).click();
    await expect(modal.getByText("Supplier confirmed stock (E2E)")).toBeVisible();
    await expect(modal.getByText(/Pending Payment → Supplier Confirmed/)).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/p3-international-modal.png` });
  });

  test("equipment: new request → approve → technician → service date", async ({ page }) => {
    await page.goto("/orders/equipment-support");
    await page.getByRole("button", { name: "New Support Request" }).click();
    const d = dialog(page);
    await d.getByLabel("Search customer").fill(`E2E Bakery ${S}`);
    await d.getByRole("button", { name: "New customer" }).click();
    await d.getByLabel("New customer phone").fill(`+2555${Date.now().toString().slice(-8)}`);
    await d.getByRole("button", { name: "Register customer" }).click();
    await d.getByLabel(/^Equipment/).fill(`E2E Oven ${S}`);
    await d.getByLabel("Service value (TSh)").fill("1250000");
    await d.getByRole("button", { name: "Create Request" }).click();
    await toast(page, /Support request EQ-\d+ created/);
    await page.waitForURL(/open=\d+/);
    created.push({ kind: "equipment", id: Number(new URL(page.url()).searchParams.get("open")) });

    const modal = page.getByRole("dialog").filter({ hasText: "Service Timeline" });
    await modal.getByRole("button", { name: "Update Status" }).click();
    await dialog(page).getByLabel("New status").selectOption("approved");
    await dialog(page).getByRole("button", { name: "Update Status" }).click();
    await expect(modal.getByText("Current status:")).toContainText("Approved");
    await modal.getByRole("button", { name: "Assign Technician" }).click();
    await dialog(page).getByRole("radio").first().check();
    await dialog(page).getByRole("button", { name: "Assign" }).click();
    await toast(page, "Technician assigned");
    await expect(modal.getByText("Current status:")).toContainText("Assigned");
    await modal.getByRole("button", { name: "Close" }).click();

    await page.getByLabel("Search equipment orders").fill(`E2E Oven ${S}`);
    const row = page.getByRole("row").filter({ hasText: `E2E Bakery ${S}` });
    await expect(row.getByText("Assigned")).toBeVisible();
    await row.getByRole("button", { name: /Not scheduled|, \d\d:\d\d/ }).click();
    await row.getByRole("textbox").or(row.locator('input[type="date"]')).fill("2026-12-05");
    await row.getByRole("button", { name: "Save date" }).click();
    await toast(page, "Service date updated");
    await expect(row.getByText(/Dec 05/)).toBeVisible();
  });

  test.afterAll(async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: "e2e/.auth/admin.json", baseURL: process.env.E2E_BASE_URL });
    for (const o of created) {
      await ctx.request.post(`/api/proxy/orders/${o.kind}/${o.id}/transition/`, { data: { status: "cancelled", note: "E2E cleanup" } });
    }
    await ctx.close();
  });
});
