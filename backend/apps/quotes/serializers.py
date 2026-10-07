from decimal import Decimal

from django.db.models import Q
from rest_framework import serializers

from apps.locations.models import City, Country
from apps.orders.models import Classification, EquipmentDetails, InternationalDetails, PackageSize, Priority
from apps.orders.serializers import CustomerRefSerializer
from apps.parties.models import Customer

from .models import QuoteItem, QuoteRequest, QuoteStatusHistory, ServiceType

MAX_ITEMS = 30


def order_ref(order) -> dict | None:
    return {"id": order.id, "reference": order.reference, "order_type": order.order_type} if order else None


def photo_ref(quote_id: int, a) -> dict:
    # Relative to the API root; the admin's proxy serves them with the staff session.
    return {"id": a.id, "url": f"quotes/{quote_id}/photos/{a.id}/file", "from_agiza": a.from_agiza, "item": a.item_id}


def items_summary(items: list[dict]) -> str:
    """The quotation's description for a multi-item request (what the customer sees as its text)."""
    lines = [f"Several items ({len(items)})"]
    for i, it in enumerate(items, 1):
        qty = it.get("quantity") or 1
        lines.append(f"{i}. {it['name']}" + (f" ×{qty}" if qty > 1 else ""))
    return "\n".join(lines)


class QuoteItemSerializer(serializers.ModelSerializer):
    """An item line, written when staff create the quotation and read back with its price, photos and order."""

    origin_country = serializers.PrimaryKeyRelatedField(queryset=Country.objects.all(), required=False, allow_null=True)
    origin_country_name = serializers.CharField(source="origin_country.name", read_only=True, default=None)
    service_display = serializers.CharField(source="get_service_display", read_only=True)
    photos = serializers.SerializerMethodField()
    created_order = serializers.SerializerMethodField()

    class Meta:
        model = QuoteItem
        fields = [
            "id", "position", "name", "quantity", "link", "category", "notes", "service", "service_display",
            "tracking_number", "origin_country", "origin_country_name", "unit_price", "amount", "price_notes",
            "photos", "created_order",
        ]
        read_only_fields = ["id", "position", "unit_price", "amount", "price_notes"]

    def get_photos(self, obj) -> list[dict]:
        return [photo_ref(obj.quote_id, a) for a in obj.attachments.all()]

    def get_created_order(self, obj) -> dict | None:
        return order_ref(obj.created_order)


class QuoteSerializer(serializers.ModelSerializer):
    customer = CustomerRefSerializer(read_only=True)
    customer_id = serializers.PrimaryKeyRelatedField(
        source="customer", queryset=Customer.objects.filter(status="active"), write_only=True
    )
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    service_type_display = serializers.CharField(source="get_service_type_display", read_only=True)
    responded_by = serializers.SerializerMethodField()
    created_order = serializers.SerializerMethodField()
    created_orders = serializers.SerializerMethodField()
    photos = serializers.SerializerMethodField()
    # "Several items, one quotation": optional item lines (write on create; read with prices and orders).
    items = QuoteItemSerializer(many=True, required=False)
    description = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = QuoteRequest
        fields = [
            "id", "reference", "customer", "customer_id", "service_type", "service_type_display", "description",
            "origin", "destination", "status", "status_display", "requested_at", "quoted_amount", "currency",
            "estimated_delivery", "response_notes", "responded_by", "responded_at", "customer_replied_at",
            "approved_at", "created_order", "created_orders", "photos", "items", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "reference", "status", "quoted_amount", "currency", "estimated_delivery", "response_notes",
            "responded_at", "customer_replied_at", "approved_at", "created_at", "updated_at",
        ]

    def get_photos(self, obj) -> list[dict]:
        return [photo_ref(obj.id, a) for a in obj.attachments.all()]

    def get_responded_by(self, obj) -> dict | None:
        return {"id": obj.responded_by.id, "full_name": obj.responded_by.full_name} if obj.responded_by else None

    def get_created_order(self, obj) -> dict | None:
        return order_ref(getattr(obj, "created_order", None))

    def get_created_orders(self, obj) -> list[dict]:
        """Every order the quotation became: one per item for a multi-item quotation."""
        items = obj.items.all()
        if items:
            return [order_ref(it.created_order) for it in items if it.created_order_id]
        order = getattr(obj, "created_order", None)
        return [order_ref(order)] if order else []

    def validate_items(self, items):
        if len(items) > MAX_ITEMS:
            raise serializers.ValidationError(f"A quotation can hold at most {MAX_ITEMS} items.")
        return items

    def validate(self, attrs):
        if self.instance:
            if "items" in attrs:
                raise serializers.ValidationError({"items": "Items can't be changed after the quotation is created."})
            if self.instance.status != "new" and set(attrs) - {"description"}:
                raise serializers.ValidationError("Only new quotations can be edited.")
            if "description" in attrs and not attrs["description"].strip():
                raise serializers.ValidationError({"description": "Describe what the customer needs."})
            return attrs
        items = attrs.get("items") or []
        service_type = attrs.get("service_type")
        for i, item in enumerate(items):
            if item.get("service") and service_type != ServiceType.INTERNATIONAL:
                raise serializers.ValidationError(
                    {"items": {i: {"service": "Buy for me / Deliver for me applies to international quotations."}}})
        if not items and not (attrs.get("description") or "").strip():
            raise serializers.ValidationError({"description": "Describe what the customer needs."})
        if items and not (attrs.get("description") or "").strip():
            attrs["description"] = items_summary(items)
        return attrs

    def create(self, validated_data):
        items = validated_data.pop("items", [])
        quote = super().create(validated_data)
        QuoteItem.objects.bulk_create([QuoteItem(quote=quote, position=i, **item) for i, item in enumerate(items)])
        return quote


class QuoteHistorySerializer(serializers.ModelSerializer):
    changed_by = serializers.SerializerMethodField()

    class Meta:
        model = QuoteStatusHistory
        fields = ["id", "from_status", "to_status", "changed_by", "note", "created_at"]

    def get_changed_by(self, obj) -> dict | None:
        return {"id": obj.changed_by.id, "full_name": obj.changed_by.full_name} if obj.changed_by else None


class ItemPriceSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    unit_price = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"), required=False,
                                          allow_null=True)
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"), required=False,
                                      allow_null=True)
    price_notes = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        if not attrs.get("amount") and not attrs.get("unit_price"):
            raise serializers.ValidationError("Enter the item's price (unit price or amount).")
        return attrs


class RespondSerializer(serializers.Serializer):
    # A single-description quotation is priced as a whole; a multi-item one item by item (total = their sum).
    quoted_amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"), required=False,
                                             allow_null=True)
    items = ItemPriceSerializer(many=True, required=False)
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


def app_item_lines(quote: QuoteRequest) -> list[dict]:
    """Item lines for the customer app (prices once the quotation has been sent). Empty for single-item quotes.
    Photos are ids into the quotation's `photos` list."""
    priced = quote.status not in ("new",)
    return [
        {
            "id": it.id, "name": it.name, "quantity": it.quantity, "link": it.link, "category": it.category,
            "notes": it.notes, "service": it.service, "tracking_number": it.tracking_number,
            "origin_country": it.origin_country.name if it.origin_country_id else None,
            "unit_price": str(it.unit_price) if priced and it.unit_price is not None else None,
            "amount": str(it.amount) if priced and it.amount is not None else None,
            "price_notes": it.price_notes if priced else "",
            "photo_ids": [a.id for a in it.attachments.all()],
            "order": it.created_order.reference if it.created_order_id else None,
        }
        for it in quote.items.all()
    ]
