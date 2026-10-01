"""Website checkout without an account: priced like any checkout, opened later with the order link."""
from decimal import Decimal as D

import pytest
from rest_framework.test import APIClient

from apps.inventory.models import StockItem
from apps.orders.models import Order
from apps.parties.models import Customer

from .conftest import APP
from .test_auth import register

pytestmark = pytest.mark.django_db


@pytest.fixture
def web():
    return APIClient(HTTP_X_AGIZA_CHANNEL="web")


def preview(client, shop, items=None, city=None, **extra):
    payload = {"items": items or [{"variant": shop.variant.pk, "quantity": 2}], "city": (city or shop.dar).pk, **extra}
    return client.post(f"{APP}/checkout/guest/preview/", payload, format="json")


def place(client, shop, key="guest-key-0001", **extra):
    payload = {"items": [{"variant": shop.variant.pk, "quantity": 2}], "full_name": "Asha Said",
               "phone": "0754 111 222", "city": shop.dar.pk, "line1": "Plot 7, Sinza", "area": "Sinza",
               "shipping_method": shop.rider.pk, "payment_method": "pay_later", "idempotency_key": key, **extra}
    return client.post(f"{APP}/checkout/guest/place-order/", payload, format="json")


def test_guest_preview_prices_the_browser_cart_for_the_city(web, shop):
    assert preview(web, shop).json()["selected_shipping_method"] == shop.pickup.pk  # cheapest first
    body = preview(web, shop, shipping_method=shop.rider.pk).json()
    assert body["subtotal"] == "1700000.00" and body["shipping_fee"] == "3000.00" and body["total"] == "1703000.00"
    assert body["can_place_order"] is True and body["cart"]["item_count"] == 2
    mwanza = preview(web, shop, city=shop.mwanza).json()  # manual quote only: can't check out
    assert mwanza["can_place_order"] is False and mwanza["total"] is None


def test_guest_checkout_is_website_only(api, shop):
    assert preview(api, shop).status_code == 404
    assert place(api, shop).status_code == 404
    assert not Order.objects.exists()


def test_guest_places_an_order_and_opens_it_with_the_link(web, api, shop, client_for):
    res = place(web, shop, notes="Call at the gate", email="Asha@Example.com", expected_total="1703000.00")
    assert res.status_code == 201, res.json()
    body = res.json()
    order = Order.objects.get(reference=body["order"]["reference"])
    customer = Customer.objects.get(phone="+255754111222")
    assert order.customer == customer and customer.full_name == "Asha Said" and customer.email == "asha@example.com"
    assert order.total_amount == D("1703000.00") and order.shop.channel == "web"
    assert order.shop.shipping_address == "Plot 7, Sinza" and order.shop.city == shop.dar
    assert order.notes == "Guest checkout: Asha Said, +255754111222\nCall at the gate"
    assert StockItem.objects.get(variant=shop.variant).reserved == 2
    assert body["order"]["can_cancel"] is False and body["order"]["can_return"] is False

    url = f"{APP}/guest-orders/{order.reference}/"
    detail = api.get(url, {"token": body["token"]})
    assert detail.status_code == 200 and detail.json()["reference"] == order.reference
    assert api.get(url, {"token": "forged"}).status_code == 404
    assert api.get(url).status_code == 404
    other = place(web, shop, key="guest-key-0002", phone="0765 000 333").json()
    assert api.get(url, {"token": other["token"]}).status_code == 404  # one order's link never opens another

    staff = client_for("admin_l2")
    assert staff.get(f"/api/orders/shop/{order.pk}/").json()["details"]["channel"] == "web"


def test_guest_orders_go_to_the_customer_with_that_phone(web, shop, account):
    res = place(web, shop, phone="0712 345 678", full_name="Someone Else", email="new@example.com")
    assert res.status_code == 201
    order = Order.objects.get()
    assert order.customer == account.customer
    account.customer.refresh_from_db()
    assert account.customer.full_name == "Neema Joseph" and account.customer.email == ""  # never changed by a guest
    assert order.shop.customer_email == "new@example.com"


def test_signing_up_later_with_the_same_phone_shows_guest_orders(web, api, shop, sms):
    reference = place(web, shop).json()["order"]["reference"]
    res = register(api, sms, phone="0754 111 222")
    assert res.status_code == 201, res.json()
    signed_in = APIClient()
    signed_in.credentials(HTTP_AUTHORIZATION=f"Bearer {res.json()['access']}")
    assert [o["reference"] for o in signed_in.get(f"{APP}/orders/").json()["results"]] == [reference]
    assert Customer.objects.filter(phone__endswith="754111222").count() == 1  # the guest's record, now with an account


def test_guest_checkout_refuses_changed_totals_and_bad_input(web, shop):
    res = place(web, shop, expected_total="1.00")
    assert res.status_code == 409 and res.json()["error"]["code"] == "price_changed"
    assert place(web, shop, phone="12").status_code == 400
    assert place(web, shop, full_name="  ").status_code == 400
    assert place(web, shop, line1="").status_code == 400
    assert place(web, shop, payment_method="bitcoin").status_code == 400
    assert place(web, shop, shipping_method=shop.bus.pk).status_code == 409  # not offered in Dar
    assert place(web, shop, items=[]).status_code == 409  # nothing to order
    assert not Order.objects.exists()


def test_repeating_a_guest_order_request_never_duplicates_it(web, shop):
    first = place(web, shop)
    again = place(web, shop)
    assert first.status_code == 201 and again.status_code == 200 and again.json()["created"] is False
    assert again.json()["order"]["reference"] == first.json()["order"]["reference"]
    assert Order.objects.count() == 1 and StockItem.objects.get(variant=shop.variant).reserved == 2


def test_guest_order_link_checks_payments(web, api, shop):
    body = place(web, shop).json()
    url = f"{APP}/guest-orders/{body['order']['reference']}/check-payment/"
    res = api.post(f"{url}?token={body['token']}")
    assert res.status_code == 200 and res.json()["payment"]["status"] == "unpaid"
    assert api.post(f"{url}?token=nope").status_code == 404
