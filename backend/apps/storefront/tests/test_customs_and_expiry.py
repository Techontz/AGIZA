"""
Customs / import charges (Shipping Engine import-charge rules) and the payment deadline of
orders with imported items: expiry, late payments and idempotency.
"""
from datetime import date, timedelta
from decimal import Decimal as D

import pytest
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import AuditLog
from apps.inventory.models import StockItem
from apps.notifications.models import Notification
from apps.orders import expiry
from apps.orders.models import Order, Payment
from apps.payments.models import GatewayPayment
from apps.payments.tests.test_selcom import SELCOM, Gateway
from apps.shipping_engine.models import EngineSettings, ExchangeRate, ImportCharge
from apps.storefront.models import CustomerNotification

from .conftest import APP

pytestmark = pytest.mark.django_db


@pytest.fixture
def gateway(monkeypatch):
    from apps.payments import selcom

    fake = Gateway()
    monkeypatch.setattr(selcom, "_call", fake)
    return fake


@pytest.fixture
def mobile_money(gateway):
    with override_settings(**SELCOM):
        yield gateway


def add(client, variant, qty=1):
    assert client.post(f"{APP}/cart/items/", {"variant": variant.pk, "quantity": qty}, format="json").status_code in (200, 201)


def preview(client, address, **extra):
    return client.post(f"{APP}/checkout/preview/", {"address": address.pk, **extra}, format="json").json()


def place(client, address, key="customs-key-0001", **extra):
    quote = preview(client, address, **extra)
    res = client.post(f"{APP}/checkout/place-order/", {
        "address": address.pk, "shipping_method": quote["selected_shipping_method"],
        "import_method": quote["selected_import_method"], "payment_method": "mobile_money",
        "idempotency_key": key, "expected_total": quote["total"]}, format="json")
    assert res.status_code == 201, res.json()
    return Order.objects.get(reference=res.json()["order"]["reference"])


def charge(**fields) -> ImportCharge:
    return ImportCharge.objects.create(**{"name": "Import duty", "kind": "customs_duty", "basis": "percent",
                                          "rate": D("25"), "treatment": "included", **fields})


# --------------------------------------------------------------------------- #
# Customs / import charges
# --------------------------------------------------------------------------- #
def test_without_a_customs_rule_customs_are_reported_as_not_included(app, imported, home, mobile_money):
    add(app, imported.drone_variant)
    quote = preview(app, home)
    assert quote["customs_fee"] == "0.00"
    assert quote["customs"]["status"] == "not_included" and quote["customs"]["lines"] == []
    assert quote["customs"]["note"] == "Customs / import charges are not included and may be payable separately."
    assert quote["total"] == "575000.00"  # 500,000 + 75,000 air freight + free pickup: no customs added
    local_only = APIClient(HTTP_X_AGIZA_CHANNEL="web").post(f"{APP}/checkout/guest/preview/", {
        "items": [{"variant": imported.variant.pk, "quantity": 1}], "city": imported.dar.pk}, format="json").json()
    assert local_only["customs"] is None and local_only["customs_fee"] == "0.00"  # nothing imported


def test_included_duty_is_charged_and_recorded_on_the_order(app, imported, home, mobile_money, client_for):
    charge(origin_country=imported.drone.origin_country, category=imported.drone.category)
    add(app, imported.drone_variant)
    quote = preview(app, home)
    assert quote["customs_fee"] == "125000.00"  # 25% of 500,000
    assert quote["customs"]["status"] == "included"
    assert quote["customs"]["lines"] == [{"kind": "customs_duty", "kind_display": "Customs / import duty",
                                          "name": "Import duty", "treatment": "included", "amount": "125000.00"}]
    assert quote["total"] == "700000.00"  # 500,000 + 75,000 + 125,000
    order = place(app, home)
    assert order.total_amount == D("700000") and order.shop.customs_fee == D("125000")
    assert order.shop.customs_status == "included" and order.shop.delivery_fee == D("75000")
    detail = app.get(f"{APP}/orders/{order.reference}/").json()
    assert detail["amounts"]["customs_fee"] == "125000.00" and detail["customs"]["status"] == "included"
    staff = client_for("admin_l2").get(f"/api/orders/shop/{order.pk}/").json()
    assert staff["details"]["customs_fee"] == "125000.00"


def test_estimates_are_shown_but_not_charged(app, imported, home, mobile_money):
    charge()  # duty included, any origin / category
    charge(name="Import VAT", kind="import_vat", rate=D("18"), percent_base="goods_shipping", treatment="estimate")
    add(app, imported.drone_variant)
    quote = preview(app, home)
    vat = next(line for line in quote["customs"]["lines"] if line["kind"] == "import_vat")
    assert vat["amount"] == "103500.00" and vat["treatment"] == "estimate"  # 18% × (500,000 + 75,000)
    assert quote["customs"]["status"] == "estimated" and quote["customs"]["estimate"] == "103500.00"
    assert quote["customs_fee"] == "125000.00" and quote["total"] == "700000.00"  # the estimate isn't in the total
    assert "not included in your total" in quote["customs"]["note"]


def test_most_specific_rule_wins_and_inactive_rules_are_ignored(app, imported, home, mobile_money):
    charge(rate=D("10"))
    charge(name="Drone duty", product_sku="drn", rate=D("5"))
    charge(name="Old duty", product_sku="DRN", rate=D("50"), status="inactive")
    add(app, imported.drone_variant)
    quote = preview(app, home)
    assert [(line["name"], line["amount"]) for line in quote["customs"]["lines"]] == [("Drone duty", "25000.00")]


def test_fixed_charges_are_converted_and_per_order_fees_counted_once(app, imported, home, mobile_money):
    charge(name="Clearance", kind="clearance", basis="fixed_shipment", rate=D("20"), currency="USD")
    charge(name="Duty per item", basis="fixed_item", rate=D("10000"), currency="TZS")
    add(app, imported.drone_variant, 2)
    quote = preview(app, home)
    amounts = {line["name"]: line["amount"] for line in quote["customs"]["lines"]}
    assert amounts == {"Clearance": "50000.00", "Duty per item": "20000.00"}  # $20 × 2,500 once; 10,000 × 2
    assert quote["customs_fee"] == "70000.00"


def test_missing_exchange_rate_blocks_checkout_instead_of_guessing(app, imported, home, mobile_money):
    charge(basis="fixed_item", rate=D("10"), currency="AED")
    add(app, imported.drone_variant)
    quote = preview(app, home)
    assert quote["can_place_order"] is False
    assert any("Customs charges" in issue for issue in quote["issues"])


def test_delivery_calculator_shows_the_same_customs(api, imported):
    estimate = api.get(f"{APP}/delivery-estimate/", {"variant": imported.drone_variant.pk, "city": imported.dar.pk}).json()
    assert estimate["customs"]["status"] == "not_included"
    charge()
    estimate = api.get(f"{APP}/delivery-estimate/", {"variant": imported.drone_variant.pk, "city": imported.dar.pk}).json()
    assert estimate["customs"]["included"] == "125000.00" and estimate["customs"]["status"] == "included"


def test_website_guest_and_app_get_the_same_customs(app, imported, home, mobile_money):
    charge()
    add(app, imported.drone_variant)
    account = preview(app, home)
    guest = APIClient(HTTP_X_AGIZA_CHANNEL="web").post(f"{APP}/checkout/guest/preview/", {
        "items": [{"variant": imported.drone_variant.pk, "quantity": 1}], "city": imported.dar.pk}, format="json").json()
    assert guest["customs"] == account["customs"] and guest["total"] == account["total"]


def test_admin_manages_import_charges(client_for):
    staff = client_for("admin_l2")
    res = staff.post("/api/shipping-engine/import-charges/", {
        "name": "Import duty", "kind": "customs_duty", "basis": "percent", "rate": "25", "treatment": "included"},
        format="json")
    assert res.status_code == 201, res.json()
    assert res.json()["code"].startswith("IC") and res.json()["applies_to_label"] == "All imported items"
    assert staff.post("/api/shipping-engine/import-charges/", {
        "name": "Bad", "basis": "fixed_item", "rate": "5"}, format="json").status_code == 400  # fixed needs a currency
    assert staff.get("/api/shipping-engine/import-charges/").json()["count"] == 1
    assert client_for("sales").post("/api/shipping-engine/import-charges/", {}, format="json").status_code == 403


# --------------------------------------------------------------------------- #
# Payment deadline and expiry
# --------------------------------------------------------------------------- #
def test_deadline_comes_from_the_shipping_engine_settings(app, imported, home, mobile_money):
    settings = EngineSettings.load()
    settings.import_payment_window_hours = 6
    settings.save()
    add(app, imported.drone_variant)
    assert preview(app, home)["payment_window_hours"] == 6
    before = timezone.now()
    order = place(app, home)
    due = order.shop.payment_due_at
    assert before + timedelta(hours=6) <= due <= timezone.now() + timedelta(hours=6)
    assert app.get(f"{APP}/orders/{order.reference}/").json()["payment_due_at"] is not None


def test_unpaid_order_expires_after_the_deadline(app, imported, home, mobile_money):
    add(app, imported.drone_variant)
    add(app, imported.variant)  # a local phone: its stock is reserved
    order = place(app, home)
    assert StockItem.objects.get(variant=imported.variant).reserved == 1
    assert expiry.expire_due() == []  # not due yet
    later = order.shop.payment_due_at + timedelta(minutes=1)
    assert expiry.expire_due(now=later) == [order.reference]
    order.refresh_from_db()
    assert order.status == "cancelled"
    assert StockItem.objects.get(variant=imported.variant).reserved == 0  # released
    assert not StockItem.objects.filter(variant=imported.drone_variant).exists()  # never reserved or bought
    history = order.status_history.order_by("-id").first()
    assert history.to_status == "cancelled" and history.note.startswith("Payment deadline passed")
    assert AuditLog.objects.filter(object_id=str(order.pk), action="status_change").exists()
    inbox = list(CustomerNotification.objects.filter(customer=order.customer).values_list("title", "body"))
    assert [t for t, _ in inbox] == [f"Order {order.reference} cancelled"]  # one, specific message
    assert "imported items were not bought" in inbox[0][1]
    assert expiry.expire_due(now=later) == []  # idempotent
    detail = app.get(f"{APP}/orders/{order.reference}/").json()
    assert detail["can_pay"] is False and detail["status"] == "cancelled"


def test_paid_orders_never_expire(app, imported, home, mobile_money):
    add(app, imported.drone_variant)
    order = place(app, home)
    mobile_money.status = {"payment_status": "COMPLETED", "amount": str(order.total_amount), "transid": "SEL1"}
    # The payment completed at Selcom but the callback never arrived: the job checks before cancelling.
    assert expiry.expire_due(now=order.shop.payment_due_at + timedelta(hours=1)) == []
    order.refresh_from_db()
    assert order.status == "pending" and order.payments.count() == 1


def test_late_payment_never_revives_an_expired_order(api, app, imported, home, mobile_money):
    add(app, imported.drone_variant)
    order = place(app, home)
    gateway_payment = GatewayPayment.objects.get(order=order)
    expiry.expire_due(now=order.shop.payment_due_at + timedelta(minutes=5))
    mobile_money.status = {"payment_status": "COMPLETED", "amount": str(order.total_amount), "transid": "LATE1"}
    for _ in range(2):  # Selcom retries its callback: still handled once
        res = api.post("/api/payments/selcom/webhook/", {"order_id": gateway_payment.provider_order_id}, format="json")
        assert res.status_code == 200
    order.refresh_from_db()
    gateway_payment.refresh_from_db()
    assert order.status == "cancelled" and not Payment.objects.filter(order=order).exists()
    assert gateway_payment.status == "completed" and gateway_payment.needs_attention is True
    assert "couldn't be applied" in gateway_payment.failure_reason
    assert Notification.objects.filter(title__contains="needs attention").count() >= 1
    late = CustomerNotification.objects.filter(customer=order.customer, title__startswith="Payment received for cancelled")
    assert late.count() == 1 and "refund" in late.get().body


def test_paying_after_the_deadline_is_refused(app, imported, home, mobile_money):
    add(app, imported.drone_variant)
    order = place(app, home)
    order.shop.payment_due_at = timezone.now() - timedelta(minutes=1)
    order.shop.save(update_fields=["payment_due_at"])
    assert app.get(f"{APP}/orders/{order.reference}/").json()["can_pay"] is False
    res = app.post(f"{APP}/orders/{order.reference}/pay/")
    assert res.status_code == 409 and "deadline" in res.json()["error"]["message"]


def test_part_paid_orders_expire_with_a_refund_flag(app, imported, home, mobile_money, client_for):
    add(app, imported.drone_variant)
    order = place(app, home)
    client_for("admin_l2").post(f"/api/orders/shop/{order.pk}/payments/",
                                {"amount": "100000", "method": "cash", "kind": "advance"}, format="json")
    expiry.expire_due(now=order.shop.payment_due_at + timedelta(minutes=1))
    order.refresh_from_db()
    assert order.status == "cancelled"
    assert Notification.objects.filter(title=f"Refund needed · {order.reference}").exists()
    body = CustomerNotification.objects.get(customer=order.customer, title__endswith="cancelled").body
    assert "refund the 100,000 TZS" in body


def test_guests_are_texted_when_their_order_expires(imported, mobile_money, sms, monkeypatch,
                                                    django_capture_on_commit_callbacks):
    web = APIClient(HTTP_X_AGIZA_CHANNEL="web")
    items = [{"variant": imported.drone_variant.pk, "quantity": 1}]
    quote = web.post(f"{APP}/checkout/guest/preview/", {"items": items, "city": imported.dar.pk}, format="json").json()
    web.post(f"{APP}/checkout/guest/place-order/", {
        "items": items, "full_name": "Asha Said", "phone": "0754 111 222", "city": imported.dar.pk,
        "line1": "Plot 7, Sinza", "shipping_method": quote["selected_shipping_method"],
        "import_method": quote["selected_import_method"], "payment_method": "mobile_money",
        "idempotency_key": "guest-expiry-01", "expected_total": quote["total"]}, format="json")
    order = Order.objects.get()
    sms.sent = []
    monkeypatch.setattr("apps.notifications.providers.SmsProvider", sms)  # never a real SMS
    with django_capture_on_commit_callbacks(execute=True):
        expiry.expire_due(now=order.shop.payment_due_at + timedelta(minutes=1))
    assert len(sms.sent) == 1 and sms.sent[0][0] == "+255754111222" and order.reference in sms.sent[0][1]


def test_exchange_rate_changes_reprice_import_shipping(app, imported, home, mobile_money):
    add(app, imported.drone_variant)
    assert preview(app, home)["import_fee"] == "75000.00"
    ExchangeRate.objects.create(base_currency="USD", quote_currency="TZS", rate=D("2600"), effective_date=date.today())
    assert preview(app, home)["import_fee"] == "78000.00"  # $30 minimum × 2,600
