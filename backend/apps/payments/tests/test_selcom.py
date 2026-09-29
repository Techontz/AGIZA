"""Selcom mobile-money payments: signed requests, and money credited only when Selcom itself confirms it."""
import base64
from decimal import Decimal as D

import pytest
from django.test import override_settings

from apps.orders.models import Order, Payment
from apps.payments import selcom
from apps.payments.models import GatewayPayment
from apps.storefront.tests.conftest import APP

pytestmark = pytest.mark.django_db

SELCOM = {"SELCOM_VENDOR_CODE": "TILL001", "SELCOM_API_KEY": "key", "SELCOM_SECRET_KEY": "secret",
          "SELCOM_BASE_PAYMENT_URL": "https://apigw.selcom.test/v1", "SELCOM_CALLBACK_BASE_URL": "https://api.agiza.test"}


class Gateway:
    """Fake Selcom API: records calls; `status` is what order-status answers."""

    def __init__(self):
        self.calls = []
        self.status = {"payment_status": "PENDING"}

    def __call__(self, method, path, payload, signed_fields):
        self.calls.append((method, path, payload, signed_fields))
        if path == "checkout/create-order-minimal":
            url = base64.b64encode(b"https://checkout.selcom.test/pay/abc").decode()
            return {"result": "SUCCESS", "resultcode": "000", "data": [{"payment_gateway_url": url}]}
        return {"result": "SUCCESS", "data": [{"order_id": payload["order_id"], **self.status}]}


@pytest.fixture
def gateway(monkeypatch):
    fake = Gateway()
    monkeypatch.setattr(selcom, "_call", fake)
    return fake


@pytest.fixture
def paid_checkout(app, shop, home, gateway):
    with override_settings(**SELCOM):
        app.post(f"{APP}/cart/items/", {"variant": shop.variant.pk, "quantity": 1}, format="json")
        res = app.post(f"{APP}/checkout/place-order/", {
            "address": home.pk, "shipping_method": shop.rider.pk, "payment_method": "mobile_money",
            "idempotency_key": "selcom-checkout-1"}, format="json")
        assert res.status_code == 201, res.json()
        yield res.json()


def webhook(api, order_id, **payload):
    return api.post("/api/payments/selcom/webhook/", {"order_id": order_id, **payload}, format="json")


def test_digest_matches_selcoms_signing_scheme():
    value = selcom.digest("secret", "2026-09-29T10:00:00+03:00", {"vendor": "V", "order_id": "O", "amount": "1"},
                          ["vendor", "order_id", "amount"])
    import hashlib
    import hmac

    raw = "timestamp=2026-09-29T10:00:00+03:00&vendor=V&order_id=O&amount=1"
    assert value == base64.b64encode(hmac.new(b"secret", raw.encode(), hashlib.sha256).digest()).decode()


def test_mobile_money_is_offered_only_when_configured(api, shop):
    assert [m["code"] for m in api.get(f"{APP}/config/").json()["payment_methods"]] == ["pay_later"]
    with override_settings(**SELCOM):
        assert [m["code"] for m in api.get(f"{APP}/config/").json()["payment_methods"]] == ["mobile_money", "pay_later"]


def test_checkout_opens_a_selcom_payment_for_the_server_total(paid_checkout, gateway):
    assert paid_checkout["payment"]["checkout_url"] == "https://checkout.selcom.test/pay/abc"
    method, path, payload, signed = gateway.calls[0]
    assert path == "checkout/create-order-minimal" and signed == ["vendor", "order_id", "amount", "currency", "webhook"]
    assert payload["amount"] == "853000" and payload["currency"] == "TZS" and payload["buyer_phone"] == "255712345678"
    assert base64.b64decode(payload["webhook"]).decode() == "https://api.agiza.test/api/payments/selcom/webhook/"
    assert Order.objects.get().shop.payment_preference == "mobile_money"


def test_forged_webhook_does_not_credit_money(api, paid_checkout, gateway):
    gp = GatewayPayment.objects.get()
    with override_settings(**SELCOM):
        res = webhook(api, gp.provider_order_id, result="SUCCESS", payment_status="COMPLETED", amount="853000")
    assert res.status_code == 200
    gp.refresh_from_db()
    assert gp.status == "pending" and not Payment.objects.exists()  # Selcom still says PENDING


def test_confirmed_payment_is_recorded_once(api, app, paid_checkout, gateway):
    gp = GatewayPayment.objects.get()
    gateway.status = {"payment_status": "COMPLETED", "amount": "853000", "transid": "SEL123"}
    with override_settings(**SELCOM):
        webhook(api, gp.provider_order_id)
        webhook(api, gp.provider_order_id)  # retries are harmless
        check = app.post(f"{APP}/orders/{paid_checkout['order']['reference']}/check-payment/").json()
    payment = Payment.objects.get()
    assert payment.amount == D("853000.00") and payment.method == "mobile_money" and payment.reference == "SEL123"
    assert payment.recorded_by is None
    gp.refresh_from_db()
    assert gp.status == "completed" and gp.payment == payment
    assert check["payment"]["status"] == "fully_paid"


def test_the_app_can_check_a_payment_when_the_webhook_is_late(app, paid_checkout, gateway):
    gateway.status = {"payment_status": "COMPLETED", "amount": "853000", "transid": "SEL9"}
    with override_settings(**SELCOM):
        res = app.post(f"{APP}/orders/{paid_checkout['order']['reference']}/check-payment/")
    assert res.json()["gateway"][0]["status"] == "completed"
    assert Payment.objects.get().reference == "SEL9"


def test_failed_payment_can_be_retried(app, paid_checkout, gateway):
    gateway.status = {"payment_status": "CANCELLED"}
    reference = paid_checkout["order"]["reference"]
    with override_settings(**SELCOM):
        app.post(f"{APP}/orders/{reference}/check-payment/")
        retry = app.post(f"{APP}/orders/{reference}/pay/")
    assert GatewayPayment.objects.filter(status="failed").count() == 1
    assert retry.status_code == 200 and retry.json()["checkout_url"]
    assert GatewayPayment.objects.filter(status="pending").count() == 1


def test_double_tap_on_pay_reuses_the_open_checkout(app, paid_checkout, gateway):
    with override_settings(**SELCOM):
        app.post(f"{APP}/orders/{paid_checkout['order']['reference']}/pay/")
    assert GatewayPayment.objects.count() == 1
    assert len([c for c in gateway.calls if c[1] == "checkout/create-order-minimal"]) == 1


def test_money_that_cannot_be_applied_is_flagged_for_finance(api, paid_checkout, gateway, client_for):
    order = Order.objects.get()
    finance = client_for("admin_l2")
    finance.post(f"/api/orders/shop/{order.pk}/payments/", {"amount": "853000", "method": "cash", "kind": "balance"},
                 format="json")  # customer also paid cash
    gateway.status = {"payment_status": "COMPLETED", "amount": "853000", "transid": "SEL7"}
    with override_settings(**SELCOM):
        webhook(api, GatewayPayment.objects.get().provider_order_id)
    gp = GatewayPayment.objects.get()
    assert gp.status == "completed" and gp.needs_attention and gp.payment is None
    assert Payment.objects.count() == 1
    assert finance.get("/api/notifications/").json()["results"][0]["title"].startswith("Online payment needs attention")


def test_unknown_webhooks_are_acknowledged_and_ignored(api, db):
    assert webhook(api, "AGIZA-NOPE").status_code == 200
    assert not Payment.objects.exists()


def test_pay_is_refused_for_other_customers_and_paid_orders(other_app, app, paid_checkout, gateway):
    reference = paid_checkout["order"]["reference"]
    with override_settings(**SELCOM):
        assert other_app.post(f"{APP}/orders/{reference}/pay/").status_code == 404
        gateway.status = {"payment_status": "COMPLETED", "amount": "853000", "transid": "SEL1"}
        app.post(f"{APP}/orders/{reference}/check-payment/")
        assert app.post(f"{APP}/orders/{reference}/pay/").status_code == 409
        assert app.post(f"{APP}/orders/{reference}/cancel/", {"reason": "x"}).status_code == 409  # paid online


def signed(payload: dict, secret="secret") -> str:
    import hashlib
    import hmac

    message = f"{payload['order_id']}{payload['amount']}{payload['resultcode']}"
    return hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()


def test_mobile_money_needs_the_callback_base_url(api, shop):
    with override_settings(**{**SELCOM, "SELCOM_CALLBACK_BASE_URL": ""}):
        assert [m["code"] for m in api.get(f"{APP}/config/").json()["payment_methods"]] == ["pay_later"]


def test_webhook_with_a_wrong_signature_is_rejected(api, paid_checkout, gateway):
    gp = GatewayPayment.objects.get()
    gateway.status = {"payment_status": "COMPLETED", "amount": "853000", "transid": "SEL5"}
    payload = {"order_id": gp.provider_order_id, "amount": "853000", "resultcode": "000", "result": "SUCCESS"}
    with override_settings(**SELCOM):
        bad = api.post("/api/payments/selcom/webhook/", payload, format="json", HTTP_X_SEL_SIGNATURE="deadbeef")
        assert bad.status_code == 400 and not Payment.objects.exists()
        good = api.post("/api/payments/selcom/webhook/", payload, format="json",
                        HTTP_X_SEL_SIGNATURE=signed(payload))
    assert good.status_code == 200
    assert Payment.objects.get().reference == "SEL5"


def test_deploy_checks_flag_bad_selcom_settings():
    from apps.payments.checks import selcom_configuration

    with override_settings(**SELCOM):
        assert selcom_configuration(None) == []
    legacy = "https://management.agizastore.com/cargo/api/v1/invoice/selcom-callback/"
    with override_settings(**{**SELCOM, "SELCOM_CALLBACK_BASE_URL": legacy}):
        assert [w.id for w in selcom_configuration(None)] == ["payments.W003"]
    with override_settings(**{**SELCOM, "SELCOM_API_KEY": "", "SELCOM_BASE_PAYMENT_URL": "http://apigw.test/v1"}):
        assert {w.id for w in selcom_configuration(None)} == {"payments.W001", "payments.W002"}
