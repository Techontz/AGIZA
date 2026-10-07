"""
Procurement workflow services — the only code that changes procurement status.

International Order → Procurement (pending sourcing) → supplier selected →
supplier paid (order: Paid Supplier) → supplier shipped, with its tracking number
(order: Waiting to Receive; the parcel now appears in Shipping's Waiting to
Receive list) → received at cargo (done by Shipping's receipt, which also moves
the order to Sent to Consolidation).

The supplier may cancel at any point before receipt: a paid / shipped order then
goes back to Supplier Confirmed so a new supplier can be selected and paid.
"""
from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.core.audit import record_audit
from apps.core.workflow import WorkflowError
from apps.orders import services as order_services
from apps.orders.workflows import InternationalStatus

from .models import ProcurementOrder, ProcurementStatus, ProcurementStatusHistory

P = ProcurementStatus
LABELS = dict(ProcurementStatus.choices)


def _lock(proc: ProcurementOrder) -> ProcurementOrder:
    return ProcurementOrder.objects.select_for_update().select_related("order").get(pk=proc.pk)


def _set_status(proc: ProcurementOrder, to_status: str, user, note: str = "", request=None, fields=()):
    from_status = proc.status
    proc.status = to_status
    proc.save(update_fields=["status", "updated_at", *fields])
    ProcurementStatusHistory.objects.create(procurement=proc, from_status=from_status, to_status=to_status,
                                            changed_by=user, note=note.strip())
    record_audit(action="status_change", request=request, actor=user, instance=proc,
                 changes={"status": [from_status, to_status], **({"note": [None, note]} if note else {})})


def _customer_payment_ok(order) -> bool:
    """Suppliers are paid once the customer has paid in full, or installments were approved."""
    summary = order_services.payment_summary(order)
    return summary.status == "fully_paid" or (order.installment_plan and order.installment_allowed)


def open_for_order(order, user=None) -> ProcurementOrder:
    """Start procurement for a newly created Agiza-sourced international order."""
    proc, created = ProcurementOrder.objects.get_or_create(
        order=order, defaults={"operator": order.handler, "currency": order.currency}
    )
    if created:
        ProcurementStatusHistory.objects.create(procurement=proc, to_status=proc.status, changed_by=user,
                                                note="Procurement opened")
    return proc


def _sync_order_details(proc: ProcurementOrder):
    details = proc.order.international
    details.supplier_name = proc.supplier.name if proc.supplier_id else ""
    details.tracking_number = proc.supplier_tracking_number or details.tracking_number
    if proc.item_cost is not None:
        details.item_cost = proc.item_cost
    details.save(update_fields=["supplier_name", "tracking_number", "item_cost"])


@transaction.atomic
def select_supplier(proc: ProcurementOrder, *, supplier, user, item_cost: Decimal | None = None,
                    unit_cost: Decimal | None = None, quantity: int | None = None, expected_at_cargo=None,
                    supplier_order_number: str | None = None, note: str = "", request=None) -> ProcurementOrder:
    proc = _lock(proc)
    if not supplier.is_active:
        raise WorkflowError(f"{supplier.name} is inactive.", field="supplier")
    if proc.status not in (P.PENDING_SOURCING, P.SUPPLIER_CANCELLED, P.SUPPLIER_SELECTED):
        raise WorkflowError("The supplier can't change once the supplier has been paid.", conflict=True)
    if quantity is not None:
        proc.quantity = quantity
    if unit_cost is not None:
        proc.unit_cost = unit_cost
        if item_cost is None:
            item_cost = unit_cost * proc.quantity
    if item_cost is not None:
        proc.item_cost = item_cost
    if expected_at_cargo is not None:
        proc.expected_at_cargo = expected_at_cargo
    if supplier_order_number is not None:
        proc.supplier_order_number = supplier_order_number
    previous = proc.supplier
    proc.supplier = supplier
    if proc.exception_flag == "stock_unavailable":
        proc.exception_flag = ""
    fields = ["supplier", "quantity", "unit_cost", "item_cost", "expected_at_cargo", "supplier_order_number",
              "exception_flag"]
    if proc.status == P.SUPPLIER_SELECTED:
        proc.save(update_fields=[*fields, "updated_at"])
        ProcurementStatusHistory.objects.create(
            procurement=proc, from_status=proc.status, to_status=proc.status, changed_by=user,
            note=note or f"Supplier changed from {previous.name if previous else '—'} to {supplier.name}")
        record_audit(action="update", request=request, actor=user, instance=proc,
                     changes={"supplier": [previous.pk if previous else None, supplier.pk]})
    else:
        _set_status(proc, P.SUPPLIER_SELECTED, user, note or f"Supplier: {supplier.name}", request, fields)
    _sync_order_details(proc)

    order = proc.order
    if order.status in (InternationalStatus.PENDING_PAYMENT, InternationalStatus.ISSUE_PENDING_PAYMENT) \
            and _customer_payment_ok(order):
        order_services.transition(order, InternationalStatus.SUPPLIER_CONFIRMED, user,
                                  f"Supplier confirmed: {supplier.name}", request)
    return proc


@transaction.atomic
def mark_paid(proc: ProcurementOrder, *, user, payment_reference: str = "", paid_at=None,
              supplier_tracking_number: str | None = None, note: str = "", request=None) -> ProcurementOrder:
    """Record the supplier payment. The order moves to Paid Supplier; the goods are expected at cargo once
    the supplier ships them (`mark_shipped`)."""
    proc = _lock(proc)
    if proc.status != P.SUPPLIER_SELECTED:
        raise WorkflowError(f"Only orders with a selected supplier can be paid (currently {LABELS[proc.status]}).",
                            conflict=True)
    if proc.item_cost is None or proc.item_cost <= 0:
        raise WorkflowError("Enter the item cost before recording the supplier payment.", field="item_cost")
    order = order_services._lock(proc.order)
    if order.status in (InternationalStatus.PENDING_PAYMENT, InternationalStatus.ISSUE_PENDING_PAYMENT):
        if not _customer_payment_ok(order):
            raise WorkflowError(
                f"{order.reference} isn't paid in full and has no approved installment plan — "
                "the supplier can't be paid yet.", conflict=True)
        order = order_services.transition(order, InternationalStatus.SUPPLIER_CONFIRMED, user,
                                          f"Supplier confirmed: {proc.supplier.name}", request)
    if order.status != InternationalStatus.SUPPLIER_CONFIRMED:
        raise WorkflowError(f"{order.reference} must be Supplier Confirmed before paying the supplier.",
                            conflict=True)
    proc.paid_at = paid_at or timezone.now()
    proc.payment_reference = payment_reference
    if supplier_tracking_number:
        proc.supplier_tracking_number = supplier_tracking_number
    if proc.exception_flag == "payment_issue":
        proc.exception_flag = ""
    _set_status(proc, P.PAID, user, note or "Supplier paid", request,
                ["paid_at", "payment_reference", "supplier_tracking_number", "exception_flag"])
    _sync_order_details(proc)
    order_services.advance(order, InternationalStatus.PAID_SUPPLIER, user, via_action="procurement",
                           note=f"Supplier {proc.supplier.name} paid", request=request)
    return proc


@transaction.atomic
def mark_shipped(proc: ProcurementOrder, *, user, supplier_tracking_number: str, shipped_at=None,
                 expected_at_cargo=None, note: str = "", request=None) -> ProcurementOrder:
    """The supplier shipped the goods to the consolidation warehouse (old system: "shipped to Shipping Agent").

    The order moves to Waiting to Receive and the parcel, with its tracking number, appears in
    Shipping's Waiting to Receive list.
    """
    proc = _lock(proc)
    if proc.status != P.PAID:
        raise WorkflowError(f"Only paid supplier orders can be marked shipped (currently {LABELS[proc.status]}).",
                            conflict=True)
    tracking = (supplier_tracking_number or "").strip()
    if not tracking:
        raise WorkflowError("Enter the supplier's tracking number.", field="supplier_tracking_number")
    proc.supplier_tracking_number = tracking
    proc.shipped_at = shipped_at or timezone.now()
    if expected_at_cargo is not None:
        proc.expected_at_cargo = expected_at_cargo
    if proc.exception_flag in ("supplier_delay", "parcel_lost"):
        proc.exception_flag = ""
    _set_status(proc, P.SUPPLIER_SHIPPED, user, note or f"Supplier shipped · tracking {tracking}", request,
                ["supplier_tracking_number", "shipped_at", "expected_at_cargo", "exception_flag"])
    _sync_order_details(proc)
    order = order_services._lock(proc.order)
    if order.status in (InternationalStatus.PAID_SUPPLIER, InternationalStatus.IN_PRODUCTION):
        order_services.advance(order, InternationalStatus.WAITING_TO_RECEIVE, user, via_action="supplier-shipped",
                               note=f"Supplier {proc.supplier.name} shipped · tracking {tracking}", request=request)

    from apps.shipping import services as shipping

    shipping.expect_procured_parcel(proc, user)
    return proc


@transaction.atomic
def cancel_supplier(proc: ProcurementOrder, *, user, reason: str, request=None) -> ProcurementOrder:
    """The supplier cancelled (stock-out, delay, failed to ship...). A new supplier must be selected.

    After payment / shipping the order goes back to Supplier Confirmed, the expected parcel is
    withdrawn and that supplier order's payment and tracking details are cleared (they stay in the
    procurement history and audit log), so select supplier → mark paid → mark shipped works again.
    """
    proc = _lock(proc)
    if proc.status not in (P.SUPPLIER_SELECTED, P.PAID, P.SUPPLIER_SHIPPED):
        raise WorkflowError("Only an active supplier order can be cancelled.", conflict=True)
    reason = (reason or "").strip()
    if not reason:
        raise WorkflowError("Give the reason the supplier cancelled.", field="reason")
    was_paid = proc.status in (P.PAID, P.SUPPLIER_SHIPPED)
    fields = []
    if was_paid:
        previous = {"supplier_order_number": proc.supplier_order_number,
                    "supplier_tracking_number": proc.supplier_tracking_number,
                    "payment_reference": proc.payment_reference,
                    "paid_at": proc.paid_at.isoformat() if proc.paid_at else None}
        proc.supplier_order_number = proc.supplier_tracking_number = proc.payment_reference = ""
        proc.paid_at = proc.shipped_at = None
        if proc.exception_flag == "parcel_lost":
            proc.exception_flag = ""
        fields = ["supplier_order_number", "supplier_tracking_number", "payment_reference", "paid_at", "shipped_at",
                  "exception_flag"]
        details = ", ".join(f"{k.replace('_', ' ')}: {v}" for k, v in previous.items() if v)
        reason_note = f"{reason}{f' (cleared {details})' if details else ''}"
    else:
        reason_note = reason
    _set_status(proc, P.SUPPLIER_CANCELLED, user, reason_note, request, fields)
    if was_paid:
        from apps.shipping import services as shipping

        shipping.withdraw_expected_parcel(proc.order, user, f"Supplier cancelled: {reason}")
        intl = proc.order.international
        intl.tracking_number = ""
        intl.save(update_fields=["tracking_number"])
        order = order_services._lock(proc.order)
        if order.status in (InternationalStatus.PAID_SUPPLIER, InternationalStatus.IN_PRODUCTION,
                            InternationalStatus.WAITING_TO_RECEIVE):
            order_services.advance(order, InternationalStatus.SUPPLIER_CONFIRMED, user,
                                   via_action="procurement-cancel",
                                   note=f"Supplier {proc.supplier.name} cancelled: {reason} — select a new supplier",
                                   request=request)
    return proc


def mark_received(proc: ProcurementOrder, user, request=None):
    """Called by Shipping when the goods are received at the consolidation warehouse."""
    proc = _lock(proc)
    if proc.status == P.RECEIVED_AT_CARGO:
        return proc
    # `paid` stays receivable for goods expected before "supplier shipped" existed.
    if proc.status not in (P.SUPPLIER_SHIPPED, P.PAID):
        raise WorkflowError("Goods can be received once the supplier has shipped them.", conflict=True)
    proc.received_at = timezone.now()
    _set_status(proc, P.RECEIVED_AT_CARGO, user, "Received at the consolidation warehouse", request, ["received_at"])
    return proc


def on_parcel_lost(order, user, reason: str):
    """Shipping marked the supplier's parcel lost: flag the procurement so it can be followed up."""
    proc = ProcurementOrder.objects.filter(order=order).first()
    if proc is None or proc.status in (P.CANCELLED, P.RECEIVED_AT_CARGO):
        return
    proc = _lock(proc)
    proc.exception_flag = "parcel_lost"
    proc.save(update_fields=["exception_flag", "updated_at"])
    ProcurementStatusHistory.objects.create(procurement=proc, from_status=proc.status, to_status=proc.status,
                                            changed_by=user, note=f"Parcel lost: {reason}")


def on_order_cancelled(order, user):
    proc = ProcurementOrder.objects.filter(order=order).first()
    if proc and proc.status not in (P.CANCELLED, P.RECEIVED_AT_CARGO):
        _set_status(_lock(proc), P.CANCELLED, user, "Order cancelled")
