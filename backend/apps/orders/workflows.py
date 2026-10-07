"""
Order state machines. Django is the only place statuses may change: every
change must be an allowed transition from the current status.
"""
from django.db import models


class OrderType(models.TextChoices):
    EXPRESS = "express", "Express Delivery"
    INTERNATIONAL = "international", "International"
    EQUIPMENT = "equipment", "Equipment Support"
    SHOP = "shop", "E-commerce Shop"


REFERENCE_PREFIX = {OrderType.EXPRESS: "EXP", OrderType.INTERNATIONAL: "INT", OrderType.EQUIPMENT: "EQ",
                    OrderType.SHOP: "ECO"}


# --------------------------------------------------------------------------- #
# Express delivery
# --------------------------------------------------------------------------- #
class ExpressStatus(models.TextChoices):
    WAITING_QUOTE = "waiting_quote", "Waiting Quote"
    QUOTED = "quoted", "Quoted"
    ACCEPTED = "accepted", "Accepted"
    REJECTED = "rejected", "Rejected"
    DRIVER_ASSIGNED = "driver_assigned", "Driver Assigned"
    PICKED_UP = "picked_up", "Picked Up"
    AT_AGIZA_CENTER = "at_agiza_center", "At Agiza Reroute Center"
    IN_TRANSIT = "in_transit", "In Transit"
    ARRIVED = "arrived", "Arrived at Destination City"
    DELIVERED = "delivered", "Delivered"
    CANCELLED = "cancelled", "Cancelled"


# The design groups statuses into three stages (tabs / stat cards).
EXPRESS_STAGE = {
    ExpressStatus.WAITING_QUOTE: "waiting_quote",
    ExpressStatus.QUOTED: "quoted",
    ExpressStatus.ACCEPTED: "quoted",
    ExpressStatus.REJECTED: "quoted",
    ExpressStatus.DRIVER_ASSIGNED: "in_progress",
    ExpressStatus.PICKED_UP: "in_progress",
    ExpressStatus.AT_AGIZA_CENTER: "in_progress",
    ExpressStatus.IN_TRANSIT: "in_progress",
    ExpressStatus.ARRIVED: "in_progress",
    ExpressStatus.DELIVERED: "in_progress",
    ExpressStatus.CANCELLED: "cancelled",
}

E = ExpressStatus
EXPRESS_TRANSITIONS = {
    E.WAITING_QUOTE: {E.QUOTED, E.CANCELLED},
    E.QUOTED: {E.ACCEPTED, E.REJECTED, E.CANCELLED},
    E.REJECTED: {E.QUOTED, E.CANCELLED},
    E.ACCEPTED: {E.QUOTED, E.DRIVER_ASSIGNED, E.CANCELLED},
    E.DRIVER_ASSIGNED: {E.PICKED_UP, E.CANCELLED},
    E.PICKED_UP: {E.AT_AGIZA_CENTER, E.IN_TRANSIT},
    E.AT_AGIZA_CENTER: {E.IN_TRANSIT},
    E.IN_TRANSIT: {E.AT_AGIZA_CENTER, E.ARRIVED},
    E.ARRIVED: {E.DELIVERED},
    E.DELIVERED: set(),
    E.CANCELLED: set(),
}
# Statuses that only special actions may reach (they need extra data).
EXPRESS_ACTION_ONLY = {E.QUOTED: "quote", E.DRIVER_ASSIGNED: "assign-driver"}


# --------------------------------------------------------------------------- #
# International
# --------------------------------------------------------------------------- #
class InternationalStatus(models.TextChoices):
    PENDING_PAYMENT = "pending_payment", "Pending Payment"
    ISSUE_PENDING_PAYMENT = "issue_pending_payment", "Issue - Pending Payment"
    SUPPLIER_CONFIRMED = "supplier_confirmed", "Supplier Confirmed"
    PAID_SUPPLIER = "paid_supplier", "Paid Supplier"
    IN_PRODUCTION = "in_production", "In Production"
    WAITING_TO_RECEIVE = "waiting_to_receive", "Waiting to Receive"
    SENT_TO_CONSOLIDATION = "sent_to_consolidation", "Sent to Consolidation"
    SHIPPING_TO_DESTINATION = "shipping_to_destination", "Shipping to Tanzania"
    CLEARANCE = "clearance", "Customs Clearance"
    READY_FOR_COLLECTION = "ready_for_collection", "Ready for Collection"
    COMPLETED = "completed", "Completed"
    CANCELLED = "cancelled", "Cancelled"


I = InternationalStatus
INTERNATIONAL_TRANSITIONS = {
    I.PENDING_PAYMENT: {I.SUPPLIER_CONFIRMED, I.ISSUE_PENDING_PAYMENT, I.CANCELLED},
    I.ISSUE_PENDING_PAYMENT: {I.PENDING_PAYMENT, I.SUPPLIER_CONFIRMED, I.CANCELLED},
    # "Deliver for Me" orders skip the supplier payment: the customer bought the goods.
    I.SUPPLIER_CONFIRMED: {I.PAID_SUPPLIER, I.SENT_TO_CONSOLIDATION, I.CANCELLED},
    # Paid Supplier / In Production → Sent to Consolidation is kept for goods expected before
    # "supplier shipped" existed; new orders go through Waiting to Receive.
    I.PAID_SUPPLIER: {I.IN_PRODUCTION, I.WAITING_TO_RECEIVE, I.SENT_TO_CONSOLIDATION},
    I.IN_PRODUCTION: {I.WAITING_TO_RECEIVE, I.SENT_TO_CONSOLIDATION},
    # Goods on their way to the consolidation warehouse: the supplier shipped them, or the
    # customer bought them ("Deliver for Me" orders start here).
    I.WAITING_TO_RECEIVE: {I.SENT_TO_CONSOLIDATION, I.CANCELLED},
    I.SENT_TO_CONSOLIDATION: {I.SHIPPING_TO_DESTINATION},
    I.SHIPPING_TO_DESTINATION: {I.CLEARANCE},
    I.CLEARANCE: {I.READY_FOR_COLLECTION},
    I.READY_FOR_COLLECTION: {I.COMPLETED},
    I.COMPLETED: set(),
    I.CANCELLED: set(),
}

# Stages owned by Procurement and Shipping: only their actions move the order
# there (paying the supplier, receiving cargo, shipment milestones).
INTERNATIONAL_ACTION_ONLY = {
    I.PAID_SUPPLIER: "procurement",
    I.WAITING_TO_RECEIVE: "supplier-shipped",
    I.SENT_TO_CONSOLIDATION: "cargo-receipt",
    I.SHIPPING_TO_DESTINATION: "shipment",
    I.CLEARANCE: "shipment",
    I.READY_FOR_COLLECTION: "shipment",
}

# Backward moves only one action may make, kept out of INTERNATIONAL_TRANSITIONS so the generic
# status change (and the "next status" dropdown) never offers them: when the supplier cancels after
# being paid or shipping, the order goes back to Supplier Confirmed to pick a new supplier.
INTERNATIONAL_ACTION_EDGES = {
    (I.PAID_SUPPLIER, I.SUPPLIER_CONFIRMED): "procurement-cancel",
    (I.IN_PRODUCTION, I.SUPPLIER_CONFIRMED): "procurement-cancel",
    (I.WAITING_TO_RECEIVE, I.SUPPLIER_CONFIRMED): "procurement-cancel",
}

# Which department owns an international order at each stage.
INTERNATIONAL_DEPARTMENT = {
    I.PENDING_PAYMENT: "procurement",
    I.ISSUE_PENDING_PAYMENT: "procurement",
    I.SUPPLIER_CONFIRMED: "procurement",
    I.PAID_SUPPLIER: "procurement",
    I.IN_PRODUCTION: "procurement",
    I.WAITING_TO_RECEIVE: "shipping",
    I.SENT_TO_CONSOLIDATION: "shipping",
    I.SHIPPING_TO_DESTINATION: "shipping",
    I.CLEARANCE: "shipping",
    I.READY_FOR_COLLECTION: "delivery",
    I.COMPLETED: "delivery",
    I.CANCELLED: "unassigned",
}


# --------------------------------------------------------------------------- #
# Equipment support
# --------------------------------------------------------------------------- #
class EquipmentStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    APPROVED = "approved", "Approved"
    ASSIGNED = "assigned", "Assigned"
    ON_SITE = "on_site", "On-Site"
    IN_PROGRESS = "in_progress", "In-Progress"
    TESTING = "testing", "Testing"
    COMPLETED = "completed", "Completed"
    MAINTENANCE_REQUIRED = "maintenance_required", "Maintenance Required"
    CANCELLED = "cancelled", "Cancelled"


Q = EquipmentStatus
EQUIPMENT_TRANSITIONS = {
    Q.PENDING: {Q.APPROVED, Q.CANCELLED},
    Q.APPROVED: {Q.ASSIGNED, Q.CANCELLED},
    Q.ASSIGNED: {Q.ON_SITE, Q.CANCELLED},
    Q.ON_SITE: {Q.IN_PROGRESS, Q.MAINTENANCE_REQUIRED},
    Q.IN_PROGRESS: {Q.TESTING, Q.MAINTENANCE_REQUIRED},
    Q.TESTING: {Q.COMPLETED, Q.IN_PROGRESS, Q.MAINTENANCE_REQUIRED},
    Q.MAINTENANCE_REQUIRED: {Q.IN_PROGRESS, Q.ASSIGNED, Q.CANCELLED},
    Q.COMPLETED: set(),
    Q.CANCELLED: set(),
}
EQUIPMENT_ACTION_ONLY = {Q.ASSIGNED: "assign-technician"}


# --------------------------------------------------------------------------- #
# E-commerce shop orders
# --------------------------------------------------------------------------- #
class ShopStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    PROCESSING = "processing", "Processing"
    SHIPPED = "shipped", "Shipped"
    DELIVERED = "delivered", "Delivered"
    CANCELLED = "cancelled", "Cancelled"


P = ShopStatus
SHOP_TRANSITIONS = {
    P.PENDING: {P.PROCESSING, P.CANCELLED},
    P.PROCESSING: {P.SHIPPED, P.CANCELLED},
    P.SHIPPED: {P.DELIVERED},
    P.DELIVERED: set(),
    P.CANCELLED: set(),
}
# Shipping deducts stock and opens the delivery; Delivered comes from the delivery's proof.
SHOP_ACTION_ONLY = {P.SHIPPED: "ship", P.DELIVERED: "deliver", P.CANCELLED: "cancel"}


# Transitions reachable only through one action, per order type: {(from, to): action}.
ACTION_EDGES = {OrderType.INTERNATIONAL: INTERNATIONAL_ACTION_EDGES}

WORKFLOWS = {
    OrderType.EXPRESS: (ExpressStatus, EXPRESS_TRANSITIONS, EXPRESS_ACTION_ONLY),
    OrderType.INTERNATIONAL: (InternationalStatus, INTERNATIONAL_TRANSITIONS, INTERNATIONAL_ACTION_ONLY),
    OrderType.EQUIPMENT: (EquipmentStatus, EQUIPMENT_TRANSITIONS, EQUIPMENT_ACTION_ONLY),
    OrderType.SHOP: (ShopStatus, SHOP_TRANSITIONS, SHOP_ACTION_ONLY),
}

TERMINAL = {"delivered", "completed", "cancelled"}


def status_label(order_type: str, status: str) -> str:
    choices = WORKFLOWS[OrderType(order_type)][0]
    return dict(choices.choices).get(status, status)


def allowed_next(order_type: str, status: str) -> list[str]:
    _, transitions, _ = WORKFLOWS[OrderType(order_type)]
    return sorted(str(s) for s in transitions.get(status, set()))
