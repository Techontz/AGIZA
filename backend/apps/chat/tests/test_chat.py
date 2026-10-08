"""Chat: persistence, handler ownership, quotes, escalation, follow-ups, notifications and webhooks."""
import hashlib
import hmac
import json
from datetime import timedelta
from decimal import Decimal as D

import pytest
from django.test import override_settings
from django.utils import timezone

from apps.accounts.constants import StaffLevel
from apps.chat import services
from apps.chat.models import Conversation, Message, WebhookEvent
from apps.notifications.models import Notification
from apps.quotes.models import QuoteRequest
from apps.tasks.models import Task

pytestmark = pytest.mark.django_db

CHAT = "/api/chat/conversations"


@pytest.fixture
def inbound(buyer):
    buyer.phone = "+255 712 345 678"
    buyer.save()

    def _make(text="Hello! I need 50 smartphones from China", handle="+255712345678"):
        return services.receive(channel="whatsapp", handle=handle, name="Fatuma", body=text)

    return _make


def test_inbound_links_customer_and_threading(ops, inbound, buyer):
    msg = inbound()
    conv = msg.conversation
    assert conv.customer == buyer and conv.response_status == "waiting_team"
    again = inbound("Are you there?")
    assert again.conversation_id == conv.id and Message.objects.filter(conversation=conv).count() == 2
    rows = ops.get(f"{CHAT}/").json()["results"]
    assert rows[0]["unread_count"] == 2 and rows[0]["lifecycle"] == "new_inquiry"
    assert rows[0]["client_value"] == "curious"
    ops.post(f"{CHAT}/{conv.id}/mark-read/")
    assert ops.get(f"{CHAT}/{conv.id}/").json()["unread_count"] == 0


def test_reply_note_and_handler_ownership(ops, client_for, inbound):
    conv = inbound().conversation
    res = ops.post(f"{CHAT}/{conv.id}/send/", {"body": "Hi Fatuma! Preparing a quote."}, format="json")
    assert res.status_code == 201
    body = res.json()
    # WhatsApp isn't connected in tests: the reply is stored, not pretended to be sent.
    assert body["delivery_status"] == "stored" and "WhatsApp" in body["delivery_error"]
    detail = ops.get(f"{CHAT}/{conv.id}/").json()
    assert detail["active_handler"]["id"] == ops.user.id and detail["response_status"] == "waiting_client"
    other = client_for(StaffLevel.SALES)
    blocked = other.post(f"{CHAT}/{conv.id}/send/", {"body": "Hello"}, format="json")
    assert blocked.status_code == 409 and "Take over" in blocked.json()["error"]["message"]
    note = other.post(f"{CHAT}/{conv.id}/send/", {"body": "Good payment record", "internal": True}, format="json")
    assert note.status_code == 201 and note.json()["sender"] == "internal"
    assert other.post(f"{CHAT}/{conv.id}/take-over/").json()["active_handler"]["id"] == other.user.id
    assert Notification.objects.filter(recipient=ops.user, kind="assignment").exists()
    assert other.post(f"{CHAT}/{conv.id}/send/", {"body": "Hello"}, format="json").status_code == 201
    assert ops.post(f"{CHAT}/{conv.id}/release/").status_code == 409  # not the handler
    assert other.post(f"{CHAT}/{conv.id}/release/").json()["active_handler"] is None
    senders = [m["sender"] for m in ops.get(f"{CHAT}/{conv.id}/messages/").json()]
    assert senders.count("system") >= 2 and "internal" in senders


def test_quote_cards_and_lifecycle(ops, inbound, buyer):
    conv = inbound().conversation
    res = ops.post(f"{CHAT}/{conv.id}/create-quote/", {"service_type": "international",
                                                       "description": "50 smartphones from China"}, format="json")
    quote = QuoteRequest.objects.get(pk=res.json()["quote"]["id"])
    assert Task.objects.filter(quote=quote, task_type="generate_quote").exists()
    unpriced = ops.post(f"{CHAT}/{conv.id}/send-quote/", {"quote": quote.id}, format="json")
    assert unpriced.status_code == 409
    ops.post(f"/api/quotes/{quote.id}/respond/", {"quoted_amount": "23250000", "estimated_delivery": "2026-10-20",
                                                  "notes": "Air cargo"}, format="json")
    card = ops.post(f"{CHAT}/{conv.id}/send-quote/", {"quote": quote.id}, format="json").json()
    assert card["quotation"]["amount"] == "23250000.00" and card["quotation"]["reference"] == quote.reference
    detail = ops.get(f"{CHAT}/{conv.id}/").json()
    assert detail["lifecycle"] == "quoted" and detail["client_action_state"] == "quote_sent"
    services.receive(channel="whatsapp", handle="+255712345678", name="Fatuma", body="Looks good")
    assert ops.get(f"{CHAT}/{conv.id}/").json()["client_action_state"] == "awaiting_response"
    other_customer_quote = QuoteRequest.objects.create(customer=type(buyer).objects.create(full_name="X",
                                                                                            phone="+2557"),
                                                       service_type="express", description="x",
                                                       quoted_amount=D("1"))
    assert ops.post(f"{CHAT}/{conv.id}/send-quote/", {"quote": other_customer_quote.id},
                    format="json").status_code == 400


def test_assign_escalate_follow_up_link_archive(ops, client_for, inbound, make_intl):
    conv = inbound().conversation
    agent = client_for(StaffLevel.SALES, full_name="Hassan Mohammed").user
    body = ops.post(f"{CHAT}/{conv.id}/assign/", {"agent": agent.id}, format="json").json()
    assert body["assigned_agent"]["full_name"] == "Hassan Mohammed"
    assert Notification.objects.filter(recipient=agent, kind="assignment").exists()
    finance = client_for(StaffLevel.FINANCE)
    body = ops.post(f"{CHAT}/{conv.id}/escalate/", {"to": "finance", "note": "Payment dispute"},
                    format="json").json()
    assert body["escalated_to"] == "finance" and body["response_status"] == "urgent"
    assert Notification.objects.filter(recipient=finance.user, kind="escalation").exists()
    assert Task.objects.filter(department="finance", description__contains=conv.reference).exists()
    assert ops.post(f"{CHAT}/{conv.id}/follow-up/", {"at": (timezone.now() - timedelta(hours=1)).isoformat()},
                    format="json").status_code == 400
    ops.post(f"{CHAT}/{conv.id}/follow-up/", {"at": (timezone.now() + timedelta(minutes=5)).isoformat()},
             format="json")
    Conversation.objects.filter(pk=conv.pk).update(follow_up_at=timezone.now() - timedelta(minutes=1))
    assert services.due_follow_ups() == 1 and services.due_follow_ups() == 0
    order = make_intl()
    body = ops.post(f"{CHAT}/{conv.id}/link/", {"order": order.id}, format="json").json()
    assert body["order"]["reference"] == order.reference and body["lifecycle"] == "awaiting_payment"
    assert ops.post(f"{CHAT}/{conv.id}/archive/").json()["status"] == "archived"
    assert ops.get(f"{CHAT}/").json()["count"] == 0
    assert ops.get(f"{CHAT}/?view=archived").json()["count"] == 1
    # A new customer message reopens it.
    services.receive(channel="whatsapp", handle="+255712345678", name="Fatuma", body="Hello again")
    assert ops.get(f"{CHAT}/").json()["count"] == 1


def test_notifications_are_private_and_markable(ops, client_for, inbound):
    conv = inbound().conversation
    agent = client_for(StaffLevel.SALES)
    ops.post(f"{CHAT}/{conv.id}/assign/", {"agent": agent.user.id}, format="json")
    assert agent.get("/api/notifications/unread-count/").json() == {"unread": 1}
    assert ops.get("/api/notifications/").json()["count"] == 0  # someone else's aren't visible
    nid = agent.get("/api/notifications/").json()["results"][0]["id"]
    assert agent.post(f"/api/notifications/{nid}/read/").json() == {"unread": 0}
    assert client_for(StaffLevel.DRIVER).get(f"{CHAT}/").status_code == 403


def sign(secret, body):
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


WA_PAYLOAD = {"entry": [{"changes": [{"value": {
    "contacts": [{"wa_id": "255754987654", "profile": {"name": "John Mwamba"}}],
    "messages": [{"from": "255754987654", "id": "wamid.1", "type": "text", "text": {"body": "Where is my order?"}}],
}}]}]}


def test_webhooks_disabled_until_configured(api):
    assert api.get("/api/chat/webhooks/whatsapp/?hub.mode=subscribe").status_code == 503
    assert api.post("/api/chat/webhooks/tiktok/", {}, format="json").status_code == 503


@override_settings(WHATSAPP_VERIFY_TOKEN="verify-me", WHATSAPP_APP_SECRET="s3cret")
def test_whatsapp_webhook_verification_signature_and_idempotency(api):
    ok = api.get("/api/chat/webhooks/whatsapp/?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=42")
    assert ok.status_code == 200 and ok.content == b"42"
    assert api.get("/api/chat/webhooks/whatsapp/?hub.mode=subscribe&hub.verify_token=nope").status_code == 403
    body = json.dumps(WA_PAYLOAD).encode()
    bad = api.generic("POST", "/api/chat/webhooks/whatsapp/", body, content_type="application/json",
                      HTTP_X_HUB_SIGNATURE_256="sha256=forged")
    assert bad.status_code == 403
    for _ in range(2):  # Meta retries: stored once
        res = api.generic("POST", "/api/chat/webhooks/whatsapp/", body, content_type="application/json",
                          HTTP_X_HUB_SIGNATURE_256=sign("s3cret", body))
        assert res.status_code == 200
    conv = Conversation.objects.get(channel="whatsapp", contact_handle="+255754987654")
    assert conv.contact_name == "John Mwamba"
    assert conv.messages.filter(sender="customer").count() == 1
    assert WebhookEvent.objects.filter(processed=True).count() == 2


def test_inbox_filters_chats_by_what_they_are_about(ops, buyer, make_intl):
    quote = QuoteRequest.objects.create(customer=buyer, service_type="international", description="Phones")
    order = make_intl()
    general = services.receive(channel="web", handle="+255700000001", name="A", body="Hi", room={}).conversation
    about_quote = services.receive(channel="web", handle="+255700000001", name="A", body="Colour?",
                                   room={"quote": quote}).conversation
    about_order = services.receive(channel="web", handle="+255700000001", name="A", body="Where is it?",
                                   room={"order": order}).conversation

    def ids(about):
        return {c["id"] for c in ops.get(f"{CHAT}/", {"about": about}).json()["results"]}

    assert ids("general") == {general.id}
    assert ids("quote") == {about_quote.id}
    assert ids("order") == {about_order.id}
    assert ids("return") == set()
    # Once approved, the quotation's chat belongs to its order and leaves the Quotations filter.
    Conversation.objects.filter(pk=about_quote.pk).update(order=order)
    assert ids("quote") == set() and ids("order") == {about_quote.id, about_order.id}
    assert ops.get(f"{CHAT}/", {"about": "nonsense"}).status_code == 400
