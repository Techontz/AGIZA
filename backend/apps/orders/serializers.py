from decimal import Decimal

from rest_framework import serializers

from apps.accounts.models import User
from apps.catalog.models import ProductVariant
from apps.locations.models import City, Country
from apps.parties.models import Customer

from .models import (
    Classification,
    EquipmentDetails,
    ExpressDetails,
    InternationalDetails,
    Order,
    OrderAttachment,
    OrderItem,
    OrderStatusHistory,
    PackageSize,
    Payment,
    Priority,
    ShopDetails,
)
from .services import payment_summary
from .workflows import EXPRESS_STAGE, WORKFLOWS, ExpressStatus, OrderType, status_label


def _dec(value, places: int = 2) -> str | None:
    """Exact decimal string for hand-built JSON (DRF would emit a float)."""
    if value is None:
        return None
    return f"{value:.{places}f}"


def _person(user) -> dict | None:
    return {"id": user.id, "full_name": user.full_name} if user else None


class CustomerRefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = ["id", "reference", "full_name", "phone", "email"]


class HistorySerializer(serializers.ModelSerializer):
    from_status_display = serializers.SerializerMethodField()
    to_status_display = serializers.SerializerMethodField()
    changed_by = serializers.SerializerMethodField()

    class Meta:
        model = OrderStatusHistory
        fields = ["id", "from_status", "from_status_display", "to_status", "to_status_display", "changed_by", "note", "created_at"]

    def _label(self, obj, status):
        return status_label(obj.order.order_type, status) if status else None

    def get_from_status_display(self, obj) -> str | None:
        return self._label(obj, obj.from_status)

    def get_to_status_display(self, obj) -> str | None:
        return self._label(obj, obj.to_status)

    def get_changed_by(self, obj) -> dict | None:
        return _person(obj.changed_by)


class PaymentSerializer(serializers.ModelSerializer):
    method_display = serializers.CharField(source="get_method_display", read_only=True)
    kind_display = serializers.CharField(source="get_kind_display", read_only=True)
    recorded_by = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = ["id", "amount", "currency", "method", "method_display", "kind", "kind_display", "reference",
                  "paid_at", "notes", "recorded_by", "created_at"]
        read_only_fields = ["id", "currency", "recorded_by", "created_at"]

    def get_recorded_by(self, obj) -> dict | None:
        return _person(obj.recorded_by)


class RecordPaymentSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"))
    method = serializers.ChoiceField(choices=Payment.Method.choices)
    kind = serializers.ChoiceField(choices=[c for c in Payment.Kind.choices if c[0] != "refund"], default="balance")
    reference = serializers.CharField(max_length=80, required=False, allow_blank=True, default="")
    paid_at = serializers.DateTimeField(required=False)
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class AttachmentSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = OrderAttachment
        fields = ["id", "caption", "content_type", "url", "created_at"]

    def get_url(self, obj) -> str:
        # Relative to the API root; the Next.js proxy serves it with the session.
        return f"orders/attachments/{obj.id}/file"


# --------------------------------------------------------------------------- #
# Read serializers
# --------------------------------------------------------------------------- #
class OrderSerializer(serializers.ModelSerializer):
    customer = CustomerRefSerializer(read_only=True)
    status_display = serializers.SerializerMethodField()
    department_display = serializers.CharField(source="get_department_display", read_only=True)
    handler = serializers.SerializerMethodField()
    payment = serializers.SerializerMethodField()
    allowed_transitions = serializers.SerializerMethodField()
    attachments_count = serializers.IntegerField(read_only=True, default=0)
    source_quote_reference = serializers.CharField(source="source_quote.reference", read_only=True, default=None)

    class Meta:
        model = Order
        fields = [
            "id", "reference", "order_type", "status", "status_display", "customer", "item_details", "department",
            "department_display", "handler", "currency", "total_amount", "payment", "installment_plan",
            "installment_allowed", "notes", "allowed_transitions", "attachments_count", "source_quote_reference",
            "created_at", "updated_at",
        ]

    def get_status_display(self, obj) -> str:
        return status_label(obj.order_type, obj.status)

    def get_handler(self, obj) -> dict | None:
        return _person(obj.handler)

    def get_payment(self, obj) -> dict:
        summary = payment_summary(obj, getattr(obj, "paid_total", None) or Decimal("0")).as_dict
        return {**summary, **{k: _dec(summary[k]) for k in ("total", "paid", "due")}}

    def get_allowed_transitions(self, obj) -> list[dict]:
        """Next statuses reachable with a plain status change (action-only ones excluded)."""
        _, transitions, action_only = WORKFLOWS[OrderType(obj.order_type)]
        return [
            {"value": s, "label": status_label(obj.order_type, s)}
            for s in sorted(transitions.get(obj.status, set()))
            if s not in action_only
        ]


class ExpressOrderSerializer(OrderSerializer):
    stage = serializers.SerializerMethodField()
    details = serializers.SerializerMethodField()

    class Meta(OrderSerializer.Meta):
        fields = [*OrderSerializer.Meta.fields, "stage", "details"]

    def get_stage(self, obj) -> str:
        return EXPRESS_STAGE[ExpressStatus(obj.status)]

    def get_details(self, obj) -> dict:
        d: ExpressDetails = obj.express
        return {
            "pickup_address": d.pickup_address,
            "pickup_city": {"id": d.pickup_city_id, "name": d.pickup_city.name} if d.pickup_city_id else None,
            "delivery_address": d.delivery_address,
            "delivery_city": {"id": d.delivery_city_id, "name": d.delivery_city.name} if d.delivery_city_id else None,
            "priority": d.priority,
            "weight_kg": _dec(d.weight_kg, 3),
            "package_size": d.package_size,
            "customer_package_size": d.customer_package_size,
            "estimated_delivery_at": d.estimated_delivery_at,
            "advance_required": d.advance_required,
            "advance_amount": _dec(d.advance_amount),
            "quoted_at": d.quoted_at,
            "quoted_by": _person(d.quoted_by),
            "driver": _person(d.driver),
        }


class InternationalOrderSerializer(OrderSerializer):
    details = serializers.SerializerMethodField()
    needs_attention = serializers.SerializerMethodField()

    class Meta(OrderSerializer.Meta):
        fields = [*OrderSerializer.Meta.fields, "needs_attention", "details"]

    def get_needs_attention(self, obj) -> bool:
        return obj.status == "issue_pending_payment" or (obj.installment_plan and not obj.installment_allowed)

    def get_details(self, obj) -> dict:
        d: InternationalDetails = obj.international
        return {
            "source_country": {"id": d.source_country_id, "iso2": d.source_country.iso2, "name": d.source_country.display_name},
            "order_class": d.order_class,
            "service_type": d.service_type,
            "service_type_display": d.get_service_type_display(),
            "supplier_name": d.supplier_name,
            "tracking_number": d.tracking_number,
            "item_cost": _dec(d.item_cost),
            "shipping_cost": _dec(d.shipping_cost),
            "estimated_delivery": d.estimated_delivery,
        }


class EquipmentOrderSerializer(OrderSerializer):
    details = serializers.SerializerMethodField()
    needs_attention = serializers.SerializerMethodField()
    service_timeline = serializers.SerializerMethodField()

    class Meta(OrderSerializer.Meta):
        fields = [*OrderSerializer.Meta.fields, "needs_attention", "details", "service_timeline"]

    def get_needs_attention(self, obj) -> bool:
        return obj.equipment.needs_attention or obj.status == "maintenance_required"

    def get_details(self, obj) -> dict:
        d: EquipmentDetails = obj.equipment
        return {
            "service_type": d.service_type,
            "service_type_display": d.get_service_type_display(),
            "equipment": d.equipment,
            "classification": d.classification,
            "city": {"id": d.city_id, "name": d.city.name} if d.city_id else None,
            "site_address": d.site_address,
            "technician": _person(d.technician),
            "technician_assigned_at": d.technician_assigned_at,
            "expected_date": d.expected_date,
            "priority": d.priority,
        }

    def get_service_timeline(self, obj) -> list[dict]:
        """The four steps of the design's Service Timeline, from real history."""
        reached = {h.to_status: h.created_at for h in obj.status_history.all()}
        done_on_site = {"on_site", "in_progress", "testing", "completed", "maintenance_required"}
        d = obj.equipment
        return [
            {"key": "logged", "label": "Request Logged", "done": True, "at": obj.created_at},
            {"key": "assigned", "label": "Technician Assigned", "done": bool(d.technician_id), "at": d.technician_assigned_at},
            {"key": "on_site", "label": "On-Site Work", "done": obj.status in done_on_site,
             "at": reached.get("on_site") or d.expected_date},
            {"key": "completed", "label": "Completion & Testing", "done": obj.status == "completed",
             "at": reached.get("completed")},
        ]


# --------------------------------------------------------------------------- #
# Write serializers
# --------------------------------------------------------------------------- #
class _CreateBase(serializers.Serializer):
    customer = serializers.PrimaryKeyRelatedField(queryset=Customer.objects.filter(status="active"))
    item_details = serializers.CharField(max_length=255)
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class ExpressCreateSerializer(_CreateBase):
    pickup_address = serializers.CharField(max_length=255)
    pickup_city = serializers.PrimaryKeyRelatedField(queryset=City.objects.all(), required=False, allow_null=True)
    delivery_address = serializers.CharField(max_length=255)
    delivery_city = serializers.PrimaryKeyRelatedField(queryset=City.objects.all(), required=False, allow_null=True)
    priority = serializers.ChoiceField(choices=Priority.choices, default=Priority.STANDARD)
    weight_kg = serializers.DecimalField(max_digits=10, decimal_places=3, min_value=Decimal("0.001"), required=False, allow_null=True)
    package_size = serializers.ChoiceField(choices=PackageSize.choices, required=False, allow_blank=True, default="")

    DETAIL_FIELDS = ["pickup_address", "pickup_city", "delivery_address", "delivery_city", "priority", "weight_kg"]


class InternationalCreateSerializer(_CreateBase):
    source_country = serializers.PrimaryKeyRelatedField(queryset=Country.objects.filter(is_sourcing_origin=True))
    order_class = serializers.ChoiceField(choices=Classification.choices, default=Classification.SIMPLE)
    service_type = serializers.ChoiceField(choices=InternationalDetails.ServiceType.choices,
                                           default=InternationalDetails.ServiceType.FULL_SERVICE)
    total_amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"), required=False)
    installment_plan = serializers.BooleanField(default=False)

    DETAIL_FIELDS = ["source_country", "order_class", "service_type"]


class EquipmentCreateSerializer(_CreateBase):
    service_type = serializers.ChoiceField(choices=EquipmentDetails.ServiceType.choices)
    equipment = serializers.CharField(max_length=160)
    classification = serializers.ChoiceField(choices=Classification.choices, default=Classification.SIMPLE)
    city = serializers.PrimaryKeyRelatedField(queryset=City.objects.all(), required=False, allow_null=True)
    site_address = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    expected_date = serializers.DateTimeField(required=False, allow_null=True)
    priority = serializers.ChoiceField(choices=[("high", "High"), ("medium", "Medium"), ("low", "Low")], default="medium")
    total_amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"), required=False)

    DETAIL_FIELDS = ["service_type", "equipment", "classification", "city", "site_address", "expected_date", "priority"]


class ExpressUpdateSerializer(serializers.Serializer):
    item_details = serializers.CharField(max_length=255, required=False)
    notes = serializers.CharField(required=False, allow_blank=True)
    pickup_address = serializers.CharField(max_length=255, required=False)
    pickup_city = serializers.PrimaryKeyRelatedField(queryset=City.objects.all(), required=False, allow_null=True)
    delivery_address = serializers.CharField(max_length=255, required=False)
    delivery_city = serializers.PrimaryKeyRelatedField(queryset=City.objects.all(), required=False, allow_null=True)
    priority = serializers.ChoiceField(choices=Priority.choices, required=False)
    weight_kg = serializers.DecimalField(max_digits=10, decimal_places=3, min_value=Decimal("0.001"), required=False, allow_null=True)


class InternationalUpdateSerializer(serializers.Serializer):
    item_details = serializers.CharField(max_length=255, required=False)
    notes = serializers.CharField(required=False, allow_blank=True)
    handler = serializers.PrimaryKeyRelatedField(queryset=User.objects.filter(is_active=True), required=False, allow_null=True)
    installment_plan = serializers.BooleanField(required=False)
    order_class = serializers.ChoiceField(choices=Classification.choices, required=False)
    service_type = serializers.ChoiceField(choices=InternationalDetails.ServiceType.choices, required=False)
    supplier_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    tracking_number = serializers.CharField(max_length=80, required=False, allow_blank=True)
    item_cost = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0"), required=False, allow_null=True)
    shipping_cost = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0"), required=False, allow_null=True)
    total_amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"), required=False)
    estimated_delivery = serializers.DateField(required=False, allow_null=True)


class EquipmentUpdateSerializer(serializers.Serializer):
    item_details = serializers.CharField(max_length=255, required=False)
    notes = serializers.CharField(required=False, allow_blank=True)
    equipment = serializers.CharField(max_length=160, required=False)
    classification = serializers.ChoiceField(choices=Classification.choices, required=False)
    city = serializers.PrimaryKeyRelatedField(queryset=City.objects.all(), required=False, allow_null=True)
    site_address = serializers.CharField(max_length=255, required=False, allow_blank=True)
    priority = serializers.ChoiceField(choices=[("high", "High"), ("medium", "Medium"), ("low", "Low")], required=False)
    needs_attention = serializers.BooleanField(required=False)
    total_amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"), required=False)


# Actions
class TransitionSerializer(serializers.Serializer):
    status = serializers.CharField(max_length=32)
    note = serializers.CharField(required=False, allow_blank=True, default="", max_length=1000)


class ExpressQuoteSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"))
    estimated_delivery_at = serializers.DateTimeField()
    advance_required = serializers.BooleanField(default=False)
    advance_amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"), required=False, allow_null=True)
    note = serializers.CharField(required=False, allow_blank=True, default="")


class QuoteStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=[("accepted", "Accepted"), ("rejected", "Rejected")])
    note = serializers.CharField(required=False, allow_blank=True, default="")


class AssignSerializer(serializers.Serializer):
    user = serializers.PrimaryKeyRelatedField(queryset=User.objects.all())
    note = serializers.CharField(required=False, allow_blank=True, default="")


class PackageSizeSerializer(serializers.Serializer):
    package_size = serializers.ChoiceField(choices=PackageSize.choices)


class ExpectedDateSerializer(serializers.Serializer):
    expected_date = serializers.DateTimeField()


class SuggestPriceSerializer(serializers.Serializer):
    method = serializers.IntegerField()


# --------------------------------------------------------------------------- #
# E-commerce shop orders
# --------------------------------------------------------------------------- #
class OrderItemSerializer(serializers.ModelSerializer):
    unit_price = serializers.SerializerMethodField()
    line_total = serializers.SerializerMethodField()
    product_id = serializers.IntegerField(source="variant.product_id", read_only=True)
    warehouse = serializers.CharField(source="warehouse.name", read_only=True, default=None)

    class Meta:
        model = OrderItem
        fields = ["id", "product_id", "variant", "product_name", "variant_name", "sku", "quantity", "unit_price",
                  "line_total", "warehouse"]

    def get_unit_price(self, obj) -> str:
        return _dec(obj.unit_price)

    def get_line_total(self, obj) -> str:
        return _dec(obj.line_total)


class ShopOrderSerializer(OrderSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    details = serializers.SerializerMethodField()
    payment_status = serializers.SerializerMethodField()
    delivery = serializers.SerializerMethodField()

    class Meta(OrderSerializer.Meta):
        fields = [*OrderSerializer.Meta.fields, "items", "details", "payment_status", "delivery"]

    def get_details(self, obj) -> dict:
        d: ShopDetails = obj.shop
        parts = [d.shipping_address, d.area, d.city.name if d.city_id else ""]
        return {
            "customer_email": d.customer_email,
            "shipping_address": d.shipping_address,
            "city": {"id": d.city_id, "name": d.city.name} if d.city_id else None,
            "area": d.area,
            "full_address": ", ".join(p for p in parts if p),
            "channel": d.channel,
            "channel_display": d.get_channel_display(),
            "delivery_fee": _dec(d.delivery_fee),
            "subtotal": _dec(sum((i.line_total for i in obj.items.all()), Decimal("0"))),
            "fulfillment_warehouse": d.fulfillment_warehouse.name if d.fulfillment_warehouse_id else None,
            "shipped_at": d.shipped_at,
        }

    def get_payment_status(self, obj) -> str:
        """The design's payment badge: paid / pending (nothing or part paid)."""
        return "paid" if self.get_payment(obj)["status"] == "fully_paid" else "pending"

    def get_delivery(self, obj) -> dict | None:
        rows = [d for d in obj.deliveries.all()]
        d = rows[-1] if rows else None
        return {"id": d.id, "reference": d.reference, "status": d.status,
                "status_display": d.get_status_display()} if d else None


class ShopItemWriteSerializer(serializers.Serializer):
    variant = serializers.PrimaryKeyRelatedField(queryset=ProductVariant.objects.select_related("product"))
    quantity = serializers.IntegerField(min_value=1, max_value=1000)
    unit_price = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0"), required=False,
                                          allow_null=True)


class ShopCreateSerializer(serializers.Serializer):
    customer = serializers.PrimaryKeyRelatedField(queryset=Customer.objects.filter(status="active"))
    items = ShopItemWriteSerializer(many=True)
    shipping_address = serializers.CharField(max_length=255)
    city = serializers.PrimaryKeyRelatedField(queryset=City.objects.all(), required=False, allow_null=True)
    area = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")
    customer_email = serializers.EmailField(required=False, allow_blank=True, default="")
    channel = serializers.ChoiceField(choices=ShopDetails.Channel.choices, default=ShopDetails.Channel.MANUAL)
    delivery_fee = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0"),
                                            default=Decimal("0"))
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class ShipSerializer(serializers.Serializer):
    driver = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(), required=False, allow_null=True)
    scheduled_at = serializers.DateTimeField(required=False, allow_null=True)
    note = serializers.CharField(required=False, allow_blank=True, default="")


class CancelSerializer(serializers.Serializer):
    reason = serializers.CharField()


class ShopNotesSerializer(serializers.Serializer):
    notes = serializers.CharField(allow_blank=True)
