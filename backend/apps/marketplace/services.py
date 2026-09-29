"""
Marketplace workflows. Like every other AGIZA workflow, each change goes through a
function here that checks the transition, locks the row, writes a history row and an
audit-log entry in one transaction.

Vendor lifecycle
    apply ─► pending ─► under_review ─► approved ◄─► suspended
                │  ▲          │
                ▼  │ resubmit  ▼
        changes_requested    rejected ─► under_review (AGIZA reconsiders)

Order lifecycle (per vendor part of an order)
    pending ─► accepted ─► ready   (the vendor)
            ─► shipped ─► delivered / cancelled   (follows the AGIZA order)
"""
from __future__ import annotations

import logging
from collections import defaultdict
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.utils import timezone

from apps.catalog.models import Status, Vendor
from apps.core.audit import record_audit
from apps.core.workflow import WorkflowError
from apps.locations.models import Warehouse

from . import commission as commissions
from .models import (
    VENDOR_TRANSITIONS,
    FulfillmentEvent,
    FulfillmentStatus,
    MarketplaceSettings,
    SettlementStatus,
    VendorFulfillment,
    VendorPayout,
    VendorStatusHistory,
)

logger = logging.getLogger("apps.marketplace")
A = Vendor.ApprovalStatus
CENT = Decimal("0.01")

TRANSITIONS = {
    A.PENDING: {A.UNDER_REVIEW, A.APPROVED, A.REJECTED, A.CHANGES_REQUESTED},
    A.UNDER_REVIEW: {A.APPROVED, A.REJECTED, A.CHANGES_REQUESTED},
    A.CHANGES_REQUESTED: {A.PENDING, A.REJECTED},
    A.REJECTED: {A.UNDER_REVIEW},
    A.APPROVED: {A.SUSPENDED},
    A.SUSPENDED: {A.APPROVED},
}
NOTE_REQUIRED = {A.REJECTED: "Give the reason for rejecting the application.",
                 A.CHANGES_REQUESTED: "Say what the vendor needs to change.",
                 A.SUSPENDED: "Give the reason for suspending the vendor."}
# What a vendor may still change on their own application / store.
APPLICANT_EDITABLE = {A.PENDING, A.CHANGES_REQUESTED}


# --------------------------------------------------------------------------- #
# Notifications (never block the workflow)
# --------------------------------------------------------------------------- #
def _notify_owner(vendor: Vendor, title: str, body: str, data: dict | None = None):
    if not vendor.owner_id:
        return
    from apps.storefront.push import notify_customer

    notify_customer(vendor.owner.customer, title=title, body=body,
                    data={"type": "seller", "screen": "seller", **(data or {})})


def _notify_staff(title: str, body: str, link: str):
    from apps.accounts.constants import Module
    from apps.notifications import services as notifications
    from apps.notifications.models import Notification

    notifications.notify(notifications.users_with(Module.ECOMMERCE), kind=Notification.Kind.SYSTEM,
                         title=title, body=body, link=link)


# --------------------------------------------------------------------------- #
# Vendor applications and account status
# --------------------------------------------------------------------------- #
def _history(vendor: Vendor, from_status: str, to_status: str, *, user=None, note: str = "", by_vendor=False):
    VendorStatusHistory.objects.create(vendor=vendor, from_status=from_status, to_status=to_status, note=note,
                                       changed_by=user, by_vendor=by_vendor)


def _check_name(name: str, vendor: Vendor | None = None):
    if Vendor.objects.filter(name__iexact=name.strip()).exclude(pk=getattr(vendor, "pk", None)).exists():
        raise WorkflowError("A store with this name already exists. Choose another name.", field="name")


@transaction.atomic
def apply(account, data: dict, request=None) -> Vendor:
    """An AGIZA customer asks to sell. Nothing is sold until AGIZA approves."""
    if not MarketplaceSettings.load().vendor_applications_open:
        raise WorkflowError("AGIZA isn't accepting new vendor applications right now.", conflict=True)
    if Vendor.objects.filter(owner=account).exists():
        raise WorkflowError("You have already applied to sell on AGIZA.", conflict=True)
    _check_name(data["name"])
    vendor = Vendor(owner=account, approval_status=A.PENDING, commission_mode=Vendor.CommissionMode.DEFAULT,
                    status=Status.ACTIVE, submitted_at=timezone.now(), **data)
    vendor.phone = vendor.phone or f"+{account.phone}"
    vendor.email = vendor.email or account.customer.email
    vendor.location = vendor.city.name if vendor.city_id else vendor.location
    vendor.save()
    _history(vendor, "", A.PENDING, note="Application submitted", by_vendor=True)
    record_audit(action="create", request=request, actor=None, instance=vendor,
                 changes={"application": [None, vendor.name]}, object_repr=f"Vendor application · {vendor.name}")
    _notify_staff(f"New vendor application · {vendor.name}", f"{vendor.contact_person or vendor.name} applied to sell.",
                  f"/ecommerce?section=vendors&vendor={vendor.pk}")
    return vendor


@transaction.atomic
def update_application(vendor: Vendor, data: dict, request=None) -> Vendor:
    """The applicant edits their application; after a change request this resubmits it."""
    vendor = Vendor.objects.select_for_update().get(pk=vendor.pk)
    if vendor.approval_status not in APPLICANT_EDITABLE:
        raise WorkflowError("Your application is being reviewed and can't be changed now.", conflict=True)
    if "name" in data:
        _check_name(data["name"], vendor)
    for key, value in data.items():
        setattr(vendor, key, value)
    if vendor.city_id:
        vendor.location = vendor.city.name
    from_status = vendor.approval_status
    vendor.approval_status = A.PENDING
    vendor.submitted_at = timezone.now()
    vendor.save()
    if from_status != A.PENDING:
        _history(vendor, from_status, A.PENDING, note="Application resubmitted", by_vendor=True)
        _notify_staff(f"Vendor application resubmitted · {vendor.name}", "The requested changes were made.",
                      f"/ecommerce?section=vendors&vendor={vendor.pk}")
    return vendor


def ensure_stock_location(vendor: Vendor) -> Warehouse | None:
    """The vendor's own stock location (a Warehouse of type Vendor), in step with its city and contact details."""
    if vendor.city_id is None:
        return None
    fields = {"name": f"{vendor.name} (vendor)"[:150], "country": vendor.city.country, "city": vendor.city,
              "address": vendor.business_address, "contact_person": vendor.contact_person[:150],
              "phone": vendor.phone[:32], "email": vendor.email,
              "status": Warehouse.Status.ACTIVE if vendor.is_public else Warehouse.Status.INACTIVE}
    warehouse = vendor.warehouse
    if warehouse is None:
        warehouse = Warehouse.objects.create(type=Warehouse.Type.VENDOR, **fields)
        Vendor.objects.filter(pk=vendor.pk).update(warehouse=warehouse)
        vendor.warehouse = warehouse
    else:
        changed = [k for k, v in fields.items() if getattr(warehouse, k) != v]
        if changed:
            for key in changed:
                setattr(warehouse, key, fields[key])
            warehouse.save(update_fields=[*changed, "updated_at"])
    return warehouse


@transaction.atomic
def change_status(vendor: Vendor, to_status: str, *, user, note: str = "", request=None) -> Vendor:
    """Staff review actions: start review, approve, reject, request changes, suspend, reactivate."""
    vendor = Vendor.objects.select_for_update().get(pk=vendor.pk)
    from_status = vendor.approval_status
    if to_status not in TRANSITIONS.get(from_status, set()):
        labels = dict(A.choices)
        raise WorkflowError(f"A vendor can't go from {labels[from_status]} to {labels.get(to_status, to_status)}.",
                            conflict=True)
    note = note.strip()
    if to_status in NOTE_REQUIRED and not note:
        raise WorkflowError(NOTE_REQUIRED[to_status], field="note")
    if to_status == A.APPROVED and vendor.owner_id and vendor.city_id is None:
        raise WorkflowError("Set the vendor's city first: it is where AGIZA collects their orders.", field="city")
    vendor.approval_status = to_status
    vendor.reviewed_at = timezone.now()
    vendor.reviewed_by = user
    if note:
        vendor.review_note = note
    if to_status == A.APPROVED:
        vendor.verified = True
        vendor.joined_date = vendor.joined_date or timezone.localdate()
        vendor.status = Status.ACTIVE
    vendor.save()
    if vendor.owner_id:
        ensure_stock_location(vendor)  # a suspended vendor's location stops being reservable
    _history(vendor, from_status, to_status, user=user, note=note)
    record_audit(action="status_change", request=request, actor=user, instance=vendor,
                 changes={"approval_status": [from_status, to_status], **({"note": [None, note]} if note else {})})
    messages = {
        A.APPROVED: ("Your AGIZA store is approved", "You can now add products and receive orders."),
        A.REJECTED: ("Your vendor application", f"Your application wasn't approved: {note}"),
        A.CHANGES_REQUESTED: ("Changes needed on your application", note),
        A.SUSPENDED: ("Your AGIZA store is suspended", note),
    }
    if to_status == A.APPROVED and from_status == A.SUSPENDED:
        messages[A.APPROVED] = ("Your AGIZA store is active again", "Your products are visible to customers.")
    if to_status in messages:
        _notify_owner(vendor, *messages[to_status])
    return vendor


def on_owner_account_closed(account):
    """The vendor's owner deleted their AGIZA account: the store stops selling (staff can take it over)."""
    vendor = Vendor.objects.filter(owner=account).first()
    if vendor is None:
        return
    if vendor.approval_status == A.APPROVED:
        change_status(vendor, A.SUSPENDED, user=None, note="The store owner closed their AGIZA account.")
    elif vendor.approval_status in APPLICANT_EDITABLE | {A.UNDER_REVIEW}:
        change_status(vendor, A.REJECTED, user=None, note="The applicant closed their AGIZA account.")


# --------------------------------------------------------------------------- #
# Orders: one fulfillment per seller, with commission captured at order time
# --------------------------------------------------------------------------- #
def _split(total: Decimal, weights: dict) -> dict:
    """Split `total` over keys in proportion to weights (cents stay whole; the last key takes the rounding)."""
    keys = list(weights)
    if not keys:
        return {}
    weight_sum = sum(weights.values())
    shares, given = {}, Decimal("0")
    for key in keys[:-1]:
        share = (total * weights[key] / weight_sum).quantize(CENT, rounding=ROUND_HALF_UP) if weight_sum else Decimal("0")
        shares[key] = share
        given += share
    shares[keys[-1]] = total - given
    return shares


@transaction.atomic
def record_order(order, *, shipping_allocation: dict | None = None) -> list[VendorFulfillment]:
    """
    Called when a shop order is created. Groups its lines by seller, captures who sold each
    line and AGIZA's commission, and allocates the delivery fee to the parts it pays for.
    `shipping_allocation`: {vendor_id or None: fee} from checkout; otherwise the fee is split by value.
    """
    items = list(order.items.select_related("variant__product__vendor", "variant__product__category"))
    loaded = []

    def settings():  # loaded once, and only if a vendor on marketplace rates is in the order
        if not loaded:
            loaded.append(MarketplaceSettings.load())
        return loaded[0]

    groups: dict[int | None, list] = defaultdict(list)
    for item in items:
        groups[item.variant.product.vendor_id].append(item)
    subtotals = {vid: sum((i.line_total for i in lines), Decimal("0")) for vid, lines in groups.items()}
    fee = order.shop.delivery_fee if hasattr(order, "shop") else Decimal("0")
    if shipping_allocation is not None and set(shipping_allocation) <= set(groups) \
            and sum(shipping_allocation.values(), Decimal("0")) == fee:
        fees = {vid: shipping_allocation.get(vid, Decimal("0")) for vid in groups}
    else:
        fees = _split(fee, subtotals)
    fulfillments = []
    for vendor_id, lines in groups.items():
        vendor = lines[0].variant.product.vendor
        gross = subtotals[vendor_id]
        total_commission = Decimal("0")
        for item in lines:
            product = item.variant.product
            rate = commissions.rate_for(product, vendor, settings=settings) if vendor else None
            item.vendor = vendor
            item.commission_amount = commissions.commission_for(rate, item.unit_price, item.quantity) if vendor else None
            total_commission += item.commission_amount or Decimal("0")
        fulfillment = VendorFulfillment.objects.create(
            order=order, vendor=vendor, origin=lines[0].warehouse, item_count=sum(i.quantity for i in lines),
            subtotal=gross, commission=total_commission if vendor else Decimal("0"),
            vendor_net=(gross - total_commission) if vendor else Decimal("0"), shipping_fee=fees.get(vendor_id, 0),
        )
        for item in lines:
            item.fulfillment = fulfillment
            item.save(update_fields=["vendor", "fulfillment", "commission_amount"])
        FulfillmentEvent.objects.create(fulfillment=fulfillment, to_status=FulfillmentStatus.PENDING,
                                        note="Order placed")
        fulfillments.append(fulfillment)
        if vendor is not None and vendor.owner_id:
            _notify_owner(vendor, f"New order {order.reference}",
                          f"{fulfillment.item_count} item(s) · accept it and get it ready for AGIZA to collect.",
                          {"fulfillment": fulfillment.pk})
    return fulfillments


def _event(fulfillment: VendorFulfillment, to_status: str, *, user=None, note: str = "", by_vendor=False):
    FulfillmentEvent.objects.create(fulfillment=fulfillment, from_status=fulfillment.status, to_status=to_status,
                                    note=note[:255], changed_by=user, by_vendor=by_vendor)
    fulfillment.status = to_status


@transaction.atomic
def vendor_advance(fulfillment: VendorFulfillment, to_status: str, *, vendor: Vendor, note: str = "",
                   request=None) -> VendorFulfillment:
    """The vendor accepts its part of an order, then marks it ready for AGIZA to collect."""
    fulfillment = VendorFulfillment.objects.select_for_update().select_related("order", "vendor").get(pk=fulfillment.pk)
    if fulfillment.vendor_id != vendor.pk:  # defence in depth: views already scope by vendor
        raise WorkflowError("Order not found.", conflict=True)
    if not vendor.is_public:
        raise WorkflowError("Your store is not active, so orders can't be updated.", conflict=True)
    if fulfillment.order.status == "cancelled":
        raise WorkflowError("This order was cancelled.", conflict=True)
    if to_status not in VENDOR_TRANSITIONS.get(fulfillment.status, set()):
        labels = dict(FulfillmentStatus.choices)
        raise WorkflowError(f"This order can't go from {labels[fulfillment.status]} to "
                            f"{labels.get(to_status, to_status)}.", conflict=True)
    now = timezone.now()
    _event(fulfillment, to_status, note=note, by_vendor=True)
    if to_status == FulfillmentStatus.ACCEPTED:
        fulfillment.accepted_at = now
    elif to_status == FulfillmentStatus.READY:
        fulfillment.ready_at = now
    fulfillment.save(update_fields=["status", "accepted_at", "ready_at", "updated_at"])
    record_audit(action="status_change", request=request, actor=None, instance=fulfillment.order,
                 changes={f"vendor_{vendor.pk}_fulfillment": [None, to_status]},
                 object_repr=f"{fulfillment.reference} · {vendor.name}")
    if to_status == FulfillmentStatus.READY:
        _notify_staff(f"Ready for pickup · {fulfillment.order.reference}",
                      f"{vendor.name} has {fulfillment.item_count} item(s) ready to collect.",
                      f"/orders/ecommerce?order={fulfillment.order_id}")
    return fulfillment


def waiting_for_vendors(order) -> list[str]:
    """Names of self-service vendors whose items aren't ready yet (the order can't ship before)."""
    rows = (VendorFulfillment.objects.filter(order=order, vendor__owner__isnull=False)
            .exclude(status__in=[FulfillmentStatus.READY, FulfillmentStatus.SHIPPED, FulfillmentStatus.DELIVERED,
                                 FulfillmentStatus.CANCELLED])
            .values_list("vendor__name", flat=True))
    return list(rows)


ORDER_TO_FULFILLMENT = {
    "processing": FulfillmentStatus.ACCEPTED,
    "shipped": FulfillmentStatus.SHIPPED,
    "delivered": FulfillmentStatus.DELIVERED,
    "cancelled": FulfillmentStatus.CANCELLED,
}


ORDER_LABELS = {"processing": "being prepared", "shipped": "collected and on its way", "delivered": "delivered",
                "cancelled": "cancelled"}


def on_order_status(order, to_status: str, user):
    """Keep each vendor part in step with the AGIZA order (called by orders.services)."""
    target = ORDER_TO_FULFILLMENT.get(to_status)
    if target is None:
        return
    for fulfillment in VendorFulfillment.objects.select_for_update().filter(order=order).select_related("vendor"):
        if fulfillment.status in (FulfillmentStatus.CANCELLED, FulfillmentStatus.DELIVERED):
            continue
        if target == FulfillmentStatus.ACCEPTED:
            # Staff start preparing: AGIZA's own and staff-managed vendors' items. Self-service vendors accept themselves.
            if fulfillment.status != FulfillmentStatus.PENDING or (fulfillment.vendor and fulfillment.vendor.owner_id):
                continue
        _event(fulfillment, target, user=user, note=f"Order {ORDER_LABELS[to_status]}")
        fulfillment.save(update_fields=["status", "updated_at"])
    refresh_settlement(order)


def refresh_settlement(order):
    """
    Vendor earnings become payable once the order is delivered AND fully paid; a cancelled
    order voids them. Settled (paid out) parts never change.
    """
    from apps.orders.services import payment_summary

    if order.status == "cancelled":
        target = SettlementStatus.VOID
    elif order.status == "delivered" and payment_summary(order).status == "fully_paid":
        target = SettlementStatus.PAYABLE
    else:
        target = SettlementStatus.PENDING
    (VendorFulfillment.objects.filter(order=order, vendor__isnull=False)
     .exclude(settlement_status__in=[SettlementStatus.SETTLED, target])
     .update(settlement_status=target, updated_at=timezone.now()))


def on_payment(order):
    refresh_settlement(order)


# --------------------------------------------------------------------------- #
# Payouts (recorded; the transfer itself happens outside the system)
# --------------------------------------------------------------------------- #
@transaction.atomic
def record_payout(vendor: Vendor, *, user, method: str, paid_at=None, transaction_reference: str = "",
                  notes: str = "", fulfillment_ids: list[int] | None = None, request=None) -> VendorPayout:
    rows = VendorFulfillment.objects.select_for_update().filter(vendor=vendor,
                                                                settlement_status=SettlementStatus.PAYABLE)
    if fulfillment_ids is not None:
        rows = rows.filter(pk__in=fulfillment_ids)
    rows = list(rows)
    if fulfillment_ids is not None and len(rows) != len(set(fulfillment_ids)):
        raise WorkflowError("Some of the chosen orders aren't payable (not delivered and paid, or already paid out).",
                            field="fulfillments")
    if not rows:
        raise WorkflowError(f"{vendor.name} has no payable earnings.", conflict=True)
    amount = sum((r.vendor_net for r in rows), Decimal("0"))
    if amount <= 0:
        raise WorkflowError("The payable amount is zero.", conflict=True)
    payout = VendorPayout.objects.create(vendor=vendor, amount=amount, method=method, paid_at=paid_at or timezone.now(),
                                         transaction_reference=transaction_reference, notes=notes, recorded_by=user)
    VendorFulfillment.objects.filter(pk__in=[r.pk for r in rows]).update(
        settlement_status=SettlementStatus.SETTLED, payout=payout, updated_at=timezone.now())
    record_audit(action="create", request=request, actor=user, instance=payout,
                 changes={"vendor": [None, vendor.name], "amount": [None, str(amount)], "orders": [None, len(rows)]})
    _notify_owner(vendor, "Payout sent", f"AGIZA sent you {amount:,.0f} {payout.currency} ({payout.reference}).")
    return payout
