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
    logger.info("Vendor %s (%s): %s → %s by user %s", vendor.pk, vendor.slug, from_status, to_status,
                getattr(user, "pk", None))
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
    if fulfillment.issue_open:
        raise WorkflowError("You reported a problem on this order; wait for AGIZA's decision.", conflict=True)
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
        from apps.deliveries import pickups

        pickups.on_vendor_ready(fulfillment)
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


def _fully_paid(order) -> bool:
    """Everything charged was received. Later refunds don't count against it: they are reconciled
    separately (vendor refund debits), so settled earnings never flip back to pending."""
    from django.db.models import Sum

    from apps.orders.models import Payment

    received = (order.payments.exclude(kind=Payment.Kind.REFUND).aggregate(t=Sum("amount"))["t"]
                or Decimal("0"))
    return order.total_amount is not None and received >= order.total_amount


def refresh_settlement(order):
    """
    Vendor earnings become payable once the order is delivered AND fully paid (posted to the vendor
    ledger then, once); a cancelled order voids them. Parts already payable, settled or cancelled
    don't move back.
    """
    from . import ledger

    if order.status == "cancelled":
        target = SettlementStatus.VOID
    elif order.status == "delivered" and _fully_paid(order):
        target = SettlementStatus.PAYABLE
    else:
        target = SettlementStatus.PENDING
    rows = (VendorFulfillment.objects.select_for_update().filter(order=order, vendor__isnull=False)
            .exclude(settlement_status__in=[SettlementStatus.SETTLED, SettlementStatus.PAYABLE, target]))
    if target != SettlementStatus.VOID:  # a seller's cancelled part stays void
        rows = rows.exclude(status=FulfillmentStatus.CANCELLED)
    for f in rows.select_related("order", "vendor"):
        f.settlement_status = target
        f.save(update_fields=["settlement_status", "updated_at"])
        if target == SettlementStatus.PAYABLE:
            ledger.post_earning(f)


def on_payment(order):
    refresh_settlement(order)


# --------------------------------------------------------------------------- #
# Payouts: see apps.marketplace.ledger (append-only ledger, payout lifecycle)
# --------------------------------------------------------------------------- #
def record_payout(vendor: Vendor, *, user, method: str, paid_at=None, transaction_reference: str = "",
                  notes: str = "", request=None) -> VendorPayout:
    """A transfer already made to the vendor: its whole payable balance, recorded as paid."""
    from . import ledger

    return ledger.record_payout(vendor, user=user, method=method, transaction_reference=transaction_reference,
                                paid_at=paid_at, notes=notes, request=request)


# --------------------------------------------------------------------------- #
# Fulfilment problems reported by vendors
# --------------------------------------------------------------------------- #
@transaction.atomic
def report_issue(fulfillment: VendorFulfillment, *, vendor: Vendor, issue_type: str, note: str,
                 request=None) -> VendorFulfillment:
    """A vendor can't (fully) supply its part. It reports why; AGIZA decides what happens next."""
    from .models import IssueType

    fulfillment = VendorFulfillment.objects.select_for_update().select_related("order", "vendor").get(pk=fulfillment.pk)
    if fulfillment.vendor_id != vendor.pk:
        raise WorkflowError("Order not found.", conflict=True)
    if issue_type not in IssueType.values:
        raise WorkflowError("Choose what the problem is.", field="issue_type")
    note = note.strip()
    if len(note) < 5:
        raise WorkflowError("Explain the problem so AGIZA can help the customer.", field="note")
    if fulfillment.status not in (FulfillmentStatus.PENDING, FulfillmentStatus.ACCEPTED, FulfillmentStatus.READY) \
            or fulfillment.order.status in ("shipped", "delivered", "cancelled"):
        raise WorkflowError("This order can no longer be changed. Contact AGIZA.", conflict=True)
    if fulfillment.issue_open:
        raise WorkflowError("A problem is already reported on this order; AGIZA is looking at it.", conflict=True)
    fulfillment.issue_type = issue_type
    fulfillment.issue_note = note
    fulfillment.issue_reported_at = timezone.now()
    fulfillment.issue_resolved_at = None
    fulfillment.issue_resolution = ""
    fulfillment.save(update_fields=["issue_type", "issue_note", "issue_reported_at", "issue_resolved_at",
                                    "issue_resolution", "updated_at"])
    FulfillmentEvent.objects.create(fulfillment=fulfillment, from_status=fulfillment.status,
                                    to_status=fulfillment.status, by_vendor=True,
                                    note=f"Problem reported: {IssueType(issue_type).label}")
    record_audit(action="update", request=request, actor=None, instance=fulfillment.order,
                 changes={f"vendor_{vendor.pk}_issue": [None, issue_type], "note": [None, note]},
                 object_repr=f"{fulfillment.reference} · {vendor.name}")
    logger.info("Fulfilment problem reported on %s by vendor %s: %s", fulfillment.reference, vendor.pk, issue_type)
    _notify_staff(f"Fulfilment problem · {fulfillment.order.reference}",
                  f"{vendor.name}: {IssueType(issue_type).label}. {note}"[:500],
                  f"/orders/ecommerce?search={fulfillment.order.reference}")
    from apps.storefront.notifications import notify

    notify(fulfillment.order.customer, title=f"Update on order {fulfillment.order.reference}",
           body="A seller reported a problem with part of your order. AGIZA is on it and will update you.",
           data={"type": "order", "order": fulfillment.order.reference, "screen": "order"})
    return fulfillment


@transaction.atomic
def resolve_issue(fulfillment: VendorFulfillment, *, user, action: str, note: str, request=None) -> VendorFulfillment:
    """AGIZA's decision: carry on with this seller's part, or cancel only that part."""
    fulfillment = VendorFulfillment.objects.select_for_update().get(pk=fulfillment.pk)
    if not fulfillment.issue_open:
        raise WorkflowError("There is no open problem on this order part.", conflict=True)
    note = note.strip()
    if not note:
        raise WorkflowError("Say what was decided.", field="note")
    if action == "continue":
        fulfillment.issue_resolved_at = timezone.now()
        fulfillment.issue_resolution = note
        fulfillment.save(update_fields=["issue_resolved_at", "issue_resolution", "updated_at"])
        FulfillmentEvent.objects.create(fulfillment=fulfillment, from_status=fulfillment.status,
                                        to_status=fulfillment.status, changed_by=user, note=f"Resolved: {note}"[:255])
        if fulfillment.vendor_id:
            _notify_owner(fulfillment.vendor, f"Order {fulfillment.order.reference}", f"AGIZA: {note}",
                          {"fulfillment": fulfillment.pk})
    elif action == "cancel_part":
        cancel_part(fulfillment, user=user, reason=note, request=request)
    else:
        raise WorkflowError("Choose continue or cancel_part.", field="action")
    record_audit(action="status_change", request=request, actor=user, instance=fulfillment.order,
                 changes={f"fulfillment_{fulfillment.pk}_issue": ["open", action], "note": [None, note]})
    return fulfillment


@transaction.atomic
def cancel_part(fulfillment: VendorFulfillment, *, user, reason: str, request=None):
    """
    Cancel one seller's part and keep the rest of the order. Its stock is released, its earnings
    void and its pickup cancelled. The order total goes down by the part's goods and delivery share
    (an explicit OrderAdjustment row keeps the before/after), and if the customer had already paid
    more than the new total, a refund is opened for AGIZA to pay back.
    """
    from apps.inventory import services as inventory
    from apps.orders import services as order_services
    from apps.orders.models import OrderAdjustment
    from apps.orders.workflows import ShopStatus

    order = order_services._lock(fulfillment.order)
    fulfillment = VendorFulfillment.objects.select_for_update().get(pk=fulfillment.pk)
    if fulfillment.status in (FulfillmentStatus.CANCELLED, FulfillmentStatus.SHIPPED, FulfillmentStatus.DELIVERED):
        raise WorkflowError("This part of the order can't be cancelled now.", conflict=True)
    if order.status not in (ShopStatus.PENDING, ShopStatus.PROCESSING):
        raise WorkflowError(f"{order.reference} has already left; handle it as a return.", conflict=True)
    remaining = order.fulfillments.exclude(pk=fulfillment.pk).exclude(status=FulfillmentStatus.CANCELLED)
    if not remaining.exists():  # nothing else left: cancel the whole order the usual way
        from apps.orders import shop

        shop.cancel(order, user=user, reason=reason, request=request)
        _close_issue(fulfillment, user, reason)
        return fulfillment
    seller = fulfillment.vendor.name if fulfillment.vendor_id else "AGIZA"
    for line in fulfillment.items.select_related("variant", "warehouse", "order"):
        inventory.release(line, user=user, note=f"{order.reference}: {seller} part cancelled")
    _event(fulfillment, FulfillmentStatus.CANCELLED, user=user, note=f"Cancelled: {reason}")
    fulfillment.settlement_status = SettlementStatus.VOID
    fulfillment.save(update_fields=["status", "settlement_status", "updated_at"])
    _close_issue(fulfillment, user, reason)
    task = getattr(fulfillment, "pickup_task", None)
    if task is not None:
        from apps.deliveries import pickups

        pickups.cancel(task, user=user, note=reason)
    amount = fulfillment.subtotal + fulfillment.shipping_fee
    before = order.total_amount or Decimal("0")
    after = max(before - amount, Decimal("0"))
    OrderAdjustment.objects.create(order=order, amount=after - before, total_before=before, total_after=after,
                                   reason=f"{seller} part cancelled: {reason}"[:255],
                                   fulfillment=fulfillment, created_by=user)
    order.total_amount = after
    order.save(update_fields=["total_amount", "updated_at"])
    record_audit(action="update", request=request, actor=user, instance=order,
                 changes={"total_amount": [str(before), str(after)], "reason": [None, reason]})
    paid = order_services.net_paid(order)
    if paid > after:
        from apps.returns import services as returns

        returns.open_refund_obligation(order, fulfillment=fulfillment, amount=min(paid - after, amount), user=user,
                                       reason=reason)
    from apps.storefront.notifications import notify

    notify(order.customer, title=f"Order {order.reference} updated",
           body=f"Part of your order couldn't be supplied and was removed. New total: {after:,.0f} {order.currency}.",
           data={"type": "order", "order": order.reference, "screen": "order"})
    if fulfillment.vendor_id:
        _notify_owner(fulfillment.vendor, f"Order {order.reference} cancelled", reason, {"fulfillment": fulfillment.pk})
    refresh_settlement(order)
    return fulfillment


def _close_issue(fulfillment, user, reason):
    if fulfillment.issue_reported_at and not fulfillment.issue_resolved_at:
        fulfillment.issue_resolved_at = timezone.now()
        fulfillment.issue_resolution = f"Part cancelled: {reason}"
        fulfillment.save(update_fields=["issue_resolved_at", "issue_resolution", "updated_at"])
