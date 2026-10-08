"""
Order workflow services — the only code that changes order status.

Every state change: locks the order row, checks the current status and the
allowed transition, updates the record, writes OrderStatusHistory (who, when,
note) and an audit-log entry, all inside one transaction.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from django.db import transaction
from django.db.models import Case, DecimalField, F, OuterRef, Subquery, Sum, When
from django.utils import timezone

from apps.accounts.constants import StaffLevel
from apps.core.audit import record_audit
from apps.core.workflow import WorkflowError  # noqa: F401  (re-exported for callers)

from .models import (
    Department,
    EquipmentDetails,
    ExpressDetails,
    InternationalDetails,
    Order,
    OrderStatusHistory,
    Payment,
    ShopDetails,
)
from .workflows import (
    ACTION_EDGES,
    INTERNATIONAL_DEPARTMENT,
    SHOP_IMPORT_STAGES,
    TERMINAL,
    WORKFLOWS,
    EquipmentStatus,
    ExpressStatus,
    InternationalStatus,
    OrderType,
    ShopStatus,
    status_label,
)


# --------------------------------------------------------------------------- #
# Core helpers
# --------------------------------------------------------------------------- #
def _lock(order: Order) -> Order:
    return Order.objects.select_for_update().get(pk=order.pk)


def _history(order: Order, from_status: str, to_status: str, user, note: str = "") -> OrderStatusHistory:
    return OrderStatusHistory.objects.create(
        order=order, from_status=from_status, to_status=to_status, changed_by=user, note=note.strip()
    )


def _set_status(order: Order, to_status: str, user, note: str = "", request=None) -> Order:
    from_status = order.status
    order.status = to_status
    fields = ["status", "updated_at"]
    if order.order_type == OrderType.INTERNATIONAL:
        order.department = INTERNATIONAL_DEPARTMENT[InternationalStatus(to_status)]
        fields.append("department")
    order.save(update_fields=fields)
    _history(order, from_status, to_status, user, note)
    record_audit(
        action="status_change",
        request=request,
        actor=user,
        instance=order,
        changes={"status": [from_status, to_status], **({"note": [None, note]} if note else {})},
    )
    _after_status_change(order, from_status, to_status, user)
    return order


def _after_status_change(order: Order, from_status: str, to_status: str, user):
    """Keep the operational records that follow an order (procurement, cargo, delivery) in step."""
    from apps.deliveries import services as deliveries
    from apps.procurement import services as procurement
    from apps.shipping import services as shipping

    if to_status == "cancelled":
        procurement.on_order_cancelled(order, user)
        shipping.on_order_cancelled(order, user)
    elif order.order_type == OrderType.INTERNATIONAL:
        shipping.on_order_status(order, to_status, user)
    deliveries.on_order_status(order, to_status, user)
    if order.order_type == OrderType.SHOP:
        from apps.marketplace import services as marketplace

        marketplace.on_order_status(order, to_status, user)


def _check_transition(order: Order, to_status: str, via_action: str | None = None):
    statuses, transitions, action_only = WORKFLOWS[OrderType(order.order_type)]
    if to_status not in statuses.values:
        raise WorkflowError(f"Unknown status “{to_status}”.", field="status")
    edge_action = ACTION_EDGES.get(OrderType(order.order_type), {}).get((order.status, to_status))
    if edge_action and via_action == edge_action:
        return  # a backward move only this action may make (e.g. the supplier cancelled after payment)
    if to_status not in transitions.get(order.status, set()):
        raise WorkflowError(
            f"Cannot move {order.reference} from {status_label(order.order_type, order.status)} "
            f"to {status_label(order.order_type, to_status)}.",
            conflict=True,
        )
    required_action = action_only.get(to_status)
    if required_action and via_action != required_action:
        raise WorkflowError(
            f"{status_label(order.order_type, to_status)} is set with the “{required_action}” action.", field="status"
        )
    if order.order_type == OrderType.SHOP and to_status in SHOP_IMPORT_STAGES and not is_imported(order):
        raise WorkflowError(f"{order.reference} has no imported items: it doesn't travel from abroad.", conflict=True)
    _check_prepayment(order, to_status)


def is_imported(order: Order) -> bool:
    """A shop order with items coming from abroad (a warehouse or supplier outside Tanzania)."""
    details = getattr(order, "shop", None)
    if details is None:
        return False
    if details.import_shipping_method_id or details.import_fee or details.prepayment_required:
        return True
    return any(item.sourced_abroad or (item.warehouse_id and item.warehouse.country.iso2 != "TZ")
               for item in order.items.all())


def _check_prepayment(order: Order, to_status: str):
    """Shop orders with imported items are bought abroad only once the customer has paid in full."""
    if order.order_type != OrderType.SHOP or to_status not in (ShopStatus.PROCESSING, ShopStatus.ORDERED_FROM_SUPPLIER,
                                                               ShopStatus.SHIPPED):
        return
    details = getattr(order, "shop", None)
    if details is None or not details.prepayment_required:
        return
    due = payment_summary(order).due
    if due and due > 0:
        raise WorkflowError(f"{order.reference} has imported items: it must be fully paid before it is processed "
                            f"({due:,.2f} {order.currency} still due).", conflict=True)


@transaction.atomic
def transition(order: Order, to_status: str, user, note: str = "", request=None) -> Order:
    """Generic status change (only for statuses that need no extra data)."""
    order = _lock(order)
    _check_transition(order, to_status)
    return _set_status(order, to_status, user, note, request)


@transaction.atomic
def advance(order: Order, to_status: str, user, *, via_action: str, note: str = "", request=None) -> Order:
    """Status change made by another module's action (procurement, cargo receipt, shipment, delivery)."""
    order = _lock(order)
    _check_transition(order, to_status, via_action=via_action)
    return _set_status(order, to_status, user, note, request)


# --------------------------------------------------------------------------- #
# Creation
# --------------------------------------------------------------------------- #
INITIAL_STATUS = {
    OrderType.EXPRESS: ExpressStatus.WAITING_QUOTE,
    OrderType.INTERNATIONAL: InternationalStatus.PENDING_PAYMENT,
    OrderType.EQUIPMENT: EquipmentStatus.PENDING,
    OrderType.SHOP: ShopStatus.PENDING,
}
DETAILS_MODEL = {
    OrderType.EXPRESS: ExpressDetails,
    OrderType.INTERNATIONAL: InternationalDetails,
    OrderType.EQUIPMENT: EquipmentDetails,
    OrderType.SHOP: ShopDetails,
}


@transaction.atomic
def create_order(
    order_type: str,
    *,
    customer,
    item_details: str,
    details: dict,
    user=None,
    status: str | None = None,
    note: str = "Order created",
    request=None,
    **order_fields,
) -> Order:
    order_type = OrderType(order_type)
    status = status or INITIAL_STATUS[order_type]
    if order_type == OrderType.INTERNATIONAL and status in (InternationalStatus.PENDING_PAYMENT, "") \
            and details.get("service_type") == InternationalDetails.ServiceType.DELIVER_FOR_ME:
        # "Deliver for Me": the customer bought the goods, so once the order exists we only wait for
        # them at the consolidation warehouse. Payment is checked before the cargo ships.
        status = InternationalStatus.WAITING_TO_RECEIVE
    order = Order(order_type=order_type, customer=customer, item_details=item_details, status=status,
                  created_by=user, **order_fields)
    if order_type == OrderType.INTERNATIONAL:
        order.department = INTERNATIONAL_DEPARTMENT[InternationalStatus(status)]
    elif order_type in (OrderType.EXPRESS, OrderType.SHOP):
        order.department = Department.DELIVERY
    else:
        order.department = Department.SUPPORT
    order.save()
    DETAILS_MODEL[order_type].objects.create(order=order, **details)
    _history(order, "", status, user, note)
    record_audit(action="create", request=request, actor=user, instance=order,
                 changes={"status": [None, status], "customer": [None, customer.pk]})
    if order_type == OrderType.INTERNATIONAL:
        from apps.procurement import services as procurement
        from apps.shipping import services as shipping

        if order.international.service_type == InternationalDetails.ServiceType.DELIVER_FOR_ME:
            shipping.expect_client_parcel(order, user)
        else:
            procurement.open_for_order(order, user)
    _refresh_customer(order.customer, user)
    return order


def _refresh_customer(customer, user):
    """Customer activity changes interests and tag-rule matches."""
    from apps.crm import services as crm

    transaction.on_commit(lambda: crm.refresh_customer(customer, user))


# --------------------------------------------------------------------------- #
# Payments
# --------------------------------------------------------------------------- #
@dataclass
class PaymentSummary:
    total: Decimal | None
    paid: Decimal
    due: Decimal | None
    status: str  # unpaid | partial | fully_paid | installment

    @property
    def as_dict(self) -> dict:
        return {"total": self.total, "paid": self.paid, "due": self.due, "status": self.status}


_SIGNED_AMOUNT = Case(When(kind=Payment.Kind.REFUND, then=-F("amount")), default=F("amount"))


def with_paid_total(qs):
    """Annotate orders with `paid_total` (payments minus refunds) without join fan-out."""
    paid = (Payment.objects.filter(order=OuterRef("pk")).order_by().values("order")
            .annotate(s=Sum(_SIGNED_AMOUNT)).values("s"))
    return qs.annotate(paid_total=Subquery(paid, output_field=DecimalField(max_digits=14, decimal_places=2)))


def net_paid(order: Order) -> Decimal:
    """Payments received minus refunds."""
    return order.payments.aggregate(s=Sum(_SIGNED_AMOUNT))["s"] or Decimal("0")


def prefetched_net_paid(order: Order) -> Decimal:
    """net_paid() computed from `order.payments` already prefetched (no query)."""
    return sum((-p.amount if p.kind == Payment.Kind.REFUND else p.amount for p in order.payments.all()),
               Decimal("0"))


def payment_summary(order: Order, paid: Decimal | None = None) -> PaymentSummary:
    if paid is None:
        paid = net_paid(order)
    total = order.total_amount
    due = max(total - paid, Decimal("0")) if total is not None else None
    if total is not None and total > 0 and paid >= total:
        status = "fully_paid"
    elif total == 0 and paid == 0 and order.adjustments.exists():
        status = "fully_paid"  # everything was refunded / taken off: nothing is owed
    elif order.installment_plan:
        status = "installment"
    elif paid > 0:
        status = "partial"
    else:
        status = "unpaid"
    return PaymentSummary(total, paid, due, status)


@transaction.atomic
def record_payment(order: Order, *, amount: Decimal, method: str, user, kind: str = Payment.Kind.BALANCE,
                   reference: str = "", paid_at=None, notes: str = "", request=None) -> Payment:
    order = _lock(order)
    if order.status == "cancelled":
        raise WorkflowError("Payments can't be recorded on a cancelled order.", conflict=True)
    if kind == Payment.Kind.REFUND:
        raise WorkflowError("Refunds are handled through Returns.", field="kind")
    if order.total_amount is None:
        raise WorkflowError("Set the order price (quote) before recording payments.", conflict=True)
    summary = payment_summary(order)
    if amount > summary.due:
        raise WorkflowError(f"Amount exceeds the outstanding balance of {summary.due:,.2f} {order.currency}.", field="amount")
    payment = Payment.objects.create(
        order=order, amount=amount, currency=order.currency, method=method, kind=kind, reference=reference,
        paid_at=paid_at or timezone.now(), notes=notes, recorded_by=user,
    )
    record_audit(action="create", request=request, actor=user, instance=payment,
                 changes={"amount": [None, str(amount)], "order": [None, order.reference]})
    from apps.finance import services as finance

    finance.on_payment(order, payment)
    if order.order_type == OrderType.SHOP:
        from apps.marketplace import services as marketplace

        marketplace.on_payment(order)
    _refresh_customer(order.customer, user)
    return payment


# --------------------------------------------------------------------------- #
# Express delivery actions
# --------------------------------------------------------------------------- #
def _require_type(order: Order, order_type: OrderType):
    if order.order_type != order_type:
        raise WorkflowError(f"This action applies to {order_type.label} orders only.", conflict=True)


@transaction.atomic
def quote_express(order: Order, *, amount: Decimal, estimated_delivery_at, user, advance_required: bool = False,
                  advance_amount: Decimal | None = None, note: str = "", request=None) -> Order:
    """Generate or edit the quote. Editing an accepted/rejected quote sends it back to Quoted."""
    order = _lock(order)
    _require_type(order, OrderType.EXPRESS)
    if amount is None or amount <= 0:
        raise WorkflowError("Full price must be greater than zero.", field="amount")
    if advance_required:
        if not advance_amount or advance_amount <= 0:
            raise WorkflowError("Enter the advance payment amount.", field="advance_amount")
        if advance_amount > amount:
            raise WorkflowError("Advance payment can't exceed the full price.", field="advance_amount")
    else:
        advance_amount = None
    editable = {ExpressStatus.WAITING_QUOTE, ExpressStatus.QUOTED, ExpressStatus.ACCEPTED, ExpressStatus.REJECTED}
    if order.status not in editable:
        raise WorkflowError("The quote can't change once a driver is assigned.", conflict=True)

    details = order.express
    before = (order.total_amount, details.estimated_delivery_at, details.advance_required, details.advance_amount)
    order.total_amount = amount
    order.save(update_fields=["total_amount", "updated_at"])
    details.estimated_delivery_at = estimated_delivery_at
    details.advance_required = advance_required
    details.advance_amount = advance_amount
    details.quoted_at = timezone.now()
    details.quoted_by = user
    details.save()

    message = note or ("Quote updated" if order.status == ExpressStatus.QUOTED else "Quote generated")
    if order.status == ExpressStatus.QUOTED:
        _history(order, order.status, order.status, user, message)  # edit without status change
        record_audit(action="update", request=request, actor=user, instance=order,
                     changes={"quote": [[str(v) if v is not None else None for v in before], str(amount)]})
    else:
        _check_transition(order, ExpressStatus.QUOTED, via_action="quote")
        _set_status(order, ExpressStatus.QUOTED, user, message, request)
    return order


@transaction.atomic
def set_package_size(order: Order, size: str, user, request=None) -> Order:
    order = _lock(order)
    _require_type(order, OrderType.EXPRESS)
    if order.status not in (ExpressStatus.WAITING_QUOTE, ExpressStatus.QUOTED):
        raise WorkflowError("Package size can only change before the quote is accepted.", conflict=True)
    details = order.express
    before = details.package_size
    details.package_size = size
    details.save(update_fields=["package_size"])
    record_audit(action="update", request=request, actor=user, instance=order, changes={"package_size": [before, size]})
    return order


def _check_assignee(user_obj, *, driver: bool):
    if not user_obj.is_active:
        raise WorkflowError(f"{user_obj.full_name} is inactive.", field="driver" if driver else "technician")
    if driver and user_obj.staff_level != StaffLevel.DRIVER:
        raise WorkflowError(f"{user_obj.full_name} is not a driver.", field="driver")


@transaction.atomic
def assign_driver(order: Order, driver, user, note: str = "", request=None) -> Order:
    order = _lock(order)
    _require_type(order, OrderType.EXPRESS)
    _check_assignee(driver, driver=True)
    details = order.express
    reassign_ok = {ExpressStatus.DRIVER_ASSIGNED, ExpressStatus.PICKED_UP, ExpressStatus.AT_AGIZA_CENTER,
                   ExpressStatus.IN_TRANSIT, ExpressStatus.ARRIVED}
    if order.status == ExpressStatus.ACCEPTED:
        if details.advance_required:
            paid = payment_summary(order).paid
            if paid < details.advance_amount:
                raise WorkflowError(
                    f"The required advance payment of {details.advance_amount:,.0f} {order.currency} "
                    f"hasn't been received yet (paid {paid:,.0f}).",
                    conflict=True,
                )
        details.driver = driver
        details.save(update_fields=["driver"])
        _check_transition(order, ExpressStatus.DRIVER_ASSIGNED, via_action="assign-driver")
        _set_status(order, ExpressStatus.DRIVER_ASSIGNED, user, note or f"Driver: {driver.full_name}", request)
    elif order.status in reassign_ok:
        previous = details.driver
        details.driver = driver
        details.save(update_fields=["driver"])
        _history(order, order.status, order.status, user,
                 note or f"Driver changed from {previous.full_name if previous else '—'} to {driver.full_name}")
        record_audit(action="update", request=request, actor=user, instance=order,
                     changes={"driver": [previous.pk if previous else None, driver.pk]})
    else:
        raise WorkflowError("A driver can be assigned once the customer has accepted the quote.", conflict=True)
    from apps.deliveries import services as deliveries

    deliveries.sync_express(order, user)
    return order


# --------------------------------------------------------------------------- #
# Equipment support actions
# --------------------------------------------------------------------------- #
@transaction.atomic
def assign_technician(order: Order, technician, user, note: str = "", request=None) -> Order:
    order = _lock(order)
    _require_type(order, OrderType.EQUIPMENT)
    _check_assignee(technician, driver=False)
    details = order.equipment
    previous = details.technician
    details.technician = technician
    details.technician_assigned_at = timezone.now()
    details.save(update_fields=["technician", "technician_assigned_at"])
    order.handler = technician
    order.save(update_fields=["handler", "updated_at"])
    if order.status == EquipmentStatus.APPROVED:
        _check_transition(order, EquipmentStatus.ASSIGNED, via_action="assign-technician")
        _set_status(order, EquipmentStatus.ASSIGNED, user, note or f"Technician: {technician.full_name}", request)
    elif order.status in TERMINAL or order.status == EquipmentStatus.PENDING:
        raise WorkflowError("Approve the request before assigning a technician.", conflict=True)
    else:
        _history(order, order.status, order.status, user,
                 note or f"Technician changed from {previous.full_name if previous else '—'} to {technician.full_name}")
        record_audit(action="update", request=request, actor=user, instance=order,
                     changes={"technician": [previous.pk if previous else None, technician.pk]})
    return order


@transaction.atomic
def set_expected_date(order: Order, expected, user, request=None) -> Order:
    order = _lock(order)
    _require_type(order, OrderType.EQUIPMENT)
    if order.status in TERMINAL:
        raise WorkflowError("The service date of a closed order can't change.", conflict=True)
    details = order.equipment
    before = details.expected_date
    details.expected_date = expected
    details.save(update_fields=["expected_date"])
    record_audit(action="update", request=request, actor=user, instance=order,
                 changes={"expected_date": [before.isoformat() if before else None, expected.isoformat()]})
    return order
