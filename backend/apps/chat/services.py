"""
Chat services — every conversation change goes through here and is stored
in PostgreSQL. Outbound replies go through the channel provider when that
channel is connected; otherwise they are saved with delivery "stored" and
the reason, never shown as sent.
"""
from __future__ import annotations

import re
from datetime import timedelta

from django.db import transaction
from django.db.models import Q, Value
from django.db.models.functions import Replace
from django.utils import timezone

from apps.core.audit import record_audit
from apps.core.workflow import WorkflowError
from apps.notifications import services as notifications
from apps.notifications.models import Notification
from apps.notifications.providers import NotConfigured, SendError, get_provider
from apps.parties.models import Customer

from .models import Conversation, Message

R = Conversation.ResponseStatus
LIFECYCLE = ["new_inquiry", "quoted", "awaiting_payment", "paid", "shipping", "delivered"]
URGENT_AFTER = timedelta(hours=2)
QUOTE_EXPIRES_AFTER = timedelta(days=7)
DEPARTMENT_LEVELS = {
    "management": ["top_admin", "admin_l2"],
    "procurement": ["procurement", "admin_l2", "admin_l1"],
    "finance": ["finance", "admin_l2"],
    "sales": ["sales", "admin_l1", "admin_l2"],
    "support": ["data_entry", "admin_l1"],
    "delivery": ["admin_l1", "admin_l2"],
}


def _lock(conv: Conversation) -> Conversation:
    return Conversation.objects.select_for_update().get(pk=conv.pk)


def _digits(phone: str) -> str:
    return re.sub(r"\D", "", phone or "")[-9:]


def _touch(conv: Conversation, msg: Message):
    conv.last_message_at = msg.created_at
    if msg.sender != Message.Sender.INTERNAL:
        conv.last_message_preview = (msg.body or ("Quotation card" if msg.quote_id else ""))[:200]
    fields = ["last_message_at", "last_message_preview", "updated_at"]
    if msg.sender == Message.Sender.CUSTOMER:
        conv.last_customer_message_at = msg.created_at
        conv.response_status = R.WAITING_TEAM if conv.response_status != R.URGENT else R.URGENT
        fields += ["last_customer_message_at", "response_status"]
        if conv.status == Conversation.Status.ARCHIVED:
            conv.status = Conversation.Status.OPEN
            fields.append("status")
    elif msg.sender == Message.Sender.AGENT:
        conv.response_status = R.WAITING_CLIENT
        conv.team_read_at = msg.created_at
        fields += ["response_status", "team_read_at"]
    conv.save(update_fields=fields)


def _system(conv, text: str, user=None) -> Message:
    msg = Message.objects.create(conversation=conv, sender=Message.Sender.SYSTEM, body=text, author=user)
    conv.last_message_at = msg.created_at
    conv.save(update_fields=["last_message_at", "updated_at"])
    return msg


# --------------------------------------------------------------------------- #
# Inbound
# --------------------------------------------------------------------------- #
def find_customer(handle: str, channel: str) -> Customer | None:
    digits = _digits(handle)
    if channel in ("whatsapp", "web") and len(digits) >= 9:
        # Phones are stored in several formats ("+255 712 345 678", "0712-345678"): compare digits only.
        plain = Replace(Replace(Replace(Replace("phone", Value(" "), Value("")), Value("-"), Value("")),
                                Value("+"), Value("")), Value("("), Value(""))
        return Customer.objects.annotate(plain_phone=plain).filter(plain_phone__endswith=digits).first()
    return None


ROOM_FIELDS = ("order", "quote", "return_request")


def room_filter(room: dict | None) -> dict:
    """Lookup for an app chat room: one per order / quotation / return, plus a general room with none."""
    room = room or {}
    return {f: room[f] for f in ROOM_FIELDS if room.get(f)} or {f"{f}__isnull": True for f in ROOM_FIELDS}


@transaction.atomic
def receive(*, channel: str, handle: str, name: str, body: str, external_id: str = "",
            thread_id: str = "", room: dict | None = None) -> Message:
    """Store a customer's message (webhook or web widget); opens a conversation if needed.

    `room` (the app) keeps a separate conversation per order, quotation or return; without it the
    customer's latest open conversation on the channel is used, as for WhatsApp and the other channels.
    """
    if external_id and Message.objects.filter(external_id=external_id).exists():
        return Message.objects.get(external_id=external_id)  # provider retries are idempotent
    qs = Conversation.objects.select_for_update().filter(channel=channel, contact_handle=handle)
    if room is not None:
        qs = qs.filter(**room_filter(room))
    conv = qs.exclude(status=Conversation.Status.ARCHIVED).order_by("-last_message_at").first()
    if conv is None:
        conv = Conversation.objects.create(channel=channel, contact_handle=handle, contact_name=name or handle,
                                           external_thread_id=thread_id, customer=find_customer(handle, channel),
                                           **{f: v for f, v in (room or {}).items() if f in ROOM_FIELDS and v})
    msg = Message.objects.create(conversation=conv, sender=Message.Sender.CUSTOMER, body=body,
                                 delivery_status=Message.Delivery.RECEIVED, external_id=external_id)
    _touch(conv, msg)
    target = conv.active_handler or conv.assigned_agent
    if target:
        notifications.notify(target, kind=Notification.Kind.MESSAGE, title=f"New message from {conv.contact_name}",
                             body=body[:200], link=f"/chat?open={conv.pk}")
    return msg


# --------------------------------------------------------------------------- #
# Staff actions
# --------------------------------------------------------------------------- #
def _require_handler(conv: Conversation, user):
    if conv.active_handler_id and conv.active_handler_id != user.pk:
        raise WorkflowError(f"{conv.active_handler.full_name} is handling this conversation. Take over to reply.",
                            conflict=True)


def _deliver(conv: Conversation, msg: Message, text: str):
    provider = get_provider(conv.channel)
    try:
        msg.external_id = provider.send(conv.contact_handle, text) or ""
        msg.delivery_status = Message.Delivery.SENT
    except NotConfigured as exc:
        msg.delivery_status, msg.delivery_error = Message.Delivery.STORED, str(exc)[:255]
    except SendError as exc:
        msg.delivery_status, msg.delivery_error = Message.Delivery.FAILED, str(exc)[:255]
    msg.save(update_fields=["external_id", "delivery_status", "delivery_error"])


@transaction.atomic
def send_message(conv: Conversation, *, user, body: str, request=None) -> Message:
    conv = _lock(conv)
    if not body.strip():
        raise WorkflowError("Type a message.", field="body")
    _require_handler(conv, user)
    if not conv.active_handler_id:  # replying makes you the active handler
        conv.active_handler, conv.handler_since = user, timezone.now()
        conv.save(update_fields=["active_handler", "handler_since"])
    if not conv.assigned_agent_id:
        conv.assigned_agent = user
        conv.save(update_fields=["assigned_agent"])
    msg = Message.objects.create(conversation=conv, sender=Message.Sender.AGENT, body=body.strip(), author=user)
    _deliver(conv, msg, msg.body)
    _touch(conv, msg)
    return msg


@transaction.atomic
def add_note(conv: Conversation, *, user, body: str) -> Message:
    if not body.strip():
        raise WorkflowError("Write the note first.", field="body")
    msg = Message.objects.create(conversation=conv, sender=Message.Sender.INTERNAL, body=body.strip(), author=user)
    Conversation.objects.filter(pk=conv.pk).update(last_message_at=msg.created_at, updated_at=timezone.now())
    return msg


@transaction.atomic
def send_quote(conv: Conversation, quote, *, user, request=None) -> Message:
    """Post a quotation card (the quote must be priced and belong to the linked customer)."""
    conv = _lock(conv)
    _require_handler(conv, user)
    if conv.customer_id is None:
        raise WorkflowError("Link the conversation to a customer first.", conflict=True)
    if quote.customer_id != conv.customer_id:
        raise WorkflowError("That quotation belongs to another customer.", field="quote")
    if quote.quoted_amount is None:
        raise WorkflowError(f"{quote.reference} hasn't been priced yet — respond to it in Intake & Quotes.",
                            conflict=True)
    conv.quote = quote
    conv.save(update_fields=["quote"])
    msg = Message.objects.create(conversation=conv, sender=Message.Sender.AGENT, author=user, quote=quote,
                                 body=f"Quotation {quote.reference}: TSh {quote.quoted_amount:,.0f}")
    _deliver(conv, msg, f"Your quotation {quote.reference}: TSh {quote.quoted_amount:,.0f}. "
                        f"{quote.response_notes or ''}".strip())
    _touch(conv, msg)
    _system(conv, "Quote Sent", user)
    return msg


@transaction.atomic
def create_quote(conv: Conversation, *, user, service_type: str, description: str, origin: str = "",
                 destination: str = "", request=None):
    from apps.quotes.models import QuoteRequest, QuoteStatusHistory
    from apps.tasks import services as tasks

    conv = _lock(conv)
    if conv.customer_id is None:
        raise WorkflowError("Link the conversation to a customer first.", conflict=True)
    if not description.strip():
        raise WorkflowError("Describe what the customer wants.", field="description")
    quote = QuoteRequest.objects.create(customer_id=conv.customer_id, service_type=service_type,
                                        description=description.strip(), origin=origin, destination=destination,
                                        created_by=user)
    QuoteStatusHistory.objects.create(quote=quote, to_status=quote.status, changed_by=user,
                                      note=f"Created from chat {conv.reference}")
    tasks.open_quote_task(quote, user)
    conv.quote = quote
    conv.save(update_fields=["quote"])
    _system(conv, f"Quotation Created ({quote.reference})", user)
    record_audit(action="create", request=request, actor=user, instance=quote,
                 changes={"conversation": [None, conv.reference]})
    return quote


@transaction.atomic
def take_over(conv: Conversation, *, user) -> Conversation:
    conv = _lock(conv)
    previous = conv.active_handler
    if previous and previous.pk == user.pk:
        return conv
    conv.active_handler, conv.handler_since = user, timezone.now()
    conv.save(update_fields=["active_handler", "handler_since", "updated_at"])
    _system(conv, f"{user.full_name} took over" + (f" from {previous.full_name}" if previous else ""), user)
    if previous:
        notifications.notify(previous, kind=Notification.Kind.ASSIGNMENT, title=f"{user.full_name} took over "
                             f"{conv.contact_name}", link=f"/chat?open={conv.pk}")
    return conv


@transaction.atomic
def release(conv: Conversation, *, user) -> Conversation:
    conv = _lock(conv)
    if conv.active_handler_id != user.pk and not user.is_top_admin:
        raise WorkflowError("Only the active handler can release the conversation.", conflict=True)
    conv.active_handler, conv.handler_since = None, None
    conv.save(update_fields=["active_handler", "handler_since", "updated_at"])
    _system(conv, f"{user.full_name} released the conversation", user)
    return conv


@transaction.atomic
def assign(conv: Conversation, agent, *, user, request=None) -> Conversation:
    conv = _lock(conv)
    if not agent.is_active:
        raise WorkflowError(f"{agent.full_name} is inactive.", field="agent")
    previous = conv.assigned_agent
    conv.assigned_agent = agent
    conv.save(update_fields=["assigned_agent", "updated_at"])
    _system(conv, f"Assigned to {agent.full_name}", user)
    notifications.notify(agent, kind=Notification.Kind.ASSIGNMENT, title=f"Conversation assigned: {conv.contact_name}",
                         link=f"/chat?open={conv.pk}", exclude=user)
    record_audit(action="update", request=request, actor=user, instance=conv,
                 changes={"assigned_agent": [previous.pk if previous else None, agent.pk]})
    return conv


@transaction.atomic
def escalate(conv: Conversation, *, to: str, note: str, user, request=None) -> Conversation:
    from apps.tasks import services as tasks

    conv = _lock(conv)
    if to not in DEPARTMENT_LEVELS:
        raise WorkflowError("Choose where to escalate.", field="to")
    label = dict(Conversation.Department.choices)[to]
    conv.escalated_to, conv.escalated_at = to, timezone.now()
    conv.response_status = R.URGENT
    conv.save(update_fields=["escalated_to", "escalated_at", "response_status", "updated_at"])
    _system(conv, f"Escalated to {label}", user)
    if note.strip():
        add_note(conv, user=user, body=f"Escalation: {note.strip()}")
    from apps.accounts.models import User

    recipients = User.objects.filter(is_active=True, staff_level__in=DEPARTMENT_LEVELS[to])
    notifications.notify(recipients, kind=Notification.Kind.ESCALATION, title=f"Escalated: {conv.contact_name}",
                         body=note[:200], link=f"/chat?open={conv.pk}", exclude=user)
    department = {"management": "support", "procurement": "procurement", "finance": "finance"}.get(to, to)
    tasks.create_task(task_type="follow_up_client", user=user, department=department, priority="high",
                      sla_deadline=timezone.now() + timedelta(hours=4), order=conv.order,
                      quote=conv.quote if conv.order is None else None,
                      description=f"Escalated chat with {conv.contact_name} ({conv.reference}): {note or label}")
    record_audit(action="update", request=request, actor=user, instance=conv, changes={"escalated_to": [None, to]})
    return conv


@transaction.atomic
def set_follow_up(conv: Conversation, *, at, user) -> Conversation:
    conv = _lock(conv)
    if at is not None and at <= timezone.now():
        raise WorkflowError("Choose a time in the future.", field="at")
    conv.follow_up_at, conv.follow_up_notified = at, False
    conv.save(update_fields=["follow_up_at", "follow_up_notified", "updated_at"])
    _system(conv, f"Follow-up set for {timezone.localtime(at):%d %b %H:%M}" if at else "Follow-up cleared", user)
    return conv


@transaction.atomic
def link(conv: Conversation, *, user, customer=None, order=None, quote=None, request=None) -> Conversation:
    conv = _lock(conv)
    changes = {}
    if customer is not None:
        changes["customer"] = [conv.customer_id, customer.pk]
        conv.customer = customer
        if conv.contact_name == conv.contact_handle:
            conv.contact_name = customer.full_name
    target = customer or conv.customer
    if order is not None:
        if target and order.customer_id != target.pk:
            raise WorkflowError("That order belongs to another customer.", field="order")
        changes["order"] = [conv.order_id, order.pk]
        conv.order = order
    if quote is not None:
        if target and quote.customer_id != target.pk:
            raise WorkflowError("That quotation belongs to another customer.", field="quote")
        changes["quote"] = [conv.quote_id, quote.pk]
        conv.quote = quote
    conv.save()
    what = ", ".join(filter(None, [customer and f"client {customer.full_name}", order and order.reference,
                                   quote and quote.reference]))
    _system(conv, f"Linked to {what}", user)
    record_audit(action="update", request=request, actor=user, instance=conv, changes=changes)
    return conv


def mark_read(conv: Conversation):
    Conversation.objects.filter(pk=conv.pk).update(team_read_at=timezone.now())


@transaction.atomic
def set_status(conv: Conversation, status: str, *, user) -> Conversation:
    conv = _lock(conv)
    conv.status = status
    conv.save(update_fields=["status", "updated_at"])
    _system(conv, "Conversation archived" if status == Conversation.Status.ARCHIVED else "Conversation reopened", user)
    return conv


# --------------------------------------------------------------------------- #
# Derived states (from real linked records)
# --------------------------------------------------------------------------- #
def lifecycle(conv: Conversation) -> str:
    order = conv.order
    if order is not None:
        s = order.status
        if s in ("delivered", "completed"):
            return "delivered"
        if s in ("shipping_to_destination", "clearance", "ready_for_collection", "shipped", "in_transit",
                 "picked_up", "at_agiza_center", "arrived", "driver_assigned", "sent_to_consolidation"):
            return "shipping"
        from apps.orders.services import payment_summary

        return "paid" if payment_summary(order).status == "fully_paid" else "awaiting_payment"
    if conv.quote is not None:
        return "awaiting_payment" if conv.quote.status in ("answered", "approved") else (
            "quoted" if conv.quote.status == "waiting_reply" else "new_inquiry")
    return "new_inquiry"


def client_action_state(conv: Conversation, cards: list[Message]) -> str | None:
    card = cards[-1] if cards else None
    if card is None or card.quote is None:
        return None
    quote = card.quote
    if quote.status in ("declined", "cancelled"):
        return "quote_expired"
    if quote.status != "waiting_reply":
        return None
    if timezone.now() - card.created_at > QUOTE_EXPIRES_AFTER:
        return "quote_expired"
    if card.delivery_status == Message.Delivery.READ:
        return "quote_viewed"
    if conv.last_customer_message_at and conv.last_customer_message_at > card.created_at:
        return "awaiting_response"
    return "quote_sent"


def response_status(conv: Conversation) -> str:
    """Waiting for the team for longer than 2 hours is urgent."""
    if conv.response_status == R.WAITING_TEAM and conv.last_customer_message_at and \
            timezone.now() - conv.last_customer_message_at > URGENT_AFTER:
        return R.URGENT
    return conv.response_status


def client_value(total_orders: int, total_spent) -> str:
    if total_orders == 0:
        return "curious"
    if total_orders < 3:
        return "customer"
    if total_spent >= 10_000_000:
        return "high_value"
    return "repeating"


def due_follow_ups():
    """Notify handlers of follow-ups that are due (run every few minutes)."""
    count = 0
    for conv in Conversation.objects.filter(follow_up_at__lte=timezone.now(), follow_up_notified=False).filter(
            Q(active_handler__isnull=False) | Q(assigned_agent__isnull=False)):
        count += notifications.notify(conv.active_handler or conv.assigned_agent, kind=Notification.Kind.FOLLOW_UP,
                                      title=f"Follow up with {conv.contact_name}", link=f"/chat?open={conv.pk}")
        Conversation.objects.filter(pk=conv.pk).update(follow_up_notified=True)
    return count
