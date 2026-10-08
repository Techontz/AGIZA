"""
Customer tracking timelines, built only from recorded events (status history,
payments, deliveries, cargo shipments). Nothing is estimated or invented: a step
is completed when its event happened, with that event's date.

International orders keep the eight customer-facing steps of the old AGIZA app
(placed, payment, processing, shipped from origin, in transit, customs, ready,
delivered), mapped onto the current order workflow.
"""
from __future__ import annotations

from apps.deliveries.models import DeliveryStatus
from apps.orders.services import is_imported, payment_summary
from apps.orders.workflows import EquipmentStatus, ExpressStatus, InternationalStatus, OrderType, ShopStatus

I, E, Q, P = InternationalStatus, ExpressStatus, EquipmentStatus, ShopStatus
PAYMENT = "__payment__"

# (key, label, statuses that mean the step happened)
STEPS = {
    OrderType.SHOP: [
        ("placed", "Order placed", {P.PENDING}),
        ("payment", "Payment received", {PAYMENT}),
        ("processing", "Preparing your order", {P.PROCESSING}),
        ("shipped", "Shipped", {P.SHIPPED}),
        ("out_for_delivery", "Out for delivery", {DeliveryStatus.OUT_FOR_DELIVERY}),
        ("delivered", "Delivered", {P.DELIVERED}),
    ],
    OrderType.INTERNATIONAL: [
        # "Deliver for Me" orders start at Waiting to Receive (Agiza-sourced ones reach it later, after
        # the placed date, so it never moves their "placed" date).
        ("placed", "Order placed", {I.PENDING_PAYMENT, I.ISSUE_PENDING_PAYMENT, I.WAITING_TO_RECEIVE}),
        ("payment", "Payment confirmed", {PAYMENT}),
        ("processing", "Processing with supplier", {I.SUPPLIER_CONFIRMED, I.PAID_SUPPLIER, I.IN_PRODUCTION}),
        ("shipped_from_origin", "Shipped from origin", {I.SENT_TO_CONSOLIDATION}),
        ("in_transit", "In transit to Tanzania", {I.SHIPPING_TO_DESTINATION}),
        ("customs_clearance", "Customs clearance", {I.CLEARANCE}),
        ("ready", "Ready for collection / delivery", {I.READY_FOR_COLLECTION}),
        ("delivered", "Delivered", {I.COMPLETED}),
    ],
    OrderType.EXPRESS: [
        ("placed", "Request received", {E.WAITING_QUOTE}),
        ("quoted", "Price quoted", {E.QUOTED, E.ACCEPTED}),
        ("driver", "Driver assigned", {E.DRIVER_ASSIGNED}),
        ("picked_up", "Picked up", {E.PICKED_UP}),
        ("in_transit", "In transit", {E.AT_AGIZA_CENTER, E.IN_TRANSIT, E.ARRIVED}),
        ("delivered", "Delivered", {E.DELIVERED}),
    ],
    OrderType.EQUIPMENT: [
        ("placed", "Request received", {Q.PENDING}),
        ("approved", "Approved", {Q.APPROVED}),
        ("assigned", "Technician assigned", {Q.ASSIGNED}),
        ("in_progress", "Work in progress", {Q.ON_SITE, Q.IN_PROGRESS, Q.TESTING}),
        ("completed", "Completed", {Q.COMPLETED, Q.MAINTENANCE_REQUIRED}),
    ],
}


# Shop orders with imported items: the trip to Tanzania comes between preparing and shipping.
SHOP_IMPORT_STEPS = [
    ("placed", "Order placed", {P.PENDING}),
    ("payment", "Payment received", {PAYMENT}),
    ("processing", "Preparing your order", {P.PROCESSING, P.ORDERED_FROM_SUPPLIER}),
    ("shipped_from_origin", "At our warehouse abroad", {P.AT_ORIGIN_WAREHOUSE}),
    ("in_transit", "In transit to Tanzania", {P.SHIPPING_TO_DESTINATION}),
    ("customs_clearance", "Customs clearance", {P.CLEARANCE}),
    ("arrived", "Arrived in Tanzania", {P.ARRIVED}),
    ("shipped", "Shipped", {P.SHIPPED}),
    ("out_for_delivery", "Out for delivery", {DeliveryStatus.OUT_FOR_DELIVERY}),
    ("delivered", "Delivered", {P.DELIVERED}),
]


def _steps(order) -> list:
    if order.order_type == OrderType.SHOP and is_imported(order):
        return SHOP_IMPORT_STEPS
    return STEPS[OrderType(order.order_type)]


# "Deliver for Me": the customer bought the goods, so there's no supplier step — we wait for the parcel.
DELIVER_FOR_ME_LABELS = {"processing": "Waiting for your parcel at our warehouse",
                         "shipped_from_origin": "Received at our warehouse"}


def _labels(order) -> dict:
    if order.order_type != OrderType.INTERNATIONAL:
        return {}
    details = getattr(order, "international", None)
    return DELIVER_FOR_ME_LABELS if details and details.service_type == "deliver_for_me" else {}


def _payment_date(order):
    """When payments first covered the total (fully paid), else None."""
    total = order.total_amount
    if not total:
        return None
    running = 0
    for payment in sorted(order.payments.all(), key=lambda p: p.paid_at):
        running += -payment.amount if payment.kind == "refund" else payment.amount
        if running >= total:
            return payment.paid_at
    return None


def timeline(order) -> dict:
    reached: dict[str, object] = {}
    for row in order.status_history.all():
        reached.setdefault(row.to_status, row.created_at)
    for delivery in order.deliveries.all():
        for event in delivery.events.all():
            reached.setdefault(event.to_status, event.created_at)
    paid_at = _payment_date(order)
    if paid_at:
        reached[PAYMENT] = paid_at

    steps = []
    labels = _labels(order)
    for key, label, statuses in _steps(order):
        dates = [reached[s] for s in statuses if s in reached]
        steps.append({"key": key, "label": labels.get(key, label), "at": min(dates) if dates else None})
    # A later step having happened means earlier progress steps are done too (a status may be skipped).
    # Payment is the exception: it is completed only by real payments (pay-later orders ship unpaid).
    last_done = max((i for i, s in enumerate(steps) if s["at"] and s["key"] != "payment"), default=-1)
    cancelled = order.status == "cancelled"
    upcoming = next((i for i in range(last_done + 1, len(steps)) if steps[i]["key"] != "payment"), None)
    for i, step in enumerate(steps):
        if step["at"] or (i < last_done and step["key"] != "payment"):
            step["state"] = "completed"
        elif step["key"] == "payment":
            step["state"] = "pending"
        elif i == upcoming and not cancelled:
            step["state"] = "current"
        else:
            step["state"] = "pending"
    return {
        "steps": steps,
        "cancelled": cancelled,
        "cancelled_at": reached.get("cancelled") if cancelled else None,
        "payment": payment_summary(order).as_dict,
    }


def cargo_milestones(order) -> list[dict]:
    """Shipment milestones for international cargo (from the Shipping module), if it has shipped."""
    from apps.shipping.services import milestone_timeline

    parcel = getattr(order, "cargo", None)
    if parcel is None or parcel.shipment_id is None:
        return []
    shipment = parcel.shipment
    return milestone_timeline(parcel, shipment, list(shipment.events.all()))
