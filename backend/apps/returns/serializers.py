from decimal import Decimal

from rest_framework import serializers

from apps.accounts.models import User
from apps.core.workflow import allowed_next
from apps.orders.models import Order, Payment
from apps.orders.serializers import _dec, _person

from .models import (
    RETURN_ACTION_ONLY,
    RETURN_TRANSITIONS,
    ExceptionFlag,
    FinancialImpact,
    ItemCondition,
    ReasonCode,
    ReturnRequest,
    ReturnStatus,
    ReturnStatusHistory,
    ReturnType,
)

MONEY = {"max_digits": 14, "decimal_places": 2, "min_value": Decimal("0")}


class ReturnSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    return_type_display = serializers.CharField(source="get_return_type_display", read_only=True)
    reason_code_display = serializers.CharField(source="get_reason_code_display", read_only=True)
    owner_display = serializers.CharField(source="get_owner_display", read_only=True)
    financial_impact_display = serializers.CharField(source="get_financial_impact_display", read_only=True)
    exception_flag_display = serializers.CharField(source="get_exception_flag_display", read_only=True)
    item_condition_display = serializers.CharField(source="get_item_condition_display", read_only=True)
    order = serializers.SerializerMethodField()
    customer = serializers.SerializerMethodField()
    delivery = serializers.SerializerMethodField()
    handler = serializers.SerializerMethodField()
    return_value = serializers.SerializerMethodField()
    refund_amount = serializers.SerializerMethodField()
    last_update = serializers.SerializerMethodField()
    actions = serializers.SerializerMethodField()
    allowed_transitions = serializers.SerializerMethodField()
    lines = serializers.SerializerMethodField()
    attachments = serializers.SerializerMethodField()
    vendor_responses = serializers.SerializerMethodField()
    refund_status = serializers.SerializerMethodField()
    customer_status_display = serializers.SerializerMethodField()
    sellers = serializers.SerializerMethodField()

    class Meta:
        model = ReturnRequest
        fields = ["id", "reference", "order", "customer", "delivery", "return_type", "return_type_display",
                  "reason_code", "reason_code_display", "status", "status_display", "owner", "owner_display",
                  "handler", "item_details", "return_value", "financial_impact", "financial_impact_display",
                  "exception_flag", "exception_flag_display", "item_condition", "item_condition_display",
                  "inspection_notes", "inspected_at", "decision_notes", "decided_at", "refund_amount",
                  "resolution_notes", "closed_at", "notes", "last_update", "actions", "allowed_transitions",
                  "created_at", "updated_at", "requested_by_customer", "customer_note", "customer_message",
                  "restocked", "reconciled_at", "lines", "attachments", "vendor_responses", "refund_status",
                  "customer_status_display", "sellers"]

    def get_lines(self, obj) -> list[dict]:
        return [{"id": line.pk, "item": line.order_item_id, "name": line.order_item.product_name,
                 "variant_name": line.order_item.variant_name, "quantity": line.quantity, "amount": _dec(line.amount),
                 "seller": (line.order_item.fulfillment.vendor.name if line.order_item.fulfillment_id
                            and line.order_item.fulfillment.vendor_id else "AGIZA")} for line in obj.lines.all()]

    def get_attachments(self, obj) -> list[dict]:
        return [{"id": a.pk, "url": f"returns/{obj.pk}/attachments/{a.pk}/file",
                 "content_type": a.content_type, "at": a.created_at} for a in obj.attachments.all()]

    def get_vendor_responses(self, obj) -> list[dict]:
        return [{"vendor": r.vendor.name, "message": r.message, "at": r.created_at} for r in obj.vendor_responses.all()]

    def get_refund_status(self, obj) -> str:
        from .services import customer_status

        return customer_status(obj)[1]

    def get_customer_status_display(self, obj) -> str:
        from .services import customer_status

        return customer_status(obj)[0]

    def get_sellers(self, obj) -> list[str]:
        names = {line.order_item.fulfillment.vendor.name if line.order_item.fulfillment_id
                 and line.order_item.fulfillment.vendor_id else "AGIZA" for line in obj.lines.all()}
        return sorted(names)

    def get_order(self, obj) -> dict:
        return {"id": obj.order_id, "reference": obj.order.reference, "order_type": obj.order.order_type}

    def get_customer(self, obj) -> dict:
        c = obj.order.customer
        return {"id": c.id, "full_name": c.full_name, "phone": c.phone}

    def get_delivery(self, obj) -> dict | None:
        return {"id": obj.delivery_id, "reference": obj.delivery.reference} if obj.delivery_id else None

    def get_handler(self, obj) -> dict | None:
        h = obj.handler
        if not h:
            return None
        return {"id": h.id, "full_name": h.full_name, "role": h.get_staff_level_display()}

    def get_return_value(self, obj) -> str | None:
        return _dec(obj.return_value)

    def get_refund_amount(self, obj) -> str | None:
        return _dec(obj.refund_amount)

    def get_last_update(self, obj) -> dict:
        """When the return last changed and which department made the change."""
        rows = list(obj.history.all())
        last = rows[-1] if rows else None
        return {"at": last.created_at if last else obj.updated_at, "department": last.owner if last else obj.owner}

    def get_actions(self, obj) -> list[str]:
        return {
            "initiated": ["transition", "decide"],
            "in_transit": ["transition"],
            "received": ["inspect"],
            "inspected": ["decide"],
            "approved": ["close"],
            "rejected": ["close"],
        }.get(obj.status, [])

    def get_allowed_transitions(self, obj) -> list[dict]:
        return allowed_next(obj.status, transitions=RETURN_TRANSITIONS, choices=ReturnStatus,
                            action_only=RETURN_ACTION_ONLY)


class ReturnCreateSerializer(serializers.Serializer):
    order = serializers.PrimaryKeyRelatedField(queryset=Order.objects.select_related("customer"))
    return_type = serializers.ChoiceField(choices=ReturnType.choices)
    reason_code = serializers.ChoiceField(choices=ReasonCode.choices)
    item_details = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    return_value = serializers.DecimalField(**MONEY, required=False, allow_null=True)
    financial_impact = serializers.ChoiceField(choices=FinancialImpact.choices, required=False)
    handler = serializers.PrimaryKeyRelatedField(queryset=User.objects.filter(is_active=True), required=False,
                                                 allow_null=True)
    exception_flag = serializers.ChoiceField(choices=ExceptionFlag.choices, required=False, allow_blank=True,
                                             default="")
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class ReturnUpdateSerializer(serializers.Serializer):
    reason_code = serializers.ChoiceField(choices=ReasonCode.choices, required=False)
    item_details = serializers.CharField(max_length=255, required=False)
    return_value = serializers.DecimalField(**MONEY, required=False, allow_null=True)
    financial_impact = serializers.ChoiceField(choices=FinancialImpact.choices, required=False)
    exception_flag = serializers.ChoiceField(choices=ExceptionFlag.choices, required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)


class ReturnTransitionSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=ReturnStatus.choices)
    note = serializers.CharField(required=False, allow_blank=True, default="")


class InspectSerializer(serializers.Serializer):
    item_condition = serializers.ChoiceField(choices=ItemCondition.choices)
    notes = serializers.CharField()
    financial_impact = serializers.ChoiceField(choices=FinancialImpact.choices, required=False)
    restock = serializers.BooleanField(required=False, allow_null=True, default=None,
                                       help_text="Put the returned units back in stock (default: when resellable)")


class DecideSerializer(serializers.Serializer):
    approve = serializers.BooleanField()
    notes = serializers.CharField()
    financial_impact = serializers.ChoiceField(choices=FinancialImpact.choices, required=False)
    refund_amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"),
                                             required=False, allow_null=True)


class CloseSerializer(serializers.Serializer):
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    refund_method = serializers.ChoiceField(choices=Payment.Method.choices, required=False, allow_null=True)
    refund_reference = serializers.CharField(max_length=80, required=False, allow_blank=True, default="")


class ReassignSerializer(serializers.Serializer):
    handler = serializers.PrimaryKeyRelatedField(queryset=User.objects.all())
    note = serializers.CharField(required=False, allow_blank=True, default="")


class ReturnHistorySerializer(serializers.ModelSerializer):
    from_status_display = serializers.SerializerMethodField()
    to_status_display = serializers.SerializerMethodField()
    owner_display = serializers.CharField(source="get_owner_display", read_only=True)
    changed_by = serializers.SerializerMethodField()

    class Meta:
        model = ReturnStatusHistory
        fields = ["id", "from_status", "from_status_display", "to_status", "to_status_display", "owner",
                  "owner_display", "changed_by", "note", "created_at"]

    def get_from_status_display(self, obj) -> str | None:
        return dict(ReturnStatus.choices).get(obj.from_status) if obj.from_status else None

    def get_to_status_display(self, obj) -> str | None:
        return dict(ReturnStatus.choices).get(obj.to_status)

    def get_changed_by(self, obj) -> dict | None:
        return _person(obj.changed_by)
