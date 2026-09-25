from decimal import Decimal

from django.db.models import Q
from rest_framework import serializers

from apps.locations.models import City, Country
from apps.orders.models import Classification, EquipmentDetails, InternationalDetails, PackageSize, Priority
from apps.orders.serializers import CustomerRefSerializer
from apps.parties.models import Customer

from .models import QuoteRequest, QuoteStatusHistory, ServiceType


class QuoteSerializer(serializers.ModelSerializer):
    customer = CustomerRefSerializer(read_only=True)
    customer_id = serializers.PrimaryKeyRelatedField(
        source="customer", queryset=Customer.objects.filter(status="active"), write_only=True
    )
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    service_type_display = serializers.CharField(source="get_service_type_display", read_only=True)
    responded_by = serializers.SerializerMethodField()
    created_order = serializers.SerializerMethodField()

    class Meta:
        model = QuoteRequest
        fields = [
            "id", "reference", "customer", "customer_id", "service_type", "service_type_display", "description",
            "origin", "destination", "status", "status_display", "requested_at", "quoted_amount", "currency",
            "estimated_delivery", "response_notes", "responded_by", "responded_at", "customer_replied_at",
            "approved_at", "created_order", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "reference", "status", "quoted_amount", "currency", "estimated_delivery", "response_notes",
            "responded_at", "customer_replied_at", "approved_at", "created_at", "updated_at",
        ]

    def get_responded_by(self, obj) -> dict | None:
        return {"id": obj.responded_by.id, "full_name": obj.responded_by.full_name} if obj.responded_by else None

    def get_created_order(self, obj) -> dict | None:
        order = getattr(obj, "created_order", None)
        if not order:
            return None
        return {"id": order.id, "reference": order.reference, "order_type": order.order_type}

    def validate(self, attrs):
        if self.instance and self.instance.status != "new" and set(attrs) - {"description"}:
            raise serializers.ValidationError("Only new quotations can be edited.")
        return attrs


class QuoteHistorySerializer(serializers.ModelSerializer):
    changed_by = serializers.SerializerMethodField()

    class Meta:
        model = QuoteStatusHistory
        fields = ["id", "from_status", "to_status", "changed_by", "note", "created_at"]

    def get_changed_by(self, obj) -> dict | None:
        return {"id": obj.changed_by.id, "full_name": obj.changed_by.full_name} if obj.changed_by else None


class RespondSerializer(serializers.Serializer):
    quoted_amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"))
    estimated_delivery = serializers.DateField(required=False, allow_null=True)
    response_notes = serializers.CharField(required=False, allow_blank=True, default="")


class ReplySerializer(serializers.Serializer):
    accepted = serializers.BooleanField()
    note = serializers.CharField(required=False, allow_blank=True, default="")


# ---- approval: the order details each service type needs --------------------
class ApproveExpressSerializer(serializers.Serializer):
    item_details = serializers.CharField(max_length=255, required=False, allow_blank=True)
    pickup_address = serializers.CharField(max_length=255)
    pickup_city = serializers.PrimaryKeyRelatedField(queryset=City.objects.all(), required=False, allow_null=True)
    delivery_address = serializers.CharField(max_length=255)
    delivery_city = serializers.PrimaryKeyRelatedField(queryset=City.objects.all(), required=False, allow_null=True)
    priority = serializers.ChoiceField(choices=Priority.choices, default=Priority.STANDARD)
    weight_kg = serializers.DecimalField(max_digits=10, decimal_places=3, min_value=Decimal("0.001"), required=False, allow_null=True)
    package_size = serializers.ChoiceField(choices=PackageSize.choices, required=False, allow_blank=True, default="")

    def validate(self, attrs):
        attrs["customer_package_size"] = attrs.get("package_size", "")
        return attrs


class ApproveInternationalSerializer(serializers.Serializer):
    item_details = serializers.CharField(max_length=255, required=False, allow_blank=True)
    source_country = serializers.PrimaryKeyRelatedField(queryset=Country.objects.filter(is_sourcing_origin=True))
    order_class = serializers.ChoiceField(choices=Classification.choices, default=Classification.SIMPLE)
    service_type = serializers.ChoiceField(choices=InternationalDetails.ServiceType.choices,
                                           default=InternationalDetails.ServiceType.FULL_SERVICE)
    installment_plan = serializers.BooleanField(default=False)


class ApproveEquipmentSerializer(serializers.Serializer):
    item_details = serializers.CharField(max_length=255, required=False, allow_blank=True)
    service_type = serializers.ChoiceField(choices=EquipmentDetails.ServiceType.choices)
    equipment = serializers.CharField(max_length=160)
    classification = serializers.ChoiceField(choices=Classification.choices, default=Classification.SIMPLE)
    city = serializers.PrimaryKeyRelatedField(queryset=City.objects.all(), required=False, allow_null=True)
    site_address = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    expected_date = serializers.DateTimeField(required=False, allow_null=True)


APPROVE_SERIALIZER = {
    ServiceType.EXPRESS: ApproveExpressSerializer,
    ServiceType.INTERNATIONAL: ApproveInternationalSerializer,
    ServiceType.EQUIPMENT: ApproveEquipmentSerializer,
}


def guess_country(text: str) -> Country | None:
    """Match a free-text origin like "China" or "Dubai" to a sourcing country."""
    text = (text or "").strip()
    if not text:
        return None
    return (
        Country.objects.filter(is_sourcing_origin=True)
        .filter(Q(name__iexact=text) | Q(display_name__icontains=text) | Q(iso2__iexact=text) | Q(cities__name__iexact=text))
        .distinct()
        .first()
    )
