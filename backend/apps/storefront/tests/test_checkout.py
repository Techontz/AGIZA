"""Catalogue, cart and checkout: the server prices everything, reserves stock and never double-orders."""
from decimal import Decimal as D

import pytest

from apps.inventory.models import StockItem
from apps.orders.models import Order
from apps.parties.models import Address
from apps.storefront.models import CartItem

from .conftest import APP

pytestmark = pytest.mark.django_db


def add(client, variant, qty=1):
    return client.post(f"{APP}/cart/items/", {"variant": variant.pk, "quantity": qty}, format="json")


def place(client, address, method, key="checkout-key-0001", **extra):
    payload = {"address": address.pk, "shipping_method": method.pk, "payment_method": "pay_later",
               "idempotency_key": key, **extra}
    return client.post(f"{APP}/checkout/place-order/", payload, format="json")


# --------------------------------------------------------------------------- #
# Catalogue
# --------------------------------------------------------------------------- #
def test_catalogue_is_public_shows_only_visible_products_and_hides_costs(api, shop):
    res = api.get(f"{APP}/products/")
    assert res.status_code == 200
    names = [p["name"] for p in res.json()["results"]]
    assert names == ["USB-C Cable", "Galaxy A54"]  # newest first; the draft product is hidden
    detail = api.get(f"{APP}/products/{shop.product.pk}/").json()
    assert detail["price"] == "850000.00" and detail["variants"][0]["available"] == 5
    assert "purchase_cost" not in str(detail) and "700000" not in str(detail)
    assert api.get(f"{APP}/products/{shop.draft.pk}/").status_code == 404


def test_catalogue_search_category_and_stock_flags(api, shop):
    assert [p["name"] for p in api.get(f"{APP}/products/", {"search": "galaxy"}).json()["results"]] == ["Galaxy A54"]
    rows = api.get(f"{APP}/products/", {"category": shop.product.category_id, "ordering": "price"}).json()["results"]
    assert [p["name"] for p in rows] == ["USB-C Cable", "Galaxy A54"]
    StockItem.objects.filter(variant=shop.variant).update(reserved=5)
    card = next(p for p in api.get(f"{APP}/products/").json()["results"] if p["name"] == "Galaxy A54")
    assert card["in_stock"] is False
    assert api.get(f"{APP}/categories/").json()[0]["name"] == "Phones"


def test_cities_and_config(api, shop):
    cities = api.get(f"{APP}/cities/").json()
    assert any(c["name"] == "Dar es Salaam" for c in cities)
    config = api.get(f"{APP}/config/").json()
    assert config["currency"] == "TZS"
    assert [m["code"] for m in config["payment_methods"]] == ["pay_later"]  # Selcom not configured


# --------------------------------------------------------------------------- #
# Cart
# --------------------------------------------------------------------------- #
def test_cart_prices_live_and_validates_stock(app, shop):
    assert add(app, shop.variant, 6).status_code == 400  # only 5 in stock
    assert add(app, shop.draft_variant).status_code == 400  # not for sale
    res = add(app, shop.variant, 2)
    assert res.status_code == 201
    cart = res.json()
    assert cart["subtotal"] == "1700000.00" and cart["item_count"] == 2
    assert add(app, shop.variant, 4).status_code == 400  # 2 + 4 > 5

    shop.product.price = D("800000")
    shop.product.save()
    assert app.get(f"{APP}/cart/").json()["subtotal"] == "1600000.00"  # prices are never frozen in the cart

    item = cart["items"][0]["id"]
    assert app.patch(f"{APP}/cart/items/{item}/", {"quantity": 3}, format="json").json()["item_count"] == 3
    assert app.delete(f"{APP}/cart/items/{item}/").json()["items"] == []


def test_cart_flags_items_that_became_unavailable(app, shop):
    add(app, shop.variant, 3)
    StockItem.objects.filter(variant=shop.variant).update(reserved=4)  # someone else bought them
    cart = app.get(f"{APP}/cart/").json()
    assert cart["has_issues"] and cart["items"][0]["issue"] == "Only 1 left"
    assert cart["subtotal"] == "0.00"


def test_cart_items_of_another_customer_are_not_reachable(app, other_app, shop):
    item = add(app, shop.variant).json()["items"][0]["id"]
    assert other_app.patch(f"{APP}/cart/items/{item}/", {"quantity": 2}, format="json").status_code == 404
    assert other_app.delete(f"{APP}/cart/items/{item}/").status_code == 404


# --------------------------------------------------------------------------- #
# Addresses
# --------------------------------------------------------------------------- #
def test_addresses_are_private_and_keep_one_default(app, other_app, shop):
    first = app.post(f"{APP}/addresses/", {"line1": "Plot 12, Mikocheni B", "city": shop.dar.pk}, format="json").json()
    assert first["is_default"] is True  # the first address becomes the default
    second = app.post(f"{APP}/addresses/", {"line1": "Kariakoo, Msimbazi St", "city": shop.dar.pk,
                                            "is_default": True, "latitude": "-6.8160", "longitude": "39.2803"},
                      format="json").json()
    rows = app.get(f"{APP}/addresses/").json()
    assert [r["id"] for r in rows if r["is_default"]] == [second["id"]]
    assert other_app.get(f"{APP}/addresses/{first['id']}/").status_code == 404
    assert app.post(f"{APP}/addresses/", {"line1": " ", "city": shop.dar.pk}, format="json").status_code == 400
    assert app.post(f"{APP}/addresses/", {"line1": "X", "city": shop.dar.pk, "latitude": "1"},
                    format="json").status_code == 400
    assert app.delete(f"{APP}/addresses/{second['id']}/").status_code == 204
    assert app.get(f"{APP}/addresses/").json()[0]["is_default"] is True


# --------------------------------------------------------------------------- #
# Checkout
# --------------------------------------------------------------------------- #
def test_preview_prices_delivery_with_the_shipping_engine(app, shop, home):
    add(app, shop.variant, 2)
    add(app, shop.cable_variant, 5)
    res = app.post(f"{APP}/checkout/preview/", {"address": home.pk}, format="json")
    assert res.status_code == 200
    body = res.json()
    options = {o["code"]: o for o in body["shipping_options"]}
    # 2 × 0.5 kg + 5 × 0.1 kg = 1.5 kg at 800 TZS/kg = 1,200 → minimum charge 3,000
    assert options["RIDER"]["available"] and options["RIDER"]["cost"] == "3000.00"
    assert options["RIDER"]["estimated_delivery"] == "0–1 days"
    assert options["PICKUP"]["cost"] == "0.00"
    assert options["BUS"]["available"] is False  # no route Dar → Dar for bus
    assert body["selected_shipping_method"] == shop.pickup.pk  # cheapest available
    assert body["subtotal"] == "1775000.00" and body["total"] == "1775000.00"

    rider = app.post(f"{APP}/checkout/preview/", {"address": home.pk, "shipping_method": shop.rider.pk},
                     format="json").json()
    assert rider["shipping_fee"] == "3000.00" and rider["total"] == "1778000.00" and rider["can_place_order"]



def test_local_delivery_is_offered_by_location_even_when_a_product_limits_its_methods(app, shop, home):
    # A seller allows only long-distance methods; inside Dar the engine still prices rider and pickup.
    shop.product.shipping_methods.set([shop.bus])
    add(app, shop.variant)
    body = app.post(f"{APP}/checkout/preview/", {"address": home.pk}, format="json").json()
    options = {o["code"]: o for o in body["shipping_options"]}
    assert options["RIDER"]["available"] and options["PICKUP"]["available"] and not body["issues"]
    assert options["BUS"]["available"] is False
    # Upcountry the local methods have no rule, so only the product's own method is quoted.
    far = Address.objects.create(customer=home.customer, line1="Plot 3", city=shop.mwanza)
    body = app.post(f"{APP}/checkout/preview/", {"address": far.pk}, format="json").json()
    assert not any(o["available"] for o in body["shipping_options"] if o["code"] in ("RIDER", "PICKUP"))

def test_heavier_carts_are_priced_per_kg(app, shop, home):
    shop.product.weight_kg = D("4")
    shop.product.save()
    add(app, shop.variant, 2)  # 8 kg × 800
    body = app.post(f"{APP}/checkout/preview/", {"address": home.pk, "shipping_method": shop.rider.pk},
                    format="json").json()
    assert body["shipping_fee"] == "6400.00"


def test_destinations_needing_a_manual_quote_check_out_with_the_cost_to_be_confirmed(app, shop, account):
    mwanza = Address.objects.create(customer=account.customer, line1="Rock City Mall", city=shop.mwanza)
    add(app, shop.variant)
    body = app.post(f"{APP}/checkout/preview/", {"address": mwanza.pk}, format="json").json()
    bus = next(o for o in body["shipping_options"] if o["code"] == "BUS")
    assert bus["available"] is False and bus["manual_quote"] is True and "confirmed by AGIZA" in bus["message"]
    assert body["selected_shipping_method"] == shop.bus.pk and body["delivery_fee_pending"] is True
    assert body["can_place_order"] is True and body["total"] == "850000.00" and body["shipping_fee"] is None
    assert place(app, mwanza, shop.bus).status_code == 201  # more in test_manual_delivery_and_requests.py


def test_place_order_creates_app_order_reserves_stock_and_clears_cart(app, shop, home, client_for):
    add(app, shop.variant, 2)
    res = place(app, home, shop.rider, notes="Call on arrival", expected_total="1703000.00")
    assert res.status_code == 201, res.json()
    body = res.json()
    order = Order.objects.get(reference=body["order"]["reference"])
    assert body["created"] is True and body["payment"] is None
    assert order.order_type == "shop" and order.status == "pending" and order.created_by is None
    assert order.total_amount == D("1703000.00") and order.shop.delivery_fee == D("3000.00")
    details = order.shop
    assert details.channel == "app" and details.shipping_method == shop.rider
    assert details.delivery_address == home and details.payment_preference == "pay_later"
    assert details.estimated_delivery == "0–1 days" and details.city == shop.dar
    assert details.shipping_address == "Home: Plot 12, Mikocheni B" and details.area == "Mikocheni"
    assert body["order"]["shipping"]["address"] == "Home: Plot 12, Mikocheni B, Mikocheni, Dar es Salaam"
    assert order.notes == "Call on arrival"
    assert StockItem.objects.get(variant=shop.variant).reserved == 2
    assert not CartItem.objects.exists()

    assert body["order"]["amounts"] == {"subtotal": "1700000.00", "shipping_fee": "3000.00", "import_fee": "0.00",
                                      "customs_fee": "0.00", "total": "1703000.00"}
    assert [s["state"] for s in body["order"]["timeline"]["steps"]][:3] == ["completed", "pending", "current"]

    # Staff see it in E-commerce orders, with the customer's checkout choices.
    staff = client_for("admin_l2")
    row = staff.get(f"/api/orders/shop/{order.pk}/").json()
    assert row["details"]["channel"] == "app"
    assert row["details"]["shipping_method"]["name"] == "Rider Delivery"
    assert row["details"]["payment_preference"] == "pay_later"
    assert [r["reference"] for r in staff.get("/api/orders/shop/", {"channel": "app"}).json()["results"]] == [order.reference]
    assert staff.get("/api/orders/shop/", {"channel": "manual"}).json()["results"] == []


def test_client_supplied_prices_are_ignored(app, shop, home):
    add(app, shop.variant, 1)
    res = place(app, home, shop.rider, unit_price="1", total="1", delivery_fee="0", items=[{"variant": 1, "unit_price": 1}])
    assert res.status_code == 201
    assert Order.objects.get().total_amount == D("853000.00")


def test_changed_total_is_refused_with_a_fresh_preview(app, shop, home):
    add(app, shop.variant, 1)
    res = place(app, home, shop.rider, expected_total="853000.00")
    assert res.status_code == 201
    add(app, shop.variant, 1)
    shop.product.price = D("900000")
    shop.product.save()
    res = place(app, home, shop.rider, key="checkout-key-0002", expected_total="853000.00")
    assert res.status_code == 409
    error = res.json()["error"]
    assert error["code"] == "price_changed" and error["details"]["total"] == "903000.00"
    assert Order.objects.count() == 1


def test_repeating_a_place_order_request_never_duplicates_the_order(app, shop, home):
    add(app, shop.variant, 1)
    first = place(app, home, shop.rider)
    again = place(app, home, shop.rider)
    assert first.status_code == 201 and again.status_code == 200
    assert again.json()["created"] is False
    assert again.json()["order"]["reference"] == first.json()["order"]["reference"]
    assert Order.objects.count() == 1
    assert StockItem.objects.get(variant=shop.variant).reserved == 1
    assert place(app, home, shop.rider, key="checkout-key-0099").status_code == 409  # cart is now empty


def test_checkout_refuses_bad_input(app, other_app, shop, home):
    add(app, shop.variant, 1)
    assert place(app, home, shop.rider, payment_method="bitcoin").status_code == 400
    assert place(app, home, shop.rider, key="short").status_code == 400
    assert place(other_app, home, shop.rider).status_code == 404  # someone else's address
    assert place(app, home, shop.bus).status_code == 409  # method not offered for this address
    StockItem.objects.filter(variant=shop.variant).update(reserved=5)
    assert place(app, home, shop.rider, key="checkout-key-0003").status_code == 409  # out of stock now
    assert not Order.objects.exists()
    assert CartItem.objects.count() == 1  # the cart is kept when checkout fails


# --------------------------------------------------------------------------- #
# Orders after checkout
# --------------------------------------------------------------------------- #
def test_orders_are_private_and_cancellable_while_pending(app, other_app, shop, home, client_for):
    add(app, shop.variant, 2)
    reference = place(app, home, shop.rider).json()["order"]["reference"]
    assert [o["reference"] for o in app.get(f"{APP}/orders/").json()["results"]] == [reference]
    assert app.get(f"{APP}/orders/", {"group": "completed"}).json()["results"] == []
    assert other_app.get(f"{APP}/orders/{reference}/").status_code == 404
    assert other_app.post(f"{APP}/orders/{reference}/cancel/", {"reason": "x"}).status_code == 404

    res = app.post(f"{APP}/orders/{reference}/cancel/", {"reason": "Ordered by mistake"})
    assert res.status_code == 200 and res.json()["status"] == "cancelled"
    assert res.json()["timeline"]["cancelled"] is True
    assert StockItem.objects.get(variant=shop.variant).reserved == 0
    assert app.get(f"{APP}/orders/", {"group": "cancelled"}).json()["count"] == 1


def test_orders_past_pending_cannot_be_cancelled_by_the_customer(app, shop, home, client_for):
    add(app, shop.variant, 1)
    body = place(app, home, shop.rider).json()["order"]
    staff = client_for("admin_l2")
    order = Order.objects.get(reference=body["reference"])
    assert staff.post(f"/api/orders/shop/{order.pk}/transition/", {"status": "processing"}).status_code == 200
    assert app.post(f"{APP}/orders/{body['reference']}/cancel/", {"reason": "Changed my mind"}).status_code == 409
    detail = app.get(f"{APP}/orders/{body['reference']}/").json()
    assert detail["status_display"] == "Processing" and detail["can_cancel"] is False
    step = next(s for s in detail["timeline"]["steps"] if s["key"] == "processing")
    assert step["state"] == "completed" and step["at"]


def test_staff_payments_show_in_the_app(app, shop, home, client_for):
    add(app, shop.variant, 1)
    body = place(app, home, shop.rider).json()["order"]
    staff = client_for("admin_l2")
    order = Order.objects.get(reference=body["reference"])
    res = staff.post(f"/api/orders/shop/{order.pk}/payments/",
                     {"amount": "853000", "method": "cash", "kind": "balance"}, format="json")
    assert res.status_code == 201, res.json()
    detail = app.get(f"{APP}/orders/{body['reference']}/").json()
    assert detail["payment"]["status"] == "fully_paid" and detail["payment"]["due"] == "0.00"
    assert detail["can_cancel"] is False  # paid: a refund goes through staff
    assert app.post(f"{APP}/orders/{body['reference']}/cancel/", {"reason": "x"}).status_code == 409
    assert next(s for s in detail["timeline"]["steps"] if s["key"] == "payment")["state"] == "completed"
