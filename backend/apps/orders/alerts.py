"""
Exception flags on orders: issues someone must follow up before the customer has to.

Staff raise them (Procurement, Shipping, Deliveries: needs care, very late, angry client, needs
documentation…) and resolve them with a note. Two are raised and cleared automatically by
`refresh_automatic` (management command `refresh_order_alerts`, hourly):

  - Stuck in Procurement: an order whose procurement hasn't reached Supplier Shipped within
    STALL_DAYS of opening (installment orders count once an admin approved them);
  - Delivery Date Close: an order still with Shipping whose expected delivery date is at most
    DUE_SOON_DAYS away (or already passed).
"""
from __future__ import annotations

from datetime import timedelta

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.core.audit import record_audit
from apps.core.workflow import WorkflowError

from . import services
from .models import Department, Order, OrderFlag
from .workflows import InternationalStatus, OrderType

STALL_DAYS = 3
DUE_SOON_DAYS = 3
K = OrderFlag.Kind
I = InternationalStatus
# International stages owned by Shipping & Tracking.
SHIPPING_STAGES = (I.WAITING_TO_RECEIVE, I.SENT_TO_CONSOLIDATION, I.SHIPPING_TO_DESTINATION, I.CLEARANCE)


def _label(flag: OrderFlag) -> str:
    return flag.get_kind_display() + (f": {flag.note}" if flag.note else "")


@transaction.atomic
def raise_flag(order: Order, kind: str, *, user=None, note: str = "", department: str = "", automatic: bool = False,
               request=None) -> OrderFlag:
    """Open a flag on the order; an open flag of the same kind is kept (its note updated) instead of doubled."""
    order = services._lock(order)
    if order.status in ("completed", "delivered", "cancelled") and not automatic:
        raise WorkflowError(f"{order.reference} is closed.", conflict=True)
    if kind == K.OTHER and not note.strip():
        raise WorkflowError("Describe the issue.", field="note")
    note = note.strip()[:255]
    flag = OrderFlag.objects.filter(order=order, kind=kind, resolved_at__isnull=True).first()
    if flag:
        if note and note != flag.note:
            flag.note = note
            flag.save(update_fields=["note", "updated_at"])
        return flag
    flag = OrderFlag.objects.create(order=order, kind=kind, note=note, department=department, automatic=automatic,
                                    raised_by=user)
    services._history(order, order.status, order.status, user, f"Flag raised — {_label(flag)}")
    if not automatic:
        record_audit(action="create", request=request, actor=user, instance=flag,
                     changes={"order": [None, order.reference], "kind": [None, kind]})
    return flag


@transaction.atomic
def resolve_flag(flag: OrderFlag, *, user=None, note: str = "", request=None) -> OrderFlag:
    flag = OrderFlag.objects.select_for_update().select_related("order").get(pk=flag.pk)
    if flag.resolved_at:
        raise WorkflowError("This flag is already resolved.", conflict=True)
    flag.resolved_at, flag.resolved_by, flag.resolution_note = timezone.now(), user, note.strip()[:255]
    flag.save(update_fields=["resolved_at", "resolved_by", "resolution_note", "updated_at"])
    services._history(flag.order, flag.order.status, flag.order.status, user,
                      f"Flag resolved — {flag.get_kind_display()}" + (f": {flag.resolution_note}" if flag.resolution_note else ""))
    if user is not None:
        record_audit(action="update", request=request, actor=user, instance=flag, changes={"resolved": [False, True]})
    return flag


# --------------------------------------------------------------------------- #
# Automatic flags
# --------------------------------------------------------------------------- #
def _stalled_in_procurement(now) -> dict[int, str]:
    """{order id: note} for orders whose procurement hasn't reached Supplier Shipped within STALL_DAYS."""
    from apps.procurement.models import ProcurementOrder
    from apps.procurement.models import ProcurementStatus as PS

    since = now - timedelta(days=STALL_DAYS)
    rows = (ProcurementOrder.objects
            .filter(status__in=[PS.PENDING_SOURCING, PS.SUPPLIER_SELECTED, PS.PAID, PS.SUPPLIER_CANCELLED],
                    created_at__lte=since)
            .exclude(order__status__in=["completed", "cancelled"])
            .exclude(Q(order__installment_plan=True, order__installment_allowed=False))
            .values_list("order_id", "status", "created_at"))
    labels = dict(PS.choices)
    return {order_id: f"{(now - opened).days} days in procurement, still {labels[status]}"
            for order_id, status, opened in rows}


def _delivery_close(today) -> dict[int, str]:
    """{order id: note} for orders still with Shipping whose expected delivery is DUE_SOON_DAYS away or passed."""
    rows = (Order.objects.filter(order_type=OrderType.INTERNATIONAL, status__in=SHIPPING_STAGES,
                                 international__estimated_delivery__lte=today + timedelta(days=DUE_SOON_DAYS))
            .values_list("id", "international__estimated_delivery"))
    notes = {}
    for order_id, when in rows:
        days = (when - today).days
        notes[order_id] = (f"Expected {when:%d %b} — {days} day(s) left and still with Shipping" if days >= 0
                           else f"Expected {when:%d %b} — overdue by {-days} day(s)")
    return notes


def refresh_automatic(now=None) -> dict:
    """Raise the automatic flags that now apply and resolve those that no longer do."""
    now = now or timezone.now()
    wanted = {K.PROCUREMENT_STALLED: (_stalled_in_procurement(now), Department.PROCUREMENT),
              K.DELIVERY_DUE_SOON: (_delivery_close(timezone.localdate(now)), Department.SHIPPING)}
    raised = resolved = 0
    for kind, (notes, department) in wanted.items():
        open_flags = {f.order_id: f for f in OrderFlag.objects.filter(kind=kind, resolved_at__isnull=True)}
        for order_id, note in notes.items():
            if order_id not in open_flags:
                raised += 1
            raise_flag(Order(pk=order_id), kind, note=note, department=department, automatic=True)
        for order_id, flag in open_flags.items():
            if order_id not in notes:
                resolve_flag(flag, note="Cleared automatically")
                resolved += 1
    return {"raised": raised, "resolved": resolved}
