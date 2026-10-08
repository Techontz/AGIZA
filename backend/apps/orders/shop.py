"""
E-commerce shop orders: order lines with captured prices, stock reserved on
creation, deducted when shipped (which opens the delivery), released on
cancellation. Delivered is set by the delivery's proof of delivery.
"""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.core.audit import record_audit
from apps.core.workflow import WorkflowError
from apps.inventory import services as inventory

from . import services
from .models import Order, OrderItem, ShopDetails
from .workflows import OrderType, ShopStatus


@transaction.atomic
def create_shop_order(*, customer, items: list[dict], shipping_address: str, user, city=None, area: str = "",
                      customer_email: str = "", channel: str = ShopDetails.Channel.WEB,
                      delivery_fee: Decimal = Decimal("0"), notes: str = "", request=None,
                      delivery_address=None, shipping_method=None, estimated_delivery: str = "",
                      payment_preference: str = "", shipping_allocation: dict | None = None,
                      import_shipping_method=None, import_fee: Decimal = Decimal("0"),
                      prepayment_required: bool = False, payment_due_at=None,
                      customs_fee: Decimal = Decimal("0"), customs_status: str = "",
                      customs_charges: dict | None = None, delivery_fee_pending: bool = False,
                      delivery_issue: str = "") -> Order:
    """
    items: [{"variant": ProductVariant, "quantity": int, "unit_price": Decimal | None, "sourced_abroad": bool}]
    shipping_allocation: {vendor_id or None: fee} — which seller's items each part of the delivery fee is for.
    A line `sourced_abroad` (an imported item) takes stock if some is held, else AGIZA buys it for the order.
    delivery_fee_pending: the delivery needs a manual quote; staff set it later (set_delivery_fee).
    """
    if not items:
        raise WorkflowError("Add at least one item.", field="items")
    seen = set()
    for line in items:
        variant = line["variant"]
        if variant.pk in seen:
            raise WorkflowError(f"{variant.sku} is listed twice.", field="items")
        seen.add(variant.pk)
        product = variant.product
        if product.status != "active" or variant.status != "active":
            raise WorkflowError(f"{product.name} ({variant.sku}) isn't available for sale.", field="items")
    lines = []
    subtotal = Decimal("0")
    for line in items:
        variant, qty = line["variant"], int(line["quantity"])
        if qty < 1:
            raise WorkflowError("Quantities must be at least 1.", field="items")
        price = line.get("unit_price")
        price = variant.effective_price if price is None else price
        total = (price * qty).quantize(Decimal("0.01"))
        subtotal += total
        lines.append((variant, qty, price, total, bool(line.get("sourced_abroad"))))
    order = services.create_order(
        OrderType.SHOP, customer=customer, item_details=", ".join(f"{q}× {v.product.name}" for v, q, *_ in lines)[:255],
        user=user, request=request, notes=notes, total_amount=subtotal + delivery_fee + customs_fee,
        details={"customer_email": customer_email or customer.email, "shipping_address": shipping_address,
                 "city": city, "area": area, "channel": channel, "delivery_fee": delivery_fee,
                 "delivery_address": delivery_address, "shipping_method": shipping_method,
                 "estimated_delivery": estimated_delivery, "payment_preference": payment_preference,
                 "import_shipping_method": import_shipping_method, "import_fee": import_fee,
                 "prepayment_required": prepayment_required, "payment_due_at": payment_due_at,
                 "customs_fee": customs_fee, "customs_status": customs_status,
                 "customs_charges": customs_charges or {}, "delivery_fee_pending": delivery_fee_pending,
                 "delivery_issue": delivery_issue},
    )
    for variant, qty, price, total, abroad in lines:
        try:
            warehouse = inventory.reserve(variant, qty, order=order, user=user,
                                          preferred=variant.product.location).warehouse
        except WorkflowError:
            if not abroad:
                raise
            warehouse = None  # nothing held: bought abroad for this order
        OrderItem.objects.create(order=order, variant=variant, product_name=variant.product.name,
                                 variant_name="" if variant.is_default else variant.name, sku=variant.sku,
                                 quantity=qty, unit_price=price, unit_cost=variant.effective_cost, line_total=total,
                                 warehouse=warehouse, sourced_abroad=abroad and warehouse is None)
    first = order.items.exclude(warehouse__isnull=True).first()
    ShopDetails.objects.filter(order=order).update(fulfillment_warehouse=first.warehouse if first else None)
    from apps.marketplace import services as marketplace

    marketplace.record_order(order, shipping_allocation=shipping_allocation)
    from apps.deliveries import pickups

    pickups.plan(order)
    return order


DELIVERY_FEE_SET_TITLE = "Delivery cost confirmed — you can now pay"


@transaction.atomic
def set_delivery_fee(order: Order, *, user, fee: Decimal, shipping_method=None, estimated_delivery: str | None = None,
                     note: str = "", request=None) -> Order:
    """
    Staff set the delivery cost of an order placed while it needed a manual quote (ShopDetails.delivery_fee_pending).
    `fee` is the delivery to the customer's address; any import shipping charged at checkout stays. The total goes
    up by `fee`, the sellers' delivery shares follow, a prepaid order's payment window starts now, and the customer
    is told they can pay.
    """
    order = services._lock(order)
    services._require_type(order, OrderType.SHOP)
    details = ShopDetails.objects.select_for_update().get(order=order)
    if not details.delivery_fee_pending:
        raise WorkflowError("The delivery cost of this order is already set.", conflict=True)
    if order.status == ShopStatus.CANCELLED:
        raise WorkflowError("This order is cancelled.", conflict=True)
    if fee is None or fee < 0:
        raise WorkflowError("Enter the delivery cost (0 or more).", field="delivery_fee")
    before = {"delivery_fee": str(details.delivery_fee), "total_amount": str(order.total_amount),
              "shipping_method": details.shipping_method_id, "estimated_delivery": details.estimated_delivery}
    details.delivery_fee += fee
    details.delivery_fee_pending = False
    fields = ["delivery_fee", "delivery_fee_pending"]
    if shipping_method is not None:
        details.shipping_method = shipping_method
        fields.append("shipping_method")
    if estimated_delivery is not None and estimated_delivery.strip():
        details.estimated_delivery = estimated_delivery.strip()[:60]
        fields.append("estimated_delivery")
    if details.prepayment_required:  # the payment window starts once the customer can pay
        from apps.shipping_engine.models import EngineSettings

        details.payment_due_at = timezone.now() + timedelta(hours=EngineSettings.load().import_payment_window_hours)
        fields.append("payment_due_at")
    details.save(update_fields=fields)
    order.total_amount = (order.total_amount or Decimal("0")) + fee
    order.save(update_fields=["total_amount", "updated_at"])
    _share_delivery_fee(order, fee)

    amount = f"{fee:,.2f} {order.currency}"
    message = f"Delivery cost set: {amount}" + (f" · {note.strip()}" if note.strip() else "")
    services._history(order, order.status, order.status, user, message)  # no status change
    record_audit(action="update", request=request, actor=user, instance=order, changes={
        "delivery_fee": [before["delivery_fee"], str(details.delivery_fee)],
        "total_amount": [before["total_amount"], str(order.total_amount)],
        "delivery_fee_pending": [True, False],
        **({"shipping_method": [before["shipping_method"], details.shipping_method_id]}
           if "shipping_method" in fields else {}),
        **({"estimated_delivery": [before["estimated_delivery"], details.estimated_delivery]}
           if "estimated_delivery" in fields else {}),
    })
    _tell_customer_fee_set(order, amount)
    return order


def _share_delivery_fee(order: Order, fee: Decimal):
    """Add the delivery cost to the sellers' parts of the order, in proportion to their items (vendor accounting)."""
    from apps.marketplace.models import VendorFulfillment
    from apps.marketplace.services import _split

    parts = list(VendorFulfillment.objects.select_for_update().filter(order=order).exclude(status="cancelled")
                 .order_by("id"))
    if not parts or not fee:
        return
    shares = _split(fee, {p.pk: p.subtotal for p in parts})
    for part in parts:
        part.shipping_fee += shares.get(part.pk, Decimal("0"))
        part.save(update_fields=["shipping_fee"])


def _tell_customer_fee_set(order: Order, amount: str):
    from apps.storefront.notifications import notify

    from .expiry import _sms

    body = (f"The delivery cost of order {order.reference} is {amount}. "
            f"Your total is {order.total_amount:,.2f} {order.currency}: you can now pay.")
    notify(order.customer, title=DELIVERY_FEE_SET_TITLE, body=body,
           data={"type": "order_status", "order": order.reference, "screen": "order"})
    if not hasattr(order.customer, "account"):  # a guest has no app inbox: text them (once saved) if SMS is set up
        phone = order.customer.phone
        transaction.on_commit(lambda: _sms(phone, f"AGIZA: {body} Open the order link you received to pay."))


def _live_lines(order):
    """Order lines still being supplied (a seller's cancelled part has already released its stock)."""
    return (order.items.select_related("variant", "warehouse", "fulfillment")
            .exclude(fulfillment__status="cancelled"))


@transaction.atomic
def ship(order: Order, *, user, driver=None, scheduled_at=None, note: str = "", request=None) -> Order:
    """Stock leaves the warehouse and the last-mile delivery is opened."""
    order = services._lock(order)
    services._require_type(order, OrderType.SHOP)
    services._check_transition(order, ShopStatus.SHIPPED, via_action="ship")
    if order.shop.delivery_fee_pending:
        raise WorkflowError("Set the delivery cost of this order first.", conflict=True)
    from apps.marketplace import services as marketplace

    waiting = marketplace.waiting_for_vendors(order)
    if waiting:
        raise WorkflowError(f"Waiting for {', '.join(waiting)} to mark their items ready for pickup.", conflict=True)
    from apps.deliveries import pickups as pickup_tasks

    # Items kept in several places are collected to an AGIZA hub first (pickup tasks), then delivered.
    hub = pickup_tasks.require_consolidated(order)
    for line in _live_lines(order).exclude(warehouse__isnull=True):  # items bought abroad held no stock here
        inventory.dispatch(line, user=user)
    details = order.shop
    details.shipped_at = timezone.now()
    details.save(update_fields=["shipped_at"])
    services._set_status(order, ShopStatus.SHIPPED, user, note or "Shipped", request)

    from apps.deliveries import services as deliveries
    from apps.deliveries.models import DeliveryType

    warehouse = details.fulfillment_warehouse
    if hub is not None:
        warehouse = hub
    pickups = [warehouse.name] if hub is not None else list(dict.fromkeys(
        line.warehouse.name for line in _live_lines(order) if line.warehouse_id))
    if hub is None and _live_lines(order).first() is not None:
        warehouse = _live_lines(order).first().warehouse or warehouse
    same_city = details.city_id and warehouse and warehouse.city_id == details.city_id
    delivery = deliveries.create_delivery(
        order, user=user, delivery_address=details.shipping_address, destination_city=details.city,
        destination_area=details.area, pickup_point=" + ".join(pickups)[:255] if pickups else (warehouse.name if warehouse else ""),
        pickup_warehouse=warehouse, scheduled_at=scheduled_at,
        delivery_type=DeliveryType.STANDARD if same_city or not details.city_id else DeliveryType.INTER_CITY,
        request=request,
    )
    if driver:
        deliveries.assign_driver(delivery, driver, user=user, scheduled_at=scheduled_at, request=request)
    return order


@transaction.atomic
def cancel(order: Order, *, user, reason: str, request=None) -> Order:
    order = services._lock(order)
    services._require_type(order, OrderType.SHOP)
    if not reason.strip():
        raise WorkflowError("Give the reason for cancelling.", field="reason")
    services._check_transition(order, ShopStatus.CANCELLED, via_action="cancel")
    for line in _live_lines(order):
        inventory.release(line, user=user, note=f"{order.reference} cancelled")
    services._set_status(order, ShopStatus.CANCELLED, user, reason, request)
    record_audit(action="update", request=request, actor=user, instance=order, changes={"cancel_reason": [None, reason]})
    return order


def on_delivered(order: Order, user, request=None):
    if order.status == ShopStatus.SHIPPED:
        services.advance(order, ShopStatus.DELIVERED, user, via_action="deliver", note="Delivered", request=request)
