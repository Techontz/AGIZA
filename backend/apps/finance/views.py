from decimal import Decimal

import django_filters
from django.db.models import Count, DecimalField, ExpressionWrapper, F, OuterRef, Prefetch, Q, Subquery, Sum, Value
from django.db.models.functions import Coalesce, Greatest
from django.http import HttpResponse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.constants import Module
from apps.accounts.permissions import HasModulePermission
from apps.core.pdf import pdf
from apps.core.workflow import run
from apps.orders import services as order_services
from apps.orders.models import Order, OrderItem, Payment
from apps.orders.serializers import _dec
from apps.parties.models import Customer

from . import services
from .models import Installment, InstallmentPlan, Invoice, PlanStatus, Wallet
from .serializers import (
    CostsSerializer,
    DecisionSerializer,
    InvoiceCreateSerializer,
    InvoicePaidSerializer,
    InvoiceSerializer,
    LedgerPaymentSerializer,
    OrderPaymentSerializer,
    PlanCreateSerializer,
    PlanSerializer,
    RecordSerializer,
    TopUpSerializer,
    WalletAdjustSerializer,
    WalletPaySerializer,
    WalletTransactionSerializer,
)

MONEY = DecimalField(max_digits=16, decimal_places=2)
ZERO = Value(Decimal("0"), output_field=MONEY)


def _with_costs(qs):
    """Annotate purchase / shipping cost with the same defaults as services.financials (for totals)."""
    items_cost = (OrderItem.objects.filter(order=OuterRef("pk")).order_by().values("order")
                  .annotate(s=Sum(ExpressionWrapper(F("unit_cost") * F("quantity"), output_field=MONEY)))
                  .values("s"))
    return qs.annotate(
        purchase=Coalesce(F("purchase_cost"), F("procurement__item_cost"), F("international__item_cost"),
                          Subquery(items_cost, output_field=MONEY), ZERO, output_field=MONEY),
        shipping=Coalesce(F("shipping_cost"), F("international__shipping_cost"), ZERO, output_field=MONEY),
    )


class FinanceStatsView(APIView):
    module = Module.FINANCE
    permission_classes = [HasModulePermission]

    @extend_schema(tags=["finance"], responses=OpenApiTypes.OBJECT)
    def get(self, request):
        qs = order_services.with_paid_total(_with_costs(Order.objects.exclude(status="cancelled")))
        qs = qs.annotate(order_due=Greatest(Coalesce(F("total_amount"), ZERO) - Coalesce(F("paid_total"), ZERO), ZERO,
                                      output_field=MONEY))
        rows = qs.aggregate(revenue=Coalesce(Sum("total_amount"), ZERO), paid=Coalesce(Sum("paid_total"), ZERO),
                            costs=Coalesce(Sum(F("purchase") + F("shipping")), ZERO),
                            due=Coalesce(Sum("order_due"), ZERO),
                            orders=Count("id"))
        return Response({
            "revenue": _dec(rows["revenue"]), "paid": _dec(rows["paid"]),
            "profit": _dec(rows["revenue"] - rows["costs"]), "due": _dec(rows["due"]), "orders": rows["orders"],
            "wallet_balance": _dec(Wallet.objects.aggregate(s=Coalesce(Sum("balance"), ZERO))["s"]),
            "overdue_installments": services.overdue_installments().filter(
                plan__status=PlanStatus.ACTIVE).count(),
        })


class OrderPaymentFilter(django_filters.FilterSet):
    payment = django_filters.ChoiceFilter(choices=[("due", "Balance due"), ("paid", "Paid in full")],
                                          method="filter_payment")
    customer = django_filters.NumberFilter(field_name="customer_id")

    class Meta:
        model = Order
        fields = ["order_type", "customer", "payment"]

    def filter_payment(self, qs, name, value):
        paid = Q(total_amount__gt=0) & Q(paid_total__gte=F("total_amount"))
        return qs.filter(paid) if value == "paid" else qs.filter(total_amount__gt=0).exclude(paid)


@extend_schema(tags=["finance"])
class OrderPaymentViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin,
                          viewsets.GenericViewSet):
    """Finance view of every order: totals, paid, costs and profit; receipts."""

    module = Module.FINANCE
    permission_classes = [HasModulePermission]
    serializer_class = OrderPaymentSerializer
    filterset_class = OrderPaymentFilter
    search_fields = ["reference", "item_details", "customer__full_name", "customer__reference"]
    ordering_fields = ["created_at", "total_amount"]
    http_method_names = ["get", "patch", "head", "options"]

    def get_queryset(self):
        qs = Order.objects.all()
        if self.action == "list":  # cancelled orders stay reachable for receipts
            qs = qs.exclude(status="cancelled")
        qs = (qs.select_related("customer", "procurement", "international", "shop")
              .prefetch_related("items").order_by("-created_at", "-id"))
        return order_services.with_paid_total(qs)

    @extend_schema(request=CostsSerializer)
    def partial_update(self, request, *args, **kwargs):
        s = CostsSerializer(data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        order = run(services.set_costs, self.get_object(), user=request.user, request=request, **s.validated_data)
        return Response(OrderPaymentSerializer(self.get_queryset().get(pk=order.pk)).data)

    def update(self, request, *args, **kwargs):
        return self.partial_update(request, *args, **kwargs)

    @action(detail=True)
    def receipt(self, request, pk=None):
        """Payment receipt: the order, what was paid (each payment) and the balance."""
        order = self.get_object()
        payments = order.payments.select_related("recorded_by").order_by("paid_at", "id")
        return Response({
            "order": OrderPaymentSerializer(order).data,
            "payments": LedgerPaymentSerializer(payments, many=True).data,
            "issued_at": order.updated_at,
        })


class PaymentFilter(django_filters.FilterSet):
    paid_from = django_filters.DateFilter(field_name="paid_at", lookup_expr="date__gte")
    paid_to = django_filters.DateFilter(field_name="paid_at", lookup_expr="date__lte")
    order = django_filters.NumberFilter(field_name="order_id")
    customer = django_filters.NumberFilter(field_name="order__customer_id")

    class Meta:
        model = Payment
        fields = ["method", "kind", "order", "customer", "paid_from", "paid_to"]


@extend_schema(tags=["finance"])
class PaymentViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
                     viewsets.GenericViewSet):
    """Payments ledger. Recording a payment never accepts more than the order's balance."""

    module = Module.FINANCE
    permission_classes = [HasModulePermission]
    serializer_class = LedgerPaymentSerializer
    filterset_class = PaymentFilter
    search_fields = ["reference", "order__reference", "order__customer__full_name"]
    ordering_fields = ["paid_at", "amount"]

    def get_queryset(self):
        return Payment.objects.select_related("order__customer", "recorded_by").order_by("-paid_at", "-id")

    @extend_schema(request=RecordSerializer, responses={201: LedgerPaymentSerializer})
    def create(self, request, *args, **kwargs):
        s = RecordSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        data = dict(s.validated_data)
        payment = run(order_services.record_payment, data.pop("order"), user=request.user, request=request, **data)
        return Response(LedgerPaymentSerializer(self.get_queryset().get(pk=payment.pk)).data,
                        status=status.HTTP_201_CREATED)

    @extend_schema(request=WalletPaySerializer, responses={201: LedgerPaymentSerializer})
    @action(detail=False, methods=["post"], url_path="from-wallet")
    def from_wallet(self, request):
        s = WalletPaySerializer(data=request.data)
        s.is_valid(raise_exception=True)
        payment = run(services.pay_from_wallet, s.validated_data["order"], amount=s.validated_data["amount"],
                      user=request.user, request=request)
        return Response(LedgerPaymentSerializer(self.get_queryset().get(pk=payment.pk)).data,
                        status=status.HTTP_201_CREATED)


class InvoiceFilter(django_filters.FilterSet):
    customer = django_filters.NumberFilter(field_name="customer_id")
    order = django_filters.NumberFilter(field_name="order_id")
    quote = django_filters.NumberFilter(field_name="quote_id")

    class Meta:
        model = Invoice
        fields = ["status", "source", "customer", "order", "quote"]


@extend_schema(tags=["finance"])
class InvoiceViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
                     viewsets.GenericViewSet):
    module = Module.FINANCE
    permission_classes = [HasModulePermission]
    serializer_class = InvoiceSerializer
    filterset_class = InvoiceFilter
    search_fields = ["reference", "customer__full_name", "order__reference", "quote__reference", "items__description"]
    ordering_fields = ["created_at", "due_date"]
    required_access = {"pdf": "view"}

    def get_queryset(self):
        return (Invoice.objects.select_related("customer", "order", "quote", "created_by").prefetch_related("items")
                .order_by("-created_at", "-id").distinct())

    def _respond(self, invoice, code=status.HTTP_200_OK):
        return Response(InvoiceSerializer(self.get_queryset().get(pk=invoice.pk)).data, status=code)

    @extend_schema(request=InvoiceCreateSerializer, responses={201: InvoiceSerializer})
    def create(self, request, *args, **kwargs):
        s = InvoiceCreateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        invoice = run(services.create_invoice, user=request.user, request=request, **s.validated_data)
        return self._respond(invoice, status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def send(self, request, pk=None):
        """Mark as sent. Delivery by SMS/email uses the notification providers once configured."""
        return self._respond(run(services.send_invoice, self.get_object(), user=request.user, request=request))

    @extend_schema(request=InvoicePaidSerializer)
    @action(detail=True, methods=["post"], url_path="mark-paid")
    def mark_paid(self, request, pk=None):
        s = InvoicePaidSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        return self._respond(run(services.mark_invoice_paid, self.get_object(), user=request.user, request=request,
                                 **s.validated_data))

    @action(detail=True, methods=["post"])
    def void(self, request, pk=None):
        return self._respond(run(services.void_invoice, self.get_object(), user=request.user, request=request))

    @extend_schema(responses={200: bytes})
    @action(detail=True)
    def pdf(self, request, pk=None):
        inv = self.get_object()
        t = services.invoice_totals(inv)
        lines = [
            f"Invoice {inv.reference}   ({inv.get_status_display()})",
            f"Issued {inv.issue_date:%d %b %Y}" + (f"   Due {inv.due_date:%d %b %Y}" if inv.due_date else ""),
            f"Bill to: {inv.customer.full_name}  {inv.customer.phone}",
            *( [f"For: {inv.order.reference if inv.order_id else inv.quote.reference}"] if (inv.order_id or inv.quote_id) else []),
            "",
            *[f"{i.description[:60]}   {i.quantity:g} x {i.unit_price:,.2f} = {i.amount:,.2f}" for i in inv.items.all()],
            "",
            f"Subtotal: {inv.currency} {t['subtotal']:,.2f}",
            *( [f"VAT {inv.tax_rate:g}%: {inv.currency} {t['tax']:,.2f}"] if t["tax"] else []),
            f"Total: {inv.currency} {t['total']:,.2f}",
            f"Paid: {inv.currency} {t['paid']:,.2f}    Balance: {inv.currency} {t['balance']:,.2f}",
        ]
        response = HttpResponse(pdf("AGIZA — INVOICE", lines[:34]), content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{inv.reference}.pdf"'
        response["Cache-Control"] = "private, no-store"
        return response


@extend_schema(tags=["finance"])
class WalletViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Customers with a wallet or orders: balance, orders, paid, due, installments (keyed by customer id)."""

    module = Module.FINANCE
    permission_classes = [HasModulePermission]
    search_fields = ["full_name", "reference", "phone"]
    required_access = {"top_up": "edit", "adjust": "manage"}
    serializer_class = WalletTransactionSerializer  # rows are built in _row(); used for schema generation

    def get_queryset(self):
        orders = Order.objects.filter(customer=OuterRef("pk")).exclude(status="cancelled")
        paid = (Payment.objects.filter(order__customer=OuterRef("pk")).exclude(order__status="cancelled")
                .order_by().values("order__customer")
                .annotate(s=Coalesce(Sum("amount", filter=~Q(kind=Payment.Kind.REFUND)), ZERO)
                          - Coalesce(Sum("amount", filter=Q(kind=Payment.Kind.REFUND)), ZERO)).values("s"))
        totals = orders.order_by().values("customer").annotate(s=Sum("total_amount")).values("s")
        counts = orders.order_by().values("customer").annotate(n=Count("id")).values("n")
        return (Customer.objects.filter(Q(wallet__isnull=False) | Q(orders__isnull=False)).distinct()
                .select_related("wallet")
                .annotate(order_count=Coalesce(Subquery(counts), 0),
                          total_paid=Coalesce(Subquery(paid, output_field=MONEY), ZERO),
                          total_value=Coalesce(Subquery(totals, output_field=MONEY), ZERO))
                .prefetch_related(Prefetch("orders", queryset=Order.objects.filter(
                    installment_schedule__status__in=[PlanStatus.ACTIVE, PlanStatus.PENDING_APPROVAL])
                    .select_related("installment_schedule").prefetch_related("installment_schedule__installments"),
                    to_attr="plan_orders"))
                .order_by("full_name", "id"))

    def _row(self, c) -> dict:
        wallet = getattr(c, "wallet", None)
        plans = []
        for o in getattr(c, "plan_orders", []):
            plan = o.installment_schedule
            nxt = services.next_installment(plan)
            plans.append({"plan_id": plan.id, "order_id": o.id, "order": o.reference, "status": plan.status,
                          "status_display": plan.get_status_display(), "total": _dec(plan.total_amount),
                          "paid": _dec(sum((i.paid_amount for i in plan.installments.all()), Decimal("0"))),
                          "next_due": nxt.due_date if nxt else None,
                          "next_amount": _dec(nxt.amount - nxt.paid_amount) if nxt else None})
        due = max(c.total_value - c.total_paid, Decimal("0"))
        return {"customer": {"id": c.id, "reference": c.reference, "full_name": c.full_name, "phone": c.phone},
                "wallet_balance": _dec(wallet.balance if wallet else Decimal("0")),
                "total_orders": c.order_count, "total_paid": _dec(c.total_paid), "total_due": _dec(due),
                "installment_plans": plans}

    @extend_schema(operation_id="finance_wallets_list", responses=OpenApiTypes.OBJECT)
    def list(self, request, *args, **kwargs):
        qs = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(qs)
        return self.get_paginated_response([self._row(c) for c in page])

    @extend_schema(operation_id="finance_wallets_retrieve", responses=OpenApiTypes.OBJECT)
    def retrieve(self, request, *args, **kwargs):
        c = self.get_object()
        wallet = services.wallet_for(c) if hasattr(c, "wallet") else None
        txs = wallet.transactions.select_related("order", "created_by")[:100] if wallet else []
        return Response({**self._row(c), "transactions": WalletTransactionSerializer(txs, many=True).data})

    @extend_schema(request=TopUpSerializer)
    @action(detail=True, methods=["post"], url_path="top-up")
    def top_up(self, request, pk=None):
        s = TopUpSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        run(services.top_up, self.get_object(), user=request.user, request=request, **s.validated_data)
        return self.retrieve(request, pk=pk)

    @extend_schema(request=WalletAdjustSerializer)
    @action(detail=True, methods=["post"])
    def adjust(self, request, pk=None):
        s = WalletAdjustSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        run(services.adjust_wallet, self.get_object(), user=request.user, request=request, **s.validated_data)
        return self.retrieve(request, pk=pk)


@extend_schema(tags=["finance"])
class InstallmentPlanViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
                             viewsets.GenericViewSet):
    """Installment schedules. Creating needs Finance edit; approving or rejecting needs Finance manage."""

    module = Module.FINANCE
    permission_classes = [HasModulePermission]
    serializer_class = PlanSerializer
    filterset_fields = ["status"]
    search_fields = ["order__reference", "order__customer__full_name"]
    required_access = {"decide": "manage"}

    def get_queryset(self):
        return (InstallmentPlan.objects.select_related("order__customer", "approved_by")
                .prefetch_related(Prefetch("installments", queryset=Installment.objects.order_by("sequence")))
                .order_by("-created_at", "-id"))

    def _respond(self, plan, code=status.HTTP_200_OK):
        return Response(PlanSerializer(self.get_queryset().get(pk=plan.pk)).data, status=code)

    @extend_schema(request=PlanCreateSerializer, responses={201: PlanSerializer})
    def create(self, request, *args, **kwargs):
        s = PlanCreateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        data = dict(s.validated_data)
        plan = run(services.create_plan, data.pop("order"), user=request.user, request=request, **data)
        return self._respond(plan, status.HTTP_201_CREATED)

    @extend_schema(request=DecisionSerializer)
    @action(detail=True, methods=["post"])
    def decide(self, request, pk=None):
        s = DecisionSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        plan = run(services.decide_plan, self.get_object(), user=request.user, request=request, **s.validated_data)
        return self._respond(plan)
