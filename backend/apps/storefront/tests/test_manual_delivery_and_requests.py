"""
Out-of-stock "Request" (Pata Bei) and orders whose delivery cost AGIZA confirms by hand
(the Shipping Engine asked for a manual quote): ordered without paying, paid once staff set the cost.
"""
from decimal import Decimal as D
from types import SimpleNamespace

import pytest
from rest_framework.test import APIClient

from apps.inventory.models import StockItem
from apps.locations.models import City
from apps.orders.models import Order, OrderStatusHistory
from apps.parties.models import Address
from apps.quotes.models import QuoteRequest
from apps.shipping_engine.constants import NoRuleFallback
from apps.shipping_engine.models import EngineSettings
from apps.storefront.models import CustomerNotification

from .conftest import APP

pytestmark = pytest.mark.django_db


def sell_out(shop, variant=None):
    StockItem.objects.filter(variant=variant or shop.variant).update(quantity=0)


def allow_pata_bei(product, on=True):
    product.pata_bei = on
    product.save(update_fields=["pata_bei"])


def card(api, product):
    return api.get(f"{APP}/products/{product.pk}/").json()


def request_product(client, product):
    return client.post(f"{APP}/requests/", {"request_type": "buy_for_me", "item_name": product.name,
                                            "product": product.pk}, format="json")


# --------------------------------------------------------------------------- #
# Out-of-stock requests ("Pata Bei")
# --------------------------------------------------------------------------- #
def test_can_request_only_when_out_of_stock_and_pata_bei_is_on(api, shop):
    assert card(api, shop.product)["can_request"] is False  # in stock, Pata Bei off
    allow_pata_bei(shop.product)
    assert card(api, shop.product)["can_request"] is False  # in stock
    sell_out(shop)
    body = card(api, shop.product)
    assert body["available"] == 0 and body["can_request"] is True
    allow_pata_bei(shop.product, False)
    assert card(api, shop.product)["can_request"] is False  # out of stock, Pata Bei off
    listed = api.get(f"{APP}/products/").json()["results"]
    assert all("can_request" in p for p in listed)


def test_imported_products_are_never_out_of_stock(api, imported):
    allow_pata_bei(imported.drone)
    body = card(api, imported.drone)
    assert body["ships_from"] == "China" and body["can_request"] is False


def test_request_validation_follows_can_request(app, shop, imported):
    res = request_product(app, shop.product)  # in stock, Pata Bei off
    assert res.status_code == 400 and "product" in res.json()["error"]["details"]
    allow_pata_bei(shop.product)
    assert request_product(app, shop.product).status_code == 400  # still in stock
    sell_out(shop)
    res = request_product(app, shop.product)
    assert res.status_code == 201, res.json()
    assert "Shop product (out of stock): Galaxy A54" in QuoteRequest.objects.get(pk=res.json()["id"]).description
    allow_pata_bei(shop.product, False)
    assert request_product(app, shop.product).status_code == 400
    allow_pata_bei(imported.drone)
    assert request_product(app, imported.drone).status_code == 400  # imported: orderable now
    allow_pata_bei(shop.draft)
    sell_out(shop, shop.draft_variant)
    assert request_product(app, shop.draft).status_code == 400  # not shown in the shop


# --------------------------------------------------------------------------- #
# Delivery cost to be confirmed by AGIZA
# --------------------------------------------------------------------------- #
@pytest.fixture
def mwanza(account, shop):
    return Address.objects.create(customer=account.customer, line1="Rock City Mall", city=shop.mwanza)


@pytest.fixture
def gateway(monkeypatch):
    """Mobile money available; the real start_payment runs (so its refusal is tested), the gateway is faked."""
    monkeypatch.setattr("apps.payments.services.available", lambda: True)
    started = []

    def start_checkout(order, *, phone):
        started.append(order.reference)
        return SimpleNamespace(status="pending", gateway_url="https://pay.example/checkout", provider_order_id="S1")

    monkeypatch.setattr("apps.payments.services.start_checkout", start_checkout)
    return started


def place(client, address, method, key="manual-key-0001", **extra):
    payload = {"address": address.pk, "shipping_method": method.pk, "payment_method": "mobile_money",
               "idempotency_key": key, **extra}
    return client.post(f"{APP}/checkout/place-order/", payload, format="json")


def test_manual_quote_order_waits_for_the_delivery_cost_then_is_paid(app, shop, mwanza, gateway, client_for):
    app.post(f"{APP}/cart/items/", {"variant": shop.variant.pk, "quantity": 1}, format="json")
    res = place(app, mwanza, shop.bus, expected_total="850000.00")
    assert res.status_code == 201, res.json()
    body = res.json()
    assert body["payment"] is None and gateway == []  # nothing to pay yet
    order = Order.objects.get(reference=body["order"]["reference"])
    assert order.shop.delivery_fee_pending is True and order.shop.delivery_fee == 0
    assert order.total_amount == D("850000") and order.shop.shipping_method == shop.bus
    assert order.shop.payment_due_at is None
    assert body["order"]["delivery_fee_pending"] is True and body["order"]["can_pay"] is False

    pay = app.post(f"{APP}/orders/{order.reference}/pay/")
    assert pay.status_code == 409 and "delivery cost" in pay.json()["error"]["message"]
    assert gateway == []
    cards = app.get(f"{APP}/orders/").json()["results"]
    assert cards[0]["delivery_fee_pending"] is True

    staff = client_for("admin_l2")
    row = staff.get(f"/api/orders/shop/{order.pk}/").json()
    assert row["details"]["delivery_fee_pending"] is True
    # Staff see what is missing in the Shipping Engine for this address (never shown to the customer).
    issue = row["details"]["delivery_issue"]
    assert issue.startswith("Delivery to Mwanza has no price set up.") and "manual" in issue.lower(), issue
    assert "delivery_issue" not in body["order"] and "has no price set up" not in str(body)
    listed = staff.get("/api/orders/shop/", {"delivery_fee_pending": "true"}).json()["results"]
    assert [r["reference"] for r in listed] == [order.reference]
    assert staff.get("/api/orders/shop/stats/").json()["delivery_fee_pending"] == 1
    assert staff.post(f"/api/orders/shop/{order.pk}/ship/", {}, format="json").status_code in (400, 409)

    assert staff.post(f"/api/orders/shop/{order.pk}/delivery-fee/", {"delivery_fee": "-1"},
                      format="json").status_code == 400
    res = staff.post(f"/api/orders/shop/{order.pk}/delivery-fee/",
                     {"delivery_fee": "25000", "estimated_delivery": "2–3 days", "note": "Bus to Mwanza"}, format="json")
    assert res.status_code == 200, res.json()
    assert res.json()["details"]["delivery_fee_pending"] is False and res.json()["details"]["delivery_fee"] == "25000.00"
    order.refresh_from_db()
    assert order.total_amount == D("875000") and order.shop.delivery_fee == D("25000")
    assert order.shop.estimated_delivery == "2–3 days"
    assert order.fulfillments.get().shipping_fee == D("25000")
    assert OrderStatusHistory.objects.filter(order=order, note__startswith="Delivery cost set: 25,000.00").exists()
    note = CustomerNotification.objects.filter(customer=order.customer).latest("id")
    assert note.title == "Delivery cost confirmed — you can now pay" and note.data["order"] == order.reference
    assert staff.post(f"/api/orders/shop/{order.pk}/delivery-fee/", {"delivery_fee": "1"},
                      format="json").status_code == 409  # already set

    detail = app.get(f"{APP}/orders/{order.reference}/").json()
    assert detail["delivery_fee_pending"] is False and detail["can_pay"] is True
    assert detail["amounts"]["shipping_fee"] == "25000.00" and detail["amounts"]["total"] == "875000.00"
    pay = app.post(f"{APP}/orders/{order.reference}/pay/")
    assert pay.status_code == 200 and gateway == [order.reference]


def test_manual_quotes_are_offered_only_when_nothing_is_priced(app, shop, account, home):
    app.post(f"{APP}/cart/items/", {"variant": shop.cable_variant.pk, "quantity": 1}, format="json")
    dar = app.post(f"{APP}/checkout/preview/", {"address": home.pk}, format="json").json()
    bus = next(o for o in dar["shipping_options"] if o["code"] == "BUS")  # not on the Dar route: fallback
    assert bus["manual_quote"] is False and bus["available"] is False and dar["delivery_fee_pending"] is False
    assert app.post(f"{APP}/checkout/place-order/", {"address": home.pk, "shipping_method": shop.bus.pk,
                                                     "payment_method": "pay_later", "idempotency_key": "dar-bus-01"},
                    format="json").status_code == 409
    arusha = City.objects.get(name="Arusha", country=shop.tz)  # no route: the no-rule fallback (manual quote)
    address = Address.objects.create(customer=account.customer, line1="Clock Tower", city=arusha)
    body = app.post(f"{APP}/checkout/preview/", {"address": address.pk}, format="json").json()
    assert body["can_place_order"] is True and body["delivery_fee_pending"] is True
    assert all(o["manual_quote"] for o in body["shipping_options"])


def test_blocked_destinations_still_cannot_check_out(app, shop, account):
    settings = EngineSettings.load()
    settings.no_rule_fallback = NoRuleFallback.BLOCK
    settings.save()
    arusha = City.objects.get(name="Arusha", country=shop.tz)
    address = Address.objects.create(customer=account.customer, line1="Clock Tower", city=arusha)
    app.post(f"{APP}/cart/items/", {"variant": shop.cable_variant.pk, "quantity": 1}, format="json")
    body = app.post(f"{APP}/checkout/preview/", {"address": address.pk}, format="json").json()
    assert body["can_place_order"] is False and body["delivery_fee_pending"] is False
    assert not any(o["manual_quote"] for o in body["shipping_options"])
    res = app.post(f"{APP}/checkout/place-order/", {"address": address.pk, "shipping_method": shop.rider.pk,
                                                    "payment_method": "pay_later", "idempotency_key": "blocked-0001"},
                   format="json")
    assert res.status_code == 409 and not Order.objects.exists()


def test_guest_order_with_the_delivery_cost_to_be_confirmed(shop, gateway, client_for, monkeypatch):
    texts = []
    monkeypatch.setattr("apps.orders.expiry._sms", lambda phone, body: texts.append((phone, body)))
    web = APIClient(HTTP_X_AGIZA_CHANNEL="web")
    payload = {"items": [{"variant": shop.variant.pk, "quantity": 1}], "full_name": "Asha Said",
               "phone": "0754 111 222", "city": shop.mwanza.pk, "line1": "Rock City Mall", "area": "",
               "shipping_method": shop.bus.pk, "payment_method": "mobile_money", "idempotency_key": "guest-manual-1"}
    res = web.post(f"{APP}/checkout/guest/place-order/", payload, format="json")
    assert res.status_code == 201, res.json()
    body = res.json()
    assert body["payment"] is None and body["order"]["delivery_fee_pending"] is True
    url, token = f"{APP}/guest-orders/{body['order']['reference']}", body["token"]
    pay = web.post(f"{url}/pay/?token={token}")
    assert pay.status_code == 409 and gateway == []

    order = Order.objects.get(reference=body["order"]["reference"])
    staff = client_for("admin_l2")
    with_commit = staff.post(f"/api/orders/shop/{order.pk}/delivery-fee/", {"delivery_fee": "30000"}, format="json")
    assert with_commit.status_code == 200
    detail = web.get(f"{url}/", {"token": token}).json()
    assert detail["delivery_fee_pending"] is False and detail["total"] == "880000.00" and detail["can_pay"] is True
    assert web.post(f"{url}/pay/?token={token}").status_code == 200 and gateway == [order.reference]


def test_imported_order_payment_window_starts_when_the_cost_is_set(app, imported, mwanza, gateway, client_for):
    app.post(f"{APP}/cart/items/", {"variant": imported.drone_variant.pk, "quantity": 1}, format="json")
    quote = app.post(f"{APP}/checkout/preview/", {"address": mwanza.pk}, format="json").json()
    assert quote["can_place_order"] is True and quote["delivery_fee_pending"] is True, quote["issues"]
    res = place(app, mwanza, imported.bus, expected_total=quote["total"])
    assert res.status_code == 201, res.json()
    order = Order.objects.get(reference=res.json()["order"]["reference"])
    assert order.shop.prepayment_required is True and order.shop.payment_due_at is None
    assert order.shop.delivery_fee == order.shop.import_fee
    staff = client_for("admin_l2")
    assert staff.post(f"/api/orders/shop/{order.pk}/delivery-fee/", {"delivery_fee": "20000"},
                      format="json").status_code == 200
    order.refresh_from_db()
    assert order.shop.payment_due_at is not None
    assert order.shop.delivery_fee == order.shop.import_fee + D("20000")
