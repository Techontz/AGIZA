# AGIZA multi-vendor marketplace

AGIZA is a marketplace: products are sold by **AGIZA itself** or by **vendors**. One Django
backend (`backend/`) serves the admin (`agiza_admin/`), the customer app (`agiza_mobile/`)
and the public website (`agiza_web/`). There is one product catalogue, one cart per
customer, one order per checkout and one payment flow.

## Concepts

| Concept | Where | Notes |
|---|---|---|
| Vendor / store | `catalog.Vendor` | Existing table, extended. Two kinds: **staff-managed** (no owner, usually stock in AGIZA warehouses — the vendors that existed before) and **self-service** (`owner` = the AGIZA customer account that applied). |
| Sold by AGIZA | `Product.vendor = NULL` | Shown as the store `agiza` ("AGIZA"). |
| Approval status | `Vendor.approval_status` | `pending → under_review → approved ⇄ suspended`; `changes_requested` (vendor edits → `pending`); `rejected` (→ `under_review` if AGIZA reconsiders). Every step is in `marketplace.VendorStatusHistory` and the audit log. Existing vendors were migrated as `approved`. |
| Store location | `Vendor.warehouse` | A `locations.Warehouse` of type `vendor`, created on approval in the vendor's city. Vendor stock lives there, so the stock ledger, reservation, dispatch and release are the existing inventory services. Suspending the vendor makes it non-reservable. |
| Product moderation | `Product.review_status` | `not_required` (AGIZA / staff-created), `pending`, `approved`, `rejected`, `disabled`. Vendor products are shown only when `not_required`/`approved`. With review on (default), a new product or a change to name, description, category, brand, condition, specifications or images goes back to `pending`; price/stock changes don't. |
| Listing state (vendor UI) | derived | `draft`, `pending_review`, `published`, `rejected`, `inactive`, `disabled`. |
| Commission | `marketplace.commission` | First match: product rate (vendor agreement "per product") → vendor agreement (`commission_mode=custom`) → subcategory rate → category rate (`CategoryCommission`) → marketplace default (`MarketplaceSettings.default_commission_percent`, 10% initially). Fixed agreements are per unit. Captured per order line at order time. |
| Order | `orders.Order` | Unchanged: one per checkout, one payment. |
| Vendor fulfillment | `marketplace.VendorFulfillment` | One per seller per order (vendor `NULL` = AGIZA's own items): status, gross, commission, vendor net, delivery-fee share, settlement status, payout. |
| Settlement | `VendorFulfillment.settlement_status` | `pending` → `payable` (order **delivered and fully paid**) → `settled` (in a `VendorPayout`). Cancelled order → `void`. |
| Payout | `marketplace.VendorPayout` | Staff record a transfer made outside the system; the amount is the sum of the chosen payable earnings. No automatic payouts. |

### Fulfilment flow

```
pending ──(vendor: accept)──► accepted ──(vendor: ready)──► ready
   └──(staff: order → processing, AGIZA/managed vendors only)──► accepted
AGIZA ships the order (only when every self-service vendor part is ready) ──► shipped ──► delivered
order cancelled ──► cancelled (earnings void, stock released)
```

### Shipping

The Shipping Engine prices one shipment; the cart is split into shipments by origin (the
existing behaviour). Goods held in AGIZA warehouses travel together whoever sells them;
goods a vendor keeps at its own premises are collected there and priced as their own
shipment from the vendor's city. The delivery fee is the sum, and each delivery option
lists its shipments (`shipments: [{label, origin, cost}]`). The fee is allocated to the
vendor fulfilments it pays for (AGIZA revenue).

**TZS 3,000 Rider Delivery** is Shipping Engine configuration, not code: `ShippingRule`
route *Dar es Salaam → Dar es Salaam*, method *Rider Delivery* (RIDER), per-kg 800 TZS with a
**minimum charge of 3,000 TZS** (seeded demo data, editable in Admin → Shipping Engine →
Rules). Neither app nor website contains the value.

## Customer API (`/api/app/`, customer JWT; public where noted)

Every product card now has `vendor` (the seller) and `created_at`:

```json
"vendor": {"slug": "agiza", "name": "AGIZA", "logo": null, "verified": true, "is_agiza": true, "city": null}
"vendor": {"slug": "kariakoo-electronics", "name": "Kariakoo Electronics", "logo": "https://…/api/app/stores/kariakoo-electronics/logo/", "verified": true, "is_agiza": false, "city": "Dar es Salaam"}
```

| Endpoint | Auth | Notes |
|---|---|---|
| `GET products/?search=&category=&store=<slug>&min_price=&max_price=&featured=&deals=&ordering=newest\|price\|-price\|name\|popular&page=&page_size=` | public | `search` is normalised server-side (case, accents, punctuation, joined words). `store=agiza` = sold by AGIZA. |
| `GET products/<id>/` | public | Detail incl. `vendor`. |
| `GET stores/?search=&page=` | public | `[{slug, name, logo, banner, verified, is_agiza, city, rating, joined, products_count}]`; page 1 starts with AGIZA when it sells anything. |
| `GET stores/<slug>/` | public | Same plus `description`. `agiza` works. |
| `GET stores/<slug>/logo/`, `…/banner/` | public | Image (public stores only). |
| `GET cart/` | customer | Adds `items[].vendor` and `groups: [{vendor, subtotal, variant_ids}]` (AGIZA first). |
| `POST cart/guest/` `{items: [{variant, quantity}]}` | public | Prices a browser cart exactly like a saved cart (same shape; `items[].id` is `null`). |
| `POST cart/merge/` `{items: [...]}` | customer | Adds a browser cart to the saved cart (capped at stock); returns the cart plus `notes: [str]`. |
| `POST checkout/preview/` | customer | `shipping_options[].shipments: [{label, origin, cost}]`. |
| `POST checkout/place-order/` | customer | Unchanged contract (idempotency key, `expected_total`). |
| `GET orders/<ref>/` | customer | Shop orders add `sellers: [{vendor, status, status_display, item_count, subtotal, shipping_fee}]` and `items[].vendor`. No commission is ever exposed to customers. |

### Seller API (`/api/app/seller/`, customer JWT of the store owner)

Every view resolves the store from the signed-in account; other stores' records are 404.
Suspended stores can read but not change anything.

| Endpoint | Notes |
|---|---|
| `GET store/` | My store/application (404 if none): business, payout, `approval_status(_display)`, `review_note`, `can_sell`, `can_edit_application`, `logo`, `banner`, `commission` (label), `payout_schedule`, `history`. |
| `POST store/` | Apply: `name, city (id), business_address, contact_person, business_type (individual\|company), phone, email?, description?, legal_name?, registration_number?, tin?, payout_method (mobile_money\|bank)?, payout_provider?, payout_account_name?, payout_account_number?` |
| `PATCH store/` | Pending / changes requested: edit the application (resubmits). Approved: `description, city, business_address, contact_person, phone, email, payout_*`. |
| `POST store/logo/`, `store/banner/` (multipart `file`) · `GET` same | JPEG/PNG/WebP ≤ 4 MB. |
| `GET dashboard/` | `{store, products: {published, pending_review, draft, rejected, inactive, disabled}, earnings, orders_to_prepare, low_stock}` |
| `GET products/?search=&page=` · `POST products/` | Create: `name, category (top-level id), subcategory?, brand?, condition, condition_description?, description?, price, compare_at_price?, weight_kg (required), length_cm?, width_cm?, height_cm?, keywords?, ready_to_ship_days?, status (draft\|active\|inactive), stock?, specifications? [{name,value}], has_variations, variants? [{id?, name, sku?, price?, compare_at_price?, weight_kg?, stock, status}]` |
| `GET/PATCH/DELETE products/<id>/` | Delete removes a never-ordered product, otherwise deactivates it. |
| `POST products/<id>/images/` (multipart) · `POST/DELETE products/<id>/images/<image_id>/` | POST on an image = make it the main image. |
| `POST products/<id>/stock/` `{variant, quantity}` | Units on hand at the store location (ledgered). |
| `GET images/<id>/` | Own product images (incl. drafts). |
| `GET orders/?status=open\|pending\|accepted\|ready\|shipped\|delivered\|cancelled` · `GET orders/<id>/` | This store's part of each order: items, gross, commission, net, settlement, customer first name and delivery city only. |
| `POST orders/<id>/accept/`, `orders/<id>/ready/` | |
| `GET earnings/` | `{summary: {gross_sales, commission, net_earnings, pending, payable, paid_out, orders}, payout_schedule, payout_account, payouts: [...]}` |

## Staff API (`/api/`, staff session)

| Endpoint | Permission | Notes |
|---|---|---|
| `GET catalog/vendors/?approval_status=pending,under_review&self_service=true&search=` | E-commerce view | Rows add `slug, approval_status(_display), self_service, owner{name, phone, reference, customer_id}, description, city, city_name, business_*, payout_*, submitted_at, reviewed_at, review_note, logo_url, banner_url, warehouse, pending_products, commission_mode`. |
| `GET catalog/vendors/counts/` | view | Count per approval status + `all`. |
| `POST catalog/vendors/<id>/review/` `{status, note}` | E-commerce edit | `note` required for rejected / changes_requested / suspended. |
| `GET catalog/vendors/<id>/history/` | view | |
| `POST catalog/vendors/<id>/media/logo/` (or `banner`) | edit | |
| `GET catalog/vendors/<id>/<logo\|banner>/file/` | view | |
| `GET catalog/products/?seller=agiza\|vendors\|<vendor id>&review_status=pending` | view | Rows add `seller{id, name, slug, self_service}, review_status(_display), review_note`. |
| `POST catalog/products/<id>/moderate/` `{action: approve\|reject\|disable, note}` | edit | Self-service vendors' products only. |
| `GET/PATCH marketplace/settings/` | view / **manage** | `default_commission_percent, require_product_review, vendor_applications_open, payout_schedule`. |
| `GET/POST/PATCH/DELETE marketplace/category-commissions/` | view / **manage** | `{category, percent}` |
| `GET marketplace/fulfillments/?vendor=<id>\|agiza&order=<order id>&status=&settlement_status=payable` | E-commerce / Orders / Finance view | |
| `GET marketplace/earnings/?vendor=<id>` | E-commerce / Finance view | Marketplace totals + a row per vendor (gross, commission, net, pending, payable, paid out). |
| `GET/POST marketplace/payouts/` `{vendor, method, transaction_reference?, paid_at?, notes?, fulfillments?: [ids]}` | Finance edit | Amount computed from payable earnings. |
| `POST orders/shop/<id>/ship/` | existing | Now refused (409) until every self-service vendor part is ready. |

## Clients

- **agiza_admin** — Vendors (review, profile, branding, products, orders, earnings, history), product
  moderation, Marketplace Settings (default / category commission, product review, applications,
  payout schedule), Vendor Earnings & Payouts, and a Sellers block on each shop order.
- **agiza_web** — the public marketplace and the vendor seller area (`/sell`, `/sell/apply`, `/seller/*`).
  Server rendering reads the public catalogue with `X-Storefront-Key` (`STOREFRONT_SERVER_KEY`), which
  skips only the per-IP anonymous throttle on public GETs. Orders it places carry
  `X-Agiza-Channel: web` and are recorded as channel "Online store".
- **agiza_mobile** — seller on product tiles, Sold by card, Stores list and store pages, cart grouped by
  store, multi-shipment explanation at checkout, Sellers on the order.

## Known limitations

- No automatic vendor payouts: transfers happen outside the system and are recorded by staff.
- One last-mile delivery per order; the pickup points are listed on the delivery, while each vendor's
  readiness is tracked on its fulfilment. There is no separate rider task per pickup.
- Vendors can't cancel their part of an order; they contact AGIZA, and staff cancel the order.
- Returns and refunds after delivery keep using the existing Returns module; they don't yet reverse a
  vendor's earnings automatically (adjust before recording the payout).
- Store ratings are the value staff set on the vendor; there are no customer reviews yet.
- A delivery method a product allows (e.g. "Pickup In Store") applies to vendor items too; restrict a
  vendor product's methods in the admin product editor if needed.
- Historical orders (before the marketplace) have their seller recorded but no fulfilments or
  commission.
