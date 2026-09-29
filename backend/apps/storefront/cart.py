"""
The customer's cart. It stores only variants and quantities; every read prices the
lines from the catalogue and checks live stock, so what the app shows is always
what checkout will charge.
"""
from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.db.models import Prefetch

from apps.catalog.models import ProductImage, ProductVariant, StoreSettings
from apps.core.workflow import WorkflowError

from .catalog import available_by_variant, is_sellable
from .models import MAX_LINE_QUANTITY, Cart, CartItem


def cart_for(customer, *, lock: bool = False) -> Cart:
    cart, _ = Cart.objects.get_or_create(customer=customer)
    if lock:
        cart = Cart.objects.select_for_update().get(pk=cart.pk)
    return cart


def cart_items(cart: Cart):
    return list(
        cart.items.select_related("variant__product__category", "variant__product__location__city",
                                  "variant__product__location__country", "variant__product__origin_country",
                                  "variant__product__shipping_profile")
        .prefetch_related(
            "variant__product__shipping_methods", "variant__option_values",
            Prefetch("variant__product__images", queryset=ProductImage.objects.filter(variant__isnull=True),
                     to_attr="shop_images"),
        )
    )


def _issue(item: CartItem, available: int) -> str:
    if not is_sellable(item.variant):
        return "No longer available"
    if available <= 0:
        return "Out of stock"
    if item.quantity > available:
        return f"Only {available} left"
    return ""


def summarize(cart: Cart) -> dict:
    """Priced lines plus problems that block checkout (unavailable items, too little stock)."""
    items = cart_items(cart)
    stock = available_by_variant(i.variant_id for i in items)
    lines, subtotal = [], Decimal("0")
    for item in items:
        available = stock.get(item.variant_id, 0)
        price = item.variant.effective_price
        line_total = (price * item.quantity).quantize(Decimal("0.01"))
        issue = _issue(item, available)
        lines.append({"item": item, "unit_price": price, "line_total": line_total, "available": available,
                      "issue": issue})
        if not issue:
            subtotal += line_total
    return {
        "lines": lines,
        "subtotal": subtotal,
        "item_count": sum(i.quantity for i in items),
        "currency": StoreSettings.load().currency,
        "has_issues": any(line["issue"] for line in lines),
    }


def _check_quantity(variant: ProductVariant, quantity: int):
    if quantity < 1:
        raise WorkflowError("Quantity must be at least 1.", field="quantity")
    if quantity > MAX_LINE_QUANTITY:
        raise WorkflowError(f"You can order at most {MAX_LINE_QUANTITY} of one item.", field="quantity")
    if not is_sellable(variant):
        raise WorkflowError(f"{variant.product.name} isn't available for sale.", field="variant")
    available = available_by_variant([variant.pk]).get(variant.pk, 0)
    if quantity > available:
        raise WorkflowError(f"Only {available} of {variant.product.name} in stock." if available
                            else f"{variant.product.name} is out of stock.", field="quantity")


@transaction.atomic
def add_item(customer, variant: ProductVariant, quantity: int) -> CartItem:
    cart = cart_for(customer, lock=True)
    item = cart.items.filter(variant=variant).first()
    total = quantity + (item.quantity if item else 0)
    _check_quantity(variant, total)
    if item:
        item.quantity = total
        item.save(update_fields=["quantity", "updated_at"])
        return item
    return CartItem.objects.create(cart=cart, variant=variant, quantity=quantity)


@transaction.atomic
def set_quantity(item: CartItem, quantity: int) -> CartItem:
    _check_quantity(item.variant, quantity)
    item.quantity = quantity
    item.save(update_fields=["quantity", "updated_at"])
    return item
