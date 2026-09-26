"""
Inventory services — the only code that changes stock. Every change locks the
stock row, keeps 0 <= reserved <= quantity, and writes a StockMovement.
"""
from __future__ import annotations

from django.db import transaction
from django.db.models import F

from apps.core.audit import record_audit
from apps.core.workflow import WorkflowError

from .models import StockItem, StockMovement

K = StockMovement.Kind


def stock_status(item: StockItem, low_threshold: int = 3) -> str:
    """Design statuses: In Stock / Low Stock / Out of Stock / Reserved."""
    if item.quantity <= 0:
        return "out_of_stock"
    if item.available <= 0:
        return "reserved"
    if item.available <= low_threshold:
        return "low_stock"
    return "in_stock"


def _lock(item: StockItem) -> StockItem:
    return StockItem.objects.select_for_update().select_related("variant", "warehouse").get(pk=item.pk)


def _move(item: StockItem, kind: str, *, dq: int = 0, dr: int = 0, user=None, order=None, note: str = "") -> StockItem:
    new_q, new_r = item.quantity + dq, item.reserved + dr
    if new_q < 0:
        raise WorkflowError(f"Only {item.quantity} × {item.variant.sku} at {item.warehouse.name}.", field="quantity")
    if new_r < 0 or new_r > new_q:
        raise WorkflowError(f"Only {item.available} × {item.variant.sku} available at {item.warehouse.name}.",
                            field="quantity")
    item.quantity, item.reserved = new_q, new_r
    item.save(update_fields=["quantity", "reserved", "updated_at"])
    StockMovement.objects.create(stock_item=item, kind=kind, quantity_change=dq, reserved_change=dr,
                                 quantity_after=new_q, reserved_after=new_r, order=order, note=note[:255],
                                 created_by=user)
    return item


def stock_for(variant, warehouse, *, bin_code: str = "") -> StockItem:
    item, created = StockItem.objects.get_or_create(variant=variant, warehouse=warehouse,
                                                    defaults={"bin_code": bin_code})
    return item


@transaction.atomic
def receive(variant, warehouse, quantity: int, *, user, bin_code: str = "", note: str = "", request=None) -> StockItem:
    if quantity <= 0:
        raise WorkflowError("Enter a quantity greater than zero.", field="quantity")
    item = _lock(stock_for(variant, warehouse, bin_code=bin_code))
    if bin_code and item.bin_code != bin_code:
        item.bin_code = bin_code
        item.save(update_fields=["bin_code"])
    _move(item, K.RECEIPT, dq=quantity, user=user, note=note or "Stock received")
    record_audit(action="update", request=request, actor=user, instance=item,
                 changes={"received": [None, quantity]})
    return item


@transaction.atomic
def adjust(item: StockItem, *, new_quantity: int, user, reason: str, request=None) -> StockItem:
    """Stock count correction. The reason is required and kept in the ledger."""
    item = _lock(item)
    if not reason.strip():
        raise WorkflowError("Give a reason for the adjustment.", field="reason")
    if new_quantity < item.reserved:
        raise WorkflowError(f"{item.reserved} units are reserved for orders; the count can't go below that.",
                            field="new_quantity")
    delta = new_quantity - item.quantity
    if delta:
        _move(item, K.ADJUSTMENT, dq=delta, user=user, note=reason)
        record_audit(action="update", request=request, actor=user, instance=item,
                     changes={"quantity": [item.quantity - delta, new_quantity], "reason": [None, reason]})
    return item


@transaction.atomic
def transfer(item: StockItem, to_warehouse, quantity: int, *, user, bin_code: str = "", request=None) -> StockItem:
    item = _lock(item)
    if to_warehouse.pk == item.warehouse_id:
        raise WorkflowError("Choose a different location.", field="to_warehouse")
    if quantity <= 0 or quantity > item.available:
        raise WorkflowError(f"Only {item.available} available to transfer.", field="quantity")
    _move(item, K.TRANSFER_OUT, dq=-quantity, user=user, note=f"To {to_warehouse.name}")
    target = _lock(stock_for(item.variant, to_warehouse, bin_code=bin_code))
    _move(target, K.TRANSFER_IN, dq=quantity, user=user, note=f"From {item.warehouse.name}")
    record_audit(action="update", request=request, actor=user, instance=item,
                 changes={"transfer": [item.warehouse.code, to_warehouse.code], "quantity": [None, quantity]})
    return target


def _candidates(variant, preferred=None):
    """Where to take stock from: the preferred location first, then any Tanzanian location with stock."""
    qs = (StockItem.objects.select_for_update().select_related("warehouse__country", "variant")
          .filter(variant=variant, warehouse__status__in=["active", "full"], quantity__gt=F("reserved")))
    items = list(qs.order_by("-quantity"))
    items.sort(key=lambda s: (s.warehouse_id != getattr(preferred, "pk", None), s.warehouse.country.iso2 != "TZ"))
    return items


@transaction.atomic
def reserve(variant, quantity: int, *, order, user, preferred=None) -> StockItem:
    """Reserve stock for an order line at one location (the first that can serve it all)."""
    for item in _candidates(variant, preferred):
        if item.available >= quantity:
            return _move(item, K.RESERVATION, dr=quantity, user=user, order=order, note=f"Reserved for {order.reference}")
    total = sum(i.available for i in _candidates(variant, preferred))
    raise WorkflowError(f"Not enough stock for {variant.sku}: {total} available, {quantity} ordered.", field="items")


@transaction.atomic
def release(item_line, *, user, note: str = "") -> None:
    """Give back the reservation of an order line (order cancelled)."""
    if not item_line.warehouse_id:
        return
    stock = _lock(StockItem.objects.get(variant=item_line.variant, warehouse=item_line.warehouse))
    _move(stock, K.RELEASE, dr=-item_line.quantity, user=user, order=item_line.order,
          note=note or f"Released from {item_line.order.reference}")


@transaction.atomic
def dispatch(item_line, *, user) -> None:
    """Reserved stock leaves the warehouse (order shipped)."""
    stock = _lock(StockItem.objects.get(variant=item_line.variant, warehouse=item_line.warehouse))
    _move(stock, K.SALE, dq=-item_line.quantity, dr=-item_line.quantity, user=user, order=item_line.order,
          note=f"Shipped {item_line.order.reference}")


@transaction.atomic
def restock(variant, warehouse, quantity: int, *, user, order=None, note: str = "") -> StockItem:
    """Returned goods back on the shelf."""
    item = _lock(stock_for(variant, warehouse))
    return _move(item, K.RETURN, dq=quantity, user=user, order=order, note=note or "Returned to stock")
