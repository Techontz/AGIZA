"""
Delivery workflow services — the only code that changes delivery status.

Each change locks the delivery, checks the transition, writes a
DeliveryEvent and an audit entry, and keeps the order in step:
  - international: Delivered → order Completed
  - express: the Express workflow drives the delivery (driver assigned →
    Assigned Driver, picked up → Out for Delivery, delivered → Delivered);
    completing an express delivery here requires the order to have Arrived.
  - Returned → a Return is opened for the order.
"""
from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from apps.accounts.constants import StaffLevel
from apps.core.audit import record_audit
from apps.core.workflow import WorkflowError, check_transition
from apps.orders import services as order_services
from apps.orders.workflows import ExpressStatus, InternationalStatus, OrderType

from .models import (
    DELIVERY_ACTION_ONLY,
    DELIVERY_TRANSITIONS,
    FINISHED,
    Delivery,
    DeliveryEvent,
    DeliveryPhoto,
    DeliveryProof,
    DeliveryStatus,
    DeliveryType,
)

D = DeliveryStatus


def _lock(delivery: Delivery) -> Delivery:
    return Delivery.objects.select_for_update().select_related("order").get(pk=delivery.pk)


def _event(delivery, from_status, to_status, user, note=""):
    return DeliveryEvent.objects.create(delivery=delivery, from_status=from_status, to_status=to_status,
                                        changed_by=user, note=note.strip())


def _set_status(delivery: Delivery, to_status: str, user, note: str = "", request=None, fields=()):
    from_status = delivery.status
    delivery.status = to_status
    delivery.save(update_fields=["status", "updated_at", *fields])
    _event(delivery, from_status, to_status, user, note)
    record_audit(action="status_change", request=request, actor=user, instance=delivery,
                 changes={"status": [from_status, to_status], **({"note": [None, note]} if note else {})})


def _check(delivery, to_status, via_action=None):
    check_transition(delivery.status, to_status, transitions=DELIVERY_TRANSITIONS, choices=DeliveryStatus,
                     action_only=DELIVERY_ACTION_ONLY, via_action=via_action, subject=delivery.reference)


def _check_driver(driver):
    if not driver.is_active:
        raise WorkflowError(f"{driver.full_name} is inactive.", field="driver")
    if driver.staff_level != StaffLevel.DRIVER:
        raise WorkflowError(f"{driver.full_name} is not a driver.", field="driver")


# --------------------------------------------------------------------------- #
# Creation
# --------------------------------------------------------------------------- #
@transaction.atomic
def create_delivery(order, *, user, delivery_address: str, delivery_type: str = DeliveryType.STANDARD,
                    destination_city=None, destination_area: str = "", pickup_point: str = "",
                    pickup_warehouse=None, scheduled_at=None, recipient_name: str = "", recipient_phone: str = "",
                    notes: str = "", request=None) -> Delivery:
    if order.status == "cancelled":
        raise WorkflowError(f"{order.reference} is cancelled.", conflict=True)
    if order.deliveries.exclude(status__in=FINISHED).exclude(status=D.FAILED).exists():
        raise WorkflowError(f"{order.reference} already has an open delivery.", conflict=True)
    if not delivery_address.strip():
        raise WorkflowError("Enter the delivery address.", field="delivery_address")
    delivery = Delivery.objects.create(
        order=order, delivery_type=delivery_type, delivery_address=delivery_address.strip(),
        destination_city=destination_city, destination_area=destination_area, pickup_point=pickup_point,
        pickup_warehouse=pickup_warehouse, scheduled_at=scheduled_at,
        recipient_name=recipient_name or order.customer.full_name, recipient_phone=recipient_phone or order.customer.phone,
        notes=notes, created_by=user,
    )
    _event(delivery, "", D.PENDING, user, "Delivery created")
    record_audit(action="create", request=request, actor=user, instance=delivery,
                 changes={"order": [None, order.reference]})
    return delivery


def create_for_arrival(parcel, user) -> Delivery | None:
    """A shipment completed: prepare the last-mile delivery of each order."""
    order = parcel.order
    if order.deliveries.exclude(status__in=FINISHED).exists():
        return None
    address = order.customer.addresses.filter(is_default=True).select_related("city").first() \
        or order.customer.addresses.select_related("city").first()
    city = parcel.destination_city or (address.city if address else None)
    delivery_type = DeliveryType.INTER_CITY if city and city.name != "Dar es Salaam" else DeliveryType.STANDARD
    return create_delivery(
        order, user=user, delivery_type=delivery_type,
        delivery_address=address.line1 if address else "To be confirmed with the customer",
        destination_city=city, destination_area=address.area if address else "",
        pickup_point=parcel.warehouse.name if parcel.warehouse_id else "Agiza Warehouse",
        notes="Created when the shipment arrived",
    )


def _express_type(details) -> str:
    if details.pickup_city_id and details.delivery_city_id and details.pickup_city_id != details.delivery_city_id:
        return DeliveryType.INTER_CITY
    return {"urgent": DeliveryType.SAME_DAY, "express": DeliveryType.EXPRESS}.get(details.priority,
                                                                                 DeliveryType.STANDARD)


def sync_express(order, user) -> Delivery | None:
    """Create or update the delivery that mirrors an express order's driver assignment."""
    if order.order_type != OrderType.EXPRESS:
        return None
    details = order.express
    if not details.driver_id:
        return None
    delivery = order.deliveries.exclude(status__in=FINISHED).first()
    if delivery is None:
        delivery = Delivery.objects.create(
            order=order, delivery_type=_express_type(details), status=D.ASSIGNED_DRIVER, driver=details.driver,
            pickup_point=details.pickup_address, delivery_address=details.delivery_address,
            destination_city=details.delivery_city, recipient_name=order.customer.full_name,
            recipient_phone=order.customer.phone, scheduled_at=details.estimated_delivery_at, created_by=user,
        )
        _event(delivery, "", D.ASSIGNED_DRIVER, user, f"Driver: {details.driver.full_name}")
    elif delivery.driver_id != details.driver_id:
        previous = delivery.driver
        delivery.driver = details.driver
        delivery.save(update_fields=["driver", "updated_at"])
        _event(delivery, delivery.status, delivery.status, user,
               f"Driver changed from {previous.full_name if previous else '—'} to {details.driver.full_name}")
    return delivery


EXPRESS_TO_DELIVERY = {
    ExpressStatus.PICKED_UP: D.OUT_FOR_DELIVERY,
    ExpressStatus.AT_AGIZA_CENTER: D.OUT_FOR_DELIVERY,
    ExpressStatus.IN_TRANSIT: D.OUT_FOR_DELIVERY,
    ExpressStatus.ARRIVED: D.OUT_FOR_DELIVERY,
    ExpressStatus.DELIVERED: D.DELIVERED,
    ExpressStatus.CANCELLED: D.CANCELLED,
}


def on_order_status(order, to_status: str, user):
    """Order status changed elsewhere (Express workflow, cancellations)."""
    if order.order_type == OrderType.EXPRESS and to_status == ExpressStatus.DRIVER_ASSIGNED:
        sync_express(order, user)
        return
    delivery = order.deliveries.exclude(status__in=FINISHED).order_by("-id").first()
    if delivery is None:
        return
    delivery = _lock(delivery)
    if to_status == "cancelled":
        _set_status(delivery, D.CANCELLED, user, "Order cancelled")
        return
    if order.order_type != OrderType.EXPRESS:
        return
    target = EXPRESS_TO_DELIVERY.get(to_status)
    if target == D.OUT_FOR_DELIVERY and delivery.status in (D.ASSIGNED_DRIVER, D.RESCHEDULED):
        _set_status(delivery, D.OUT_FOR_DELIVERY, user, f"Express order {dict(ExpressStatus.choices)[to_status]}")
    elif target == D.DELIVERED and delivery.status != D.DELIVERED:
        delivery.delivered_at = timezone.now()
        _set_status(delivery, D.DELIVERED, user, "Marked delivered in Express Delivery", fields=["delivered_at"])


# --------------------------------------------------------------------------- #
# Actions
# --------------------------------------------------------------------------- #
@transaction.atomic
def assign_driver(delivery: Delivery, driver, *, user, scheduled_at=None, note: str = "", request=None) -> Delivery:
    delivery = _lock(delivery)
    _check_driver(driver)
    order = delivery.order
    if order.order_type == OrderType.EXPRESS:
        # The Express workflow owns express drivers (advance payment rules etc.).
        order_services.assign_driver(order, driver, user, note, request)
        return Delivery.objects.get(pk=delivery.pk)
    fields = ["driver"]
    if scheduled_at:
        delivery.scheduled_at = scheduled_at
        fields.append("scheduled_at")
    if delivery.status in (D.PENDING, D.RESCHEDULED):
        delivery.driver = driver
        _check(delivery, D.ASSIGNED_DRIVER, via_action="assign-driver")
        _set_status(delivery, D.ASSIGNED_DRIVER, user, note or f"Driver: {driver.full_name}", request, fields)
    elif delivery.status in (D.ASSIGNED_DRIVER, D.OUT_FOR_DELIVERY):
        previous = delivery.driver
        delivery.driver = driver
        delivery.save(update_fields=[*fields, "updated_at"])
        _event(delivery, delivery.status, delivery.status, user,
               note or f"Driver changed from {previous.full_name if previous else '—'} to {driver.full_name}")
        record_audit(action="update", request=request, actor=user, instance=delivery,
                     changes={"driver": [previous.pk if previous else None, driver.pk]})
    else:
        raise WorkflowError(f"A driver can't be assigned to a {delivery.get_status_display()} delivery.",
                            conflict=True)
    return delivery


@transaction.atomic
def transition(delivery: Delivery, to_status: str, *, user, note: str = "", exception_flag: str | None = None,
               scheduled_at=None, request=None) -> Delivery:
    delivery = _lock(delivery)
    _check(delivery, to_status)
    fields = []
    if exception_flag is not None:
        delivery.exception_flag = exception_flag
        fields.append("exception_flag")
    if to_status == D.FAILED:
        if not (note.strip() or delivery.exception_flag):
            raise WorkflowError("Say why the delivery failed.", field="note")
        delivery.attempts += 1
        fields.append("attempts")
    if to_status == D.RESCHEDULED:
        if not scheduled_at:
            raise WorkflowError("Choose the new delivery date.", field="scheduled_at")
        delivery.scheduled_at = scheduled_at
        fields.append("scheduled_at")
    if to_status == D.OUT_FOR_DELIVERY and not delivery.driver_id:
        raise WorkflowError("Assign a driver first.", conflict=True)
    if to_status == D.CANCELLED and delivery.order.order_type == OrderType.EXPRESS:
        raise WorkflowError("Cancel express deliveries by cancelling the order in Express Delivery.", conflict=True)
    _set_status(delivery, to_status, user, note, request, fields)
    if to_status == D.RETURNED:
        from apps.returns import services as returns

        returns.open_for_failed_delivery(delivery, user, note)
    return delivery


@transaction.atomic
def complete(delivery: Delivery, *, user, signature_name: str, notes: str = "", signature_image=None,
             signature_content_type: str = "", photos=(), completed_at=None, request=None) -> Delivery:
    """Delivered, with proof of delivery (recipient signature and optional photos)."""
    delivery = _lock(delivery)
    _check(delivery, D.DELIVERED, via_action="complete")
    if not signature_name.strip():
        raise WorkflowError("Enter the name of the person who received the delivery.", field="signature_name")
    order = order_services._lock(delivery.order)
    completed_at = completed_at or timezone.now()
    DeliveryProof.objects.create(
        delivery=delivery, signature_name=signature_name.strip(), signature_image=signature_image or "",
        signature_content_type=signature_content_type, notes=notes, completed_at=completed_at, recorded_by=user,
    )
    for upload, ctype in photos:
        DeliveryPhoto.objects.create(delivery=delivery, file=upload, content_type=ctype, uploaded_by=user)
    delivery.delivered_at = completed_at
    delivery.exception_flag = ""
    _set_status(delivery, D.DELIVERED, user, notes or f"Received by {signature_name.strip()}", request,
                ["delivered_at", "exception_flag"])

    if order.order_type == OrderType.INTERNATIONAL and order.status == InternationalStatus.READY_FOR_COLLECTION:
        order_services.transition(order, InternationalStatus.COMPLETED, user,
                                  f"Delivered ({delivery.reference})", request)
    elif order.order_type == OrderType.EXPRESS and order.status != ExpressStatus.DELIVERED:
        if order.status != ExpressStatus.ARRIVED:
            raise WorkflowError(
                f"Mark {order.reference} as Arrived at Destination City in Express Delivery first.", conflict=True)
        order_services.transition(order, ExpressStatus.DELIVERED, user, f"Delivered ({delivery.reference})", request)
    elif order.order_type == OrderType.SHOP:
        from apps.orders import shop

        shop.on_delivered(order, user, request)
    return delivery


@transaction.atomic
def add_proof(delivery: Delivery, *, user, photos=(), signature_name: str = "", notes: str = "", request=None):
    """Attach proof to a delivery already marked delivered (e.g. from Express Delivery)."""
    delivery = _lock(delivery)
    if delivery.status != D.DELIVERED:
        raise WorkflowError("Proof of delivery is added when completing the delivery.", conflict=True)
    proof = DeliveryProof.objects.filter(delivery=delivery).first()
    if proof is None:
        if not signature_name.strip():
            raise WorkflowError("Enter the name of the person who received the delivery.", field="signature_name")
        DeliveryProof.objects.create(delivery=delivery, signature_name=signature_name.strip(), notes=notes,
                                     completed_at=delivery.delivered_at or timezone.now(), recorded_by=user)
    for upload, ctype in photos:
        DeliveryPhoto.objects.create(delivery=delivery, file=upload, content_type=ctype, uploaded_by=user)
    record_audit(action="update", request=request, actor=user, instance=delivery,
                 changes={"proof_photos": [None, len(photos)]})
    return delivery


# --------------------------------------------------------------------------- #
# Group actions (one customer's deliveries handled together)
# --------------------------------------------------------------------------- #
def _one_customer(deliveries) -> list[Delivery]:
    deliveries = list(deliveries)
    if not deliveries:
        raise WorkflowError("Choose at least one delivery.", field="deliveries")
    if len({d.order.customer_id for d in deliveries}) > 1:
        raise WorkflowError("Choose deliveries of one customer only.", field="deliveries")
    return deliveries


@transaction.atomic
def assign_driver_group(deliveries, driver, *, user, scheduled_at=None, note: str = "", request=None) -> list:
    """One driver for all of a customer's selected deliveries (all or nothing)."""
    _check_driver(driver)
    return [assign_driver(d, driver, user=user, scheduled_at=scheduled_at, note=note, request=request)
            for d in _one_customer(deliveries)]


def _copies(files):
    """Read each upload once so the same file can be stored on several deliveries."""
    from django.core.files.base import ContentFile

    out = []
    for upload, ctype in files:
        upload.seek(0)
        out.append((upload.read(), upload.name, ctype))
    return lambda: [(ContentFile(data, name=name), ctype) for data, name, ctype in out]


@transaction.atomic
def complete_group(deliveries, *, user, signature_name: str, notes: str = "", signature_image=None,
                   signature_content_type: str = "", photos=(), completed_at=None, request=None) -> list:
    """Deliver a customer's selected deliveries together with one proof (all or nothing).
    Every delivery keeps its own copy of the signature and photos."""
    deliveries = _one_customer(deliveries)
    completed_at = completed_at or timezone.now()
    photo_copies = _copies(photos)
    signature_copy = _copies([(signature_image, signature_content_type)]) if signature_image else None
    done = []
    for d in deliveries:
        sig = signature_copy()[0][0] if signature_copy else None
        done.append(complete(d, user=user, signature_name=signature_name, notes=notes, signature_image=sig,
                             signature_content_type=signature_content_type, photos=photo_copies(),
                             completed_at=completed_at, request=request))
    return done
