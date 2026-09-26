import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * The whole business in one pass, through the real UI and Django:
 * sign in → quotation → customer accepts → approve into an international order
 * → payment → procurement → cargo receipt → consolidated shipment → last-mile
 * delivery with proof → order completed, fully paid, visible on the customer.
 */
const EMAIL = process.env.E2E_EMAIL ?? "";
const PASSWORD = process.env.E2E_PASSWORD ?? "";
const S = Date.now().toString(36).toUpperCase().slice(-5);

async function apiJson(api: APIRequestContext, path: string) {
  const res = await api.get(`/api/proxy/${path}`);
  expect(res.ok(), `${path}: ${res.status()}`).toBeTruthy();
  return res.json();
}
const dialog = (page: Page) => page.getByRole("dialog").last();
const toast = (page: Page, text: string | RegExp) =>
  expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible();

test.describe("full business flow", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  test("quote to completed delivery", async ({ page, isMobile }) => {
    const tag = `${S}${isMobile ? "M" : "D"}`;
    const who = `E2E Flow ${tag}`;
    const what = `E2E 10 laptops ${tag}`;

    // Sign in
    await page.goto("/intake-quotes");
    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Intake & Quotes" })).toBeVisible();

    // Quotation for a new customer
    await page.getByRole("button", { name: "New Quotation" }).click();
    let d = dialog(page);
    await d.getByLabel("Search customer").fill(who);
    await d.getByRole("button", { name: "New customer" }).click();
    await d.getByLabel("New customer phone").fill(`+2557${Date.now().toString().slice(-8)}`);
    await d.getByRole("button", { name: "Register customer" }).click();
    await expect(d.getByText(who)).toBeVisible();
    await d.getByLabel("Service Type").selectOption("international");
    await d.getByLabel("Description").fill(what);
    await d.getByLabel("Origin").fill("China");
    await d.getByLabel("Destination").fill("Dar es Salaam");
    await d.getByRole("button", { name: "Save Request" }).click();
    await toast(page, /Quotation Q-\d+-\d+ recorded/);

    await page.goto(`/intake-quotes?search=${encodeURIComponent(what)}`);
    await page.getByRole("button", { name: "Respond" }).first().click();
    await dialog(page).getByLabel("Quoted Amount (TSh)").fill("4000000");
    await dialog(page).getByLabel("Estimated Delivery Date").fill("2026-12-20");
    await dialog(page).getByRole("button", { name: "Send Quotation" }).click();
    await toast(page, "Quotation sent to customer");

    await page.goto(`/intake-quotes?tab=waiting&search=${encodeURIComponent(what)}`);
    await page.getByRole("button", { name: "Accepted" }).first().click();
    await toast(page, "Customer acceptance recorded");

    // Approve into an international order
    await page.goto(`/intake-quotes?tab=answered&search=${encodeURIComponent(what)}`);
    await page.getByRole("button", { name: "Approve Order" }).first().click();
    await expect(dialog(page).getByLabel("Source origin")).not.toHaveValue("");
    await dialog(page).getByLabel("Order type").selectOption("bulk");
    await dialog(page).getByRole("button", { name: "Approve & Create Order" }).click();
    await page.waitForURL(/\/orders\/international\?open=\d+/);
    const orderId = Number(new URL(page.url()).searchParams.get("open"));
    let order = await apiJson(page.request, `orders/international/${orderId}/`);

    // Customer pays in full
    const modal = page.getByRole("dialog").filter({ hasText: "Payment Summary" });
    await modal.getByRole("button", { name: "Record Payment" }).click();
    await dialog(page).getByLabel("Amount (TSh)").fill("4000000");
    await dialog(page).getByRole("button", { name: "Record Payment" }).click();
    await toast(page, "Payment recorded");
    await page.keyboard.press("Escape");

    // Procurement: supplier selected and paid
    await page.goto(`/procurement?search=${order.reference}`);
    await page.getByRole("button", { name: order.reference }).first().click();
    await dialog(page).getByRole("button", { name: /Select Supplier/ }).click();
    d = dialog(page);
    await d.getByRole("combobox", { name: /^Supplier/ }).selectOption({ index: 1 });
    await d.getByLabel("Item Cost (TSh)").fill("2800000");
    await d.getByRole("button", { name: /Select Supplier|Save/ }).last().click();
    await toast(page, /supplier/i);
    await dialog(page).getByRole("button", { name: /Mark Supplier Paid/ }).click();
    await dialog(page).getByLabel("Payment Reference").fill(`TT-${tag}`);
    await dialog(page).getByRole("button", { name: /Mark as Paid|Mark Supplier Paid|Confirm/ }).last().click();
    await toast(page, /paid/i);

    // Shipping: received at cargo, consolidated, milestones to completion
    await page.goto(`/shipping?tab=waiting&search=${order.reference}`);
    await page.getByRole("button", { name: /^Receive$/ }).first().click();
    await dialog(page).getByLabel("Weight (kg)").fill("25");
    await dialog(page).getByLabel("CBM (m³)").fill("0.4");
    await dialog(page).getByRole("button", { name: /Receive/ }).last().click();
    await toast(page, /received/i);

    await page.goto(`/shipping?tab=ready&search=${order.reference}`);
    await page.getByRole("checkbox", { name: new RegExp(order.reference) }).check();
    await page.getByRole("button", { name: /Create New Shipment/ }).click();
    d = dialog(page);
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
    order = await apiJson(page.request, `orders/international/${orderId}/`);
    expect(order.status).toBe("ready_for_collection");

    // Last mile with proof of delivery
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
    await dialog(page).getByLabel(/Received by/).fill(who);
    await dialog(page).getByRole("button", { name: /Complete Delivery|Confirm/ }).last().click();
    await toast(page, /delivered/i);

    // Completed, fully paid, and on the customer's record
    order = await apiJson(page.request, `orders/international/${orderId}/`);
    expect(order.status).toBe("completed");
    expect(order.payment.status).toBe("fully_paid");
    expect(order.payment.due).toBe("0.00");
    await page.goto(`/orders/international?tab=completed&search=${order.reference}`);
    await expect(page.getByText(order.reference).first()).toBeVisible();
    await page.goto(`/people?search=${encodeURIComponent(who)}`);
    await expect(page.getByRole("row").filter({ hasText: who })).toContainText("1");
  });
});
