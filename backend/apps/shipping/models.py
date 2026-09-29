"""
Shipping & Tracking.

A CargoParcel follows an international order's goods through the
consolidation warehouse: Waiting to Receive → Ready for Shipment → in a
Shipment → Arrived. Shipments consolidate parcels and move through the
milestones Created → Booked → Loaded → Export Cleared → Shipping to
Destination → Clearance → Completed; every change is a ShipmentEvent and
moves the international orders on board. Changes go only through
`apps.shipping.services`.
"""
from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models

from apps.core.models import TimeStampedModel
from apps.core.uploads import safe_filename

POSITIVE = [MinValueValidator(Decimal("0"))]


class ParcelStage(models.TextChoices):
    WAITING = "waiting", "Waiting to Receive"
    READY = "ready", "Ready for Shipment"
    IN_SHIPMENT = "in_shipment", "In Shipment"
    ARRIVED = "arrived", "Arrived"
    CANCELLED = "cancelled", "Cancelled"


class ParcelSource(models.TextChoices):
    AGIZA_PROCURED = "agiza_procured", "Agiza Procured"
    CLIENT_PURCHASED = "client_purchased", "Client Purchased"


class CargoType(models.TextChoices):
    STANDARD = "standard", "Standard"
    ELECTRONIC_BATTERY = "electronic_battery", "Electronic w/ Battery"
    BULK = "bulk", "Bulk"
    MACHINERY = "machinery", "Machinery"
    FRAGILE = "fragile", "Fragile"


class WeightType(models.TextChoices):
    ESTIMATED = "estimated", "Estimated"
    EXACT = "exact", "Exact"


class ShipmentStatus(models.TextChoices):
    CREATED = "created", "Created"
    BOOKED = "booked", "Booked"
    LOADED = "loaded", "Loaded"
    EXPORT_CLEARED = "export_cleared", "Export Cleared"
    SHIPPING_TO_DESTINATION = "shipping_to_destination", "Shipping to Destination"
    CLEARANCE = "clearance", "Clearance"
    COMPLETED = "completed", "Completed"
    CANCELLED = "cancelled", "Cancelled"


S = ShipmentStatus
SHIPMENT_TRANSITIONS = {
    S.CREATED: {S.BOOKED, S.CANCELLED},
    S.BOOKED: {S.LOADED, S.CANCELLED},
    S.LOADED: {S.EXPORT_CLEARED},
    S.EXPORT_CLEARED: {S.SHIPPING_TO_DESTINATION},
    S.SHIPPING_TO_DESTINATION: {S.CLEARANCE},
    S.CLEARANCE: {S.COMPLETED},
    S.COMPLETED: set(),
    S.CANCELLED: set(),
}
# Parcels can be added or removed only before the cargo is loaded.
OPEN_STATUSES = {S.CREATED, S.BOOKED}


class ShipmentAlert(models.TextChoices):
    NONE = "", "All Good"
    CUSTOMS_HOLD = "customs_hold", "Customs Hold"
    DOCUMENT_MISSING = "document_missing", "Document Missing"
    CARRIER_DELAY = "carrier_delay", "Carrier Delay"


class Shipment(TimeStampedModel):
    cargo_id = models.CharField(max_length=24, unique=True, editable=False)
    shipment_number = models.CharField(max_length=40, unique=True)
    shipper = models.ForeignKey("shipping_engine.Carrier", on_delete=models.PROTECT, related_name="shipments")
    shipping_method = models.ForeignKey("shipping_engine.ShippingMethod", on_delete=models.PROTECT,
                                        related_name="shipments")
    origin_country = models.ForeignKey("locations.Country", on_delete=models.PROTECT, related_name="+")
    origin_warehouse = models.ForeignKey("locations.Warehouse", null=True, blank=True, on_delete=models.PROTECT,
                                         related_name="outbound_shipments")
    destination_city = models.ForeignKey("locations.City", on_delete=models.PROTECT, related_name="+")
    status = models.CharField(max_length=24, choices=ShipmentStatus.choices, default=ShipmentStatus.CREATED,
                              db_index=True)
    master_tracking_number = models.CharField(max_length=80, blank=True, help_text="Bill of lading / air waybill")
    eta = models.DateField(null=True, blank=True)
    departed_at = models.DateTimeField(null=True, blank=True)
    arrived_at = models.DateTimeField(null=True, blank=True)
    alert = models.CharField(max_length=20, choices=ShipmentAlert.choices, blank=True, default="")
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="+")

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["shipper"]), models.Index(fields=["alert"])]

    def __str__(self) -> str:
        return f"{self.cargo_id} · {self.shipment_number}"


class CargoParcel(TimeStampedModel):
    order = models.OneToOneField("orders.Order", on_delete=models.PROTECT, related_name="cargo")
    stage = models.CharField(max_length=12, choices=ParcelStage.choices, default=ParcelStage.WAITING, db_index=True)
    source = models.CharField(max_length=20, choices=ParcelSource.choices)
    shipper = models.ForeignKey("shipping_engine.Carrier", null=True, blank=True, on_delete=models.PROTECT,
                                related_name="parcels", help_text="Preferred shipper / forwarder")
    shipping_method = models.ForeignKey("shipping_engine.ShippingMethod", null=True, blank=True,
                                        on_delete=models.PROTECT, related_name="parcels")
    warehouse = models.ForeignKey("locations.Warehouse", null=True, blank=True, on_delete=models.PROTECT,
                                  related_name="parcels", help_text="Consolidation warehouse")
    destination_city = models.ForeignKey("locations.City", null=True, blank=True, on_delete=models.PROTECT,
                                         related_name="+")
    supplier_tracking_number = models.CharField(max_length=80, blank=True)
    item_name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    packages_quantity = models.PositiveSmallIntegerField(default=1)
    estimated_arrival = models.DateField(null=True, blank=True, help_text="Expected at the consolidation warehouse")
    cargo_type = models.CharField(max_length=20, choices=CargoType.choices, default=CargoType.STANDARD)
    weight_kg = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True, validators=POSITIVE)
    cbm = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True, validators=POSITIVE)
    weight_type = models.CharField(max_length=10, choices=WeightType.choices, default=WeightType.ESTIMATED)
    received_at = models.DateTimeField(null=True, blank=True)
    received_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                    related_name="+")
    shipment = models.ForeignKey(Shipment, null=True, blank=True, on_delete=models.PROTECT, related_name="parcels")
    added_to_shipment_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self) -> str:
        return f"Cargo {self.order.reference}"


class ShipmentEvent(models.Model):
    """Tracking history: status milestones and free-form tracking updates."""

    class Kind(models.TextChoices):
        STATUS = "status", "Status change"
        UPDATE = "update", "Tracking update"
        PARCEL = "parcel", "Parcels changed"
        ALERT = "alert", "Alert"

    shipment = models.ForeignKey(Shipment, on_delete=models.CASCADE, related_name="events")
    kind = models.CharField(max_length=10, choices=Kind.choices)
    from_status = models.CharField(max_length=24, blank=True)
    to_status = models.CharField(max_length=24, blank=True)
    description = models.CharField(max_length=255, blank=True)
    location = models.CharField(max_length=150, blank=True)
    occurred_at = models.DateTimeField()
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["occurred_at", "id"]
        indexes = [models.Index(fields=["shipment", "occurred_at"])]

    def __str__(self) -> str:
        return f"{self._meta.verbose_name} #{self.pk}"


def document_path(instance, filename):
    return f"shipments/{instance.shipment_id}/{safe_filename(filename)}"


class ShipmentDocument(TimeStampedModel):
    shipment = models.ForeignKey(Shipment, on_delete=models.CASCADE, related_name="documents")
    file = models.FileField(upload_to=document_path)
    name = models.CharField(max_length=160)
    content_type = models.CharField(max_length=100, blank=True)
    notes = models.CharField(max_length=255, blank=True)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                    related_name="+")

    class Meta:
        ordering = ["created_at", "id"]
