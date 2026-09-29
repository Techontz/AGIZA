"""
Pickup tasks: how a marketplace order's items get from where they are kept to the customer.

The topology comes from the order itself, never a fixed rule:

- every live line has a stock location (an AGIZA warehouse, or a vendor's own location);
- items only in AGIZA warehouses → shipped as before (AGIZA's own stock process);
- a single vendor location and nothing else → the final Delivery leaves straight from the vendor;
- a vendor location plus any other place → an AGIZA warehouse (among the origins, else in the
  customer's or the store's city) is the hub; a PickupTask brings each vendor's items to the hub,
  and the Delivery leaves from the hub once every pickup has arrived. This mirrors checkout, where
  the Shipping Engine priced each vendor's premises as its own shipment.

Status: pending (seller preparing) → ready → assigned (rider) → collected → at_hub,
with failed / cancelled. Every change is an event, as for deliveries.
"""
from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from apps.core.audit import record_audit
from apps.core.workflow import WorkflowError, check_transition
from apps.locations.models import Warehouse

from .models import PICKUP_TRANSITIONS, PickupEvent, PickupStatus, PickupTask

AGIZA_TYPES = (Warehouse.Type.FULFILLMENT, Warehouse.Type.SHOP, Warehouse.Type.PICKUP_POINT,
               Warehouse.Type.CONSOLIDATION)
DONE = (PickupStatus.AT_HUB, PickupStatus.CANCELLED)


def _live_origins(order) -> list[Warehouse]:
    lines = (order.items.select_related("warehouse__city", "fulfillment")
             .exclude(fulfillment__status="cancelled").exclude(warehouse__isnull=True))
    return list({line.warehouse_id: line.warehouse for line in lines}.values())


def _needs_pickups(origins: list[Warehouse]) -> bool:
    return len(origins) > 1 and any(w.type == Warehouse.Type.VENDOR for w in origins)


def choose_hub(order, origins: list[Warehouse]) -> Warehouse:
    """An AGIZA location among the origins (in the customer's city first), else AGIZA's warehouse in the
    customer's or the store's city, else the first origin."""
    city_id = getattr(getattr(order, "shop", None), "city_id", None)
    agiza = sorted((w for w in origins if w.type in AGIZA_TYPES), key=lambda w: w.city_id != city_id)
    if agiza:
        return agiza[0]
    from apps.catalog.models import StoreSettings

    store_city = StoreSettings.load().location_id
    for target in (city_id, store_city):
        if target:
            hub = (Warehouse.objects.filter(city_id=target, type__in=AGIZA_TYPES, status__in=["active", "full"])
                   .order_by("type", "code").first())
            if hub:
                return hub
    return origins[0]


def _event(task: PickupTask, to_status: str, *, user=None, note: str = ""):
    PickupEvent.objects.create(task=task, from_status=task.status, to_status=to_status, note=note[:255],
                               changed_by=user)
    task.status = to_status


@transaction.atomic
def plan(order) -> list[PickupTask]:
    """Create the pickup tasks an order needs (idempotent). Called when the order is placed."""
    origins = _live_origins(order)
    if not _needs_pickups(origins):
        return []
    hub = choose_hub(order, origins)
    fulfillments = {f.origin_id: f for f in order.fulfillments.exclude(status="cancelled")}
    tasks = []
    for origin in origins:
        if origin.pk == hub.pk or origin.type != Warehouse.Type.VENDOR:
            continue
        fulfillment = fulfillments.get(origin.pk)
        existing = PickupTask.objects.filter(order=order, origin=origin).exclude(status=PickupStatus.CANCELLED).first()
        if existing:
            tasks.append(existing)
            continue
        task = PickupTask.objects.create(
            order=order, fulfillment=fulfillment, vendor=getattr(fulfillment, "vendor", None), origin=origin,
            destination=hub,
        )
        PickupEvent.objects.create(task=task, to_status=PickupStatus.PENDING, note="Planned when the order was placed")
        if fulfillment is not None and fulfillment.status == "ready":  # already packed
            _event(task, PickupStatus.READY, note="Seller had the items ready")
            task.save(update_fields=["status", "updated_at"])
        tasks.append(task)
    return tasks


def on_vendor_ready(fulfillment):
    task = PickupTask.objects.filter(fulfillment=fulfillment, status=PickupStatus.PENDING).first()
    if task:
        _event(task, PickupStatus.READY, note="Seller marked the items ready")
        task.save(update_fields=["status", "updated_at"])


def require_consolidated(order) -> Warehouse | None:
    """Before shipping: the hub if the order is consolidated (raises while a pickup hasn't arrived)."""
    origins = _live_origins(order)
    if not _needs_pickups(origins):
        return None
    plan(order)  # orders placed before pickup tasks existed get theirs now
    open_tasks = (PickupTask.objects.filter(order=order).exclude(status__in=DONE)
                  .select_related("origin", "vendor"))
    if open_tasks.exists():
        names = ", ".join(t.vendor.name if t.vendor_id else t.origin.name for t in open_tasks)
        raise WorkflowError(f"Waiting for pickups to reach the hub: {names}.", conflict=True)
    task = PickupTask.objects.filter(order=order, status=PickupStatus.AT_HUB).first()
    return task.destination if task else choose_hub(order, origins)


def _check(task, to_status):
    check_transition(task.status, to_status, transitions=PICKUP_TRANSITIONS, choices=PickupStatus,
                     subject=task.reference)


@transaction.atomic
def assign(task: PickupTask, driver, *, user, scheduled_at=None, request=None) -> PickupTask:
    task = PickupTask.objects.select_for_update().get(pk=task.pk)
    _check(task, PickupStatus.ASSIGNED)
    if not driver or not driver.is_active:
        raise WorkflowError("Choose an active rider.", field="driver")
    task.driver = driver
    task.scheduled_at = scheduled_at
    _event(task, PickupStatus.ASSIGNED, user=user, note=f"Assigned to {driver.full_name}")
    task.save(update_fields=["driver", "scheduled_at", "status", "updated_at"])
    record_audit(action="status_change", request=request, actor=user, instance=task,
                 changes={"status": [None, "assigned"], "driver": [None, driver.full_name]})
    return task


@transaction.atomic
def advance(task: PickupTask, to_status: str, *, user, note: str = "", handed_over_by: str = "",
            request=None) -> PickupTask:
    """collected (with who handed the items over) → at_hub; or failed with a reason."""
    task = PickupTask.objects.select_for_update().get(pk=task.pk)
    if to_status not in (PickupStatus.COLLECTED, PickupStatus.AT_HUB, PickupStatus.FAILED):
        raise WorkflowError("Use assign or cancel for that.", field="status")
    _check(task, to_status)
    fields = ["status", "updated_at"]
    if to_status == PickupStatus.COLLECTED:
        if not handed_over_by.strip():
            raise WorkflowError("Enter who handed the items over (proof of collection).", field="handed_over_by")
        task.handed_over_by = handed_over_by.strip()[:150]
        task.collected_at = timezone.now()
        fields += ["handed_over_by", "collected_at"]
    elif to_status == PickupStatus.AT_HUB:
        task.arrived_at = timezone.now()
        fields.append("arrived_at")
    elif not note.strip():
        raise WorkflowError("Say why the collection failed.", field="note")
    _event(task, to_status, user=user, note=note)
    task.save(update_fields=fields)
    record_audit(action="status_change", request=request, actor=user, instance=task,
                 changes={"status": [None, to_status], **({"note": [None, note]} if note else {})})
    if to_status == PickupStatus.FAILED:
        from apps.accounts.constants import Module
        from apps.notifications import services as notifications
        from apps.notifications.models import Notification

        notifications.notify(notifications.users_with(Module.DELIVERIES), kind=Notification.Kind.SYSTEM,
                             title=f"Pickup failed · {task.reference}", body=note[:500], link="/deliveries")
    return task


def cancel(task: PickupTask, *, user, note: str = "") -> PickupTask:
    if task.status in DONE:
        return task
    _event(task, PickupStatus.CANCELLED, user=user, note=note or "Cancelled")
    task.save(update_fields=["status", "updated_at"])
    return task
