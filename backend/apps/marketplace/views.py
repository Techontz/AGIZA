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
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.constants import Module
from apps.accounts.permissions import HasModulePermission
from apps.catalog.models import Category, Vendor
from apps.core.audit import AuditedViewSetMixin, diff, record_audit, snapshot
from apps.core.workflow import run
from apps.orders.serializers import _dec

from . import ledger, reviews, services
from .models import (
    CategoryCommission,
    MarketplaceSettings,
    PayoutBatch,
    ProductReview,
    SettlementStatus,
    VendorDocument,
    VendorFulfillment,
    VendorLedgerEntry,
    VendorPayout,
)

ZERO = Decimal("0")


class MarketplaceSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = MarketplaceSettings
        fields = ["default_commission_percent", "require_product_review", "vendor_applications_open",
                  "payout_schedule", "return_window_days", "auto_publish_reviews", "updated_at"]
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
        "issue": ({"type": f.issue_type, "type_display": f.get_issue_type_display(), "note": f.issue_note,
                   "reported_at": f.issue_reported_at, "resolved_at": f.issue_resolved_at,
                   "resolution": f.issue_resolution, "open": f.issue_open} if f.issue_reported_at else None),
        "pickup": ({"reference": f.pickup_task.reference, "status": f.pickup_task.status,
                    "status_display": f.pickup_task.get_status_display()}
                   if getattr(f, "pickup_task", None) else None),
    }


class FulfillmentFilter(django_filters.FilterSet):
    vendor = django_filters.CharFilter(method="filter_vendor")
    status = django_filters.BaseInFilter(field_name="status")
    settlement_status = django_filters.BaseInFilter(field_name="settlement_status")
    order = django_filters.NumberFilter(field_name="order_id")
    issue_open = django_filters.BooleanFilter(method="filter_issue_open")

    class Meta:
        model = VendorFulfillment
        fields = ["vendor", "status", "settlement_status", "order", "issue_open"]

    def filter_issue_open(self, qs, name, value):
        open_q = Q(issue_reported_at__isnull=False, issue_resolved_at__isnull=True)
        return qs.filter(open_q) if value else qs.exclude(open_q)

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
        return (VendorFulfillment.objects.select_related("order__customer", "vendor", "payout", "origin",
                                                         "pickup_task")
                .order_by("-created_at", "-id"))

    def list(self, request, *args, **kwargs):
        qs = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(qs)
        return self.get_paginated_response([fulfillment_row(f) for f in page])

    @extend_schema(request=OpenApiTypes.OBJECT)
    @action(detail=True, methods=["post"])
    def resolve(self, request, pk=None):
        """Decide on a vendor's reported problem: {"action": "continue" | "cancel_part", "note"}."""
        f = get_object_or_404(self.get_queryset(), pk=pk)
        run(services.resolve_issue, f, user=request.user, action=str(request.data.get("action", "")),
            note=str(request.data.get("note", "")), request=request)
        return Response(fulfillment_row(self.get_queryset().get(pk=f.pk)))


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
        # What is owed and paid comes from the ledger (the financial source of truth).
        due = dict(VendorLedgerEntry.objects.filter(ledger.DUE).values("vendor_id").annotate(t=Sum("amount"))
                   .values_list("vendor_id", "t"))
        refunds = dict(VendorLedgerEntry.objects.filter(kind="refund").values("vendor_id").annotate(t=Sum("amount"))
                       .values_list("vendor_id", "t"))
        paid = dict(VendorPayout.objects.filter(status="paid").values("vendor_id").annotate(t=Sum("amount"))
                    .values_list("vendor_id", "t"))
        processing = dict(VendorPayout.objects.filter(status="processing").values("vendor_id")
                          .annotate(t=Sum("amount")).values_list("vendor_id", "t"))
        return Response({
            "marketplace": {**_totals(live), "agiza_own_sales": _dec(agiza),
                            "refunds_to_customers": _dec(-(sum(refunds.values(), ZERO))),
                            "payable_to_vendors": _dec(sum((v for v in due.values() if v > 0), ZERO)),
                            "paid_to_vendors": _dec(sum(paid.values(), ZERO)),
                            "vendor_sales": vendor_totals["gross_sales"], "platform_commission": vendor_totals["commission"],
                            "vendor_earnings": vendor_totals["vendor_net"]},
            "vendors": [{"vendor": {"id": r["vendor_id"], "name": r["vendor__name"], "self_service": r["vendor__owner"] is not None},
                         "gross_sales": _dec(r["gross"] or ZERO), "commission": _dec(r["commission"] or ZERO),
                         "vendor_net": _dec(r["net"] or ZERO), "orders": r["orders"],
                         "pending": _dec(r["pending"] or ZERO),
                         "payable": _dec(due.get(r["vendor_id"]) or ZERO),
                         "in_payout": _dec(processing.get(r["vendor_id"]) or ZERO),
                         "refunds": _dec(-(refunds.get(r["vendor_id"]) or ZERO)),
                         "paid_out": _dec(paid.get(r["vendor_id"]) or ZERO)} for r in rows],
        })


# --------------------------------------------------------------------------- #
# Payouts, batches, ledger and adjustments
# --------------------------------------------------------------------------- #
class PayoutCreateSerializer(serializers.Serializer):
    vendor = serializers.PrimaryKeyRelatedField(queryset=Vendor.objects.all())
    method = serializers.ChoiceField(choices=["mobile_money", "bank", "cash", "other"])
    transaction_reference = serializers.CharField(max_length=80, required=False, allow_blank=True, default="")
    paid_at = serializers.DateTimeField(required=False, allow_null=True)
    notes = serializers.CharField(max_length=1000, required=False, allow_blank=True, default="")
    record_as_paid = serializers.BooleanField(
        default=True, help_text="True: the transfer was already made (needs its reference). False: start processing")


def payout_row(p: VendorPayout) -> dict:
    return {"id": p.id, "reference": p.reference, "vendor": {"id": p.vendor_id, "name": p.vendor.name},
            "batch": p.batch.reference if p.batch_id else None, "status": p.status,
            "status_display": p.get_status_display(), "amount": _dec(p.amount), "currency": p.currency,
            "gross_sales": _dec(p.gross_sales), "commission": _dec(p.commission),
            "refund_deductions": _dec(p.refund_deductions), "adjustments": _dec(p.adjustments),
            "method": p.method, "method_display": p.get_method_display(), "destination": p.destination,
            "transaction_reference": p.transaction_reference, "paid_at": p.paid_at, "notes": p.notes,
            "failure_reason": p.failure_reason, "orders": getattr(p, "orders", None),
            "recorded_by": p.recorded_by.full_name if p.recorded_by_id else None,
            "processed_by": p.processed_by.full_name if p.processed_by_id else None,
            "processed_at": p.processed_at, "created_at": p.created_at}


@extend_schema(tags=["marketplace"], request=PayoutCreateSerializer, responses=OpenApiTypes.OBJECT)
class PayoutViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    """
    Settlements to vendors. A payout always takes the vendor's whole payable ledger balance (the
    amount is never typed in); money moves outside the system and staff record the outcome.
    """

    module = Module.FINANCE
    permission_classes = [HasModulePermission]
    read_modules = (Module.ECOMMERCE,)
    filterset_fields = ["vendor", "status", "batch"]
    serializer_class = PayoutCreateSerializer

    def get_queryset(self):
        return (VendorPayout.objects.select_related("vendor", "recorded_by", "processed_by", "batch")
                .annotate(orders=Count("fulfillments")).order_by("-created_at", "-id"))

    def list(self, request, *args, **kwargs):
        page = self.paginate_queryset(self.filter_queryset(self.get_queryset()))
        return self.get_paginated_response([payout_row(p) for p in page])

    def _row(self, payout, code=status.HTTP_200_OK):
        return Response(payout_row(get_object_or_404(self.get_queryset(), pk=payout.pk)), status=code)

    def create(self, request, *args, **kwargs):
        s = PayoutCreateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        if d["record_as_paid"]:
            if not d["transaction_reference"].strip():
                raise ValidationError({"transaction_reference": ["Enter the transfer reference as proof of payment."]})
            payout = run(ledger.record_payout, d["vendor"], user=request.user, method=d["method"],
                         paid_at=d.get("paid_at"), transaction_reference=d["transaction_reference"], notes=d["notes"],
                         request=request)
        else:
            payout = run(ledger.create_payout, d["vendor"], user=request.user, method=d["method"], notes=d["notes"],
                         request=request)
        return self._row(payout, status.HTTP_201_CREATED)

    @extend_schema(request=OpenApiTypes.OBJECT)
    @action(detail=True, methods=["post"])
    def paid(self, request, pk=None):
        """{"transaction_reference", "paid_at"?, "notes"?} — the transfer was made."""
        payout = get_object_or_404(self.get_queryset(), pk=pk)
        run(ledger.mark_paid, payout, user=request.user,
            transaction_reference=str(request.data.get("transaction_reference", "")),
            notes=str(request.data.get("notes", "")), request=request)
        return self._row(payout)

    @extend_schema(request=OpenApiTypes.OBJECT)
    @action(detail=True, methods=["post"])
    def failed(self, request, pk=None):
        """{"reason"} — the transfer didn't go through; the amount returns to the vendor's balance."""
        payout = get_object_or_404(self.get_queryset(), pk=pk)
        run(ledger.mark_failed, payout, user=request.user, reason=str(request.data.get("reason", "")), request=request)
        return self._row(payout)

    @extend_schema(request=OpenApiTypes.OBJECT)
    @action(detail=True, methods=["post"])
    def reverse(self, request, pk=None):
        """{"reason"} — a paid transfer came back (e.g. wrong account); the amount returns to the balance."""
        payout = get_object_or_404(self.get_queryset(), pk=pk)
        run(ledger.mark_failed, payout, user=request.user, reason=str(request.data.get("reason", "")),
            reversed_after_payment=True, request=request)
        return self._row(payout)


@extend_schema(tags=["marketplace"], request=OpenApiTypes.OBJECT, responses=OpenApiTypes.OBJECT)
class PayoutBatchView(APIView):
    """GET recent batches; POST {"vendors"?: [ids], "notes"?} to prepare payouts for everyone with a balance."""

    module = Module.FINANCE
    permission_classes = [HasModulePermission]
    read_modules = (Module.ECOMMERCE,)

    def get(self, request):
        batches = PayoutBatch.objects.select_related("created_by").prefetch_related("payouts")[:50]
        return Response([{"reference": b.reference, "created_at": b.created_at, "notes": b.notes,
                          "created_by": b.created_by.full_name if b.created_by_id else None,
                          "payouts": len(b.payouts.all()),
                          "total": _dec(sum((p.amount for p in b.payouts.all()), ZERO)),
                          "statuses": sorted({p.status for p in b.payouts.all()})} for b in batches])

    def post(self, request):
        vendors = request.data.get("vendors") or None
        if vendors is not None and not (isinstance(vendors, list) and all(isinstance(v, int) for v in vendors)):
            raise ValidationError({"vendors": ["A list of vendor ids."]})
        batch = run(ledger.create_batch, user=request.user, vendor_ids=vendors,
                    notes=str(request.data.get("notes", ""))[:1000], request=request)
        payouts = VendorPayout.objects.filter(batch=batch).select_related("vendor", "recorded_by", "processed_by",
                                                                          "batch")
        return Response({"reference": batch.reference, "payouts": [payout_row(p) for p in payouts]},
                        status=status.HTTP_201_CREATED)


@extend_schema(tags=["marketplace"], responses=OpenApiTypes.OBJECT)
class LedgerView(APIView):
    """A vendor's ledger (?vendor=id), newest first, with its balance."""

    module = Module.FINANCE
    permission_classes = [HasModulePermission]
    read_modules = (Module.ECOMMERCE,)

    def get(self, request):
        vendor = get_object_or_404(Vendor, pk=request.query_params.get("vendor") or 0)
        rows = VendorLedgerEntry.objects.filter(vendor=vendor).select_related("created_by")[:500]
        return Response({
            "vendor": {"id": vendor.pk, "name": vendor.name}, "balance": ledger.balance(vendor).as_dict(),
            "entries": [{"id": e.pk, "kind": e.kind, "kind_display": e.get_kind_display(), "amount": _dec(e.amount),
                         "gross_amount": _dec(e.gross_amount), "commission_amount": _dec(e.commission_amount),
                         "reference": e.reference, "note": e.note, "at": e.created_at,
                         "by": e.created_by.full_name if e.created_by_id else "System"} for e in rows],
        })


class AdjustmentSerializer(serializers.Serializer):
    vendor = serializers.PrimaryKeyRelatedField(queryset=Vendor.objects.all())
    amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    reason = serializers.CharField(max_length=255)


@extend_schema(tags=["marketplace"], request=AdjustmentSerializer, responses=OpenApiTypes.OBJECT)
class AdjustmentView(APIView):
    """A manual credit (+) or debit (−) to a vendor's balance, with the reason. Finance manage only."""

    module = Module.FINANCE
    permission_classes = [HasModulePermission]
    required_access = {"POST": "manage"}

    def post(self, request):
        s = AdjustmentSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        entry = run(ledger.post_adjustment, d["vendor"], amount=d["amount"], reason=d["reason"], user=request.user,
                    request=request)
        return Response({"id": entry.pk, "amount": _dec(entry.amount),
                         "balance": ledger.balance(d["vendor"]).as_dict()}, status=status.HTTP_201_CREATED)


# --------------------------------------------------------------------------- #
# Reviews moderation
# --------------------------------------------------------------------------- #
@extend_schema(tags=["marketplace"], responses=OpenApiTypes.OBJECT)
class ReviewViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    module = Module.ECOMMERCE
    permission_classes = [HasModulePermission]
    filterset_fields = ["status", "vendor", "product", "rating"]
    search_fields = ["title", "body", "product__name", "customer__full_name"]

    def get_queryset(self):
        return ProductReview.objects.select_related("product", "vendor", "customer", "moderated_by").order_by(
            "-created_at", "-id")

    def _row(self, r):
        return {"id": r.pk, "product": {"id": r.product_id, "name": r.product.name},
                "vendor": {"id": r.vendor_id, "name": r.vendor.name} if r.vendor_id else {"id": None, "name": "AGIZA"},
                "customer": {"id": r.customer_id, "name": r.customer.full_name}, "rating": r.rating, "title": r.title,
                "body": r.body, "status": r.status, "status_display": r.get_status_display(),
                "verified_purchase": r.order_item_id is not None, "vendor_reply": r.vendor_reply,
                "flag_reason": r.flag_reason, "moderation_note": r.moderation_note,
                "moderated_by": r.moderated_by.full_name if r.moderated_by_id else None,
                "created_at": r.created_at, "edited_at": r.edited_at}

    def list(self, request, *args, **kwargs):
        page = self.paginate_queryset(self.filter_queryset(self.get_queryset()))
        return self.get_paginated_response([self._row(r) for r in page])

    @extend_schema(request=OpenApiTypes.OBJECT)
    @action(detail=True, methods=["post"])
    def moderate(self, request, pk=None):
        """{"action": "publish" | "hide", "note"}"""
        review = get_object_or_404(self.get_queryset(), pk=pk)
        run(reviews.moderate, review, str(request.data.get("action", "")), user=request.user,
            note=str(request.data.get("note", "")), request=request)
        return Response(self._row(self.get_queryset().get(pk=review.pk)))


# --------------------------------------------------------------------------- #
# Vendor documents (staff)
# --------------------------------------------------------------------------- #
@extend_schema(tags=["marketplace"], responses=OpenApiTypes.OBJECT)
class VendorDocumentsView(APIView):
    module = Module.ECOMMERCE
    permission_classes = [HasModulePermission]

    def get(self, request, vendor_id: int, document_id: int | None = None):
        vendor = get_object_or_404(Vendor, pk=vendor_id)
        if document_id is not None:
            from apps.core.uploads import file_response

            doc = get_object_or_404(VendorDocument, pk=document_id, vendor=vendor)
            return file_response(doc.file, doc.content_type)
        return Response([{"id": d.pk, "kind": d.kind, "kind_display": d.get_kind_display(),
                          "original_name": d.original_name, "content_type": d.content_type,
                          "url": f"marketplace/vendors/{vendor.pk}/documents/{d.pk}/file",
                          "uploaded_at": d.created_at} for d in vendor.documents.all()])
