"""
Staff marketplace API (/api/marketplace/…): marketplace settings and commission rates,
every vendor's order parts, earnings and commission figures, and recording payouts.
"""
from __future__ import annotations

from decimal import Decimal

import django_filters
from django.db.models import Count, Q, Sum
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.constants import Module
from apps.accounts.permissions import HasModulePermission
from apps.catalog.models import Category, Vendor
from apps.core.audit import AuditedViewSetMixin, diff, record_audit, snapshot
from apps.core.workflow import run
from apps.orders.serializers import _dec

from . import services
from .models import (
    CategoryCommission,
    MarketplaceSettings,
    SettlementStatus,
    VendorFulfillment,
    VendorPayout,
)

ZERO = Decimal("0")


class MarketplaceSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = MarketplaceSettings
        fields = ["default_commission_percent", "require_product_review", "vendor_applications_open",
                  "payout_schedule", "updated_at"]
        read_only_fields = ["updated_at"]


@extend_schema(tags=["marketplace"], request=MarketplaceSettingsSerializer, responses=MarketplaceSettingsSerializer)
class SettingsView(APIView):
    module = Module.ECOMMERCE
    permission_classes = [HasModulePermission]
    read_modules = (Module.FINANCE,)
    required_access = {"PATCH": "manage"}  # commission changes are a management decision

    def get(self, request):
        return Response(MarketplaceSettingsSerializer(MarketplaceSettings.load()).data)

    def patch(self, request):
        obj = MarketplaceSettings.load()
        before = snapshot(obj)
        s = MarketplaceSettingsSerializer(obj, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        s.save(updated_by=request.user)
        changes = diff(before, snapshot(obj))
        if changes:
            record_audit(action="update", request=request, instance=obj, changes=changes)
        return Response(MarketplaceSettingsSerializer(obj).data)


class CategoryCommissionSerializer(serializers.ModelSerializer):
    category = serializers.PrimaryKeyRelatedField(queryset=Category.objects.all())
    category_name = serializers.CharField(source="category.__str__", read_only=True)

    class Meta:
        model = CategoryCommission
        fields = ["id", "category", "category_name", "percent", "updated_at"]
        read_only_fields = ["id", "updated_at"]


@extend_schema(tags=["marketplace"])
class CategoryCommissionViewSet(AuditedViewSetMixin, viewsets.ModelViewSet):
    module = Module.ECOMMERCE
    permission_classes = [HasModulePermission]
    read_modules = (Module.FINANCE,)
    required_access = {"create": "manage", "partial_update": "manage", "update": "manage", "destroy": "manage"}
    serializer_class = CategoryCommissionSerializer
    pagination_class = None
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        return CategoryCommission.objects.select_related("category__parent").order_by("category__name")


# --------------------------------------------------------------------------- #
# Vendor order parts and earnings
# --------------------------------------------------------------------------- #
def fulfillment_row(f: VendorFulfillment) -> dict:
    return {
        "id": f.id, "reference": f.reference, "order_id": f.order_id, "order_reference": f.order.reference,
        "order_status": f.order.status, "customer": f.order.customer.full_name,
        "vendor": {"id": f.vendor_id, "name": f.vendor.name if f.vendor_id else "AGIZA",
                   "self_service": bool(f.vendor_id and f.vendor.owner_id)},
        "status": f.status, "status_display": f.get_status_display(), "item_count": f.item_count,
        "subtotal": _dec(f.subtotal), "commission": _dec(f.commission), "vendor_net": _dec(f.vendor_net),
        "shipping_fee": _dec(f.shipping_fee), "settlement_status": f.settlement_status,
        "settlement_display": f.get_settlement_status_display(),
        "payout": f.payout.reference if f.payout_id else None, "origin": f.origin.name if f.origin_id else None,
        "created_at": f.created_at, "accepted_at": f.accepted_at, "ready_at": f.ready_at,
    }


class FulfillmentFilter(django_filters.FilterSet):
    vendor = django_filters.CharFilter(method="filter_vendor")
    status = django_filters.BaseInFilter(field_name="status")
    settlement_status = django_filters.BaseInFilter(field_name="settlement_status")
    order = django_filters.NumberFilter(field_name="order_id")

    class Meta:
        model = VendorFulfillment
        fields = ["vendor", "status", "settlement_status", "order"]

    def filter_vendor(self, qs, name, value):
        if value == "agiza":
            return qs.filter(vendor__isnull=True)
        return qs.filter(vendor_id=value) if value.isdigit() else qs.none()


@extend_schema(tags=["marketplace"], responses=OpenApiTypes.OBJECT)
class FulfillmentViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    module = Module.ECOMMERCE
    permission_classes = [HasModulePermission]
    read_modules = (Module.ORDERS, Module.FINANCE)
    filterset_class = FulfillmentFilter
    search_fields = ["order__reference", "vendor__name", "order__customer__full_name"]

    def get_queryset(self):
        return (VendorFulfillment.objects.select_related("order__customer", "vendor", "payout", "origin")
                .order_by("-created_at", "-id"))

    def list(self, request, *args, **kwargs):
        qs = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(qs)
        return self.get_paginated_response([fulfillment_row(f) for f in page])


def _totals(qs) -> dict:
    agg = qs.aggregate(gross=Sum("subtotal"), commission=Sum("commission"), net=Sum("vendor_net"),
                       shipping=Sum("shipping_fee"), orders=Count("order", distinct=True))
    return {"gross_sales": _dec(agg["gross"] or ZERO), "commission": _dec(agg["commission"] or ZERO),
            "vendor_net": _dec(agg["net"] or ZERO), "shipping_fees": _dec(agg["shipping"] or ZERO),
            "orders": agg["orders"]}


@extend_schema(tags=["marketplace"], responses=OpenApiTypes.OBJECT)
class EarningsView(APIView):
    """Marketplace-wide figures and one row per vendor (orders not cancelled)."""

    module = Module.ECOMMERCE
    permission_classes = [HasModulePermission]
    read_modules = (Module.FINANCE,)

    def get(self, request):
        live = VendorFulfillment.objects.exclude(settlement_status=SettlementStatus.VOID).exclude(
            order__status="cancelled")
        vendor_parts = live.filter(vendor__isnull=False)
        vendor_id = request.query_params.get("vendor")
        if vendor_id and vendor_id.isdigit():
            vendor_parts = vendor_parts.filter(vendor_id=vendor_id)
        rows = (vendor_parts.values("vendor_id", "vendor__name", "vendor__owner")
                .annotate(gross=Sum("subtotal"), commission=Sum("commission"), net=Sum("vendor_net"),
                          orders=Count("order", distinct=True),
                          pending=Sum("vendor_net", filter=Q(settlement_status=SettlementStatus.PENDING)),
                          payable=Sum("vendor_net", filter=Q(settlement_status=SettlementStatus.PAYABLE)),
                          settled=Sum("vendor_net", filter=Q(settlement_status=SettlementStatus.SETTLED)))
                .order_by("-gross"))
        agiza = live.filter(vendor__isnull=True).aggregate(gross=Sum("subtotal"))["gross"] or ZERO
        vendor_totals = _totals(vendor_parts)
        return Response({
            "marketplace": {**_totals(live), "agiza_own_sales": _dec(agiza),
                            "vendor_sales": vendor_totals["gross_sales"], "platform_commission": vendor_totals["commission"],
                            "vendor_earnings": vendor_totals["vendor_net"]},
            "vendors": [{"vendor": {"id": r["vendor_id"], "name": r["vendor__name"], "self_service": r["vendor__owner"] is not None},
                         "gross_sales": _dec(r["gross"] or ZERO), "commission": _dec(r["commission"] or ZERO),
                         "vendor_net": _dec(r["net"] or ZERO), "orders": r["orders"],
                         "pending": _dec(r["pending"] or ZERO), "payable": _dec(r["payable"] or ZERO),
                         "paid_out": _dec(r["settled"] or ZERO)} for r in rows],
        })


# --------------------------------------------------------------------------- #
# Payouts
# --------------------------------------------------------------------------- #
class PayoutCreateSerializer(serializers.Serializer):
    vendor = serializers.PrimaryKeyRelatedField(queryset=Vendor.objects.all())
    method = serializers.ChoiceField(choices=["mobile_money", "bank", "cash", "other"])
    transaction_reference = serializers.CharField(max_length=80, required=False, allow_blank=True, default="")
    paid_at = serializers.DateTimeField(required=False, allow_null=True)
    notes = serializers.CharField(max_length=1000, required=False, allow_blank=True, default="")
    fulfillments = serializers.ListField(child=serializers.IntegerField(), required=False, allow_null=True,
                                         max_length=500, help_text="Empty = everything payable for the vendor")


def payout_row(p: VendorPayout) -> dict:
    return {"id": p.id, "reference": p.reference, "vendor": {"id": p.vendor_id, "name": p.vendor.name},
            "amount": _dec(p.amount), "currency": p.currency, "method": p.method, "method_display": p.get_method_display(),
            "transaction_reference": p.transaction_reference, "paid_at": p.paid_at, "notes": p.notes,
            "orders": getattr(p, "orders", None),
            "recorded_by": p.recorded_by.full_name if p.recorded_by_id else None, "created_at": p.created_at}


@extend_schema(tags=["marketplace"], request=PayoutCreateSerializer, responses=OpenApiTypes.OBJECT)
class PayoutViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    """Settlements to vendors. The amount is always the sum of the chosen payable earnings (never typed in)."""

    module = Module.FINANCE
    permission_classes = [HasModulePermission]
    read_modules = (Module.ECOMMERCE,)
    filterset_fields = ["vendor"]
    serializer_class = PayoutCreateSerializer

    def get_queryset(self):
        return (VendorPayout.objects.select_related("vendor", "recorded_by").annotate(orders=Count("fulfillments"))
                .order_by("-paid_at", "-id"))

    def list(self, request, *args, **kwargs):
        page = self.paginate_queryset(self.filter_queryset(self.get_queryset()))
        return self.get_paginated_response([payout_row(p) for p in page])

    def create(self, request, *args, **kwargs):
        s = PayoutCreateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        payout = run(services.record_payout, d["vendor"], user=request.user, method=d["method"],
                     paid_at=d.get("paid_at"), transaction_reference=d["transaction_reference"], notes=d["notes"],
                     fulfillment_ids=d.get("fulfillments") or None, request=request)
        return Response(payout_row(get_object_or_404(self.get_queryset(), pk=payout.pk)), status=status.HTTP_201_CREATED)
