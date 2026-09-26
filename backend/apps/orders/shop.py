"""
E-commerce shop orders: order lines with captured prices, stock reserved on
creation, deducted when shipped (which opens the delivery), released on
cancellation. Delivered is set by the delivery's proof of delivery.
"""
from __future__ import annotations

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
                      delivery_fee: Decimal = Decimal("0"), notes: str = "", request=None) -> Order:
    """items: [{"variant": ProductVariant, "quantity": int, "unit_price": Decimal | None}]"""
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
        lines.append((variant, qty, price, total))
    order = services.create_order(
        OrderType.SHOP, customer=customer, item_details=", ".join(f"{q}× {v.product.name}" for v, q, _, _ in lines)[:255],
        user=user, request=request, notes=notes, total_amount=subtotal + delivery_fee,
        details={"customer_email": customer_email or customer.email, "shipping_address": shipping_address,
                 "city": city, "area": area, "channel": channel, "delivery_fee": delivery_fee},
    )
    for variant, qty, price, total in lines:
        stock = inventory.reserve(variant, qty, order=order, user=user, preferred=variant.product.location)
        OrderItem.objects.create(order=order, variant=variant, product_name=variant.product.name,
                                 variant_name="" if variant.is_default else variant.name, sku=variant.sku,
                                 quantity=qty, unit_price=price, unit_cost=variant.effective_cost, line_total=total,
                                 warehouse=stock.warehouse)
    first = order.items.first()
    ShopDetails.objects.filter(order=order).update(fulfillment_warehouse=first.warehouse if first else None)
    return order


@transaction.atomic
def ship(order: Order, *, user, driver=None, scheduled_at=None, note: str = "", request=None) -> Order:
    """Stock leaves the warehouse and the last-mile delivery is opened."""
    order = services._lock(order)
    services._require_type(order, OrderType.SHOP)
    services._check_transition(order, ShopStatus.SHIPPED, via_action="ship")
    for line in order.items.select_related("variant", "warehouse"):
        inventory.dispatch(line, user=user)
    details = order.shop
    details.shipped_at = timezone.now()
    details.save(update_fields=["shipped_at"])
    services._set_status(order, ShopStatus.SHIPPED, user, note or "Shipped", request)

    from apps.deliveries import services as deliveries
    from apps.deliveries.models import DeliveryType

    warehouse = details.fulfillment_warehouse
    same_city = details.city_id and warehouse and warehouse.city_id == details.city_id
    delivery = deliveries.create_delivery(
        order, user=user, delivery_address=details.shipping_address, destination_city=details.city,
        destination_area=details.area, pickup_point=warehouse.name if warehouse else "",
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
    for line in order.items.select_related("variant", "warehouse"):
        inventory.release(line, user=user, note=f"{order.reference} cancelled")
    services._set_status(order, ShopStatus.CANCELLED, user, reason, request)
    record_audit(action="update", request=request, actor=user, instance=order, changes={"cancel_reason": [None, reason]})
    return order


def on_delivered(order: Order, user, request=None):
    if order.status == ShopStatus.SHIPPED:
        services.advance(order, ShopStatus.DELIVERED, user, via_action="deliver", note="Delivered", request=request)
