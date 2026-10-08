"""Quote workflow: respond, record the customer's reply, approve into a real order."""
from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.core.audit import record_audit
from apps.core.workflow import WorkflowError
from apps.orders import services as order_services
from apps.orders.workflows import EquipmentStatus, ExpressStatus, InternationalStatus, OrderType

from .models import QUOTE_TRANSITIONS, QuoteItem, QuoteRequest, QuoteStatus, QuoteStatusHistory, ServiceType

# Service type -> (order type, status of the new order). The customer has
# already accepted the price, so the order starts past its quoting stage.
APPROVAL_TARGET = {
    ServiceType.EXPRESS: (OrderType.EXPRESS, ExpressStatus.ACCEPTED),
    ServiceType.INTERNATIONAL: (OrderType.INTERNATIONAL, InternationalStatus.PENDING_PAYMENT),
    ServiceType.EQUIPMENT: (OrderType.EQUIPMENT, EquipmentStatus.APPROVED),
}


def _lock(quote: QuoteRequest) -> QuoteRequest:
    return QuoteRequest.objects.select_for_update().get(pk=quote.pk)


def _move(quote: QuoteRequest, to_status: str, user, note: str = "", request=None, extra_fields=()):
    if to_status not in QUOTE_TRANSITIONS[QuoteStatus(quote.status)]:
        raise WorkflowError(
            f"Cannot move {quote.reference} from {quote.get_status_display()} to {QuoteStatus(to_status).label}.",
            conflict=True,
        )
    from_status = quote.status
    quote.status = to_status
    quote.save(update_fields=["status", "updated_at", *extra_fields])
    QuoteStatusHistory.objects.create(quote=quote, from_status=from_status, to_status=to_status, changed_by=user,
                                      note=note.strip())
    record_audit(action="status_change", request=request, actor=user, instance=quote,
                 changes={"status": [from_status, to_status]})
    return quote


def _price_items(quote: QuoteRequest, prices: list[dict] | None) -> Decimal:
    """Price every item of a multi-item quotation; returns the total (the quotation's amount)."""
    items = {it.id: it for it in QuoteItem.objects.select_for_update().filter(quote=quote)}
    given = {p["id"]: p for p in prices or []}
    if set(given) - set(items):
        raise WorkflowError("Some priced items don't belong to this quotation.", field="items")
    missing = [it.name for it in items.values() if it.id not in given]
    if missing:
        raise WorkflowError(f"Price every item: {', '.join(missing)}.", field="items")
    total = Decimal("0")
    for item_id, item in items.items():
        p = given[item_id]
        unit_price, amount = p.get("unit_price"), p.get("amount")
        if not amount:
            if not unit_price or unit_price <= 0:
                raise WorkflowError(f"Enter a price for {item.name}.", field="items")
            amount = unit_price * item.quantity
        if amount <= 0:
            raise WorkflowError(f"The price of {item.name} must be greater than zero.", field="items")
        item.unit_price, item.amount, item.price_notes = unit_price or None, amount, p.get("price_notes", "")
        item.save(update_fields=["unit_price", "amount", "price_notes", "updated_at"])
        total += amount
    return total


@transaction.atomic
def respond(quote: QuoteRequest, *, amount: Decimal | None, estimated_delivery, notes: str, user, request=None,
            item_prices: list[dict] | None = None) -> QuoteRequest:
    """Send the quotation. Multi-item quotations are priced per item (`item_prices`); their total is the amount."""
    quote = _lock(quote)
    if QuoteStatus.WAITING_REPLY not in QUOTE_TRANSITIONS[QuoteStatus(quote.status)]:
        _move(quote, QuoteStatus.WAITING_REPLY, user)  # raises the usual "Cannot move …" conflict
    if quote.items.exists():
        amount = _price_items(quote, item_prices)
    elif item_prices:
        raise WorkflowError("This quotation has no item lines; enter the quoted amount.", field="items")
    if amount is None or amount <= 0:
        raise WorkflowError("Quoted amount must be greater than zero.", field="quoted_amount")
    quote.quoted_amount = amount
    quote.estimated_delivery = estimated_delivery
    quote.response_notes = notes
    quote.responded_by = user
    quote.responded_at = timezone.now()
    _move(quote, QuoteStatus.WAITING_REPLY, user, "Quotation sent to customer", request,
          extra_fields=("quoted_amount", "estimated_delivery", "response_notes", "responded_by", "responded_at"))
    from apps.tasks import services as tasks

    tasks.complete_quote_tasks(quote, user, f"Quote sent: {amount:,.0f}")
    return quote


@transaction.atomic
def record_reply(quote: QuoteRequest, *, accepted: bool, user, note: str = "", request=None) -> QuoteRequest:
    quote = _lock(quote)
    if quote.status != QuoteStatus.WAITING_REPLY:
        raise WorkflowError("Only quotations waiting for the customer's reply can be answered.", conflict=True)
    quote.customer_replied_at = timezone.now()
    to = QuoteStatus.ANSWERED if accepted else QuoteStatus.DECLINED
    return _move(quote, to, user, note or ("Customer accepted" if accepted else "Customer declined"), request,
                 extra_fields=("customer_replied_at",))


@transaction.atomic
def cancel(quote: QuoteRequest, *, user, note: str = "", request=None) -> QuoteRequest:
    quote = _move(_lock(quote), QuoteStatus.CANCELLED, user, note or "Cancelled", request)
    from apps.tasks import services as tasks
    from apps.tasks.models import Task, TaskStatus

    for task in Task.objects.filter(quote=quote).exclude(status__in=(TaskStatus.COMPLETED, TaskStatus.CANCELLED)):
        tasks.change_status(task, TaskStatus.CANCELLED, user=user, note="Quotation cancelled")
    return quote


def _estimate_delivery(order, quote: QuoteRequest, order_type: str):
    if order_type == OrderType.EXPRESS:
        details = order.express
        # An app request says "Package size: Medium": that's the size the customer selected.
        size = next((ln.partition(":")[2].strip().lower() for ln in quote.description.split("\n")
                     if ln.startswith("Package size:")), "")
        if size in ("small", "medium", "large"):
            details.customer_package_size = size
        if quote.estimated_delivery:
            details.estimated_delivery_at = timezone.make_aware(
                timezone.datetime.combine(quote.estimated_delivery, timezone.datetime.min.time().replace(hour=17))
            )
            details.quoted_at = quote.responded_at
            details.quoted_by = quote.responded_by
        details.save()
    elif order_type == OrderType.INTERNATIONAL and quote.estimated_delivery:
        order.international.estimated_delivery = quote.estimated_delivery
        order.international.save(update_fields=["estimated_delivery"])


def _copy_photos(order, photos):
    # The quotation's photos (the customer's and AGIZA's) travel with the order (same stored files).
    from apps.orders.models import OrderAttachment

    for photo in photos:
        OrderAttachment.objects.create(order=order, file=photo.file.name, content_type=photo.content_type,
                                       caption="AGIZA quotation photo" if photo.from_agiza else "Customer photo")


def _item_order_details(item: QuoteItem, order_type: str, order_details: dict) -> dict:
    """The shared approval details, adjusted for one item line."""
    details = dict(order_details)
    if order_type == OrderType.INTERNATIONAL:
        if item.origin_country_id:
            details["source_country"] = item.origin_country
        if item.service:
            details["service_type"] = item.service
        if item.tracking_number:
            details["tracking_number"] = item.tracking_number
        if not details.get("source_country"):
            raise WorkflowError(f"Choose the source origin for {item.name}.", field="source_country")
    elif order_type == OrderType.EQUIPMENT:
        details["equipment"] = item.name[:160]
    return details


def _item_notes(quote: QuoteRequest, item: QuoteItem) -> str:
    parts = [
        f"Item {item.position + 1} of quotation {quote.reference}: {item.label}",
        f"Category: {item.category}" if item.category else "",
        f"Link: {item.link}" if item.link else "",
        item.notes,
        f"Price: {item.price_notes}" if item.price_notes else "",
        quote.response_notes,
    ]
    return "\n".join(p for p in parts if p)


@transaction.atomic
def approve_orders(quote: QuoteRequest, *, user, order_details: dict, request=None) -> list:
    """Approve an answered quotation and create its order(s) — all or nothing.
    A multi-item quotation becomes one order per item; the first one is linked as the quote's source order."""
    quote = _lock(quote)
    if quote.status != QuoteStatus.ANSWERED:
        raise WorkflowError("Only quotations the customer has accepted (Answered) can be approved.", conflict=True)
    order_type, status = APPROVAL_TARGET[ServiceType(quote.service_type)]
    item_details = order_details.pop("item_details", "") or quote.description[:255]
    order_fields = {}
    if "installment_plan" in order_details:
        order_fields["installment_plan"] = order_details.pop("installment_plan")
    items = list(quote.items.select_related("origin_country").prefetch_related("attachments"))
    photos = list(quote.attachments.all())
    orders = []
    if not items:
        order = order_services.create_order(
            order_type, customer=quote.customer, item_details=item_details, details=order_details, user=user,
            status=status, note=f"Created from quotation {quote.reference}", request=request,
            total_amount=quote.quoted_amount, currency=quote.currency, notes=quote.response_notes,
            source_quote=quote, **order_fields,
        )
        _copy_photos(order, photos)
        _estimate_delivery(order, quote, order_type)
        orders.append(order)
    else:
        shared = [p for p in photos if not p.item_id]  # e.g. AGIZA's photos for the whole quotation
        for i, item in enumerate(items):
            order = order_services.create_order(
                order_type, customer=quote.customer, item_details=item.label[:255],
                details=_item_order_details(item, order_type, order_details), user=user, status=status,
                note=f"Created from quotation {quote.reference} (item {i + 1} of {len(items)})", request=request,
                total_amount=item.amount, currency=quote.currency, notes=_item_notes(quote, item),
                source_quote=quote if i == 0 else None, **order_fields,
            )
            _copy_photos(order, [*item.attachments.all(), *shared])
            _estimate_delivery(order, quote, order_type)
            item.created_order = order
            item.save(update_fields=["created_order", "updated_at"])
            orders.append(order)
    # The quotation's chat continues as the order's chat (same messages, one conversation, not two).
    from apps.chat.models import Conversation

    Conversation.objects.filter(quote=quote, order__isnull=True).update(order=orders[0], updated_at=timezone.now())
    quote.approved_by = user
    quote.approved_at = timezone.now()
    refs = ", ".join(o.reference for o in orders)
    _move(quote, QuoteStatus.APPROVED, user, f"Order{'s' if len(orders) > 1 else ''} {refs} created", request,
          extra_fields=("approved_by", "approved_at"))
    return orders


def approve(quote: QuoteRequest, *, user, order_details: dict, request=None):
    """Approve an answered quotation; returns its (first) order. See `approve_orders`."""
    return approve_orders(quote, user=user, order_details=order_details, request=request)[0]
