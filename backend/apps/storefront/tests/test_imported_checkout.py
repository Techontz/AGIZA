"""
Imported products: shipped from abroad to AGIZA's hub (the store's city), then delivered like
local items. Both legs are priced by the Shipping Engine, the items need no local stock, and
the order is paid when it is placed.
"""
from decimal import Decimal as D

import pytest
from rest_framework.test import APIClient

from apps.core.workflow import WorkflowError
from apps.inventory.models import StockItem
from apps.orders import services as order_services
from apps.orders.models import Order
from apps.shipping_engine.models import ShippingRule

from .conftest import APP

pytestmark = pytest.mark.django_db


def add(client, variant, qty=1):
    return client.post(f"{APP}/cart/items/", {"variant": variant.pk, "quantity": qty}, format="json")


def preview(client, address, **extra):
    return client.post(f"{APP}/checkout/preview/", {"address": address.pk, **extra}, format="json").json()


def place(client, address, quote, payment_method="mobile_money", key="import-key-0001"):
    return client.post(f"{APP}/checkout/place-order/", {
        "address": address.pk, "shipping_method": quote["selected_shipping_method"],
        "import_method": quote["selected_import_method"], "payment_method": payment_method,
        "idempotency_key": key, "expected_total": quote["total"]}, format="json")


def test_imported_products_are_orderable_without_local_stock_and_say_where_they_ship_from(api, imported):
    card = next(p for p in api.get(f"{APP}/products/").json()["results"] if p["name"] == "Mini Drone")
    assert card["ships_from"] == "China" and card["in_stock"] is True
    local = next(p for p in api.get(f"{APP}/products/").json()["results"] if p["name"] == "Galaxy A54")
    assert local["ships_from"] is None
    detail = api.get(f"{APP}/products/{imported.drone.pk}/").json()
    assert detail["ships_from"] == "China" and detail["variants"][0]["available"] == 100


def test_delivery_calculator_prices_both_legs_from_the_shipping_engine(api, imported):
    res = api.get(f"{APP}/delivery-estimate/", {"variant": imported.drone_variant.pk, "city": imported.dar.pk})
    assert res.status_code == 200
    body = res.json()
    assert body["imported"] is True and body["ships_from"] == "China" and body["prepayment_required"] is True
    air = body["import_options"][0]
    assert air["name"] == "Air Freight" and air["cost"] == "75000.00"  # max(2 kg × $12, $30) × 2,500
    assert air["estimated_delivery"] == "7–14 days" and air["shipments"][0]["label"] == "From China"
    sea = next(o for o in body["import_options"] if o["name"] == "Sea Freight")
    assert sea["available"] is False and "custom quote" in sea["message"]
    local = {o["name"]: o for o in body["shipping_options"] if o["available"]}
    assert local["Pickup In Store"]["cost"] == "0.00" and local["Rider Delivery"]["cost"] == "3000.00"
    assert local["Rider Delivery"]["shipments"][0]["label"] == "From AGIZA, Dar es Salaam (with your imported items)"

    local_item = api.get(f"{APP}/delivery-estimate/", {"variant": imported.variant.pk, "city": imported.dar.pk}).json()
    assert local_item["imported"] is False and local_item["import_options"] == []
    assert api.get(f"{APP}/delivery-estimate/", {"variant": imported.draft_variant.pk, "city": imported.dar.pk}).status_code == 404
    assert api.get(f"{APP}/delivery-estimate/", {"variant": imported.drone_variant.pk}).status_code == 400


def test_checkout_adds_the_import_leg_and_requires_payment(app, imported, home, selcom):
    assert add(app, imported.drone_variant, 1).status_code in (200, 201)
    add(app, imported.variant, 1)  # a local phone in the same cart
    cart = app.get(f"{APP}/cart/").json()
    drone = next(i for i in cart["items"] if i["name"] == "Mini Drone")
    assert drone["imported"] is True and drone["origin"] == "China" and drone["issue"] == ""
    assert cart["has_imported"] is True

    quote = preview(app, home, shipping_method=imported.rider.pk)
    assert quote["can_place_order"] is True, quote["issues"]
    assert quote["selected_import_method"] == imported.air.pk and quote["import_fee"] == "75000.00"
    # Rider from Dar: the phone (0.5 kg) and the drone once it reaches Dar (2 kg) are one shipment at 800/kg, min 3,000
    assert quote["delivery_fee"] == "3000.00" and quote["shipping_fee"] == "78000.00"
    assert quote["total"] == str(D("850000") + D("500000") + D("78000")) + ".00"
    assert quote["prepayment_required"] is True
    assert [m["code"] for m in quote["payment_methods"]] == ["mobile_money"]  # no "Pay later"
    assert quote["estimated_delivery"] == "7–15 days"  # air 7–14 days, then the rider 0–1 day

    assert place(app, home, quote, payment_method="pay_later").status_code == 400
    res = place(app, home, quote)
    assert res.status_code == 201, res.json()
    body = res.json()
    assert body["payment"]["checkout_url"] == "https://pay.example/checkout"
    order = Order.objects.get(reference=body["order"]["reference"])
    details = order.shop
    assert details.prepayment_required is True and details.import_shipping_method == imported.air
    assert details.import_fee == D("75000") and details.delivery_fee == D("78000")
    assert details.shipping_method == imported.rider and details.payment_preference == "mobile_money"
    lines = {i.sku: i for i in order.items.all()}
    assert lines["DRN"].sourced_abroad is True and lines["DRN"].warehouse is None  # bought abroad for the order
    assert lines["A54"].sourced_abroad is False and lines["A54"].warehouse == imported.warehouse
    assert StockItem.objects.get(variant=imported.variant).reserved == 1
    assert body["order"]["prepayment_required"] is True
    assert body["order"]["shipping"]["import_method"] == "Air Freight"


def test_unpaid_orders_with_imported_items_cannot_be_processed(app, imported, home, selcom, client_for):
    add(app, imported.drone_variant, 1)
    quote = preview(app, home)
    order = Order.objects.get(reference=place(app, home, quote).json()["order"]["reference"])
    staff = client_for("admin_l2")
    with pytest.raises(WorkflowError, match="must be fully paid"):
        order_services.transition(order, "processing", staff.handler._force_user)
    res = staff.post(f"/api/orders/shop/{order.pk}/payments/",
                     {"amount": quote["total"], "method": "cash", "kind": "balance"}, format="json")
    assert res.status_code == 201, res.json()
    order.refresh_from_db()
    order_services.transition(order, "processing", staff.handler._force_user)
    order.refresh_from_db()
    assert order.status == "processing"


def test_imported_items_cannot_be_ordered_when_mobile_money_is_unavailable(app, imported, home):
    add(app, imported.drone_variant, 1)
    quote = preview(app, home)
    assert quote["can_place_order"] is False and quote["payment_methods"] == []
    assert "paid when you order" in quote["issues"][0]
    assert place(app, home, {**quote, "selected_shipping_method": imported.pickup.pk,
                             "selected_import_method": imported.air.pk}).status_code == 400  # no mobile money
    assert not Order.objects.exists()


def test_imported_items_without_an_import_route_cannot_be_ordered(app, imported, home, selcom):
    ShippingRule.objects.filter(method=imported.air).update(status="inactive")
    add(app, imported.drone_variant, 1)
    quote = preview(app, home)
    assert quote["can_place_order"] is False and quote["import_fee"] == "0.00"
    assert any("imported items" in issue for issue in quote["issues"])


def test_guest_checkout_with_imported_items(imported, selcom):
    web = APIClient(HTTP_X_AGIZA_CHANNEL="web")
    items = [{"variant": imported.drone_variant.pk, "quantity": 1}]
    quote = web.post(f"{APP}/checkout/guest/preview/", {"items": items, "city": imported.dar.pk},
                     format="json").json()
    assert quote["import_fee"] == "75000.00" and quote["prepayment_required"] is True
    res = web.post(f"{APP}/checkout/guest/place-order/", {
        "items": items, "full_name": "Asha Said", "phone": "0754 111 222", "city": imported.dar.pk,
        "line1": "Plot 7, Sinza", "shipping_method": quote["selected_shipping_method"],
        "import_method": quote["selected_import_method"], "payment_method": "mobile_money",
        "idempotency_key": "guest-import-0001", "expected_total": quote["total"]}, format="json")
    assert res.status_code == 201, res.json()
    assert res.json()["payment"]["checkout_url"] and Order.objects.get().shop.prepayment_required is True
