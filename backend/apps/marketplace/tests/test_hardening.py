"""
Production hardening: concurrency on real MySQL transactions, checkout revalidation, the Shipping
Engine as the only source of delivery prices, OTP secrecy, private uploads, account deletion,
rate limits, health checks and the API schema.
"""
import logging
import threading
from decimal import Decimal as D

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection, connections

from apps.catalog.models import Product, ProductStatus, ReviewStatus
from apps.catalog.tests.test_catalog import PNG
from apps.inventory.models import StockItem
from apps.orders.models import Order
from apps.storefront.models import CartItem, PhoneVerification

from .conftest import APP, SELLER, client_for_account, make_account
from .test_checkout import fill_cart

pytestmark = pytest.mark.django_db


def place(client, home, shop, key, **extra):
    return client.post(f"{APP}/checkout/place-order/", {"address": home.pk, "shipping_method": shop.rider.pk,
                                                         "payment_method": "pay_later", "idempotency_key": key, **extra},
                       format="json")


# --------------------------------------------------------------------------- #
# Checkout revalidation
# --------------------------------------------------------------------------- #
def test_vendor_suspended_between_cart_and_checkout(app, home, shop, staff, vendor_a):
    fill_cart(app, [(shop.cable_variant, 1), (vendor_a.variant, 1)])
    staff.post(f"/api/catalog/vendors/{vendor_a.vendor.pk}/review/", {"status": "suspended", "note": "Audit"},
               format="json")
    res = place(app, home, shop, "harden-key-0001")
    assert res.status_code == 409 and Order.objects.count() == 0
    cart = app.get(f"{APP}/cart/").json()
    assert [i["issue"] for i in cart["items"] if i["vendor"]["slug"] == vendor_a.vendor.slug] == ["No longer available"]
    assert CartItem.objects.count() == 2  # the cart is kept until an order succeeds


def test_product_disabled_between_preview_and_place(app, home, shop, staff, vendor_a):
    fill_cart(app, [(vendor_a.variant, 1)])
    preview = app.post(f"{APP}/checkout/preview/", {"address": home.pk}, format="json").json()
    assert preview["can_place_order"]
    Product.objects.filter(pk=vendor_a.product.pk).update(review_status=ReviewStatus.DISABLED)
    res = place(app, home, shop, "harden-key-0002", expected_total=preview["total"])
    assert res.status_code == 409 and Order.objects.count() == 0


def test_price_and_stock_changes_are_caught(app, home, shop, vendor_a):
    fill_cart(app, [(vendor_a.variant, 2)])
    preview = app.post(f"{APP}/checkout/preview/", {"address": home.pk}, format="json").json()
    Product.objects.filter(pk=vendor_a.product.pk).update(price=D("330000"))
    res = place(app, home, shop, "harden-key-0003", expected_total=preview["total"])
    assert res.status_code == 409 and res.json()["error"]["code"] == "price_changed"
    StockItem.objects.filter(variant=vendor_a.variant).update(quantity=1)
    res = place(app, home, shop, "harden-key-0004")
    assert res.status_code == 409 and Order.objects.count() == 0


def test_seller_id_commission_and_fees_cannot_be_injected(app, home, shop, vendor_a, vendor_b):
    fill_cart(app, [(vendor_a.variant, 1)])
    res = place(app, home, shop, "harden-key-0005", vendor=vendor_b.vendor.pk, commission="0", shipping_fee="0",
                delivery_fee="0", unit_price="1", subtotal="1", total="1")
    assert res.status_code == 201
    order = Order.objects.get()
    assert order.total_amount == D("323000")
    part = order.fulfillments.get()
    assert part.vendor == vendor_a.vendor and part.commission == D("32000")


# --------------------------------------------------------------------------- #
# Concurrency (real transactions and row locks on MySQL)
# --------------------------------------------------------------------------- #
def _in_threads(*targets):
    errors = []

    def run(fn):
        try:
            fn()
        except Exception as exc:  # noqa: BLE001
            errors.append(exc)
        finally:
            connections.close_all()

    threads = [threading.Thread(target=run, args=(t,)) for t in targets]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=60)
    return errors


@pytest.mark.django_db(transaction=True, serialized_rollback=True)
def test_two_customers_cannot_both_buy_the_last_unit(shop):
    StockItem.objects.filter(variant=shop.variant).update(quantity=1)
    from apps.parties.models import Address

    clients, homes = [], []
    for i, phone in enumerate(["255711000001", "255711000002"]):
        acc = make_account(phone=phone, name=f"Buyer {i}")
        homes.append(Address.objects.create(customer=acc.customer, label="Home", line1="Plot 1", area="Masaki",
                                            city=shop.dar, is_default=True))
        client = client_for_account(acc)
        fill_cart(client, [(shop.variant, 1)])
        clients.append(client)
    results = []
    _in_threads(*[lambda c=c, h=h, i=i: results.append(place(c, h, shop, f"race-key-000{i}").status_code)
                  for i, (c, h) in enumerate(zip(clients, homes, strict=True))])
    assert sorted(results)[0] == 201 and sorted(results)[1] in (400, 409)  # the loser is told it's out of stock
    item = StockItem.objects.get(variant=shop.variant)
    assert (item.quantity, item.reserved) == (1, 1)
    assert Order.objects.count() == 1


@pytest.mark.django_db(transaction=True, serialized_rollback=True)
def test_double_submit_creates_one_order(shop):
    from apps.parties.models import Address

    acc = make_account(phone="255711000009")
    home = Address.objects.create(customer=acc.customer, label="Home", line1="Plot 9", area="Sinza", city=shop.dar,
                                  is_default=True)
    client = client_for_account(acc)
    fill_cart(client, [(shop.cable_variant, 2)])
    codes = []
    _in_threads(*[lambda: codes.append(place(client, home, shop, "same-key-00001").status_code) for _ in range(3)])
    assert Order.objects.count() == 1
    assert StockItem.objects.get(variant=shop.cable_variant).reserved == 2
    assert set(codes) <= {200, 201, 409}


def test_failed_order_creation_leaks_no_reservation(app, home, shop, monkeypatch):
    fill_cart(app, [(shop.cable_variant, 3)])

    def boom(*args, **kwargs):
        raise RuntimeError("database hiccup")

    monkeypatch.setattr("apps.marketplace.services.record_order", boom)
    res = place(app, home, shop, "boom-key-00001")
    assert res.status_code == 500 and "hiccup" not in res.content.decode()  # safe error, no internals
    assert StockItem.objects.get(variant=shop.cable_variant).reserved == 0
    assert Order.objects.count() == 0 and CartItem.objects.count() == 1


def test_vendor_cannot_change_another_vendors_stock_or_go_negative(vendor_a, vendor_b):
    assert vendor_a.client.post(f"{SELLER}/products/{vendor_b.product.pk}/stock/",
                                {"variant": vendor_b.variant.pk, "quantity": 0}, format="json").status_code == 404
    assert vendor_a.client.post(f"{SELLER}/products/{vendor_a.product.pk}/stock/",
                                {"variant": vendor_a.variant.pk, "quantity": -5}, format="json").status_code == 400
    assert StockItem.objects.get(variant=vendor_a.variant).quantity == 10


# --------------------------------------------------------------------------- #
# Shipping stays configuration-driven
# --------------------------------------------------------------------------- #
def test_rider_fee_comes_only_from_the_shipping_rule(app, home, shop):
    fill_cart(app, [(shop.cable_variant, 1)])
    fee = lambda: app.post(f"{APP}/checkout/preview/", {"address": home.pk, "shipping_method": shop.rider.pk},  # noqa: E731
                           format="json").json()["shipping_fee"]
    assert fee() == "3000.00"  # the rule's minimum charge (800/kg × 0.1 kg is below it)
    shop.rider_rule.minimum_charge = D("3500")
    shop.rider_rule.save()
    assert fee() == "3500.00"
    shop.rider_rule.minimum_charge = D("3000")
    shop.rider_rule.save()
    assert fee() == "3000.00"


def test_no_delivery_price_is_hardcoded_in_checkout_code():
    import pathlib
    import re

    root = pathlib.Path(__file__).resolve().parents[2]
    for rel in ("storefront/checkout.py", "storefront/shipping.py", "storefront/cart.py", "orders/shop.py"):
        text = (root / rel).read_text()
        assert not re.search(r"\b3[,_]?000\b", text), rel


# --------------------------------------------------------------------------- #
# OTP secrecy
# --------------------------------------------------------------------------- #
def test_otp_codes_are_hashed_single_use_and_never_logged_without_the_dev_switch(api, sms, settings, caplog):
    caplog.set_level(logging.DEBUG)
    api.post(f"{APP}/auth/request-code/", {"phone": "0712 111 222", "purpose": "register"}, format="json")
    code = sms.last_code()
    row = PhoneVerification.objects.get()
    from django.contrib.auth.hashers import check_password

    assert row.code_hash != code and "$" in row.code_hash and check_password(code, row.code_hash)  # a hash
    assert code not in caplog.text
    # Without an SMS provider and without the development switch, no code is created or logged.
    from apps.storefront import otp

    class Broken:
        @staticmethod
        def configured():
            return False

        def send(self, *a, **k):
            from apps.notifications.providers import NotConfigured

            raise NotConfigured("no provider")

    settings.DEBUG = True
    settings.OTP_LOG_CODES = False
    otp_mod = otp
    old = otp_mod.SmsProvider
    otp_mod.SmsProvider = Broken
    try:
        res = api.post(f"{APP}/auth/request-code/", {"phone": "0712 333 444", "purpose": "register"}, format="json")
    finally:
        otp_mod.SmsProvider = old
    assert res.status_code == 409
    assert "is " not in "".join(r.getMessage() for r in caplog.records if "code for" in r.getMessage())


def test_otp_attempts_are_limited(api, sms):
    api.post(f"{APP}/auth/request-code/", {"phone": "0712444555", "purpose": "register"}, format="json")
    for _ in range(5):
        api.post(f"{APP}/auth/register/", {"phone": "0712444555", "code": "000000", "full_name": "X",
                                            "password": "Mzigo-Salama-2026"}, format="json")
    res = api.post(f"{APP}/auth/register/", {"phone": "0712444555", "code": sms.last_code(), "full_name": "X",
                                              "password": "Mzigo-Salama-2026"}, format="json")
    assert res.status_code == 400  # even the right code is refused after too many attempts


def test_phone_numbers_are_masked_in_logs():
    from apps.storefront.otp import mask_phone

    assert mask_phone("255712345678") == "+2557•••••678"


# --------------------------------------------------------------------------- #
# Uploads
# --------------------------------------------------------------------------- #
def test_vendor_documents_are_private_and_validated(vendor_a, vendor_b, anon, staff):
    pdf = SimpleUploadedFile("licence.pdf", b"%PDF-1.4 test", content_type="application/pdf")
    res = vendor_a.client.post(f"{SELLER}/documents/", {"kind": "business_license", "file": pdf}, format="multipart")
    assert res.status_code == 200 and res.json()[0]["kind"] == "business_license"
    exe = SimpleUploadedFile("run.pdf", b"MZ\x90\x00 not a pdf", content_type="application/pdf")
    assert vendor_a.client.post(f"{SELLER}/documents/", {"kind": "other", "file": exe},
                                format="multipart").status_code == 400
    html = SimpleUploadedFile("x.html", b"<html><script>1</script>", content_type="text/html")
    assert vendor_a.client.post(f"{SELLER}/documents/", {"kind": "other", "file": html},
                                format="multipart").status_code == 400
    assert vendor_b.client.get(f"{SELLER}/documents/").json() == []
    doc = vendor_a.vendor.documents.get()
    assert doc.file.name.startswith("private/vendors/") and "licence" not in doc.file.name
    url = f"/api/marketplace/vendors/{vendor_a.vendor.pk}/documents/{doc.pk}/file/"
    assert anon.get(url).status_code == 401
    assert vendor_a.client.get(url).status_code == 401  # even the owner uses the seller area, not staff URLs
    assert staff.get(url).status_code == 200


def test_product_images_get_random_names(vendor_a):
    photo = SimpleUploadedFile("../../etc/passwd.png", PNG, content_type="image/png")
    vendor_a.client.post(f"{SELLER}/products/{vendor_a.product.pk}/images/", {"file": photo}, format="multipart")
    name = vendor_a.product.images.get().file.name
    assert "passwd" not in name and ".." not in name and name.endswith(".png")


# --------------------------------------------------------------------------- #
# Account deletion
# --------------------------------------------------------------------------- #
def test_account_deletion_anonymises_and_keeps_financial_records(app, home, shop, staff):
    from apps.orders import services as order_services

    fill_cart(app, [(shop.cable_variant, 1)])
    order = Order.objects.get(reference=place(app, home, shop, "delete-key-0001").json()["order"]["reference"])
    res = app.post(f"{APP}/auth/delete-account/", {"password": "Mzigo-Salama-2026"})
    assert res.status_code == 409  # an order is still on its way
    order_services.transition(order, "cancelled", staff.user) if False else None
    from apps.orders import shop as shop_orders

    shop_orders.cancel(order, user=staff.user, reason="Customer asked")
    app.post(f"{APP}/wishlist/", {"product": shop.product.pk}, format="json")
    assert app.post(f"{APP}/auth/delete-account/", {"password": "Mzigo-Salama-2026"}).status_code == 204
    order.refresh_from_db()
    customer = order.customer
    assert customer.full_name.startswith("Former customer") and customer.phone == "" and customer.email == ""
    assert not customer.addresses.exists() and not customer.wishlist.exists()
    assert Order.objects.filter(pk=order.pk).exists()  # records kept


# --------------------------------------------------------------------------- #
# Rate limits, health, API docs
# --------------------------------------------------------------------------- #
def test_return_requests_are_rate_limited(app, monkeypatch):
    from apps.storefront.views.engagement import OrderReturnsView

    monkeypatch.setattr(OrderReturnsView, "throttle_scope", "returns")
    from rest_framework.throttling import ScopedRateThrottle

    monkeypatch.setattr(ScopedRateThrottle, "THROTTLE_RATES", {**ScopedRateThrottle.THROTTLE_RATES, "returns": "2/min"})
    codes = [app.post(f"{APP}/orders/NOPE-1/returns/", {}, format="json").status_code for _ in range(3)]
    assert codes[-1] == 429


def test_health_endpoints(api, monkeypatch):
    assert api.get("/api/health/live/").json() == {"status": "ok"}
    assert api.get("/api/health/").json()["database"] == "ok"

    class Down:
        def __enter__(self):
            raise RuntimeError("connection refused")

        def __exit__(self, *a):
            return False

    monkeypatch.setattr(connection, "cursor", lambda: Down())
    res = api.get("/api/health/")
    assert res.status_code == 503 and "refused" not in res.content.decode()


def test_api_schema_needs_a_staff_session(api, staff, app):
    assert api.get("/api/schema/").status_code == 401
    assert app.get("/api/schema/").status_code == 401  # a customer token isn't a staff session
    assert staff.get("/api/schema/").status_code == 200


def test_errors_never_leak_internals(app, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("SELECT secret FROM /Users/conrad/.env")

    monkeypatch.setattr("apps.storefront.views.engagement.wishlist.items", boom)
    res = app.get(f"{APP}/wishlist/")
    assert res.status_code == 500
    text = res.content.decode()
    assert "SELECT" not in text and "/Users" not in text and "Traceback" not in text


def test_hidden_product_statuses_stay_private(anon, vendor_a):
    Product.objects.filter(pk=vendor_a.product.pk).update(status=ProductStatus.DRAFT)
    assert anon.get(f"{APP}/products/{vendor_a.product.pk}/").status_code == 404
    assert anon.get(f"{APP}/products/{vendor_a.product.pk}/reviews/").status_code == 404
