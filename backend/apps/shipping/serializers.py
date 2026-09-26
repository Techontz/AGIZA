from decimal import Decimal

from rest_framework import serializers

from apps.core.workflow import allowed_next
from apps.locations.models import City, Warehouse
from apps.orders.serializers import _dec, _person
from apps.orders.services import payment_summary, prefetched_net_paid
from apps.orders.workflows import status_label
from apps.shipping_engine.models import Carrier, ShippingMethod

from . import services
from .models import (
    SHIPMENT_TRANSITIONS,
    CargoParcel,
    CargoType,
    ParcelStage,
    Shipment,
    ShipmentAlert,
    ShipmentDocument,
    ShipmentEvent,
    ShipmentStatus,
    WeightType,
)

METHOD_TYPE = {"air": "air-cargo", "sea": "sea", "land": "road", "local": "road"}


def _named(obj) -> dict | None:
    return {"id": obj.id, "name": obj.name} if obj else None


def _method(m) -> dict | None:
    return {"id": m.id, "name": m.name, "category": m.category, "type": METHOD_TYPE[m.category]} if m else None


def _destination(city) -> str | None:
    return f"{city.name}, {city.country.name}" if city else None


def _image(order) -> str | None:
    for att in order.attachments.all():
        if att.content_type.startswith("image/"):
            return f"orders/attachments/{att.id}/file"
    return None


class ParcelSerializer(serializers.ModelSerializer):
    order = serializers.SerializerMethodField()
    origin = serializers.SerializerMethodField()
    stage_display = serializers.CharField(source="get_stage_display", read_only=True)
    source_display = serializers.CharField(source="get_source_display", read_only=True)
    cargo_type_display = serializers.CharField(source="get_cargo_type_display", read_only=True)
    shipper = serializers.SerializerMethodField()
    shipping_method = serializers.SerializerMethodField()
    warehouse = serializers.SerializerMethodField()
    destination = serializers.SerializerMethodField()
    weight_kg = serializers.SerializerMethodField()
    cbm = serializers.SerializerMethodField()
    exception_flags = serializers.SerializerMethodField()
    image = serializers.SerializerMethodField()
    shipment = serializers.SerializerMethodField()

    class Meta:
        model = CargoParcel
        fields = ["id", "order", "origin", "stage", "stage_display", "source", "source_display", "shipper",
                  "shipping_method", "warehouse", "destination", "supplier_tracking_number", "item_name", "description",
                  "packages_quantity", "estimated_arrival", "cargo_type", "cargo_type_display", "weight_kg", "cbm",
                  "weight_type", "received_at", "exception_flags", "image", "shipment", "updated_at"]

    def get_order(self, obj) -> dict:
        o = obj.order
        return {"id": o.id, "reference": o.reference, "status": o.status,
                "status_display": status_label(o.order_type, o.status), "customer": o.customer.full_name,
                "payment_status": payment_summary(o, prefetched_net_paid(o)).status}

    def get_origin(self, obj) -> dict:
        c = obj.order.international.source_country
        return {"iso2": c.iso2, "name": c.display_name}

    def get_shipper(self, obj) -> dict | None:
        return _named(obj.shipper)

    def get_shipping_method(self, obj) -> dict | None:
        return _method(obj.shipping_method)

    def get_warehouse(self, obj) -> dict | None:
        return {"id": obj.warehouse.id, "name": obj.warehouse.name, "code": obj.warehouse.code} if obj.warehouse else None

    def get_destination(self, obj) -> dict | None:
        c = obj.destination_city
        return {"id": c.id, "name": c.name, "label": _destination(c)} if c else None

    def get_weight_kg(self, obj) -> str | None:
        return _dec(obj.weight_kg, 3)

    def get_cbm(self, obj) -> str | None:
        return _dec(obj.cbm, 4)

    def get_exception_flags(self, obj) -> list[str]:
        return services.exception_flags(obj)

    def get_image(self, obj) -> str | None:
        return _image(obj.order)

    def get_shipment(self, obj) -> dict | None:
        s = obj.shipment
        return {"id": s.id, "cargo_id": s.cargo_id, "shipment_number": s.shipment_number} if s else None


class ParcelUpdateSerializer(serializers.Serializer):
    shipper = serializers.PrimaryKeyRelatedField(queryset=Carrier.objects.all(), required=False, allow_null=True)
    shipping_method = serializers.PrimaryKeyRelatedField(queryset=ShippingMethod.objects.all(), required=False,
                                                         allow_null=True)
    destination_city = serializers.PrimaryKeyRelatedField(queryset=City.objects.all(), required=False,
                                                          allow_null=True)
    warehouse = serializers.PrimaryKeyRelatedField(queryset=Warehouse.objects.all(), required=False, allow_null=True)
    supplier_tracking_number = serializers.CharField(max_length=80, required=False, allow_blank=True)
    item_name = serializers.CharField(max_length=200, required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    packages_quantity = serializers.IntegerField(min_value=1, max_value=32767, required=False)
    estimated_arrival = serializers.DateField(required=False, allow_null=True)
    cargo_type = serializers.ChoiceField(choices=CargoType.choices, required=False)
    weight_kg = serializers.DecimalField(max_digits=10, decimal_places=3, min_value=Decimal("0.001"), required=False)
    cbm = serializers.DecimalField(max_digits=10, decimal_places=4, min_value=Decimal("0"), required=False,
                                   allow_null=True)
    weight_type = serializers.ChoiceField(choices=WeightType.choices, required=False)


class ReceiveSerializer(serializers.Serializer):
    weight_kg = serializers.DecimalField(max_digits=10, decimal_places=3, min_value=Decimal("0.001"))
    cbm = serializers.DecimalField(max_digits=10, decimal_places=4, min_value=Decimal("0"), required=False,
                                   allow_null=True)
    weight_type = serializers.ChoiceField(choices=WeightType.choices, default=WeightType.EXACT)
    packages_quantity = serializers.IntegerField(min_value=1, max_value=32767, required=False)
    warehouse = serializers.PrimaryKeyRelatedField(queryset=Warehouse.objects.filter(status="active"),
                                                   required=False, allow_null=True)
    cargo_type = serializers.ChoiceField(choices=CargoType.choices, required=False)
    shipper = serializers.PrimaryKeyRelatedField(queryset=Carrier.objects.all(), required=False, allow_null=True)
    shipping_method = serializers.PrimaryKeyRelatedField(queryset=ShippingMethod.objects.all(), required=False,
                                                         allow_null=True)
    destination_city = serializers.PrimaryKeyRelatedField(queryset=City.objects.all(), required=False,
                                                          allow_null=True)
    note = serializers.CharField(required=False, allow_blank=True, default="")


# --------------------------------------------------------------------------- #
# Shipments
# --------------------------------------------------------------------------- #
class ShipmentEventSerializer(serializers.ModelSerializer):
    kind_display = serializers.CharField(source="get_kind_display", read_only=True)
    created_by = serializers.SerializerMethodField()
    to_status_display = serializers.SerializerMethodField()

    class Meta:
        model = ShipmentEvent
        fields = ["id", "kind", "kind_display", "from_status", "to_status", "to_status_display", "description",
                  "location", "occurred_at", "created_by", "created_at"]

    def get_created_by(self, obj) -> dict | None:
        return _person(obj.created_by)

    def get_to_status_display(self, obj) -> str | None:
        return dict(ShipmentStatus.choices).get(obj.to_status) if obj.to_status else None


class DocumentSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = ShipmentDocument
        fields = ["id", "name", "notes", "content_type", "url", "created_at"]

    def get_url(self, obj) -> str:
        return f"shipping/documents/{obj.id}/file"


class ShipmentSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    alert_display = serializers.CharField(source="get_alert_display", read_only=True)
    shipper = serializers.SerializerMethodField()
    shipping_method = serializers.SerializerMethodField()
    origin = serializers.SerializerMethodField()
    origin_warehouse = serializers.SerializerMethodField()
    destination = serializers.SerializerMethodField()
    weight_kg = serializers.SerializerMethodField()
    cbm = serializers.SerializerMethodField()
    orders = serializers.SerializerMethodField()
    documents = DocumentSerializer(many=True, read_only=True)
    allowed_transitions = serializers.SerializerMethodField()

    class Meta:
        model = Shipment
        fields = ["id", "cargo_id", "shipment_number", "shipper", "shipping_method", "origin", "origin_warehouse",
                  "destination", "status", "status_display", "weight_kg", "cbm", "eta", "departed_at", "arrived_at",
                  "alert", "alert_display", "master_tracking_number", "notes", "orders", "documents",
                  "allowed_transitions", "created_at", "updated_at"]

    def get_shipper(self, obj) -> dict:
        return _named(obj.shipper)

    def get_shipping_method(self, obj) -> dict:
        return _method(obj.shipping_method)

    def get_origin(self, obj) -> dict:
        return {"iso2": obj.origin_country.iso2, "name": obj.origin_country.display_name}

    def get_origin_warehouse(self, obj) -> dict | None:
        w = obj.origin_warehouse
        return {"id": w.id, "name": w.name, "code": w.code} if w else None

    def get_destination(self, obj) -> dict:
        return {"id": obj.destination_city_id, "name": obj.destination_city.name,
                "label": _destination(obj.destination_city)}

    def _parcels(self, obj):
        return list(obj.parcels.all())

    def get_weight_kg(self, obj) -> str:
        return _dec(sum((p.weight_kg or Decimal("0") for p in self._parcels(obj)), Decimal("0")), 3)

    def get_cbm(self, obj) -> str:
        return _dec(sum((p.cbm or Decimal("0") for p in self._parcels(obj)), Decimal("0")), 4)

    def get_orders(self, obj) -> list[dict]:
        events = list(obj.events.all())
        return [
            {"parcel_id": p.id, "order_id": p.order_id, "reference": p.order.reference,
             "customer": p.order.customer.full_name, "item_name": p.item_name, "weight_kg": _dec(p.weight_kg, 3),
             "cbm": _dec(p.cbm, 4), "timeline": services.milestone_timeline(p, obj, events)}
            for p in self._parcels(obj)
        ]

    def get_allowed_transitions(self, obj) -> list[dict]:
        return allowed_next(obj.status, transitions=SHIPMENT_TRANSITIONS, choices=ShipmentStatus)


class ShipmentCreateSerializer(serializers.Serializer):
    parcels = serializers.PrimaryKeyRelatedField(queryset=CargoParcel.objects.all(), many=True)
    shipper = serializers.PrimaryKeyRelatedField(queryset=Carrier.objects.all())
    shipping_method = serializers.PrimaryKeyRelatedField(queryset=ShippingMethod.objects.all())
    destination_city = serializers.PrimaryKeyRelatedField(queryset=City.objects.select_related("country"))
    origin_warehouse = serializers.PrimaryKeyRelatedField(queryset=Warehouse.objects.all(), required=False,
                                                          allow_null=True)
    eta = serializers.DateField(required=False, allow_null=True)
    master_tracking_number = serializers.CharField(max_length=80, required=False, allow_blank=True, default="")
    shipment_number = serializers.CharField(max_length=40, required=False, allow_blank=True, default="")
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class ShipmentUpdateSerializer(serializers.Serializer):
    eta = serializers.DateField(required=False, allow_null=True)
    master_tracking_number = serializers.CharField(max_length=80, required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)
    alert = serializers.ChoiceField(choices=ShipmentAlert.choices, required=False, allow_blank=True)
    alert_note = serializers.CharField(required=False, allow_blank=True, default="")


class ParcelsSerializer(serializers.Serializer):
    parcels = serializers.PrimaryKeyRelatedField(queryset=CargoParcel.objects.all(), many=True)


class RemoveParcelSerializer(serializers.Serializer):
    parcel = serializers.PrimaryKeyRelatedField(queryset=CargoParcel.objects.all())


class ShipmentTransitionSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=ShipmentStatus.choices)
    note = serializers.CharField(required=False, allow_blank=True, default="")
    location = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")
    occurred_at = serializers.DateTimeField(required=False)


class TrackingUpdateSerializer(serializers.Serializer):
    description = serializers.CharField(max_length=255)
    location = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")
    occurred_at = serializers.DateTimeField(required=False)


PARCEL_STAGES = [s for s, _ in ParcelStage.choices]
