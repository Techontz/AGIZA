"""
Multi-vendor cart and checkout: one cart and one order for the customer, priced by the
server; shipping per origin from the Shipping Engine; one part per seller with the
commission captured; then fulfilment, payment, delivery, settlement and payouts.
"""
from decimal import Decimal as D

import pytest

from apps.accounts.constants import StaffLevel
from apps.catalog.models import Vendor
from apps.deliveries import services as deliveries
from apps.inventory.models import StockItem
from apps.marketplace.models import CategoryCommission, MarketplaceSettings, VendorFulfillment, VendorPayout
from apps.orders import services as order_services
from apps.orders.models import Order

from .conftest import APP, SELLER

pytestmark = pytest.mark.django_db


def fill_cart(client, lines):
    for variant, qty in lines:
        res = client.post(f"{APP}/cart/items/", {"variant": variant.pk, "quantity": qty}, format="json")
        assert res.status_code == 201, res.json()


def checkout(client, address, shop, lines, key="mv-checkout-0001", **extra) -> Order:
    fill_cart(client, lines)
    res = client.post(f"{APP}/checkout/place-order/", {"address": address.pk, "shipping_method": shop.rider.pk,
                                                        "payment_method": "pay_later", "idempotency_key": key, **extra},
                      format="json")
    assert res.status_code == 201, res.json()
    return Order.objects.get(reference=res.json()["order"]["reference"])


def test_one_cart_grouped_by_store(app, shop, vendor_a, vendor_b):
    fill_cart(app, [(vendor_b.variant, 1), (shop.cable_variant, 2), (vendor_a.variant, 1)])
    cart = app.get(f"{APP}/cart/").json()
    assert [g["vendor"]["name"] for g in cart["groups"]] == ["AGIZA", "Vendor B Fashion", "Vendor A Electronics"]
    assert [g["subtotal"] for g in cart["groups"]] == ["30000.00", "45000.00", "320000.00"]
    assert cart["subtotal"] == "395000.00" and cart["item_count"] == 4
    assert {line["vendor"]["slug"] for line in cart["items"]} == {"agiza", vendor_a.vendor.slug, vendor_b.vendor.slug}


def test_delivery_is_priced_per_pickup_origin_and_explained(app, home, shop, vendor_a, vendor_b):
    fill_cart(app, [(shop.cable_variant, 1), (vendor_a.variant, 1), (vendor_b.variant, 1)])
    quote = app.post(f"{APP}/checkout/preview/", {"address": home.pk, "shipping_method": shop.rider.pk},
                     format="json").json()
    rider = next(o for o in quote["shipping_options"] if o["code"] == "RIDER")
    # AGIZA's warehouse, vendor A's shop and vendor B's shop are three pickups; each is a rider trip
    # priced by the same Shipping Engine rule (800/kg, minimum 3,000).
    assert rider["cost"] == "9000.00" and quote["shipping_fee"] == "9000.00"
    assert sorted((s["label"], s["cost"]) for s in rider["shipments"]) == [
        ("From AGIZA, Dar es Salaam", "3000.00"),
        ("From Vendor A Electronics, Dar es Salaam", "3000.00"),
        ("From Vendor B Fashion, Dar es Salaam", "3000.00"),
    ]
    assert quote["total"] == str(D("15000") + D("320000") + D("45000") + D("9000")) + ".00"
    # Changing the engine's rule changes checkout, with no app change.
    shop.rider_rule.minimum_charge = D("2500")
    shop.rider_rule.save()
    again = app.post(f"{APP}/checkout/preview/", {"address": home.pk, "shipping_method": shop.rider.pk},
                     format="json").json()
    assert again["shipping_fee"] == "7500.00"


def test_goods_in_agiza_warehouses_still_travel_together(app, home, shop, make_seller):
    """A staff-managed vendor whose stock AGIZA holds ships with AGIZA's own goods (unchanged behaviour)."""
    managed = Vendor.objects.create(name="Home Essentials Ltd", profit_type="percent", profit_value=D("20"))
    shop.product.vendor = managed
    shop.product.save()
    fill_cart(app, [(shop.variant, 1), (shop.cable_variant, 1)])
    quote = app.post(f"{APP}/checkout/preview/", {"address": home.pk, "shipping_method": shop.rider.pk},
                     format="json").json()
    assert quote["shipping_fee"] == "3000.00"
    rider = next(o for o in quote["shipping_options"] if o["code"] == "RIDER")
    assert [s["label"] for s in rider["shipments"]] == ["From AGIZA, Dar es Salaam"]


def test_place_order_splits_it_by_seller_with_commission(app, home, shop, vendor_a, vendor_b):
    CategoryCommission.objects.create(category=shop.product.category, percent=D("12.5"))
    vb = vendor_b.vendor
    vb.commission_mode, vb.profit_type, vb.profit_value = "custom", "fixed", D("2000")  # TSh 2,000 per unit
    vb.save()
    order = checkout(app, home, shop, [(shop.cable_variant, 1), (vendor_a.variant, 1), (vendor_b.variant, 2)])
    assert order.total_amount == D("15000") + D("320000") + D("90000") + D("9000")
    assert Order.objects.count() == 1  # one order for the customer
    parts = {f.vendor.name if f.vendor else "AGIZA": f for f in VendorFulfillment.objects.filter(order=order)}
    assert set(parts) == {"AGIZA", "Vendor A Electronics", "Vendor B Fashion"}
    a, b, agiza = parts["Vendor A Electronics"], parts["Vendor B Fashion"], parts["AGIZA"]
    assert (a.subtotal, a.commission, a.vendor_net) == (D("320000"), D("40000"), D("280000"))  # category 12.5%
    assert (b.subtotal, b.commission, b.vendor_net) == (D("90000"), D("4000"), D("86000"))  # fixed 2,000 × 2
    assert (agiza.subtotal, agiza.commission, agiza.vendor_net) == (D("15000"), D("0"), D("0"))
    assert [p.shipping_fee for p in (agiza, a, b)] == [D("3000")] * 3
    assert sum(p.subtotal + p.shipping_fee for p in parts.values()) == order.total_amount
    # Every line records who sold it and the commission taken.
    assert {(i.product_name, i.vendor_id, i.commission_amount) for i in order.items.all()} == {
        ("USB-C Cable", None, None), ("Tecno Spark 20", vendor_a.vendor.pk, D("40000")),
        ("Kitenge Dress", vb.pk, D("4000"))}
    # Stock is reserved at each seller's own location.
    assert StockItem.objects.get(variant=vendor_a.variant).reserved == 1
    assert StockItem.objects.get(variant=vendor_b.variant).reserved == 2
    assert StockItem.objects.get(variant=vendor_a.variant).warehouse == vendor_a.vendor.warehouse
    # The customer sees one order, with who sells what, and never commissions.
    body = app.get(f"{APP}/orders/{order.reference}/").json()
    assert [s["vendor"]["name"] for s in body["sellers"]] == ["AGIZA", "Vendor A Electronics", "Vendor B Fashion"]
    assert body["amounts"] == {"subtotal": "425000.00", "shipping_fee": "9000.00", "total": "434000.00"}
    assert "commission" not in str(body) and "vendor_net" not in str(body)


def test_commission_is_captured_at_order_time(app, home, shop, vendor_a):
    order = checkout(app, home, shop, [(vendor_a.variant, 1)])
    settings = MarketplaceSettings.load()
    settings.default_commission_percent = D("25")
    settings.save()
    part = VendorFulfillment.objects.get(order=order, vendor=vendor_a.vendor)
    assert part.commission == D("32000")  # the 10% default when ordered


def test_client_totals_and_prices_are_never_trusted(app, home, shop, vendor_a):
    fill_cart(app, [(vendor_a.variant, 1)])
    res = app.post(f"{APP}/checkout/place-order/", {
        "address": home.pk, "shipping_method": shop.rider.pk, "payment_method": "pay_later",
        "idempotency_key": "mv-tamper-01", "expected_total": "1000.00", "unit_price": "1", "commission": "0",
        "shipping_fee": "0"}, format="json")
    assert res.status_code == 409 and res.json()["error"]["code"] == "price_changed"
    assert res.json()["error"]["details"]["total"] == "323000.00"
    assert Order.objects.count() == 0


def test_staff_see_the_full_order_and_every_vendor_part(app, home, shop, vendor_a, vendor_b, staff):
    order = checkout(app, home, shop, [(shop.cable_variant, 1), (vendor_a.variant, 1), (vendor_b.variant, 1)])
    rows = staff.get("/api/marketplace/fulfillments/", {"order": order.pk}).json()["results"]
    assert sorted(r["vendor"]["name"] for r in rows) == ["AGIZA", "Vendor A Electronics", "Vendor B Fashion"]
    assert staff.get(f"/api/orders/shop/{order.pk}/").json()["total_amount"] == "389000.00"
    only_a = staff.get("/api/marketplace/fulfillments/", {"vendor": vendor_a.vendor.pk}).json()["results"]
    assert [r["vendor"]["name"] for r in only_a] == ["Vendor A Electronics"]


def _deliver(order, admin):
    delivery = order.deliveries.get()
    driver = __import__("apps.accounts.models", fromlist=["User"]).User.objects.create(
        email="rider@agiza.test", full_name="Rider One", staff_level=StaffLevel.DRIVER)
    deliveries.assign_driver(delivery, driver, user=admin)
    deliveries.transition(delivery, "out_for_delivery", user=admin)
    deliveries.complete(delivery, user=admin, signature_name="Neema Joseph")


def test_fulfilment_payment_delivery_settlement_and_payout(app, home, shop, vendor_a, vendor_b, staff):
    order = checkout(app, home, shop, [(shop.cable_variant, 1), (vendor_a.variant, 1), (vendor_b.variant, 1)])
    admin = staff.user
    order_services.transition(order, "processing", admin)
    # AGIZA can't dispatch until both vendors have the goods ready for collection.
    res = staff.post(f"/api/orders/shop/{order.pk}/ship/", {}, format="json")
    assert res.status_code == 409 and "Vendor A Electronics" in res.json()["error"]["message"]
    for seller in (vendor_a, vendor_b):
        part = VendorFulfillment.objects.get(order=order, vendor=seller.vendor)
        assert seller.client.post(f"{SELLER}/orders/{part.pk}/ready/").status_code == 409  # accept first
        assert seller.client.post(f"{SELLER}/orders/{part.pk}/accept/").json()["status"] == "accepted"
        assert seller.client.post(f"{SELLER}/orders/{part.pk}/ready/").json()["status"] == "ready"
    assert staff.post(f"/api/orders/shop/{order.pk}/ship/", {}, format="json").status_code == 200
    order.refresh_from_db()
    assert set(VendorFulfillment.objects.filter(order=order).values_list("status", flat=True)) == {"shipped"}
    delivery = order.deliveries.get()
    assert "Vendor A Electronics (vendor)" in delivery.pickup_point and "Dar Central" in delivery.pickup_point
    assert StockItem.objects.get(variant=vendor_a.variant).quantity == 9  # dispatched from the vendor
    # Delivered but unpaid: earnings still pending.
    _deliver(order, admin)
    order.refresh_from_db()
    assert order.status == "delivered"
    assert set(VendorFulfillment.objects.filter(order=order, vendor__isnull=False)
               .values_list("settlement_status", flat=True)) == {"pending"}
    # Paid in full → payable.
    order_services.record_payment(order, amount=order.total_amount, method="cash", user=admin)
    part_a = VendorFulfillment.objects.get(order=order, vendor=vendor_a.vendor)
    assert part_a.settlement_status == "payable" and part_a.status == "delivered"
    earnings = vendor_a.client.get(f"{SELLER}/earnings/").json()["summary"]
    assert earnings["payable"] == "288000.00" and earnings["commission"] == "32000.00"
    # Staff record the transfer; the amount is computed, never typed.
    finance = staff
    res = finance.post("/api/marketplace/payouts/", {"vendor": vendor_a.vendor.pk, "method": "mobile_money",
                                                     "transaction_reference": "MPESA-QX12", "amount": "1"},
                       format="json")
    assert res.status_code == 201, res.json()
    assert res.json()["amount"] == "288000.00" and res.json()["orders"] == 1
    part_a.refresh_from_db()
    assert part_a.settlement_status == "settled" and part_a.payout == VendorPayout.objects.get()
    assert vendor_a.client.get(f"{SELLER}/earnings/").json()["summary"]["paid_out"] == "288000.00"
    assert finance.post("/api/marketplace/payouts/", {"vendor": vendor_a.vendor.pk, "method": "cash"},
                        format="json").status_code == 409  # nothing left to pay
    # Vendor B hasn't been paid.
    summary = staff.get("/api/marketplace/earnings/").json()
    rows = {r["vendor"]["name"]: r for r in summary["vendors"]}
    assert rows["Vendor B Fashion"]["payable"] == "40500.00" and rows["Vendor A Electronics"]["paid_out"] == "288000.00"
    assert summary["marketplace"]["platform_commission"] == "36500.00"
    assert summary["marketplace"]["agiza_own_sales"] == "15000.00"


def test_cancelling_voids_earnings_and_releases_vendor_stock(app, home, shop, vendor_a):
    order = checkout(app, home, shop, [(vendor_a.variant, 2)])
    res = app.post(f"{APP}/orders/{order.reference}/cancel/", {"reason": "Ordered by mistake"}, format="json")
    assert res.status_code == 200
    part = VendorFulfillment.objects.get(order=order)
    assert part.status == "cancelled" and part.settlement_status == "void"
    assert StockItem.objects.get(variant=vendor_a.variant).reserved == 0
    assert vendor_a.client.post(f"{SELLER}/orders/{part.pk}/accept/").status_code == 409
    assert vendor_a.client.get(f"{SELLER}/earnings/").json()["summary"]["gross_sales"] == "0.00"


def test_only_finance_or_admins_record_payouts(vendor_a, client_for):
    sales = client_for(StaffLevel.SALES)
    assert sales.post("/api/marketplace/payouts/", {"vendor": vendor_a.vendor.pk, "method": "cash"},
                      format="json").status_code == 403
    assert client_for(StaffLevel.FINANCE).get("/api/marketplace/payouts/").status_code == 200


def test_only_managers_change_commission(client_for):
    assert client_for(StaffLevel.ADMIN_L1).patch("/api/marketplace/settings/", {"default_commission_percent": "5"},
                                                 format="json").status_code == 403
    res = client_for(StaffLevel.ADMIN_L2).patch("/api/marketplace/settings/", {"default_commission_percent": "7.5"},
                                                format="json")
    assert res.status_code == 200 and res.json()["default_commission_percent"] == "7.50"
    assert client_for(StaffLevel.ADMIN_L2).patch("/api/marketplace/settings/", {"default_commission_percent": "150"},
                                                 format="json").status_code == 400


def test_guest_cart_is_priced_by_the_server_and_merged_at_sign_in(anon, app, shop, vendor_a):
    guest = anon.post(f"{APP}/cart/guest/", {"items": [{"variant": vendor_a.variant.pk, "quantity": 2},
                                                       {"variant": shop.cable_variant.pk, "quantity": 1},
                                                       {"variant": shop.draft_variant.pk, "quantity": 1}]},
                      format="json").json()
    assert guest["subtotal"] == "655000.00"
    assert [g["vendor"]["name"] for g in guest["groups"]] == ["AGIZA", "Vendor A Electronics"]
    assert [i["issue"] for i in guest["items"] if i["name"] == "Unreleased Phone"] == ["No longer available"]
    fill_cart(app, [(vendor_a.variant, 9)])
    merged = app.post(f"{APP}/cart/merge/", {"items": [{"variant": vendor_a.variant.pk, "quantity": 2},
                                                       {"variant": shop.cable_variant.pk, "quantity": 1},
                                                       {"variant": shop.draft_variant.pk, "quantity": 1}]},
                      format="json").json()
    quantities = {i["name"]: i["quantity"] for i in merged["items"]}
    assert quantities == {"Tecno Spark 20": 10, "USB-C Cable": 1}  # capped at the 10 in stock
    assert "Only 1 more of Tecno Spark 20 could be added." in merged["notes"]
    assert "Unreleased Phone is no longer available." in merged["notes"]
