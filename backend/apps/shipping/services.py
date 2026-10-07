"""
Shipping & Tracking services — the only code that changes parcel stages and
shipment statuses. Each change runs in a transaction, writes a ShipmentEvent
(and an audit entry) and moves the international orders on board:

    parcel expected            ← supplier shipped / "Deliver for Me" order (order Waiting to Receive)
    parcel received            → order Sent to Consolidation
    parcel lost                → order note + procurement exception (order status unchanged)
    shipment Shipping to Dest. → orders Shipping to Tanzania
    shipment Clearance         → orders Customs Clearance
    shipment Completed         → orders Ready for Collection (+ a pending delivery each)

Shipments may jump forward over milestones; each skipped milestone is applied in order.
"""
from __future__ import annotations

from decimal import Decimal

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.core.audit import record_audit
from apps.core.references import next_reference
from apps.core.workflow import WorkflowError, check_transition
from apps.orders import services as order_services
from apps.orders.workflows import InternationalStatus, status_label

from .models import (
    OPEN_STATUSES,
    SHIPMENT_PATH,
    SHIPMENT_TRANSITIONS,
    CargoParcel,
    CargoType,
    ParcelSource,
    ParcelStage,
    Shipment,
    ShipmentEvent,
    ShipmentStatus,
    WeightType,
)

S = ShipmentStatus
I = InternationalStatus
CLASS_TO_CARGO = {"simple": CargoType.STANDARD, "bulk": CargoType.BULK, "machinery": CargoType.MACHINERY,
                  "fragile": CargoType.FRAGILE}
# Order status the goods reach when the shipment reaches each milestone.
ORDER_STATUS_FOR = {S.SHIPPING_TO_DESTINATION: I.SHIPPING_TO_DESTINATION, S.CLEARANCE: I.CLEARANCE,
                    S.COMPLETED: I.READY_FOR_COLLECTION}
ORIGIN_CODE = {"AE": "DXB", "US": "USA", "GB": "UK"}
RECEIVABLE_ORDER_STATUSES = {I.PENDING_PAYMENT, I.ISSUE_PENDING_PAYMENT, I.SUPPLIER_CONFIRMED, I.PAID_SUPPLIER,
                             I.IN_PRODUCTION, I.WAITING_TO_RECEIVE}
# Order statuses that move on to Sent to Consolidation when the goods are received.
ADVANCE_ON_RECEIPT = {I.SUPPLIER_CONFIRMED, I.PAID_SUPPLIER, I.IN_PRODUCTION, I.WAITING_TO_RECEIVE}


# --------------------------------------------------------------------------- #
# Parcels (Waiting to Receive → Ready for Shipment)
# --------------------------------------------------------------------------- #
def _new_parcel(order, source: str, **fields) -> CargoParcel:
    parcel, created = CargoParcel.objects.get_or_create(order=order, defaults={
        "source": source, "item_name": order.item_details[:200],
        "cargo_type": CLASS_TO_CARGO.get(order.international.order_class, CargoType.STANDARD), **fields,
    })
    if not created and parcel.stage in (ParcelStage.CANCELLED, ParcelStage.LOST, ParcelStage.WAITING):
        # Re-expected (new supplier, re-shipped after a loss) or already expected: take the new details.
        for key, value in fields.items():
            setattr(parcel, key, value)
        parcel.stage = ParcelStage.WAITING
        parcel.lost_at, parcel.lost_reason = None, ""  # a fresh expectation, not the old loss
        parcel.save()
    return parcel


def expect_client_parcel(order, user=None) -> CargoParcel:
    """"Deliver for Me": the customer bought the goods; we wait for them at the warehouse."""
    return _new_parcel(order, ParcelSource.CLIENT_PURCHASED,
                       supplier_tracking_number=order.international.tracking_number)


def expect_procured_parcel(proc, user=None) -> CargoParcel:
    """The supplier shipped the goods: they are now on their way to the consolidation warehouse."""
    return _new_parcel(proc.order, ParcelSource.AGIZA_PROCURED,
                       supplier_tracking_number=proc.supplier_tracking_number,
                       estimated_arrival=proc.expected_at_cargo, packages_quantity=1,
                       description=proc.notes or "")


def withdraw_expected_parcel(order, user, note: str = ""):
    """The goods are no longer expected (e.g. the supplier was cancelled). A parcel already marked lost is
    withdrawn too, so it leaves the Lost list instead of waiting for goods that will never come."""
    parcel = CargoParcel.objects.filter(order=order, stage__in=[ParcelStage.WAITING, ParcelStage.LOST]).first()
    if parcel:
        before = parcel.stage
        parcel.stage = ParcelStage.CANCELLED
        parcel.save(update_fields=["stage", "updated_at"])
        record_audit(action="update", actor=user, instance=parcel, changes={"stage": [before, "cancelled"],
                                                                           "note": [None, note]})


def sync_parcel_tracking(order, tracking: str):
    """Procurement corrected the supplier's tracking number of goods still expected."""
    CargoParcel.objects.filter(order=order, stage=ParcelStage.WAITING).update(
        supplier_tracking_number=tracking, updated_at=timezone.now())


def _lock_parcel(parcel: CargoParcel) -> CargoParcel:
    return CargoParcel.objects.select_for_update().select_related("order").get(pk=parcel.pk)


@transaction.atomic
def receive_parcel(parcel: CargoParcel, *, user, weight_kg: Decimal, cbm: Decimal | None = None,
                   weight_type: str = WeightType.EXACT, packages_quantity: int | None = None, warehouse=None,
                   cargo_type: str | None = None, shipper=None, shipping_method=None, destination_city=None,
                   note: str = "", request=None) -> CargoParcel:
    """Goods arrived at the consolidation warehouse: weigh them and make them Ready for Shipment."""
    parcel = _lock_parcel(parcel)
    # A parcel marked lost that turns up after all can still be received.
    if parcel.stage not in (ParcelStage.WAITING, ParcelStage.LOST):
        raise WorkflowError("Only parcels waiting to be received can be received.", conflict=True)
    from_stage = parcel.stage
    order = order_services._lock(parcel.order)
    if order.status not in RECEIVABLE_ORDER_STATUSES:
        raise WorkflowError(f"{order.reference} is {status_label(order.order_type, order.status)} and can't be "
                            "received.", conflict=True)
    if weight_kg is None or weight_kg <= 0:
        raise WorkflowError("Enter the weight in KG.", field="weight_kg")
    if parcel.source == ParcelSource.AGIZA_PROCURED:
        from apps.procurement import services as procurement

        procurement.mark_received(order.procurement, user, request)

    parcel.weight_kg = weight_kg
    parcel.cbm = cbm
    parcel.weight_type = weight_type
    if packages_quantity:
        parcel.packages_quantity = packages_quantity
    for key, value in {"warehouse": warehouse, "cargo_type": cargo_type, "shipper": shipper,
                       "shipping_method": shipping_method, "destination_city": destination_city}.items():
        if value:
            setattr(parcel, key, value)
    parcel.stage = ParcelStage.READY
    parcel.received_at = timezone.now()
    parcel.received_by = user
    parcel.save()
    record_audit(action="status_change", request=request, actor=user, instance=parcel,
                 changes={"stage": [from_stage, "ready"], "weight_kg": [None, str(weight_kg)]})

    where = f" at {warehouse.name}" if warehouse else ""
    if order.status in ADVANCE_ON_RECEIPT:
        order_services.advance(order, I.SENT_TO_CONSOLIDATION, user, via_action="cargo-receipt",
                               note=note or f"Received at cargo{where}", request=request)
    return parcel


@transaction.atomic
def mark_lost(parcel: CargoParcel, *, user, reason: str, request=None) -> CargoParcel:
    """The expected goods never arrived (lost / damaged in transit to the warehouse).

    The parcel leaves the Waiting to Receive list (it shows under Lost), the order keeps its status with a
    history note, and an Agiza-procured order's procurement is flagged "Parcel Lost" so Procurement can
    chase the supplier — or cancel it and source again.
    """
    parcel = _lock_parcel(parcel)
    reason = (reason or "").strip()
    if parcel.stage != ParcelStage.WAITING:
        raise WorkflowError("Only parcels waiting to be received can be marked lost.", conflict=True)
    if not reason:
        raise WorkflowError("Give the reason the parcel is lost.", field="reason")
    order = order_services._lock(parcel.order)
    parcel.stage = ParcelStage.LOST
    parcel.lost_at = timezone.now()
    parcel.lost_reason = reason
    parcel.save(update_fields=["stage", "lost_at", "lost_reason", "updated_at"])
    record_audit(action="status_change", request=request, actor=user, instance=parcel,
                 changes={"stage": ["waiting", "lost"], "note": [None, reason]})
    order_services._history(order, order.status, order.status, user, f"Parcel lost: {reason}")
    if parcel.source == ParcelSource.AGIZA_PROCURED:
        from apps.procurement import services as procurement

        procurement.on_parcel_lost(order, user, reason)
    return parcel


def on_order_status(order, to_status: str, user):
    """A client-purchased parcel received before payment moves on once the order is confirmed."""
    if to_status != I.SUPPLIER_CONFIRMED:
        return
    parcel = CargoParcel.objects.filter(order=order, stage=ParcelStage.READY).first()
    if parcel:
        order_services._check_transition(order, I.SENT_TO_CONSOLIDATION, via_action="cargo-receipt")
        order_services._set_status(order, I.SENT_TO_CONSOLIDATION, user, "Goods already received at cargo")


def on_order_cancelled(order, user):
    parcel = CargoParcel.objects.filter(order=order).first()
    if parcel and parcel.stage in (ParcelStage.WAITING, ParcelStage.READY, ParcelStage.LOST):
        parcel.stage = ParcelStage.CANCELLED
        parcel.save(update_fields=["stage", "updated_at"])


@transaction.atomic
def update_parcel(parcel: CargoParcel, *, user, request=None, **fields) -> CargoParcel:
    parcel = _lock_parcel(parcel)
    if parcel.stage not in (ParcelStage.WAITING, ParcelStage.READY):
        raise WorkflowError("Parcels already shipped can't be edited.", conflict=True)
    before = {k: getattr(parcel, k) for k in fields}
    for key, value in fields.items():
        setattr(parcel, key, value)
    parcel.save()
    changes = {k: [str(before[k]) if before[k] is not None else None, str(v) if v is not None else None]
               for k, v in fields.items() if before[k] != v}
    if changes:
        record_audit(action="update", request=request, actor=user, instance=parcel, changes=changes)
    return parcel


def _client_goods_unpaid(order) -> bool:
    """A "Deliver for Me" order ships only once the customer paid in full (or installments were approved)."""
    if order.international.service_type != "deliver_for_me":
        return False
    if order.installment_plan and order.installment_allowed:
        return False
    return order_services.payment_summary(order, order_services.prefetched_net_paid(order)).status != "fully_paid"


def exception_flags(parcel: CargoParcel) -> list[str]:
    flags = []
    if parcel.weight_type == WeightType.ESTIMATED:
        flags.append("weight-not-confirmed")
    order = parcel.order
    if order.status in (I.PENDING_PAYMENT, I.ISSUE_PENDING_PAYMENT) or (
        order.installment_plan and not order.installment_allowed
    ) or _client_goods_unpaid(order):
        flags.append("payment-pending")
    return flags


# --------------------------------------------------------------------------- #
# Shipments
# --------------------------------------------------------------------------- #
def _lock_shipment(shipment: Shipment) -> Shipment:
    return Shipment.objects.select_for_update().get(pk=shipment.pk)


def _event(shipment, kind, user, description="", *, from_status="", to_status="", location="", occurred_at=None):
    return ShipmentEvent.objects.create(
        shipment=shipment, kind=kind, from_status=from_status, to_status=to_status, description=description[:255],
        location=location, occurred_at=occurred_at or timezone.now(), created_by=user,
    )


def _check_parcels(parcels: list[CargoParcel], origin_country_id: int):
    if not parcels:
        raise WorkflowError("Select at least one order.", field="parcels")
    for p in parcels:
        if p.stage != ParcelStage.READY:
            raise WorkflowError(f"{p.order.reference} is not ready for shipment.", conflict=True)
        if p.order.international.source_country_id != origin_country_id:
            raise WorkflowError(f"{p.order.reference} ships from {p.order.international.source_country.name}; "
                                "a shipment can only consolidate orders from one origin.", field="parcels")
        if p.order.status != I.SENT_TO_CONSOLIDATION or _client_goods_unpaid(p.order):
            raise WorkflowError(f"{p.order.reference} has a pending customer payment and can't ship yet.",
                                conflict=True)


def _shipment_number(origin_iso: str, dest_iso: str) -> str:
    base = f"SH-{ORIGIN_CODE.get(origin_iso, origin_iso)}-{ORIGIN_CODE.get(dest_iso, dest_iso)}-" \
           f"{timezone.localdate():%y%m%d}"
    number, n = base, 1
    while Shipment.objects.filter(shipment_number=number).exists():
        n += 1
        number = f"{base}-{n}"
    return number


def _attach(shipment: Shipment, parcels: list[CargoParcel]):
    now = timezone.now()
    for p in parcels:
        p.shipment = shipment
        p.stage = ParcelStage.IN_SHIPMENT
        p.added_to_shipment_at = now
        if not p.shipper_id:
            p.shipper = shipment.shipper
        p.save(update_fields=["shipment", "stage", "added_to_shipment_at", "shipper", "updated_at"])


@transaction.atomic
def create_shipment(*, parcels: list[CargoParcel], shipper, shipping_method, destination_city, user, eta=None,
                    origin_warehouse=None, master_tracking_number: str = "", shipment_number: str = "",
                    notes: str = "", request=None) -> Shipment:
    parcels = [_lock_parcel(p) for p in parcels]
    if not parcels:
        raise WorkflowError("Select at least one order.", field="parcels")
    origin = parcels[0].order.international.source_country
    _check_parcels(parcels, origin.id)
    if shipper.status != "active":
        raise WorkflowError(f"{shipper.name} is inactive.", field="shipper")
    if shipment_number and Shipment.objects.filter(shipment_number=shipment_number).exists():
        raise WorkflowError("That shipment number is already used.", field="shipment_number")
    try:
        with transaction.atomic():
            shipment = Shipment.objects.create(
                cargo_id=next_reference(f"CARGO-{timezone.localdate().year}", width=3),
                shipment_number=shipment_number or _shipment_number(origin.iso2, destination_city.country.iso2),
                shipper=shipper, shipping_method=shipping_method, origin_country=origin,
                origin_warehouse=origin_warehouse, destination_city=destination_city, eta=eta,
                master_tracking_number=master_tracking_number, notes=notes, created_by=user,
            )
    except IntegrityError as exc:  # pragma: no cover - concurrent duplicate number
        raise WorkflowError("That shipment number is already used.", field="shipment_number") from exc
    _attach(shipment, parcels)
    _event(shipment, ShipmentEvent.Kind.STATUS, user, "Shipment created", to_status=S.CREATED)
    record_audit(action="create", request=request, actor=user, instance=shipment,
                 changes={"orders": [None, [p.order.reference for p in parcels]]})
    return shipment


@transaction.atomic
def add_parcels(shipment: Shipment, parcels: list[CargoParcel], *, user, request=None) -> Shipment:
    shipment = _lock_shipment(shipment)
    if shipment.status not in OPEN_STATUSES:
        raise WorkflowError("Orders can only be added before the cargo is loaded.", conflict=True)
    parcels = [_lock_parcel(p) for p in parcels]
    _check_parcels(parcels, shipment.origin_country_id)
    _attach(shipment, parcels)
    refs = ", ".join(p.order.reference for p in parcels)
    _event(shipment, ShipmentEvent.Kind.PARCEL, user, f"Added {refs}")
    record_audit(action="update", request=request, actor=user, instance=shipment, changes={"added": [None, refs]})
    return shipment


@transaction.atomic
def remove_parcel(shipment: Shipment, parcel: CargoParcel, *, user, request=None) -> Shipment:
    shipment = _lock_shipment(shipment)
    parcel = _lock_parcel(parcel)
    if parcel.shipment_id != shipment.id:
        raise WorkflowError("That order isn't in this shipment.", field="parcel")
    if shipment.status not in OPEN_STATUSES:
        raise WorkflowError("Orders can only be removed before the cargo is loaded.", conflict=True)
    parcel.shipment = None
    parcel.stage = ParcelStage.READY
    parcel.added_to_shipment_at = None
    parcel.save(update_fields=["shipment", "stage", "added_to_shipment_at", "updated_at"])
    _event(shipment, ShipmentEvent.Kind.PARCEL, user, f"Removed {parcel.order.reference}")
    record_audit(action="update", request=request, actor=user, instance=shipment,
                 changes={"removed": [parcel.order.reference, None]})
    return shipment


@transaction.atomic
def transition(shipment: Shipment, to_status: str, *, user, note: str = "", location: str = "",
               occurred_at=None, request=None) -> Shipment:
    """Move the shipment to a later milestone (or cancel it while still open).

    Jumping forward over milestones applies each skipped one in order — its event, departure / arrival
    dates and the order statuses on board — so every order still walks its own workflow step by step.
    """
    shipment = _lock_shipment(shipment)
    check_transition(shipment.status, to_status, transitions=SHIPMENT_TRANSITIONS, choices=ShipmentStatus,
                     subject=shipment.cargo_id)
    parcels = list(shipment.parcels.select_related("order", "order__international"))
    if to_status != S.CANCELLED and not parcels:
        raise WorkflowError("Add at least one order before moving the shipment on.", conflict=True)
    from_status = shipment.status
    labels = dict(ShipmentStatus.choices)
    when = occurred_at or timezone.now()
    if to_status == S.CANCELLED:
        steps = [S.CANCELLED]
    else:
        steps = SHIPMENT_PATH[SHIPMENT_PATH.index(from_status) + 1:SHIPMENT_PATH.index(to_status) + 1]
    skipped = [labels[s] for s in steps[:-1]]

    fields = {"status", "updated_at"}
    previous = from_status
    for step in steps:
        shipment.status = step
        if step == S.SHIPPING_TO_DESTINATION:
            shipment.departed_at = when
            fields.add("departed_at")
        elif step == S.CLEARANCE:
            shipment.arrived_at = when
            fields.add("arrived_at")
        final = step == to_status
        if final:
            description = note or labels[step]
            if skipped:
                description = f"{description} (also recorded: {', '.join(skipped)})"
        else:
            description = f"{labels[step]} — recorded when moving to {labels[to_status]}"
        _event(shipment, ShipmentEvent.Kind.STATUS, user, description, from_status=previous, to_status=step,
               location=location if final else "", occurred_at=when)
        previous = step
    shipment.save(update_fields=sorted(fields))
    record_audit(action="status_change", request=request, actor=user, instance=shipment,
                 changes={"status": [from_status, to_status],
                          **({"note": [None, note]} if note else {}),
                          **({"skipped": [None, [str(s) for s in steps[:-1]]]} if skipped else {})})

    if to_status == S.CANCELLED:
        for p in parcels:
            p.shipment = None
            p.stage = ParcelStage.READY
            p.added_to_shipment_at = None
            p.save(update_fields=["shipment", "stage", "added_to_shipment_at", "updated_at"])
        return shipment

    for step in steps:
        order_status = ORDER_STATUS_FOR.get(step)
        if not order_status:
            continue
        step_note = f"{shipment.cargo_id}: {note or labels[step]}" if step == to_status \
            else f"{shipment.cargo_id}: {labels[step]}"
        for p in parcels:
            order_services.advance(p.order, order_status, user, via_action="shipment", note=step_note,
                                   request=request)
    if to_status == S.COMPLETED:
        from apps.deliveries import services as deliveries

        for p in parcels:
            p.stage = ParcelStage.ARRIVED
            p.save(update_fields=["stage", "updated_at"])
            deliveries.create_for_arrival(p, user)
    return shipment


@transaction.atomic
def add_tracking_update(shipment: Shipment, *, user, description: str, location: str = "", occurred_at=None,
                        request=None) -> ShipmentEvent:
    shipment = _lock_shipment(shipment)
    if not description.strip():
        raise WorkflowError("Describe the tracking update.", field="description")
    if shipment.status == S.CANCELLED:
        raise WorkflowError("This shipment was cancelled.", conflict=True)
    event = _event(shipment, ShipmentEvent.Kind.UPDATE, user, description.strip(), location=location,
                   occurred_at=occurred_at)
    shipment.save(update_fields=["updated_at"])
    return event


@transaction.atomic
def set_alert(shipment: Shipment, alert: str, *, user, note: str = "", request=None) -> Shipment:
    shipment = _lock_shipment(shipment)
    if shipment.alert == alert:
        return shipment
    before = shipment.alert
    shipment.alert = alert
    shipment.save(update_fields=["alert", "updated_at"])
    label = shipment.get_alert_display() if alert else "Alert cleared"
    _event(shipment, ShipmentEvent.Kind.ALERT, user, f"{label}{': ' + note if note else ''}")
    record_audit(action="update", request=request, actor=user, instance=shipment, changes={"alert": [before, alert]})
    return shipment


# --------------------------------------------------------------------------- #
# Per-order milestone timeline (from real events)
# --------------------------------------------------------------------------- #
def milestone_timeline(parcel: CargoParcel, shipment: Shipment, events: list[ShipmentEvent]) -> list[dict]:
    reached = {}
    for e in events:
        if e.kind == ShipmentEvent.Kind.STATUS and e.to_status and e.to_status not in reached:
            reached[e.to_status] = e.occurred_at
    category = shipment.shipping_method.category
    vehicle = {"sea": "Vessel", "air": "Flight"}.get(category, "Truck")
    port = {"sea": "Port", "air": "Airport"}.get(category, "Border")
    steps = [
        ("received", "Received at Warehouse", parcel.received_at),
        ("booked", "Booked", reached.get(S.BOOKED)),
        ("loaded", f"Loaded on {vehicle}", reached.get(S.LOADED)),
        ("export_cleared", "Export Cleared", reached.get(S.EXPORT_CLEARED)),
        ("shipping_to_destination", "Departed", reached.get(S.SHIPPING_TO_DESTINATION)),
        ("clearance", f"Arrive at {port}", reached.get(S.CLEARANCE)),
        ("completed", "Cleared & Completed", reached.get(S.COMPLETED)),
    ]
    out = []
    for key, label, at in steps:
        expected = shipment.eta if key == "clearance" and not at else None
        out.append({"key": key, "label": label, "status": "completed" if at else "pending", "at": at,
                    "expected": expected})
    return out
