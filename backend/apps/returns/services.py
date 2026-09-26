"""
Return workflow services — the only code that changes return status.

Initiated → In Transit (Return) → Received → Inspected → Approved/Rejected → Closed.
Every change locks the return, checks the transition, sets the owning
department, writes ReturnStatusHistory and an audit entry. Closing an
approved refund records a refund payment on the order (never more than the
customer has paid).
"""
from __future__ import annotations

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
    ReturnRequest,
    ReturnStatus,
    ReturnStatusHistory,
    ReturnType,
)

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
            request=None) -> ReturnRequest:
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
    return ret


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
    ret.closed_at = timezone.now()
    ret.resolution_notes = notes.strip()
    _set_status(ret, R.CLOSED, user, notes or "Return closed", request, fields)
    return ret


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
