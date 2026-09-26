import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/** Phase 4 — Operations screens (Procurement, Shipping & Tracking, Deliveries, Returns, Tasks). */
const SHOTS = process.env.E2E_SCREENSHOTS;

test("Operations screens render real data", async ({ page, isMobile }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const [path, title] of [
    ["/procurement", "Procurement Management"],
    ["/shipping", "Shipping & Tracking"],
    ["/deliveries", "Deliveries Management"],
    ["/returns", "Returns Management"],
    ["/tasks?view=all", "Tasks"],
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.locator("tbody .animate-pulse")).toHaveCount(0, { timeout: 10_000 });
    await expect(page.locator("tbody tr").first()).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/p4-${path.slice(1).split("?")[0]}-${isMobile ? "mobile" : "desktop"}.png`, fullPage: !isMobile });
  }
  expect(errors).toEqual([]);
});

/* ------------------------------------------------------------------------ */
/* International order through every operations module, in the real UI.     */
/* ------------------------------------------------------------------------ */

const S = Date.now().toString(36).toUpperCase().slice(-5);

async function apiJson(api: APIRequestContext, method: "get" | "post", path: string, data?: unknown) {
  const res = await api[method](`/api/proxy/${path}`, data ? { data } : undefined);
  expect(res.ok(), `${method} ${path}: ${res.status()} ${await res.text()}`).toBeTruthy();
  return res.json();
}
const dialog = (page: Page) => page.getByRole("dialog").last();
const toast = (page: Page, text: string | RegExp) =>
  expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible();

test.describe("operations workflow", () => {
  test.describe.configure({ mode: "serial" });

  let order: { id: number; reference: string };

  test("setup: a paid international order from China", async ({ page }) => {
    const api = page.request;
    const countries = await apiJson(api, "get", "countries");
    const china = countries.find((c: { iso2: string }) => c.iso2 === "CN").id;
    const customer = await apiJson(api, "post", "customers/", { full_name: `E2E Buyer ${S}`, phone: "+255700111222" });
    order = await apiJson(api, "post", "orders/international/", {
      customer: customer.id, item_details: `E2E Drones ${S}`, source_country: china, total_amount: "900000",
      service_type: "full_service",
    });
    await apiJson(api, "post", `orders/international/${order.id}/payments/`, { amount: "900000", method: "bank_transfer" });
  });

  test("procurement: select supplier and pay supplier", async ({ page }) => {
    await page.goto(`/procurement?search=${order.reference}`);
    await page.getByRole("button", { name: order.reference }).click();
    await dialog(page).getByRole("button", { name: /Select Supplier/ }).click();
    const d = dialog(page);
    await d.getByRole("combobox", { name: /^Supplier/ }).selectOption({ index: 1 });
    await d.getByLabel("Item Cost (TSh)").fill("600000");
    await d.getByRole("button", { name: /Select Supplier|Save/ }).last().click();
    await toast(page, /supplier/i);
    await dialog(page).getByRole("button", { name: /Mark Supplier Paid/ }).click();
    await dialog(page).getByLabel("Payment Reference").fill(`TT-${S}`);
    await dialog(page).getByRole("button", { name: /Mark as Paid|Mark Supplier Paid|Confirm/ }).last().click();
    await toast(page, /paid/i);
  });

  test("shipping: receive at cargo, consolidate, run milestones", async ({ page }) => {
    await page.goto(`/shipping?tab=waiting&search=${order.reference}`);
    await page.getByRole("button", { name: /^Receive$/ }).first().click();
    await dialog(page).getByLabel("Weight (kg)").fill("12.5");
    await dialog(page).getByLabel("CBM (m³)").fill("0.2");
    await dialog(page).getByRole("button", { name: /Receive/ }).last().click();
    await toast(page, /received/i);

    await page.goto(`/shipping?tab=ready&search=${order.reference}`);
    await page.getByRole("checkbox", { name: new RegExp(order.reference) }).check();
    await page.getByRole("button", { name: /Create New Shipment/ }).click();
    const d = dialog(page);
    await d.getByLabel("Shipper").selectOption({ index: 1 });
    await d.getByLabel("Shipping Method").selectOption({ index: 1 });
    await d.getByLabel(/Destination City/).selectOption({ label: "Dar es Salaam" });
    await d.getByRole("button", { name: /Create Shipment/ }).click();
    await toast(page, /created/i);

    await page.goto(`/shipping?tab=shipments&search=${order.reference}`);
    await page.locator("tbody tr").first().getByRole("button").first().click();
    for (const status of ["Booked", "Loaded", "Export Cleared", "Shipping to Destination", "Clearance", "Completed"]) {
      await page.getByRole("button", { name: /Update Status/ }).first().click();
      await dialog(page).getByLabel(/New Status/i).selectOption({ label: status });
      await dialog(page).getByRole("button", { name: /Update Status|Save/ }).last().click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
    const detail = await apiJson(page.request, "get", `orders/international/${order.id}/`);
    expect(detail.status).toBe("ready_for_collection");
  });

  test("deliveries: assign driver, out for delivery, complete with proof", async ({ page }) => {
    await page.goto(`/deliveries?search=${order.reference}`);
    await page.getByRole("button", { name: /Show details/ }).first().click();
    await page.getByRole("button", { name: /Assign Driver|Change Driver/ }).first().click();
    await dialog(page).getByLabel("Driver").selectOption({ index: 1 });
    await dialog(page).getByRole("button", { name: /Assign/ }).last().click();
    await toast(page, /assigned/i);
    await page.getByRole("button", { name: "Mark Out for Delivery" }).first().click();
    await dialog(page).getByRole("button", { name: "Mark Out for Delivery" }).click();
    await toast(page, /Out for Delivery/);
    await page.getByRole("button", { name: /Complete Delivery/ }).first().click();
    await dialog(page).getByLabel(/Received by/).fill(`E2E Buyer ${S}`);
    await dialog(page).getByRole("button", { name: /Complete Delivery|Confirm/ }).last().click();
    await toast(page, /delivered/i);
    const detail = await apiJson(page.request, "get", `orders/international/${order.id}/`);
    expect(detail.status).toBe("completed");
  });

  test("returns: open, in transit, received", async ({ page }) => {
    const ret = await apiJson(page.request, "post", "returns/", {
      order: order.id, return_type: "wrong_item", reason_code: "item_mismatch", notes: `E2E ${S}`,
    });
    await page.goto(`/returns?search=${ret.reference}`);
    await page.getByRole("button", { name: /Show details/ }).first().click();
    await page.getByRole("button", { name: /Update Status/ }).first().click();
    await dialog(page).getByRole("button", { name: "Mark In Transit" }).click();
    await toast(page, /In Transit/);
    await page.getByRole("button", { name: /Update Status/ }).first().click();
    await dialog(page).getByRole("button", { name: "Mark Received" }).click();
    await toast(page, /Received/);
    const after = await apiJson(page.request, "get", `returns/${ret.id}/`);
    expect(after.status).toBe("received");
  });

  test("tasks: create, add note, complete", async ({ page }) => {
    await page.goto("/tasks?view=all");
    await page.getByRole("button", { name: /New Task/ }).click();
    const d = dialog(page);
    await d.getByLabel("Task Type").selectOption({ label: "Follow Up Client" });
    await d.getByLabel("Description").fill(`E2E follow-up ${S}`);
    await d.getByRole("button", { name: /Create Task/ }).click();
    await toast(page, /created/i);
    const panel = dialog(page);
    await panel.getByPlaceholder(/Add a note/).fill("Called the customer");
    await panel.getByRole("button", { name: "Add Note" }).click();
    await expect(panel.getByText("Called the customer")).toBeVisible();
    await panel.getByRole("button", { name: /Mark as Completed/ }).click();
    await toast(page, /completed/i);
  });
});
