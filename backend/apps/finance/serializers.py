from decimal import Decimal

from rest_framework import serializers

from apps.orders.models import Order, Payment
from apps.orders.serializers import _dec, _person
from apps.orders.workflows import status_label
from apps.parties.models import Customer
from apps.quotes.models import QuoteRequest

from . import services
from .models import Installment, InstallmentPlan, Invoice, InvoiceItem, WalletTransaction

MONEY = {"max_digits": 14, "decimal_places": 2, "min_value": Decimal("0")}


def _customer(c) -> dict:
    return {"id": c.id, "reference": c.reference, "full_name": c.full_name, "phone": c.phone, "email": c.email}


class OrderPaymentSerializer(serializers.ModelSerializer):
    """A row of Finance → Order Payments."""

    customer = serializers.SerializerMethodField()
    status_display = serializers.SerializerMethodField()
    order_type_display = serializers.CharField(source="get_order_type_display", read_only=True)
    figures = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = ["id", "reference", "order_type", "order_type_display", "status", "status_display", "item_details",
                  "customer", "currency", "created_at", "figures"]

    def get_customer(self, obj) -> dict:
        return _customer(obj.customer)

    def get_status_display(self, obj) -> str:
        return status_label(obj.order_type, obj.status)

    def get_figures(self, obj) -> dict:
        f = services.financials(obj, getattr(obj, "paid_total", None) or Decimal("0"))
        return {"total": _dec(f.total), "paid": _dec(f.paid), "due": _dec(f.due),
                "purchase_cost": _dec(f.purchase_cost), "shipping_cost": _dec(f.shipping_cost),
                "profit": _dec(f.profit), "margin": _dec(f.margin, 1),
                "purchase_cost_set": obj.purchase_cost is not None, "shipping_cost_set": obj.shipping_cost is not None}


class CostsSerializer(serializers.Serializer):
    purchase_cost = serializers.DecimalField(**MONEY, required=False, allow_null=True)
    shipping_cost = serializers.DecimalField(**MONEY, required=False, allow_null=True)


class LedgerPaymentSerializer(serializers.ModelSerializer):
    method_display = serializers.CharField(source="get_method_display", read_only=True)
    kind_display = serializers.CharField(source="get_kind_display", read_only=True)
    recorded_by = serializers.SerializerMethodField()
    order = serializers.SerializerMethodField()
    amount = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = ["id", "order", "amount", "currency", "method", "method_display", "kind", "kind_display",
                  "reference", "paid_at", "notes", "recorded_by", "created_at"]

    def get_order(self, obj) -> dict:
        return {"id": obj.order_id, "reference": obj.order.reference, "order_type": obj.order.order_type,
                "customer": obj.order.customer.full_name}

    def get_amount(self, obj) -> str:
        return _dec(obj.amount)

    def get_recorded_by(self, obj) -> dict | None:
        return _person(obj.recorded_by)


class RecordSerializer(serializers.Serializer):
    order = serializers.PrimaryKeyRelatedField(queryset=Order.objects.all())
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"))
    method = serializers.ChoiceField(choices=Payment.Method.choices)
    kind = serializers.ChoiceField(choices=[c for c in Payment.Kind.choices if c[0] != "refund"], default="balance")
    reference = serializers.CharField(max_length=80, required=False, allow_blank=True, default="")
    paid_at = serializers.DateTimeField(required=False)
    notes = serializers.CharField(required=False, allow_blank=True, default="")


# --------------------------------------------------------------------------- #
# Invoices
# --------------------------------------------------------------------------- #
class InvoiceItemSerializer(serializers.ModelSerializer):
    quantity = serializers.SerializerMethodField()
    unit_price = serializers.SerializerMethodField()
    amount = serializers.SerializerMethodField()

    class Meta:
        model = InvoiceItem
        fields = ["id", "description", "quantity", "unit_price", "amount"]

    def get_quantity(self, obj) -> str:
        return _dec(obj.quantity)

    def get_unit_price(self, obj) -> str:
        return _dec(obj.unit_price)

    def get_amount(self, obj) -> str:
        return _dec(obj.amount)


class InvoiceSerializer(serializers.ModelSerializer):
    customer = serializers.SerializerMethodField()
    items = InvoiceItemSerializer(many=True, read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    source_display = serializers.CharField(source="get_source_display", read_only=True)
    linked = serializers.SerializerMethodField()
    totals = serializers.SerializerMethodField()
    created_by = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = ["id", "reference", "source", "source_display", "customer", "linked", "status", "status_display",
                  "currency", "issue_date", "due_date", "tax_rate", "notes", "items", "totals", "sent_at", "paid_at",
                  "payment_method", "payment_reference", "created_by", "created_at"]

    def get_customer(self, obj) -> dict:
        return _customer(obj.customer)

    def get_linked(self, obj) -> dict | None:
        if obj.order_id:
            return {"kind": "order", "id": obj.order_id, "reference": obj.order.reference,
                    "order_type": obj.order.order_type}
        if obj.quote_id:
            return {"kind": "quote", "id": obj.quote_id, "reference": obj.quote.reference, "order_type": None}
        return None

    def get_totals(self, obj) -> dict:
        return {k: _dec(v) for k, v in services.invoice_totals(obj).items()}

    def get_created_by(self, obj) -> dict | None:
        return _person(obj.created_by)


class InvoiceLineSerializer(serializers.Serializer):
    description = serializers.CharField(max_length=255)
    quantity = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0.01"), default=1)
    unit_price = serializers.DecimalField(**MONEY)


class InvoiceCreateSerializer(serializers.Serializer):
    source = serializers.ChoiceField(choices=Invoice.Source.choices)
    quote = serializers.PrimaryKeyRelatedField(queryset=QuoteRequest.objects.all(), required=False, allow_null=True)
    order = serializers.PrimaryKeyRelatedField(queryset=Order.objects.all(), required=False, allow_null=True)
    customer = serializers.PrimaryKeyRelatedField(queryset=Customer.objects.all(), required=False, allow_null=True)
    items = InvoiceLineSerializer(many=True, required=False)
    due_date = serializers.DateField(required=False, allow_null=True)
    tax_rate = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=Decimal("0"),
                                        max_value=Decimal("100"), default=Decimal("0"))
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class InvoicePaidSerializer(serializers.Serializer):
    method = serializers.ChoiceField(choices=[c for c in Payment.Method.choices if c[0] != "wallet"])
    reference = serializers.CharField(max_length=80, required=False, allow_blank=True, default="")


# --------------------------------------------------------------------------- #
# Wallets & installments
# --------------------------------------------------------------------------- #
class WalletTransactionSerializer(serializers.ModelSerializer):
    kind_display = serializers.CharField(source="get_kind_display", read_only=True)
    source_display = serializers.CharField(source="get_source_display", read_only=True)
    order = serializers.CharField(source="order.reference", read_only=True, default=None)
    created_by = serializers.SerializerMethodField()
    amount = serializers.SerializerMethodField()
    balance_after = serializers.SerializerMethodField()

    class Meta:
        model = WalletTransaction
        fields = ["id", "kind", "kind_display", "source", "source_display", "amount", "balance_after", "order",
                  "method", "reference", "note", "created_by", "created_at"]

    def get_created_by(self, obj) -> dict | None:
        return _person(obj.created_by)

    def get_amount(self, obj) -> str:
        return _dec(obj.amount)

    def get_balance_after(self, obj) -> str:
        return _dec(obj.balance_after)


class InstallmentSerializer(serializers.ModelSerializer):
    amount = serializers.SerializerMethodField()
    paid_amount = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Installment
        fields = ["id", "sequence", "due_date", "amount", "paid_amount", "status", "status_display", "paid_at"]

    def get_amount(self, obj) -> str:
        return _dec(obj.amount)

    def get_paid_amount(self, obj) -> str:
        return _dec(obj.paid_amount)


class PlanSerializer(serializers.ModelSerializer):
    installments = InstallmentSerializer(many=True, read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    order = serializers.SerializerMethodField()
    customer = serializers.SerializerMethodField()
    total_amount = serializers.SerializerMethodField()
    next_payment = serializers.SerializerMethodField()
    approved_by = serializers.SerializerMethodField()

    class Meta:
        model = InstallmentPlan
        fields = ["id", "order", "customer", "status", "status_display", "total_amount", "number_of_installments",
                  "interval_days", "notes", "next_payment", "installments", "approved_by", "approved_at",
                  "decision_note", "created_at"]

    def get_order(self, obj) -> dict:
        return {"id": obj.order_id, "reference": obj.order.reference, "order_type": obj.order.order_type}

    def get_customer(self, obj) -> dict:
        return _customer(obj.order.customer)

    def get_total_amount(self, obj) -> str:
        return _dec(obj.total_amount)

    def get_next_payment(self, obj) -> dict | None:
        nxt = services.next_installment(obj)
        if nxt is None:
            return None
        return {"due_date": nxt.due_date, "amount": _dec(nxt.amount - nxt.paid_amount), "sequence": nxt.sequence}

    def get_approved_by(self, obj) -> dict | None:
        return _person(obj.approved_by)


class PlanCreateSerializer(serializers.Serializer):
    order = serializers.PrimaryKeyRelatedField(queryset=Order.objects.all())
    number_of_installments = serializers.IntegerField(min_value=1, max_value=24)
    first_due_date = serializers.DateField()
    interval_days = serializers.IntegerField(min_value=1, max_value=365, default=30)
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class DecisionSerializer(serializers.Serializer):
    approve = serializers.BooleanField()
    note = serializers.CharField(required=False, allow_blank=True, default="")


class TopUpSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"))
    method = serializers.ChoiceField(choices=[c for c in Payment.Method.choices if c[0] != "wallet"])
    reference = serializers.CharField(max_length=80, required=False, allow_blank=True, default="")
    note = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")


class WalletAdjustSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"))
    credit = serializers.BooleanField()
    note = serializers.CharField(max_length=255)


class WalletPaySerializer(serializers.Serializer):
    order = serializers.PrimaryKeyRelatedField(queryset=Order.objects.all())
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"))
