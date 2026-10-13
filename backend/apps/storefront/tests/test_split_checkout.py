"""A cart with several products becomes one order per product, so staff can handle each separately."""
from decimal import Decimal as D

import pytest
from django.test import override_settings

from apps.orders.models import Order, Payment
from apps.payments.models import GatewayPayment
from apps.payments.tests.test_selcom import SELCOM, Gateway

from .conftest import APP

pytestmark = pytest.mark.django_db


def fill(client, lines):
    for variant, qty in lines:
        assert client.post(f"{APP}/cart/items/", {"variant": variant.pk, "quantity": qty},
                           format="json").status_code in (200, 201)


def place(client, address, method, payment_method="pay_later", key="split-key-0001"):
    quote = client.post(f"{APP}/checkout/preview/", {"address": address.pk, "shipping_method": method.pk},
                        format="json").json()
    res = client.post(f"{APP}/checkout/place-order/", {
        "address": address.pk, "shipping_method": method.pk, "payment_method": payment_method,
        "idempotency_key": key, "expected_total": quote["total"]}, format="json")
    assert res.status_code == 201, res.json()
    return quote, res.json()


def test_each_product_becomes_its_own_order_sharing_the_delivery_fee(app, shop, home, client_for):
    fill(app, [(shop.variant, 1), (shop.cable_variant, 2)])
    quote, body = place(app, home, shop.rider)
    orders = list(Order.objects.order_by("id"))
    assert len(orders) == 2
    assert [o.item_details for o in orders] == ["1× Galaxy A54", "2× USB-C Cable"]
    reference = orders[0].shop.checkout_reference
    assert reference.startswith("CHK-") and orders[1].shop.checkout_reference == reference
    # The quoted total is charged exactly once, the delivery fee shared by value.
    assert sum(o.total_amount for o in orders) == D(quote["total"])
    assert sum(o.shop.delivery_fee for o in orders) == D(quote["shipping_fee"])
    assert orders[0].shop.delivery_fee > orders[1].shop.delivery_fee
    assert body["order"]["reference"] == orders[0].reference
    checkout = body["order"]["checkout"]
    assert checkout["reference"] == reference and checkout["total"] == f"{D(quote['total']):.2f}"
    assert [o["reference"] for o in checkout["orders"]] == [o.reference for o in orders]

    staff = client_for("admin_l2")
    rows = staff.get("/api/orders/shop/", {"search": reference}).json()["results"]
    assert sorted(r["reference"] for r in rows) == sorted(o.reference for o in orders)
    assert rows[0]["details"]["checkout_reference"] == reference
    # Each is handled on its own: one goes to processing, the other stays pending.
    staff.post(f"/api/orders/shop/{orders[1].pk}/transition/", {"status": "processing"}, format="json")
    assert [o.status for o in Order.objects.order_by("id")] == ["pending", "processing"]


def test_a_single_product_checkout_has_no_checkout_group(app, shop, home):
    fill(app, [(shop.variant, 2)])
    _, body = place(app, home, shop.rider)
    assert Order.objects.count() == 1 and body["order"]["checkout"] is None


def test_one_mobile_money_payment_pays_every_order_of_the_checkout(app, shop, home, api, monkeypatch):
    from apps.payments import selcom

    gateway = Gateway()
    monkeypatch.setattr(selcom, "_call", gateway)
    with override_settings(**SELCOM):
        fill(app, [(shop.variant, 1), (shop.cable_variant, 2)])
        quote, body = place(app, home, shop.rider, payment_method="mobile_money")
        gp = GatewayPayment.objects.get()
        assert gp.amount == D(quote["total"]).quantize(D("1"))  # the whole checkout at once
        assert gp.provider_order_id.startswith(f"AGIZA-{body['order']['checkout']['reference']}-")
        gateway.status = {"payment_status": "COMPLETED", "amount": str(gp.amount), "transid": "SPLIT1"}
        api.post("/api/payments/selcom/webhook/", {"order_id": gp.provider_order_id}, format="json")
    orders = list(Order.objects.order_by("id"))
    assert [p.order_id for p in Payment.objects.order_by("order_id")] == [o.pk for o in orders]
    from apps.orders.services import payment_summary

    assert all(payment_summary(o).due == 0 for o in orders)
    assert not GatewayPayment.objects.get().needs_attention


def test_shop_page_rows_bought_before_by_ids_and_stores_for_my_interests(app, api, shop, home):
    from apps.crm.models import CustomerInterest

    assert api.get(f"{APP}/products/", {"purchased": "1"}).json()["results"] == []  # guests: nothing
    assert app.get(f"{APP}/products/", {"purchased": "1"}).json()["results"] == []
    fill(app, [(shop.cable_variant, 1)])
    place(app, home, shop.rider)
    assert [p["name"] for p in app.get(f"{APP}/products/", {"purchased": "1"}).json()["results"]] == ["USB-C Cable"]

    ids = f"{shop.cable.pk},{shop.product.pk},999999,x"
    assert [p["name"] for p in api.get(f"{APP}/products/", {"ids": ids}).json()["results"]] == ["USB-C Cable",
                                                                                                 "Galaxy A54"]
    customer = Order.objects.first().customer
    CustomerInterest.objects.create(customer=customer, category=shop.product.category, label="phones", confidence=90,
                                    source=CustomerInterest.Source.MANUAL)
    stores = app.get(f"{APP}/stores/", {"for_you": "1"}).json()["results"]
    assert [s["name"] for s in stores] == ["AGIZA"]  # AGIZA sells in that category; no vendor does
