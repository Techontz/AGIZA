"""Saved products ("wishlist") of a signed-in customer. Visitors keep theirs in the browser until they sign in."""
from __future__ import annotations

from django.db import IntegrityError, transaction

from apps.core.workflow import WorkflowError

from .catalog import visible_products
from .models import WishlistItem

MAX_ITEMS = 200


def items(customer):
    return WishlistItem.objects.filter(customer=customer)


def add(customer, product_id: int) -> bool:
    """Save a product the shop shows. Returns True if it was newly saved."""
    if not visible_products().filter(pk=product_id).exists():
        raise WorkflowError("This product isn't available.", field="product")
    if items(customer).count() >= MAX_ITEMS:
        raise WorkflowError(f"You can save up to {MAX_ITEMS} products.", conflict=True)
    try:
        with transaction.atomic():
            WishlistItem.objects.create(customer=customer, product_id=product_id)
            return True
    except IntegrityError:  # already saved (double tap)
        return False


def remove(customer, product_id: int):
    items(customer).filter(product_id=product_id).delete()


def merge(customer, product_ids: list[int]) -> int:
    added = 0
    visible = set(visible_products().filter(pk__in=product_ids[:MAX_ITEMS]).values_list("pk", flat=True))
    for pid in product_ids[:MAX_ITEMS]:
        if pid in visible:
            try:
                added += int(add(customer, pid))
            except WorkflowError:
                break
    return added
