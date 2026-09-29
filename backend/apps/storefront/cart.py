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


LINE_RELATED = ("variant__product__category", "variant__product__location__city",
                "variant__product__location__country", "variant__product__origin_country",
                "variant__product__shipping_profile", "variant__product__vendor__city__country")


def _line_prefetch(prefix: str = "variant__"):
    return (f"{prefix}product__shipping_methods", f"{prefix}option_values",
            Prefetch(f"{prefix}product__images", queryset=ProductImage.objects.filter(variant__isnull=True),
                     to_attr="shop_images"))


def cart_items(cart: Cart):
    return list(cart.items.select_related(*LINE_RELATED).prefetch_related(*_line_prefetch()))


MAX_GUEST_LINES = 50


def guest_items(rows: list[dict]) -> list[CartItem]:
    """A visitor's cart kept in their browser: priced exactly like a saved cart (unsaved CartItem rows)."""
    wanted = {}
    for row in rows[:MAX_GUEST_LINES]:
        wanted[row["variant"]] = min(wanted.get(row["variant"], 0) + row["quantity"], MAX_LINE_QUANTITY)
    variants = (ProductVariant.objects.filter(pk__in=wanted)
                .select_related(*(r.removeprefix("variant__") for r in LINE_RELATED))
                .prefetch_related(*_line_prefetch("")))
    by_id = {v.pk: v for v in variants}
    return [CartItem(variant=by_id[vid], quantity=qty) for vid, qty in wanted.items() if vid in by_id]


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
    return summarize_items(cart_items(cart))


def summarize_items(items: list[CartItem]) -> dict:
    stock = available_by_variant(i.variant_id for i in items)
    lines, subtotal = [], Decimal("0")
    for item in items:
        available = stock.get(item.variant_id, 0)
        price = item.variant.effective_price
        line_total = (price * item.quantity).quantize(Decimal("0.01"))
        issue = _issue(item, available)
        lines.append({"item": item, "unit_price": price, "line_total": line_total, "available": available,
                      "issue": issue, "vendor": item.variant.product.vendor})
        if not issue:
            subtotal += line_total
    return {
        "lines": lines,
        "groups": _by_seller(lines),
        "subtotal": subtotal,
        "item_count": sum(i.quantity for i in items),
        "currency": StoreSettings.load().currency,
        "has_issues": any(line["issue"] for line in lines),
    }


def _by_seller(lines: list[dict]) -> list[dict]:
    """Lines grouped by who sells them (AGIZA's own products first), in the order they were added."""
    groups: dict = {}
    for line in lines:
        vendor = line["vendor"]
        group = groups.setdefault(getattr(vendor, "pk", None), {"vendor": vendor, "lines": [], "subtotal": Decimal("0")})
        group["lines"].append(line)
        if not line["issue"]:
            group["subtotal"] += line["line_total"]
    return sorted(groups.values(), key=lambda g: g["vendor"] is not None)


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


@transaction.atomic
def merge(customer, rows: list[dict]) -> list[str]:
    """
    Items a visitor added before signing in join their saved cart. Each is capped at what is
    in stock; anything that can't be added is reported instead of failing the whole merge.
    """
    notes = []
    cart = cart_for(customer, lock=True)
    for item in guest_items(rows):
        variant = item.variant
        existing = cart.items.filter(variant=variant).first()
        have = existing.quantity if existing else 0
        if not is_sellable(variant):
            notes.append(f"{variant.product.name} is no longer available.")
            continue
        room = min(available_by_variant([variant.pk]).get(variant.pk, 0), MAX_LINE_QUANTITY) - have
        quantity = min(item.quantity, room)
        if quantity <= 0:
            if have == 0:
                notes.append(f"{variant.product.name} is out of stock.")
            continue
        if quantity < item.quantity:
            notes.append(f"Only {quantity} more of {variant.product.name} could be added.")
        if existing:
            existing.quantity = have + quantity
            existing.save(update_fields=["quantity", "updated_at"])
        else:
            CartItem.objects.create(cart=cart, variant=variant, quantity=quantity)
    return notes
