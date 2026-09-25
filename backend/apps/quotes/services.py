"""Quote workflow: respond, record the customer's reply, approve into a real order."""
from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.core.audit import record_audit
from apps.orders import services as order_services
from apps.orders.services import WorkflowError
from apps.orders.workflows import EquipmentStatus, ExpressStatus, InternationalStatus, OrderType

from .models import QUOTE_TRANSITIONS, QuoteRequest, QuoteStatus, QuoteStatusHistory, ServiceType

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


@transaction.atomic
def respond(quote: QuoteRequest, *, amount: Decimal, estimated_delivery, notes: str, user, request=None) -> QuoteRequest:
    quote = _lock(quote)
    if amount is None or amount <= 0:
        raise WorkflowError("Quoted amount must be greater than zero.", field="quoted_amount")
    quote.quoted_amount = amount
    quote.estimated_delivery = estimated_delivery
    quote.response_notes = notes
    quote.responded_by = user
    quote.responded_at = timezone.now()
    return _move(quote, QuoteStatus.WAITING_REPLY, user, "Quotation sent to customer", request,
                 extra_fields=("quoted_amount", "estimated_delivery", "response_notes", "responded_by", "responded_at"))


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
    return _move(_lock(quote), QuoteStatus.CANCELLED, user, note or "Cancelled", request)


@transaction.atomic
def approve(quote: QuoteRequest, *, user, order_details: dict, request=None):
    """Approve an answered quotation and create its order — all or nothing."""
    quote = _lock(quote)
    if quote.status != QuoteStatus.ANSWERED:
        raise WorkflowError("Only quotations the customer has accepted (Answered) can be approved.", conflict=True)
    order_type, status = APPROVAL_TARGET[ServiceType(quote.service_type)]
    item_details = order_details.pop("item_details", "") or quote.description[:255]
    order_fields = {}
    if "installment_plan" in order_details:
        order_fields["installment_plan"] = order_details.pop("installment_plan")
    order = order_services.create_order(
        order_type,
        customer=quote.customer,
        item_details=item_details,
        details=order_details,
        user=user,
        status=status,
        note=f"Created from quotation {quote.reference}",
        request=request,
        total_amount=quote.quoted_amount,
        currency=quote.currency,
        notes=quote.response_notes,
        source_quote=quote,
        **order_fields,
    )
    if order_type == OrderType.EXPRESS and quote.estimated_delivery:
        details = order.express
        details.estimated_delivery_at = timezone.make_aware(
            timezone.datetime.combine(quote.estimated_delivery, timezone.datetime.min.time().replace(hour=17))
        )
        details.quoted_at = quote.responded_at
        details.quoted_by = quote.responded_by
        details.save()
    elif order_type == OrderType.INTERNATIONAL and quote.estimated_delivery:
        order.international.estimated_delivery = quote.estimated_delivery
        order.international.save(update_fields=["estimated_delivery"])
    quote.approved_by = user
    quote.approved_at = timezone.now()
    _move(quote, QuoteStatus.APPROVED, user, f"Order {order.reference} created", request,
          extra_fields=("approved_by", "approved_at"))
    return order
