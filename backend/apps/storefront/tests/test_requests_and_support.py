"""Buy for me / Deliver for me requests through Intake & Quotes, support chat, and push notifications."""
from datetime import date
from decimal import Decimal as D

import pytest
from django.test import override_settings

from apps.chat.models import Conversation
from apps.orders.models import Order
from apps.quotes.models import QuoteRequest
from apps.storefront import push
from apps.storefront.models import PushDevice
from apps.tasks.models import Task

from .conftest import APP

pytestmark = pytest.mark.django_db


@pytest.fixture
def request_payload(shop):
    return {"request_type": "buy_for_me", "item_name": "DJI Mini 4 Pro", "quantity": 2, "origin_country": "CN",
            "destination_city": shop.dar.pk, "link": "https://example.com/dji-mini-4", "weight_kg": "1.2"}


def test_buy_for_me_request_lands_in_intake_with_a_task(app, request_payload, client_for):
    res = app.post(f"{APP}/requests/", request_payload, format="json")
    assert res.status_code == 201, res.json()
    quote = QuoteRequest.objects.get(reference=res.json()["reference"])
    assert quote.service_type == "international" and quote.origin == "China" and quote.destination == "Dar es Salaam"
    assert quote.description.startswith("[Buy for me] DJI Mini 4 Pro") and "Quantity: 2" in quote.description
    assert Task.objects.filter(quote=quote, task_type="generate_quote").exists()
    staff = client_for("admin_l2")
    assert staff.get(f"/api/quotes/{quote.pk}/").json()["reference"] == quote.reference


def test_deliver_for_me_needs_a_tracking_number(app, request_payload):
    payload = {**request_payload, "request_type": "deliver_for_me"}
    assert app.post(f"{APP}/requests/", payload, format="json").status_code == 400
    res = app.post(f"{APP}/requests/", {**payload, "tracking_number": "YT123456789CN"}, format="json")
    assert res.status_code == 201 and "YT123456789CN" in res.json()["description"]
    assert app.post(f"{APP}/requests/", {**payload, "origin_country": "ZZ", "tracking_number": "1"},
                    format="json").status_code == 400


def test_customer_accepts_quote_and_staff_approve_into_a_trackable_order(app, other_app, request_payload, client_for):
    quote_id = app.post(f"{APP}/requests/", request_payload, format="json").json()["id"]
    assert app.post(f"{APP}/requests/{quote_id}/accept/").status_code == 409  # not quoted yet

    staff = client_for("admin_l2")
    res = staff.post(f"/api/quotes/{quote_id}/respond/", {"quoted_amount": "2400000", "estimated_delivery": "2026-11-01",
                                                          "response_notes": "Includes shipping"}, format="json")
    assert res.status_code == 200, res.json()
    detail = app.get(f"{APP}/requests/{quote_id}/").json()
    assert detail["quoted_amount"] == "2400000.00" and detail["can_reply"] is True
    assert other_app.get(f"{APP}/requests/{quote_id}/").status_code == 404
    assert other_app.post(f"{APP}/requests/{quote_id}/accept/").status_code == 404

    assert app.post(f"{APP}/requests/{quote_id}/accept/", {"note": "Please use air"}).json()["status"] == "answered"
    defaults = staff.get(f"/api/quotes/{quote_id}/approval-defaults/").json()
    res = staff.post(f"/api/quotes/{quote_id}/approve/", {"source_country": defaults["source_country"],
                                                          "service_type": "full_service"}, format="json")
    assert res.status_code in (200, 201), res.json()

    detail = app.get(f"{APP}/requests/{quote_id}/").json()
    order = Order.objects.get(reference=detail["order"])
    tracked = app.get(f"{APP}/orders/{order.reference}/").json()
    assert tracked["type"] == "international" and tracked["total"] == "2400000.00"
    assert tracked["timeline"]["steps"][0]["state"] == "completed"
    assert [s["key"] for s in tracked["timeline"]["steps"]] == [
        "placed", "payment", "processing", "shipped_from_origin", "in_transit", "customs_clearance", "ready", "delivered"]


def test_customer_can_decline_a_quote(app, request_payload, client_for):
    quote_id = app.post(f"{APP}/requests/", request_payload, format="json").json()["id"]
    client_for("admin_l2").post(f"/api/quotes/{quote_id}/respond/", {"quoted_amount": "900000",
                                                                     "estimated_delivery": str(date(2026, 11, 1))},
                                format="json")
    assert app.post(f"{APP}/requests/{quote_id}/decline/").json()["status"] == "declined"
    assert [q["id"] for q in app.get(f"{APP}/requests/").json()["results"]] == [quote_id]


def test_support_chat_reaches_the_admin_inbox_and_replies_come_back(app, account, client_for):
    res = app.post(f"{APP}/support/messages/", {"body": "Where is my order?"}, format="json")
    assert res.status_code == 201 and res.json()["from"] == "me"
    conv = Conversation.objects.get()
    assert conv.channel == "web" and conv.customer_id == account.customer_id

    staff = client_for("admin_l2")
    sent = staff.post(f"/api/chat/conversations/{conv.pk}/send/", {"body": "It ships today."}, format="json")
    assert sent.status_code in (200, 201), sent.json()
    note = staff.post(f"/api/chat/conversations/{conv.pk}/send/", {"body": "internal only", "internal": True},
                      format="json")
    assert note.status_code in (200, 201), note.json()
    messages = app.get(f"{APP}/support/messages/").json()["messages"]
    assert [(m["from"], m["body"]) for m in messages if m["from"] != "system"] == [
        ("me", "Where is my order?"), ("agiza", "It ships today.")]


@override_settings(EXPO_PUSH_ENABLED=True)
def test_order_status_changes_push_to_the_customers_devices(app, account, shop, home, client_for, monkeypatch,
                                                           django_capture_on_commit_callbacks):
    sent = []
    monkeypatch.setattr(push, "_send", lambda tokens, title, body, data: sent.append((tokens, title, body, data)))
    monkeypatch.setattr(push.threading, "Thread",
                        lambda target, args, daemon: type("T", (), {"start": lambda self: target(*args)})())
    PushDevice.objects.create(account=account, token="ExponentPushToken[device-1]", platform="android")
    app.post(f"{APP}/cart/items/", {"variant": shop.variant.pk, "quantity": 1}, format="json")
    with django_capture_on_commit_callbacks(execute=True):
        reference = app.post(f"{APP}/checkout/place-order/", {
            "address": home.pk, "shipping_method": shop.rider.pk, "payment_method": "pay_later",
            "idempotency_key": "push-test-0001"}, format="json").json()["order"]["reference"]
    assert sent == []  # placing the order is confirmed in the app, not pushed

    order = Order.objects.get(reference=reference)
    with django_capture_on_commit_callbacks(execute=True):
        client_for("admin_l2").post(f"/api/orders/shop/{order.pk}/transition/", {"status": "processing"})
    assert sent[-1][0] == ["ExponentPushToken[device-1]"]
    assert sent[-1][1] == f"Order {reference}" and sent[-1][2] == "Status: Processing"
    assert sent[-1][3]["screen"] == "order"

    with django_capture_on_commit_callbacks(execute=True):
        client_for("admin_l2").post(f"/api/orders/shop/{order.pk}/payments/",
                                    {"amount": str(D("853000")), "method": "cash", "kind": "balance"}, format="json")
    assert sent[-1][1] == "Payment received"


def test_approval_defaults_carry_the_app_request_type(app, request_payload, client_for):
    payload = {**request_payload, "request_type": "deliver_for_me", "tracking_number": "YT1"}
    quote_id = app.post(f"{APP}/requests/", payload, format="json").json()["id"]
    defaults = client_for("admin_l2").get(f"/api/quotes/{quote_id}/approval-defaults/").json()
    assert defaults["service_type"] == "deliver_for_me" and defaults["item_details"] == "DJI Mini 4 Pro"
