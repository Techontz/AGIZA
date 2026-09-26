import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/** Phase 5 — Commerce & Finance screens. */
const SHOTS = process.env.E2E_SCREENSHOTS;

test("Commerce & Finance screens render real data", async ({ page, isMobile }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const [path, title, shot] of [
    ["/warehouse", "Warehouse & Pick Up Points", "warehouse"],
    ["/warehouse?tab=inventory", "Warehouse & Pick Up Points", "inventory"],
    ["/warehouse?tab=shop", "Warehouse & Pick Up Points", "shop-floor"],
    ["/ecommerce", "E-commerce Platform Management", "ecommerce-menu"],
    ["/ecommerce?section=products", "Products Management", "products"],
    ["/ecommerce?section=vendors", "Vendors", "vendors"],
    ["/ecommerce?section=settings", "Store Settings", "store-settings"],
    ["/orders/ecommerce", "E-commerce Shop Orders", "shop-orders"],
    ["/finance/payments", "Finance Management", "finance-payments"],
    ["/finance/invoices", "Finance Management", "finance-invoices"],
    ["/finance/wallets", "Finance Management", "finance-wallets"],
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.locator("main .animate-pulse")).toHaveCount(0, { timeout: 10_000 });
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/p5-${shot}-${isMobile ? "mobile" : "desktop"}.png`, fullPage: !isMobile });
  }
  expect(errors).toEqual([]);
});

/* ------------------------------------------------------------------------ */
/* E-commerce order through fulfilment, then finance, in the real UI.       */
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

test.describe("commerce workflow", () => {
  test.describe.configure({ mode: "serial" });
  let order: { id: number; reference: string; total_amount: string };
  let customerId: number;

  test("setup: a shop order for an in-stock product (stock is reserved)", async ({ page }) => {
    const api = page.request;
    const variants = await apiJson(api, "get", "catalog/products/variants?search=ELEC-SONY");
    const customer = await apiJson(api, "post", "customers/", { full_name: `E2E Shopper ${S}`, phone: "+255700222333" });
    customerId = customer.id;
    order = await apiJson(api, "post", "orders/shop/", {
      customer: customer.id, items: [{ variant: variants[0].id, quantity: 1 }], shipping_address: "Plot 7, Msasani",
      area: "Msasani", delivery_fee: "10000", channel: "manual",
    });
    expect(order.reference).toMatch(/^ECO-/);
  });

  test("shop order: processing, ship, delivered by proof of delivery", async ({ page }) => {
    await page.goto(`/orders/ecommerce?search=${order.reference}`);
    await page.getByRole("button", { name: /Show details/ }).first().click();
    await page.getByRole("button", { name: /Mark Processing/ }).click();
    await dialog(page).getByRole("button", { name: "Mark Processing" }).click();
    await toast(page, /is now processing/);
    await page.getByRole("button", { name: /Ship Order/ }).click();
    await dialog(page).getByRole("button", { name: /Ship/ }).last().click();
    await toast(page, /shipped/);
    const shipped = await apiJson(page.request, "get", `orders/shop/${order.id}/`);
    expect(shipped.status).toBe("shipped");
    const d = shipped.delivery;
    const drivers = await apiJson(page.request, "get", "deliveries/drivers");
    await apiJson(page.request, "post", `deliveries/${d.id}/assign-driver/`, { driver: drivers[0].id });
    await apiJson(page.request, "post", `deliveries/${d.id}/transition/`, { status: "out_for_delivery" });
    const form = { multipart: { signature_name: `E2E Shopper ${S}` } };
    expect((await page.request.post(`/api/proxy/deliveries/${d.id}/complete/`, form)).ok()).toBeTruthy();
    expect((await apiJson(page.request, "get", `orders/shop/${order.id}/`)).status).toBe("delivered");
    await page.reload();
    await expect(page.locator("tbody tr").first().getByText(/^delivered$/i)).toBeVisible();
  });

  test("finance: record payment, receipt, invoice PDF, wallet top-up", async ({ page }) => {
    await page.goto(`/finance/payments?search=${order.reference}`);
    await page.getByRole("button", { name: /Record Payment/ }).first().click();
    await dialog(page).getByLabel("Amount (TSh)").fill(String(Number(order.total_amount)));
    await dialog(page).getByRole("button", { name: /Record Payment/ }).last().click();
    await toast(page, /recorded on/);
    await page.getByRole("button", { name: /Print Receipt/ }).first().click();
    await expect(page.getByText("PAYMENT RECEIPT")).toBeVisible();
    await page.keyboard.press("Escape");

    const inv = await apiJson(page.request, "post", "finance/invoices/", { source: "order", order: order.id });
    await page.goto(`/finance/invoices?search=${inv.reference}`);
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: /Download/ }).first().click();
    expect((await download).suggestedFilename()).toBe(`${inv.reference}.pdf`);

    await page.goto(`/finance/wallets?search=E2E Shopper ${S}`);
    await page.getByRole("button", { name: /Manage/ }).first().click();
    await dialog(page).getByRole("button", { name: /Top Up/ }).first().click();
    await dialog(page).getByLabel("Amount (TSh)").fill("50000");
    await dialog(page).getByRole("button", { name: /Top Up/ }).last().click();
    await toast(page, /topped up/);
    const wallet = await apiJson(page.request, "get", `finance/wallets/${customerId}/`);
    expect(wallet.wallet_balance).toBe("50000.00");
  });

  test("warehouse: receive stock and see it in the ledger", async ({ page }) => {
    const variants = await apiJson(page.request, "get", "catalog/products/variants?search=ELEC-SONY");
    const stock = await apiJson(page.request, "get", `inventory/stock/?search=ELEC-SONY&floor=warehouse`);
    const before = stock.results[0].quantity;
    await apiJson(page.request, "post", "inventory/stock/receive/", {
      variant: variants[0].id, warehouse: stock.results[0].warehouse.id, quantity: 4, note: `E2E ${S}`,
    });
    await page.goto("/warehouse?tab=inventory&search=ELEC-SONY");
    await expect(page.locator("tbody").getByText(String(before + 4)).first()).toBeVisible();
  });
});
