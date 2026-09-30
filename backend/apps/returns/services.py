"""
Return workflow services — the only code that changes return status.

Initiated → In Transit (Return) → Received → Inspected → Approved/Rejected → Closed.
Every change locks the return, checks the transition, sets the owning
department, writes ReturnStatusHistory and an audit entry. Closing an
approved refund records a refund payment on the order (never more than the
customer has paid).
"""
from __future__ import annotations

import logging
from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.core.audit import record_audit
from apps.core.workflow import WorkflowError, check_transition
from apps.orders import services as order_services
from apps.orders.models import Payment

from .models import (
    RETURN_ACTION_ONLY,
    RETURN_TRANSITIONS,
    FinancialImpact,
    Owner,
    ReasonCode,
    ReturnLine,
    ReturnRequest,
    ReturnStatus,
    ReturnStatusHistory,
    ReturnType,
)

logger = logging.getLogger("apps.returns")
R = ReturnStatus
OWNER_FOR = {R.INITIATED: Owner.SUPPORT, R.IN_TRANSIT: Owner.DELIVERY, R.RECEIVED: Owner.WAREHOUSE,
             R.INSPECTED: Owner.WAREHOUSE, R.REJECTED: Owner.SUPPORT}
HIGH_VALUE = Decimal("1000000")


def _lock(ret: ReturnRequest) -> ReturnRequest:
    return ReturnRequest.objects.select_for_update().select_related("order").get(pk=ret.pk)


def _owner_for(ret: ReturnRequest, status: str) -> str:
    if status == R.APPROVED:
        return Owner.FINANCE if ret.financial_impact == FinancialImpact.REFUND_REQUIRED else (
            Owner.WAREHOUSE if ret.financial_impact == FinancialImpact.REPLACEMENT_REQUIRED else Owner.SUPPORT)
    if status == R.CLOSED:
        return ret.owner
    return OWNER_FOR[status]


def _history(ret, from_status, to_status, user, note=""):
    ReturnStatusHistory.objects.create(return_request=ret, from_status=from_status, to_status=to_status,
                                       owner=ret.owner, changed_by=user, note=note.strip())


def _set_status(ret: ReturnRequest, to_status: str, user, note: str = "", request=None, fields=()):
    from_status = ret.status
    ret.status = to_status
    ret.owner = _owner_for(ret, to_status)
    ret.save(update_fields=["status", "owner", "updated_at", *fields])
    _history(ret, from_status, to_status, user, note)
    record_audit(action="status_change", request=request, actor=user, instance=ret,
                 changes={"status": [from_status, to_status], **({"note": [None, note]} if note else {})})
    logger.info("Return %s: %s → %s", ret.reference, from_status or "-", to_status)
    if ret.requested_by_customer or ret.return_type == ReturnType.SELLER_CANNOT_FULFILL:
        from apps.storefront.notifications import notify

        label, _ = customer_status(ret)
        notify(ret.order.customer, title=f"Return {ret.reference}: {label}",
               body=ret.customer_message or f"Order {ret.order.reference}",
               data={"type": "return", "return": ret.reference, "screen": "return"})


def _check(ret, to_status, via_action=None):
    check_transition(ret.status, to_status, transitions=RETURN_TRANSITIONS, choices=ReturnStatus,
                     action_only=RETURN_ACTION_ONLY, via_action=via_action, subject=ret.reference)


@transaction.atomic
def create_return(order, *, user, return_type: str, reason_code: str, item_details: str = "",
                  return_value: Decimal | None = None, financial_impact: str | None = None, handler=None,
                  exception_flag: str = "", delivery=None, notes: str = "", request=None) -> ReturnRequest:
    if order.status == "cancelled" and return_type != ReturnType.CANCELLATION_AFTER_DISPATCH:
        raise WorkflowError(f"{order.reference} is cancelled.", conflict=True)
    if financial_impact is None:
        financial_impact = (FinancialImpact.NO_REFUND if return_type == ReturnType.DELIVERY_FAILED
                            else FinancialImpact.REFUND_REQUIRED)
    if return_value is None:
        return_value = order.total_amount
    if not exception_flag and return_value and return_value >= HIGH_VALUE:
        exception_flag = "high_value_item"
    ret = ReturnRequest.objects.create(
        order=order, delivery=delivery, return_type=return_type, reason_code=reason_code,
        item_details=item_details or order.item_details, return_value=return_value,
        financial_impact=financial_impact, handler=handler, exception_flag=exception_flag, notes=notes,
        owner=Owner.SUPPORT, created_by=user,
    )
    _history(ret, "", R.INITIATED, user, notes or "Return initiated")
    record_audit(action="create", request=request, actor=user, instance=ret,
                 changes={"order": [None, order.reference], "return_type": [None, return_type]})
    return ret


REASON_FOR_FLAG = {"customer_unavailable": ReasonCode.CUSTOMER_UNAVAILABLE,
                   "address_unclear": ReasonCode.ADDRESS_INCORRECT}


def open_for_failed_delivery(delivery, user, note: str = "") -> ReturnRequest:
    """A delivery was returned: the goods come back to the warehouse with the driver."""
    ret = create_return(
        delivery.order, user=user, return_type=ReturnType.DELIVERY_FAILED, delivery=delivery,
        reason_code=REASON_FOR_FLAG.get(delivery.exception_flag, ReasonCode.CUSTOMER_UNAVAILABLE),
        handler=delivery.driver, notes=note or f"Delivery {delivery.reference} returned",
    )
    _set_status(ret, R.IN_TRANSIT, user, f"Returning with {delivery.driver.full_name if delivery.driver else 'driver'}")
    return ret


@transaction.atomic
def transition(ret: ReturnRequest, to_status: str, *, user, note: str = "", request=None) -> ReturnRequest:
    ret = _lock(ret)
    _check(ret, to_status)
    _set_status(ret, to_status, user, note, request)
    return ret


@transaction.atomic
def inspect(ret: ReturnRequest, *, user, item_condition: str, notes: str, financial_impact: str | None = None,
            restock: bool | None = None, request=None) -> ReturnRequest:
    ret = _lock(ret)
    _check(ret, R.INSPECTED, via_action="inspect")
    if not notes.strip():
        raise WorkflowError("Record the inspection findings.", field="notes")
    ret.item_condition = item_condition
    ret.inspection_notes = notes.strip()
    ret.inspected_at = timezone.now()
    ret.inspected_by = user
    fields = ["item_condition", "inspection_notes", "inspected_at", "inspected_by"]
    if financial_impact:
        ret.financial_impact = financial_impact
        fields.append("financial_impact")
    _set_status(ret, R.INSPECTED, user, f"Inspection: {ret.get_item_condition_display()}", request, fields)
    # Resellable items go back into stock where they were sold from (staff can decide otherwise).
    if restock is None:
        restock = item_condition == "as_described"
    if restock and not ret.restocked and ret.lines.exists():
        restock_lines(ret, user=user)
    return ret


def restock_lines(ret: ReturnRequest, *, user):
    from apps.inventory import services as inventory

    for line in ret.lines.select_related("order_item__variant", "order_item__warehouse"):
        item = line.order_item
        if item.warehouse_id:
            inventory.restock(item.variant, item.warehouse, line.quantity, user=user, order=ret.order,
                              note=f"Returned in {ret.reference}")
    ret.restocked = True
    ret.save(update_fields=["restocked", "updated_at"])


@transaction.atomic
def decide(ret: ReturnRequest, *, user, approve: bool, notes: str, financial_impact: str | None = None,
           refund_amount: Decimal | None = None, request=None) -> ReturnRequest:
    ret = _lock(ret)
    target = R.APPROVED if approve else R.REJECTED
    _check(ret, target, via_action="decide")
    if not notes.strip():
        raise WorkflowError("Give the reason for the decision.", field="notes")
    if financial_impact:
        ret.financial_impact = financial_impact
    if not approve:
        ret.financial_impact = FinancialImpact.NO_REFUND
        ret.refund_amount = None
    elif ret.financial_impact == FinancialImpact.REFUND_REQUIRED:
        amount = refund_amount if refund_amount is not None else ret.return_value
        if amount is None or amount <= 0:
            raise WorkflowError("Enter the refund amount.", field="refund_amount")
        paid = order_services.net_paid(ret.order)
        if amount > paid:
            raise WorkflowError(f"The refund can't exceed what the customer has paid ({paid:,.2f} "
                                f"{ret.order.currency}).", field="refund_amount")
        ret.refund_amount = amount
    else:
        ret.refund_amount = None
    ret.decision_notes = notes.strip()
    ret.decided_at = timezone.now()
    ret.decided_by = user
    _set_status(ret, target, user, notes, request,
                ["financial_impact", "refund_amount", "decision_notes", "decided_at", "decided_by"])
    return ret


@transaction.atomic
def close(ret: ReturnRequest, *, user, notes: str = "", refund_method: str | None = None,
          refund_reference: str = "", request=None) -> ReturnRequest:
    """Close the return. An approved refund is paid out here and recorded on the order."""
    ret = _lock(ret)
    _check(ret, R.CLOSED, via_action="close")
    fields = ["closed_at", "resolution_notes"]
    if ret.status == R.APPROVED and ret.financial_impact == FinancialImpact.REFUND_REQUIRED:
        if not refund_method:
            raise WorkflowError("Choose how the refund was paid.", field="refund_method")
        order = order_services._lock(ret.order)
        paid = order_services.net_paid(order)
        if ret.refund_amount > paid:
            raise WorkflowError(f"The refund can't exceed what the customer has paid ({paid:,.2f} {order.currency}).",
                                field="refund_amount")
        payment = Payment.objects.create(
            order=order, amount=ret.refund_amount, currency=order.currency, method=refund_method,
            kind=Payment.Kind.REFUND, reference=refund_reference, paid_at=timezone.now(),
            notes=f"Refund for {ret.reference}", recorded_by=user,
        )
        record_audit(action="create", request=request, actor=user, instance=payment,
                     changes={"refund": [None, str(ret.refund_amount)], "return": [None, ret.reference]})
        if refund_method == Payment.Method.WALLET:
            from apps.finance import services as finance

            finance.refund_to_wallet(order, payment, user)
        ret.refund_payment = payment
        fields.append("refund_payment")
        lower_total_for_refund(ret, order, user=user)
        reconcile(ret, user=user)
    ret.closed_at = timezone.now()
    ret.resolution_notes = notes.strip()
    _set_status(ret, R.CLOSED, user, notes or "Return closed", request, fields)
    return ret


def lower_total_for_refund(ret: ReturnRequest, order, *, user):
    """Refunded goods are no longer charged: lower the order total by the refund, with an explicit
    adjustment, so the refund never shows up as a balance the customer owes. A seller that couldn't
    supply its part already took that part off the total when it was cancelled."""
    from apps.orders.models import OrderAdjustment

    if ret.return_type == ReturnType.SELLER_CANNOT_FULFILL or not ret.refund_amount:
        return None
    if order.total_amount is None or OrderAdjustment.objects.filter(return_request=ret).exists():
        return None
    before = order.total_amount
    after = max(before - ret.refund_amount, Decimal("0"))
    adjustment = OrderAdjustment.objects.create(
        order=order, amount=after - before, total_before=before, total_after=after, return_request=ret,
        reason=f"Return {ret.reference} refunded"[:255], created_by=user)
    order.total_amount = after
    order.save(update_fields=["total_amount", "updated_at"])
    return adjustment


@transaction.atomic
def reassign(ret: ReturnRequest, handler, *, user, note: str = "", request=None) -> ReturnRequest:
    ret = _lock(ret)
    if ret.status == R.CLOSED:
        raise WorkflowError("Closed returns can't be reassigned.", conflict=True)
    if not handler.is_active:
        raise WorkflowError(f"{handler.full_name} is inactive.", field="handler")
    previous = ret.handler
    ret.handler = handler
    ret.save(update_fields=["handler", "updated_at"])
    _history(ret, ret.status, ret.status, user,
             note or f"Handler changed from {previous.full_name if previous else '—'} to {handler.full_name}")
    record_audit(action="update", request=request, actor=user, instance=ret,
                 changes={"handler": [previous.pk if previous else None, handler.pk]})
    return ret



# --------------------------------------------------------------------------- #
# Marketplace: who bears a refund
# --------------------------------------------------------------------------- #
CENT = Decimal("0.01")


def _allocate(amount: Decimal, weights: list[Decimal]) -> list[Decimal]:
    total = sum(weights, Decimal("0"))
    if not weights or total <= 0:
        return [Decimal("0")] * len(weights)
    shares = [(amount * w / total).quantize(CENT) for w in weights]
    shares[-1] += amount - sum(shares, Decimal("0"))
    return shares


def reconcile(ret: ReturnRequest, *, user):
    """
    After a refund is paid, take each seller's share back through the vendor ledger (never by
    editing earlier records): the refund is spread over the returned lines by value (never more than
    a line was sold for); a seller gives back its net share, AGIZA its commission. Any part of the
    refund above the goods' value (e.g. delivery) is AGIZA's. Lines of a cancelled seller part are
    skipped — that seller never earned them.
    """
    from apps.marketplace import ledger
    from apps.marketplace.models import FulfillmentStatus

    if ret.reconciled_at or not ret.refund_payment_id:
        return
    refund = ret.refund_amount or Decimal("0")
    lines = list(ret.lines.select_related("order_item__fulfillment__vendor", "order_item__fulfillment__order"))
    if lines:
        goods = sum((line.amount for line in lines), Decimal("0"))
        spread = _allocate(min(refund, goods), [line.amount for line in lines])
        for line, gross in zip(lines, spread, strict=True):
            item, f = line.order_item, line.order_item.fulfillment
            if not f or not f.vendor_id or f.status == FulfillmentStatus.CANCELLED or gross <= 0:
                continue
            commission = ((item.commission_amount or Decimal("0")) * gross / item.line_total).quantize(CENT) \
                if item.line_total else Decimal("0")
            ledger.post_refund(f, key=f"refund:{ret.reference}:{line.pk}", gross=gross, commission=commission,
                               return_request=ret, user=user, note=f"{line.quantity}× {item.product_name}")
    else:  # an order-level return (staff-created): spread over the sellers by value
        parts = list(ret.order.fulfillments.exclude(status=FulfillmentStatus.CANCELLED).select_related("vendor", "order"))
        goods = sum((f.subtotal for f in parts), Decimal("0"))
        spread = _allocate(min(refund, goods), [f.subtotal for f in parts])
        for f, gross in zip(parts, spread, strict=True):
            if not f.vendor_id or gross <= 0:
                continue
            commission = (f.commission * gross / f.subtotal).quantize(CENT) if f.subtotal else Decimal("0")
            ledger.post_refund(f, key=f"refund:{ret.reference}:f{f.pk}", gross=gross, commission=commission,
                               return_request=ret, user=user, note="Order refund")
    ret.reconciled_at = timezone.now()
    ret.save(update_fields=["reconciled_at", "updated_at"])


# --------------------------------------------------------------------------- #
# Customer requests
# --------------------------------------------------------------------------- #
CUSTOMER_REASONS = {ReasonCode.DAMAGED_IN_TRANSIT, ReasonCode.ITEM_MISMATCH, ReasonCode.DEFECTIVE,
                    ReasonCode.NOT_AS_DESCRIBED, ReasonCode.CUSTOMER_CHANGED_MIND}


def delivered_at(order):
    last = order.status_history.filter(to_status="delivered").order_by("-created_at").first()
    return last.created_at if last else None


def returnable(order_item) -> int:
    """Units of a line not already covered by a return that is open or approved."""
    taken = sum(line.quantity for line in order_item.return_lines.exclude(return_request__status=R.REJECTED))
    return max(order_item.quantity - taken, 0)


def return_window_open(order) -> bool:
    from apps.marketplace.models import MarketplaceSettings

    at = delivered_at(order)
    if order.status != "delivered" or at is None:
        return False
    days = MarketplaceSettings.load().return_window_days
    return timezone.now() - at <= timedelta(days=days)


@transaction.atomic
def request_by_customer(order, *, lines: list[dict], reason_code: str, explanation: str,
                        request=None) -> ReturnRequest:
    """lines: [{"item": OrderItem id, "quantity": n}]. The customer's order, delivered, within the window."""
    order = order_services._lock(order)
    if order.order_type != "shop":
        raise WorkflowError("Returns are for shop orders. Contact support about this order.", conflict=True)
    if not return_window_open(order):
        raise WorkflowError("This order can't be returned: returns are possible for a limited time after delivery.",
                            conflict=True)
    if reason_code not in CUSTOMER_REASONS:
        raise WorkflowError("Choose a reason.", field="reason_code")
    explanation = explanation.strip()
    if len(explanation) < 5:
        raise WorkflowError("Tell us what's wrong.", field="explanation")
    items = {i.pk: i for i in order.items.select_related("fulfillment__vendor").exclude(fulfillment__status="cancelled")}
    wanted, value = [], Decimal("0")
    for row in lines:
        item = items.get(row.get("item"))
        if item is None:
            raise WorkflowError("Choose items from this order.", field="lines")
        qty = int(row.get("quantity") or 0)
        if qty < 1 or qty > returnable(item):
            raise WorkflowError(f"You can return at most {returnable(item)} of {item.product_name}.", field="lines")
        amount = (item.unit_price * qty).quantize(CENT)
        wanted.append((item, qty, amount))
        value += amount
    if not wanted:
        raise WorkflowError("Choose at least one item to return.", field="lines")
    details = ", ".join(f"{q}× {i.product_name}" for i, q, _ in wanted)[:255]
    ret = create_return(order, user=None, return_type=ReturnType.CUSTOMER_REQUEST, reason_code=reason_code,
                        item_details=details, return_value=value, financial_impact=FinancialImpact.REFUND_REQUIRED,
                        notes="Requested by the customer", request=request)
    ret.requested_by_customer = True
    ret.customer_note = explanation[:2000]
    ret.save(update_fields=["requested_by_customer", "customer_note", "updated_at"])
    ReturnLine.objects.bulk_create([ReturnLine(return_request=ret, order_item=i, quantity=q, amount=a)
                                    for i, q, a in wanted])
    _announce(ret, wanted)
    return ret


def _announce(ret, wanted):
    from apps.accounts.constants import Module
    from apps.marketplace.services import _notify_owner
    from apps.notifications import services as notifications
    from apps.notifications.models import Notification

    notifications.notify(notifications.users_with(Module.RETURNS), kind=Notification.Kind.SYSTEM,
                         title=f"Return requested · {ret.order.reference}", body=ret.item_details, link="/returns")
    for vendor in {i.fulfillment.vendor for i, _, _ in wanted if i.fulfillment_id and i.fulfillment.vendor_id}:
        _notify_owner(vendor, f"Return requested · {ret.order.reference}",
                      "A customer asked to return one of your items. AGIZA will review it.", {"return": ret.reference})


@transaction.atomic
def open_refund_obligation(order, *, fulfillment, amount: Decimal, user, reason: str) -> ReturnRequest:
    """A seller couldn't supply its part of a paid order: the customer is owed a refund (approved at once)."""
    lines = list(fulfillment.items.all())
    ret = create_return(order, user=user, return_type=ReturnType.SELLER_CANNOT_FULFILL,
                        reason_code=ReasonCode.SELLER_UNAVAILABLE,
                        item_details=", ".join(f"{i.quantity}× {i.product_name}" for i in lines)[:255],
                        return_value=amount, financial_impact=FinancialImpact.REFUND_REQUIRED,
                        notes=f"Seller couldn't supply: {reason}")
    ReturnLine.objects.bulk_create([ReturnLine(return_request=ret, order_item=i, quantity=i.quantity,
                                               amount=i.line_total) for i in lines])
    ret.refund_amount = amount
    ret.decision_notes = "Seller couldn't supply the items; the customer's payment for them is refunded."
    ret.decided_at = timezone.now()
    ret.decided_by = user
    ret.customer_message = "Part of your order couldn't be supplied. AGIZA will refund you."
    _set_status(ret, R.APPROVED, user, "Refund owed: seller couldn't supply", None,
                ["refund_amount", "decision_notes", "decided_at", "decided_by", "customer_message"])
    return ret


@transaction.atomic
def vendor_respond(ret: ReturnRequest, *, vendor, message: str):
    from .models import ReturnVendorResponse

    message = message.strip()
    if len(message) < 2:
        raise WorkflowError("Write your response.", field="message")
    if not ret.lines.filter(order_item__fulfillment__vendor=vendor).exists():
        raise WorkflowError("Return not found.", conflict=True)
    if ret.status == R.CLOSED:
        raise WorkflowError("This return is closed.", conflict=True)
    response = ReturnVendorResponse.objects.create(return_request=ret, vendor=vendor, message=message[:2000])
    _history(ret, ret.status, ret.status, None, f"{vendor.name} responded")
    return response


CUSTOMER_STATUS = {R.INITIATED: "Requested", R.IN_TRANSIT: "Item on its way back", R.RECEIVED: "Item received",
                   R.INSPECTED: "Under review", R.REJECTED: "Rejected"}


def customer_status(ret: ReturnRequest) -> tuple[str, str]:
    """(return status, refund status) in the customer's words."""
    refund_due = ret.financial_impact == FinancialImpact.REFUND_REQUIRED
    if ret.status == R.APPROVED:
        label = "Refund pending" if refund_due else "Approved"
    elif ret.status == R.CLOSED:
        label = "Refunded" if ret.refund_payment_id else "Closed"
    else:
        label = CUSTOMER_STATUS.get(ret.status, ret.get_status_display())
    if ret.refund_payment_id:
        refund = "refunded"
    elif ret.status == R.APPROVED and refund_due:
        refund = "pending"
    elif ret.status == R.REJECTED:
        refund = "none"
    else:
        refund = "not_decided"
    return label, refund


@transaction.atomic
def message_customer(ret: ReturnRequest, *, user, message: str, request=None) -> ReturnRequest:
    """What AGIZA tells the customer about their return (shown in their account, and notified)."""
    ret = _lock(ret)
    message = message.strip()
    if not message:
        raise WorkflowError("Write the message.", field="message")
    ret.customer_message = message[:2000]
    ret.save(update_fields=["customer_message", "updated_at"])
    _history(ret, ret.status, ret.status, user, f"Message to customer: {message}"[:500])
    from apps.storefront.notifications import notify

    notify(ret.order.customer, title=f"Return {ret.reference}", body=message[:500],
           data={"type": "return", "return": ret.reference, "screen": "return"})
    return ret
