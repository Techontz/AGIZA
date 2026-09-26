from decimal import Decimal

from rest_framework import serializers

from apps.accounts.models import User
from apps.locations.models import Country
from apps.orders.serializers import _dec, _person
from apps.orders.workflows import status_label

from .models import ExceptionFlag, ProcurementOrder, ProcurementStatusHistory, Supplier

MONEY = {"max_digits": 14, "decimal_places": 2, "min_value": Decimal("0")}


class SupplierSerializer(serializers.ModelSerializer):
    country = serializers.PrimaryKeyRelatedField(queryset=Country.objects.all(), write_only=True)
    country_detail = serializers.SerializerMethodField()
    orders_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Supplier
        fields = ["id", "reference", "name", "country", "country_detail", "contact_person", "phone", "email",
                  "website", "address", "notes", "is_active", "orders_count", "created_at", "updated_at"]
        read_only_fields = ["id", "reference", "created_at", "updated_at"]

    def get_country_detail(self, obj) -> dict:
        return {"id": obj.country_id, "iso2": obj.country.iso2, "name": obj.country.display_name}


class ProcurementSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    exception_flag_display = serializers.CharField(source="get_exception_flag_display", read_only=True)
    order = serializers.SerializerMethodField()
    origin = serializers.SerializerMethodField()
    supplier = serializers.SerializerMethodField()
    operator = serializers.SerializerMethodField()
    unit_cost = serializers.SerializerMethodField()
    item_cost = serializers.SerializerMethodField()
    actions = serializers.SerializerMethodField()

    class Meta:
        model = ProcurementOrder
        fields = ["id", "order", "origin", "status", "status_display", "supplier", "supplier_order_number",
                  "supplier_tracking_number", "operator", "quantity", "unit_cost", "item_cost", "currency",
                  "payment_reference", "exception_flag", "exception_flag_display", "expected_at_cargo", "paid_at",
                  "received_at", "notes", "actions", "created_at", "updated_at"]

    def get_order(self, obj) -> dict:
        o = obj.order
        return {"id": o.id, "reference": o.reference, "status": o.status,
                "status_display": status_label(o.order_type, o.status), "item_details": o.item_details,
                "customer": o.customer.full_name, "service_type": o.international.service_type,
                "service_type_display": o.international.get_service_type_display(), "created_at": o.created_at}

    def get_origin(self, obj) -> dict:
        c = obj.order.international.source_country
        return {"iso2": c.iso2, "name": c.display_name}

    def get_supplier(self, obj) -> dict | None:
        s = obj.supplier
        return {"id": s.id, "name": s.name, "reference": s.reference} if s else None

    def get_operator(self, obj) -> dict | None:
        return _person(obj.operator)

    def get_unit_cost(self, obj) -> str | None:
        return _dec(obj.unit_cost)

    def get_item_cost(self, obj) -> str | None:
        return _dec(obj.item_cost)

    def get_actions(self, obj) -> list[str]:
        """Workflow actions available in the current status."""
        return {
            "pending_sourcing": ["select_supplier"],
            "supplier_cancelled": ["select_supplier"],
            "supplier_selected": ["select_supplier", "mark_paid", "cancel_supplier"],
            "paid": ["cancel_supplier"],
        }.get(obj.status, [])


class ProcurementUpdateSerializer(serializers.Serializer):
    operator = serializers.PrimaryKeyRelatedField(queryset=User.objects.filter(is_active=True), required=False,
                                                  allow_null=True)
    quantity = serializers.IntegerField(min_value=1, required=False)
    unit_cost = serializers.DecimalField(**MONEY, required=False, allow_null=True)
    item_cost = serializers.DecimalField(**MONEY, required=False, allow_null=True)
    exception_flag = serializers.ChoiceField(choices=ExceptionFlag.choices, required=False, allow_blank=True)
    expected_at_cargo = serializers.DateField(required=False, allow_null=True)
    supplier_tracking_number = serializers.CharField(max_length=80, required=False, allow_blank=True)
    supplier_order_number = serializers.CharField(max_length=80, required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)


class SelectSupplierSerializer(serializers.Serializer):
    supplier = serializers.PrimaryKeyRelatedField(queryset=Supplier.objects.all())
    item_cost = serializers.DecimalField(**MONEY, required=False, allow_null=True)
    unit_cost = serializers.DecimalField(**MONEY, required=False, allow_null=True)
    quantity = serializers.IntegerField(min_value=1, required=False)
    expected_at_cargo = serializers.DateField(required=False, allow_null=True)
    supplier_order_number = serializers.CharField(max_length=80, required=False, allow_blank=True)
    note = serializers.CharField(required=False, allow_blank=True, default="")


class MarkPaidSerializer(serializers.Serializer):
    payment_reference = serializers.CharField(max_length=80, required=False, allow_blank=True, default="")
    paid_at = serializers.DateTimeField(required=False)
    supplier_tracking_number = serializers.CharField(max_length=80, required=False, allow_blank=True)
    note = serializers.CharField(required=False, allow_blank=True, default="")


class CancelSupplierSerializer(serializers.Serializer):
    reason = serializers.CharField()


class ProcurementHistorySerializer(serializers.ModelSerializer):
    from_status_display = serializers.SerializerMethodField()
    to_status_display = serializers.SerializerMethodField()
    changed_by = serializers.SerializerMethodField()

    class Meta:
        model = ProcurementStatusHistory
        fields = ["id", "from_status", "from_status_display", "to_status", "to_status_display", "changed_by", "note",
                  "created_at"]

    def _label(self, value):
        from .models import ProcurementStatus

        return dict(ProcurementStatus.choices).get(value) if value else None

    def get_from_status_display(self, obj) -> str | None:
        return self._label(obj.from_status)

    def get_to_status_display(self, obj) -> str | None:
        return self._label(obj.to_status)

    def get_changed_by(self, obj) -> dict | None:
        return _person(obj.changed_by)
