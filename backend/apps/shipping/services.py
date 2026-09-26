"""
Shipping & Tracking services — the only code that changes parcel stages and
shipment statuses. Each change runs in a transaction, writes a ShipmentEvent
(and an audit entry) and moves the international orders on board:

    parcel received            → order Sent to Consolidation
    shipment Shipping to Dest. → orders Shipping to Tanzania
    shipment Clearance         → orders Customs Clearance
    shipment Completed         → orders Ready for Collection (+ a pending delivery each)
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
                             I.IN_PRODUCTION}


# --------------------------------------------------------------------------- #
# Parcels (Waiting to Receive → Ready for Shipment)
# --------------------------------------------------------------------------- #
def _new_parcel(order, source: str, **fields) -> CargoParcel:
    parcel, created = CargoParcel.objects.get_or_create(order=order, defaults={
        "source": source, "item_name": order.item_details[:200],
        "cargo_type": CLASS_TO_CARGO.get(order.international.order_class, CargoType.STANDARD), **fields,
    })
    if not created and parcel.stage == ParcelStage.CANCELLED:
        for key, value in fields.items():
            setattr(parcel, key, value)
        parcel.stage = ParcelStage.WAITING
        parcel.save()
    return parcel


def expect_client_parcel(order, user=None) -> CargoParcel:
    """"Deliver for Me": the customer bought the goods; we wait for them at the warehouse."""
    return _new_parcel(order, ParcelSource.CLIENT_PURCHASED,
                       supplier_tracking_number=order.international.tracking_number)


def expect_procured_parcel(proc, user=None) -> CargoParcel:
    """The supplier has been paid; the goods are now on their way to the consolidation warehouse."""
    return _new_parcel(proc.order, ParcelSource.AGIZA_PROCURED,
                       supplier_tracking_number=proc.supplier_tracking_number,
                       estimated_arrival=proc.expected_at_cargo, packages_quantity=1,
                       description=proc.notes or "")


def withdraw_expected_parcel(order, user, note: str = ""):
    parcel = CargoParcel.objects.filter(order=order, stage=ParcelStage.WAITING).first()
    if parcel:
        parcel.stage = ParcelStage.CANCELLED
        parcel.save(update_fields=["stage", "updated_at"])
        record_audit(action="update", actor=user, instance=parcel, changes={"stage": ["waiting", "cancelled"],
                                                                           "note": [None, note]})


def _lock_parcel(parcel: CargoParcel) -> CargoParcel:
    return CargoParcel.objects.select_for_update().select_related("order").get(pk=parcel.pk)


@transaction.atomic
def receive_parcel(parcel: CargoParcel, *, user, weight_kg: Decimal, cbm: Decimal | None = None,
                   weight_type: str = WeightType.EXACT, packages_quantity: int | None = None, warehouse=None,
                   cargo_type: str | None = None, shipper=None, shipping_method=None, destination_city=None,
                   note: str = "", request=None) -> CargoParcel:
    """Goods arrived at the consolidation warehouse: weigh them and make them Ready for Shipment."""
    parcel = _lock_parcel(parcel)
    if parcel.stage != ParcelStage.WAITING:
        raise WorkflowError("Only parcels waiting to be received can be received.", conflict=True)
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
                 changes={"stage": ["waiting", "ready"], "weight_kg": [None, str(weight_kg)]})

    where = f" at {warehouse.name}" if warehouse else ""
    if order.status in (I.SUPPLIER_CONFIRMED, I.PAID_SUPPLIER, I.IN_PRODUCTION):
        order_services.advance(order, I.SENT_TO_CONSOLIDATION, user, via_action="cargo-receipt",
                               note=note or f"Received at cargo{where}", request=request)
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
    if parcel and parcel.stage in (ParcelStage.WAITING, ParcelStage.READY):
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


def exception_flags(parcel: CargoParcel) -> list[str]:
    flags = []
    if parcel.weight_type == WeightType.ESTIMATED:
        flags.append("weight-not-confirmed")
    order = parcel.order
    if order.status in (I.PENDING_PAYMENT, I.ISSUE_PENDING_PAYMENT) or (
        order.installment_plan and not order.installment_allowed
    ):
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
        if p.order.status != I.SENT_TO_CONSOLIDATION:
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
    shipment = _lock_shipment(shipment)
    check_transition(shipment.status, to_status, transitions=SHIPMENT_TRANSITIONS, choices=ShipmentStatus,
                     subject=shipment.cargo_id)
    parcels = list(shipment.parcels.select_related("order", "order__international"))
    if to_status != S.CANCELLED and not parcels:
        raise WorkflowError("Add at least one order before moving the shipment on.", conflict=True)
    from_status = shipment.status
    shipment.status = to_status
    fields = ["status", "updated_at"]
    when = occurred_at or timezone.now()
    if to_status == S.SHIPPING_TO_DESTINATION:
        shipment.departed_at = when
        fields.append("departed_at")
    elif to_status == S.CLEARANCE:
        shipment.arrived_at = when
        fields.append("arrived_at")
    shipment.save(update_fields=fields)
    label = dict(ShipmentStatus.choices)[to_status]
    _event(shipment, ShipmentEvent.Kind.STATUS, user, note or label, from_status=from_status, to_status=to_status,
           location=location, occurred_at=when)
    record_audit(action="status_change", request=request, actor=user, instance=shipment,
                 changes={"status": [from_status, to_status], **({"note": [None, note]} if note else {})})

    if to_status == S.CANCELLED:
        for p in parcels:
            p.shipment = None
            p.stage = ParcelStage.READY
            p.added_to_shipment_at = None
            p.save(update_fields=["shipment", "stage", "added_to_shipment_at", "updated_at"])
        return shipment

    order_status = ORDER_STATUS_FOR.get(to_status)
    if order_status:
        for p in parcels:
            order_services.advance(p.order, order_status, user, via_action="shipment",
                                   note=f"{shipment.cargo_id}: {note or label}", request=request)
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
