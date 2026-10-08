from django.db.models import Q
from rest_framework import serializers

from apps.accounts.constants import StaffLevel
from apps.accounts.models import User
from apps.core.workflow import allowed_next
from apps.locations.models import City, Warehouse
from apps.orders.models import Order
from apps.orders.serializers import _person
from apps.orders.workflows import status_label

from .models import (
    DELIVERY_ACTION_ONLY,
    DELIVERY_TRANSITIONS,
    Delivery,
    DeliveryEvent,
    DeliveryStatus,
    DeliveryType,
    ExceptionFlag,
)

SOURCE = {"international": "international", "express": "local_delivery", "shop": "shop", "equipment": "local_delivery"}
SOURCE_LABEL = {"international": "International", "local_delivery": "Local Delivery", "shop": "Shop"}


def driver_payload(user) -> dict | None:
    return {"id": user.id, "full_name": user.full_name, "phone": user.phone} if user else None


def stock_bins(deliveries) -> dict:
    """{(variant_id, warehouse_id): bin_code} for every shop line of these deliveries, in one query."""
    from apps.inventory.models import StockItem

    keys = {(i.variant_id, i.warehouse_id) for d in deliveries for i in d.order.items.all() if i.warehouse_id}
    if not keys:
        return {}
    q = Q()
    for variant_id, warehouse_id in keys:
        q |= Q(variant_id=variant_id, warehouse_id=warehouse_id)
    return {(s.variant_id, s.warehouse_id): s.bin_code
            for s in StockItem.objects.filter(q).only("variant_id", "warehouse_id", "bin_code")}


def delivery_items(delivery, bins: dict) -> list[dict]:
    """What is being delivered: shop lines with SKU and bin, or the single item of other orders.

    Each row has a `key`; SKU / bin code the delivery team corrected (Delivery.item_labels) win over the
    stock records. Arrived cargo shows the warehouse it arrived at, not where it was consolidated abroad.
    """
    order = delivery.order
    pickup = delivery.pickup_warehouse.name if delivery.pickup_warehouse_id else ""
    lines = list(order.items.all())
    if lines:
        rows = [{"key": f"line:{i.id}", "product_name": i.product_name, "variant_name": i.variant_name, "sku": i.sku,
                 "quantity": i.quantity, "warehouse": i.warehouse.name if i.warehouse_id else "",
                 "bin_code": bins.get((i.variant_id, i.warehouse_id)) or i.variant.product.bin_code or ""}
                for i in lines]
    elif (cargo := getattr(order, "cargo", None)) is not None:
        rows = [{"key": "cargo", "product_name": cargo.item_name or order.item_details, "variant_name": "", "sku": "",
                 "quantity": cargo.packages_quantity,
                 "warehouse": pickup or (cargo.warehouse.name if cargo.warehouse_id else ""), "bin_code": ""}]
    else:
        rows = [{"key": "item", "product_name": order.item_details, "variant_name": "", "sku": "", "quantity": 1,
                 "warehouse": pickup, "bin_code": ""}]
    labels = delivery.item_labels or {}
    for row in rows:
        row.update({k: v for k, v in (labels.get(row["key"]) or {}).items() if k in ("sku", "bin_code")})
    return rows


class DeliverySerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    delivery_type_display = serializers.CharField(source="get_delivery_type_display", read_only=True)
    exception_flag_display = serializers.CharField(source="get_exception_flag_display", read_only=True)
    order = serializers.SerializerMethodField()
    source = serializers.SerializerMethodField()
    source_display = serializers.SerializerMethodField()
    customer = serializers.SerializerMethodField()
    driver = serializers.SerializerMethodField()
    destination_city = serializers.SerializerMethodField()
    pickup_warehouse = serializers.SerializerMethodField()
    proof = serializers.SerializerMethodField()
    items = serializers.SerializerMethodField()
    allowed_transitions = serializers.SerializerMethodField()

    class Meta:
        model = Delivery
        fields = ["id", "reference", "order", "source", "source_display", "customer", "delivery_type",
                  "delivery_type_display", "status", "status_display", "driver", "scheduled_at", "pickup_point",
                  "pickup_warehouse", "delivery_address", "destination_city", "destination_area", "recipient_name",
                  "recipient_phone", "exception_flag", "exception_flag_display", "attempts", "notes", "delivered_at",
                  "proof", "items", "allowed_transitions", "created_at", "updated_at"]

    def get_order(self, obj) -> dict:
        o = obj.order
        return {"id": o.id, "reference": o.reference, "order_type": o.order_type, "status": o.status,
                "status_display": status_label(o.order_type, o.status)}

    def get_source(self, obj) -> str:
        return SOURCE.get(obj.order.order_type, "local_delivery")

    def get_source_display(self, obj) -> str:
        return SOURCE_LABEL[self.get_source(obj)]

    def get_customer(self, obj) -> dict:
        c = obj.order.customer
        return {"id": c.id, "full_name": c.full_name, "phone": c.phone}

    def get_driver(self, obj) -> dict | None:
        return driver_payload(obj.driver)

    def get_items(self, obj) -> list[dict]:
        bins = self.context.get("bins")
        return delivery_items(obj, stock_bins([obj]) if bins is None else bins)

    def get_destination_city(self, obj) -> dict | None:
        return {"id": obj.destination_city.id, "name": obj.destination_city.name} if obj.destination_city else None

    def get_pickup_warehouse(self, obj) -> dict | None:
        w = obj.pickup_warehouse
        return {"id": w.id, "name": w.name} if w else None

    def get_proof(self, obj) -> dict | None:
        photos = [{"id": p.id, "url": f"deliveries/photos/{p.id}/file"} for p in obj.photos.all()]
        proof = getattr(obj, "proof", None)
        if proof is None:
            return {"photos": photos} if photos else None
        return {
            "signature_name": proof.signature_name,
            "signature_url": f"deliveries/{obj.id}/signature/file" if proof.signature_image else None,
            "notes": proof.notes,
            "completed_at": proof.completed_at,
            "recorded_by": _person(proof.recorded_by),
            "photos": photos,
        }

    def get_allowed_transitions(self, obj) -> list[dict]:
        return allowed_next(obj.status, transitions=DELIVERY_TRANSITIONS, choices=DeliveryStatus,
                            action_only=DELIVERY_ACTION_ONLY)


class DeliveryCreateSerializer(serializers.Serializer):
    order = serializers.PrimaryKeyRelatedField(queryset=Order.objects.select_related("customer"))
    delivery_address = serializers.CharField(max_length=255)
    delivery_type = serializers.ChoiceField(choices=DeliveryType.choices, default=DeliveryType.STANDARD)
    destination_city = serializers.PrimaryKeyRelatedField(queryset=City.objects.all(), required=False,
                                                          allow_null=True)
    destination_area = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")
    pickup_point = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    pickup_warehouse = serializers.PrimaryKeyRelatedField(queryset=Warehouse.objects.all(), required=False,
                                                          allow_null=True)
    scheduled_at = serializers.DateTimeField(required=False, allow_null=True)
    recipient_name = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")
    recipient_phone = serializers.CharField(max_length=32, required=False, allow_blank=True, default="")
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    driver = serializers.PrimaryKeyRelatedField(queryset=User.objects.filter(staff_level=StaffLevel.DRIVER),
                                                required=False, allow_null=True)


class DeliveryUpdateSerializer(serializers.Serializer):
    delivery_address = serializers.CharField(max_length=255, required=False)
    destination_city = serializers.PrimaryKeyRelatedField(queryset=City.objects.all(), required=False,
                                                          allow_null=True)
    destination_area = serializers.CharField(max_length=120, required=False, allow_blank=True)
    pickup_point = serializers.CharField(max_length=255, required=False, allow_blank=True)
    delivery_type = serializers.ChoiceField(choices=DeliveryType.choices, required=False)
    recipient_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    recipient_phone = serializers.CharField(max_length=32, required=False, allow_blank=True)
    exception_flag = serializers.ChoiceField(choices=ExceptionFlag.choices, required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)


class AssignDriverSerializer(serializers.Serializer):
    driver = serializers.PrimaryKeyRelatedField(queryset=User.objects.all())
    scheduled_at = serializers.DateTimeField(required=False, allow_null=True)
    note = serializers.CharField(required=False, allow_blank=True, default="")


class BulkAssignDriverSerializer(AssignDriverSerializer):
    deliveries = serializers.ListField(child=serializers.IntegerField(), min_length=1, max_length=100)


class DeliveryTransitionSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=DeliveryStatus.choices)
    note = serializers.CharField(required=False, allow_blank=True, default="")
    exception_flag = serializers.ChoiceField(choices=ExceptionFlag.choices, required=False, allow_blank=True)
    scheduled_at = serializers.DateTimeField(required=False, allow_null=True)


class ItemLabelSerializer(serializers.Serializer):
    key = serializers.CharField(max_length=40)
    sku = serializers.CharField(max_length=64, required=False, allow_blank=True)
    bin_code = serializers.CharField(max_length=60, required=False, allow_blank=True)

    def validate(self, attrs):
        if "sku" not in attrs and "bin_code" not in attrs:
            raise serializers.ValidationError("Send an SKU, a bin code or both.")
        return attrs


class CompleteSerializer(serializers.Serializer):
    signature_name = serializers.CharField(max_length=150)
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    completed_at = serializers.DateTimeField(required=False)
    signature_image = serializers.FileField(required=False)
    photos = serializers.ListField(child=serializers.FileField(), required=False, max_length=6)


class BulkCompleteSerializer(CompleteSerializer):
    deliveries = serializers.ListField(child=serializers.IntegerField(), min_length=1, max_length=100)


class DeliveryEventSerializer(serializers.ModelSerializer):
    from_status_display = serializers.SerializerMethodField()
    to_status_display = serializers.SerializerMethodField()
    changed_by = serializers.SerializerMethodField()

    class Meta:
        model = DeliveryEvent
        fields = ["id", "from_status", "from_status_display", "to_status", "to_status_display", "note", "changed_by",
                  "created_at"]

    def get_from_status_display(self, obj) -> str | None:
        return dict(DeliveryStatus.choices).get(obj.from_status) if obj.from_status else None

    def get_to_status_display(self, obj) -> str | None:
        return dict(DeliveryStatus.choices).get(obj.to_status)

    def get_changed_by(self, obj) -> dict | None:
        return _person(obj.changed_by)
