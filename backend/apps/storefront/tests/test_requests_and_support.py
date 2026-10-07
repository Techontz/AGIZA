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
    res = app.post(f"{APP}/requests/", {**payload, "tracking_number": "1", "shipping_method": "sea"}, format="json")
    assert res.status_code == 201 and "Preferred shipping: Sea freight" in res.json()["description"]
    assert app.post(f"{APP}/requests/", {**payload, "tracking_number": "1", "shipping_method": "rail"},
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


def test_local_parcel_delivery_request_becomes_an_express_quote(app, shop, client_for):
    from apps.locations.models import City

    arusha = City.objects.filter(country=shop.dar.country).exclude(pk=shop.dar.pk).first() or City.objects.create(
        name="Arusha", country=shop.dar.country, region=shop.dar.region)
    payload = {"request_type": "local_delivery", "item_name": "Documents envelope", "destination_city": arusha.pk,
               "dropoff_address": "Sokoine Rd 12", "contact_name": "Asha", "contact_phone": "+255700000001"}
    assert app.post(f"{APP}/requests/", payload, format="json").status_code == 400  # needs a pickup city
    res = app.post(f"{APP}/requests/", {**payload, "pickup_city": shop.dar.pk, "pickup_address": "Kariakoo"},
                   format="json")
    assert res.status_code == 201, res.json()
    quote = QuoteRequest.objects.get(reference=res.json()["reference"])
    assert quote.service_type == "express" and quote.origin == "Dar es Salaam" and quote.destination == arusha.name
    assert "Pick up: Kariakoo, Dar es Salaam" in quote.description and "Asha +255700000001" in quote.description
    defaults = client_for("admin_l2").get(f"/api/quotes/{quote.pk}/approval-defaults/").json()
    assert defaults["item_details"] == "Documents envelope" and defaults["pickup_address"] == "Kariakoo, Dar es Salaam"
    assert defaults["delivery_address"] == f"Sokoine Rd 12, {arusha.name}" and defaults["service_type"] is None
    assert "Receiver: Asha +255700000001" in quote.description and defaults["package_size"] == ""

    sent = app.post(f"{APP}/requests/", {**payload, "pickup_city": shop.dar.pk, "sender_name": "Juma",
                                         "sender_phone": "+255700000002", "package_size": "medium"}, format="json")
    assert sent.status_code == 201, sent.json()
    assert "Sender: Juma +255700000002" in sent.json()["description"]
    assert "Package size: Medium" in sent.json()["description"]
    defaults = client_for("admin_l2").get(f"/api/quotes/{sent.json()['id']}/approval-defaults/").json()
    assert defaults["package_size"] == "medium"


def test_product_requests_may_leave_the_country_to_staff(app, request_payload):
    res = app.post(f"{APP}/requests/", {**request_payload, "origin_country": ""}, format="json")
    assert res.status_code == 201 and QuoteRequest.objects.get(pk=res.json()["id"]).origin == ""
    parcel = {**request_payload, "request_type": "deliver_for_me", "tracking_number": "YT1", "origin_country": ""}
    assert app.post(f"{APP}/requests/", parcel, format="json").status_code == 400


def test_requests_from_abroad_need_no_delivery_city(app, shop):
    minimal = {"request_type": "buy_for_me", "item_name": "Nike Air Force 1", "details": "White, size 42"}
    res = app.post(f"{APP}/requests/", minimal, format="json")
    assert res.status_code == 201, res.json()
    quote = QuoteRequest.objects.get(pk=res.json()["id"])
    assert quote.destination == "" and quote.origin == "" and "White, size 42" in quote.description
    parcel = {**minimal, "request_type": "deliver_for_me", "origin_country": "CN", "tracking_number": "YT1",
              "shipping_method": "sea"}
    res = app.post(f"{APP}/requests/", parcel, format="json")
    assert res.status_code == 201 and "Preferred shipping: Sea freight" in res.json()["description"]
    local = {"request_type": "local_delivery", "item_name": "Envelope", "pickup_city": shop.dar.pk}
    assert "destination_city" in app.post(f"{APP}/requests/", local, format="json").json()["error"]["details"]


def test_request_without_a_city_uses_the_default_address(app, home):
    res = app.post(f"{APP}/requests/", {"request_type": "buy_for_me", "item_name": "Phone case"}, format="json")
    assert res.status_code == 201 and res.json()["destination"] == "Dar es Salaam"


PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


def test_customer_adds_photos_to_a_request_and_they_follow_the_order(app, other_app, request_payload, client_for,
                                                                     settings, tmp_path):
    from django.core.files.uploadedfile import SimpleUploadedFile

    from apps.orders.models import OrderAttachment

    settings.MEDIA_ROOT = tmp_path
    payload = {**request_payload, "request_type": "deliver_for_me", "tracking_number": "YT77"}
    quote_id = app.post(f"{APP}/requests/", payload, format="json").json()["id"]
    photo = lambda name="box.png", data=PNG: SimpleUploadedFile(name, data, content_type="image/png")  # noqa: E731
    res = app.post(f"{APP}/requests/{quote_id}/photos/", {"file": photo()}, format="multipart")
    assert res.status_code == 201, res.json()
    [shown] = res.json()["photos"]
    assert shown["url"].endswith(f"/api/app/requests/{quote_id}/photos/{shown['id']}/")
    image = app.get(f"{APP}/requests/{quote_id}/photos/{shown['id']}/")
    assert image.status_code == 200 and b"".join(image.streaming_content).startswith(b"\x89PNG")
    assert other_app.get(f"{APP}/requests/{quote_id}/photos/{shown['id']}/").status_code == 404
    assert other_app.post(f"{APP}/requests/{quote_id}/photos/", {"file": photo()}, format="multipart").status_code == 404
    bad = app.post(f"{APP}/requests/{quote_id}/photos/", {"file": photo(data=b"nope")}, format="multipart")
    assert bad.status_code == 400
    for _ in range(4):
        app.post(f"{APP}/requests/{quote_id}/photos/", {"file": photo()}, format="multipart")
    assert app.post(f"{APP}/requests/{quote_id}/photos/", {"file": photo()}, format="multipart").status_code == 409

    staff = client_for("admin_l2")
    staff_photos = staff.get(f"/api/quotes/{quote_id}/").json()["photos"]
    assert len(staff_photos) == 5 and staff.get(f"/api/{staff_photos[0]['url']}/").status_code == 200
    staff.post(f"/api/quotes/{quote_id}/respond/", {"quoted_amount": "90000"}, format="json")

    # AGIZA attaches photos to its answer; the customer sees them with the quotation.
    res = staff.post(f"/api/quotes/{quote_id}/photos/", {"file": photo("found.png")}, format="multipart")
    assert res.status_code == 200, res.json()
    agiza = [p for p in res.json()["photos"] if p["from_agiza"]]
    assert len(agiza) == 1 and agiza[0]["url"] == f"quotes/{quote_id}/photos/{agiza[0]['id']}/file"
    seen = app.get(f"{APP}/requests/{quote_id}/").json()["photos"]
    assert [p["from"] for p in seen].count("agiza") == 1 and [p["from"] for p in seen].count("me") == 5
    assert app.get(f"{APP}/requests/{quote_id}/photos/{agiza[0]['id']}/").status_code == 200
    assert staff.delete(f"/api/quotes/{quote_id}/photos/{staff_photos[0]['id']}/").status_code == 404  # customer's
    assert staff.delete(f"/api/quotes/{quote_id}/photos/{agiza[0]['id']}/").status_code == 200
    assert staff.post(f"/api/quotes/{quote_id}/photos/", {"file": photo(data=b"nope")}, format="multipart").status_code == 400
    staff.post(f"/api/quotes/{quote_id}/photos/", {"file": photo("final.png")}, format="multipart")

    app.post(f"{APP}/requests/{quote_id}/accept/")
    defaults = staff.get(f"/api/quotes/{quote_id}/approval-defaults/").json()
    res = staff.post(f"/api/quotes/{quote_id}/approve/", {"source_country": defaults["source_country"],
                                                          "service_type": "deliver_for_me"}, format="json")
    assert res.status_code in (200, 201), res.json()
    order = Order.objects.get(reference=app.get(f"{APP}/requests/{quote_id}/").json()["order"])
    assert OrderAttachment.objects.filter(order=order, caption="Customer photo").count() == 5
    assert OrderAttachment.objects.filter(order=order, caption="AGIZA quotation photo").count() == 1
    assert staff.post(f"/api/quotes/{quote_id}/photos/", {"file": photo()}, format="multipart").status_code == 409
    assert app.post(f"{APP}/requests/{quote_id}/photos/", {"file": photo()}, format="multipart").status_code == 409


def test_chat_rooms_keep_a_conversation_per_quotation_apart_from_general_support(app, other_app, request_payload,
                                                                                  client_for):
    quote_id = app.post(f"{APP}/requests/", request_payload, format="json").json()["id"]
    assert app.get(f"{APP}/support/rooms/").json()["rooms"] == [
        {"key": "", "kind": "general", "title": "AGIZA Support", "preview": "", "last_message_at": None}]

    assert app.post(f"{APP}/support/messages/", {"body": "Hello AGIZA"}, format="json").status_code == 201
    room = f"quote:{quote_id}"
    res = app.post(f"{APP}/support/messages/", {"body": "Can you check the colour?", "room": room}, format="json")
    assert res.status_code == 201, res.json()

    general = Conversation.objects.get(customer=app.account.customer, quote__isnull=True)
    about_quote = Conversation.objects.get(customer=app.account.customer, quote_id=quote_id)
    assert general.pk != about_quote.pk
    assert [m["body"] for m in app.get(f"{APP}/support/messages/").json()["messages"]] == ["Hello AGIZA"]
    assert [m["body"] for m in app.get(f"{APP}/support/messages/", {"room": room}).json()["messages"]] == [
        "Can you check the colour?"]
    rooms = app.get(f"{APP}/support/rooms/").json()["rooms"]
    assert [r["key"] for r in rooms] == ["", room] and rooms[1]["kind"] == "quote"

    # Staff see the quotation on the conversation in the admin inbox.
    staff = client_for("admin_l2")
    assert staff.get(f"/api/chat/conversations/{about_quote.pk}/").json()["quote"]["id"] == quote_id
    # Another customer can't open or post into this room; unknown rooms are rejected.
    assert other_app.get(f"{APP}/support/messages/", {"room": room}).status_code == 404
    assert other_app.post(f"{APP}/support/messages/", {"body": "hi", "room": room}, format="json").status_code == 404
    assert app.get(f"{APP}/support/messages/", {"room": "invoice:1"}).status_code == 400


def test_out_of_stock_product_request_tells_staff_which_product(app, shop):
    res = app.post(f"{APP}/requests/", {"request_type": "buy_for_me", "item_name": shop.product.name,
                                        "product": shop.product.pk, "details": "Black, 128GB"}, format="json")
    assert res.status_code == 201, res.json()
    quote = QuoteRequest.objects.get(pk=res.json()["id"])
    assert f"Shop product (out of stock): Galaxy A54 (#{shop.product.pk}, SKU A54)" in quote.description
    assert app.post(f"{APP}/requests/", {"request_type": "buy_for_me", "item_name": "x", "product": 999999},
                    format="json").status_code == 400
