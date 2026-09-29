"""
Seller API, mounted at /api/app/seller/ and used by the vendor area of the AGIZA website.

A vendor signs in with its normal AGIZA account. Every view resolves the store from the
signed-in account (`Vendor.owner`) and scopes every query to it, so another vendor's
products, orders, earnings and payouts simply don't exist here (404), whatever ids are
sent. Staff-only actions (approval, commission, moderation, payouts) are not reachable.
"""
from __future__ import annotations

from decimal import Decimal

from django.db.models import Count, F, Prefetch, Q, Sum
from django.http import Http404
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from apps.catalog.models import Product, ProductImage, ProductVariant, Vendor
from apps.core.audit import record_audit
from apps.core.pagination import StandardPagination
from apps.core.uploads import IMAGE_TYPES, file_response, validate_upload
from apps.core.workflow import run
from apps.inventory.models import StockItem
from apps.orders.models import OrderItem
from apps.storefront.serializers import money
from apps.storefront.views.base import CustomerAPIView

from . import services, vendor_products
from .models import FulfillmentStatus, MarketplaceSettings, SettlementStatus, VendorFulfillment, VendorPayout
from .seller_serializers import (
    ApplicationSerializer,
    SellerProductWriteSerializer,
    StoreProfileSerializer,
    fulfillment_payload,
    seller_product_payload,
    vendor_payload,
)

A = Vendor.ApprovalStatus


class SellerAPIView(CustomerAPIView):
    """Signed-in customer who has a store (or an application)."""

    def get_vendor(self, *, lock: bool = False) -> Vendor:
        qs = Vendor.objects.select_related("city", "warehouse")
        if lock:
            qs = qs.select_for_update()
        vendor = qs.filter(owner=self.request.user).first()
        if vendor is None:
            raise Http404("You don't have a store on AGIZA. Apply to sell first.")
        return vendor

    def approved_vendor(self) -> Vendor:
        """Approved stores only (suspended stores can still read their orders and earnings)."""
        vendor = self.get_vendor()
        if vendor.approval_status not in (A.APPROVED, A.SUSPENDED):
            raise PermissionDenied("Your store isn't approved yet.")
        return vendor


def _payload(vendor, request):
    body = vendor_payload(vendor, request)
    if vendor.commission_mode == Vendor.CommissionMode.DEFAULT:
        rate = MarketplaceSettings.load().default_commission_percent
        body["commission"] = f"{rate.normalize():f}% (some categories have their own rate)"
    body["payout_schedule"] = MarketplaceSettings.load().payout_schedule
    return body


# --------------------------------------------------------------------------- #
# Application and store profile
# --------------------------------------------------------------------------- #
@extend_schema(tags=["seller"], request=ApplicationSerializer, responses=OpenApiTypes.OBJECT)
class ApplicationView(SellerAPIView):
    """GET: my store / application (404 if none). POST: apply. PATCH: edit a pending application."""

    throttle_scope = "checkout"

    def get(self, request):
        return Response(_payload(self.get_vendor(), request))

    def post(self, request):
        s = ApplicationSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        vendor = run(services.apply, request.user, s.validated_data, request=request)
        return Response(_payload(vendor, request), status=status.HTTP_201_CREATED)

    def patch(self, request):
        vendor = self.get_vendor()
        if vendor.approval_status in (A.APPROVED, A.SUSPENDED):
            s = StoreProfileSerializer(vendor, data=request.data, partial=True)
            s.is_valid(raise_exception=True)
            if vendor.approval_status == A.SUSPENDED:
                raise PermissionDenied("Your store is suspended, so it can't be changed. Contact AGIZA.")
            s.save()
            services.ensure_stock_location(vendor)
            record_audit(action="update", request=request, instance=vendor, changes={k: [None, str(v)] for k, v in
                         s.validated_data.items() if not k.startswith("payout")}, object_repr=f"{vendor.name} (by vendor)")
            vendor.refresh_from_db()
        else:
            s = ApplicationSerializer(vendor, data=request.data, partial=True)
            s.is_valid(raise_exception=True)
            vendor = run(services.update_application, vendor, s.validated_data, request=request)
        return Response(_payload(Vendor.objects.select_related("city").get(pk=vendor.pk), request))


@extend_schema(tags=["seller"], responses=OpenApiTypes.OBJECT)
class StoreMediaUploadView(SellerAPIView):
    """POST a logo or banner image; GET it (the owner can see it before the store is public)."""

    parser_classes = [MultiPartParser, FormParser]

    def get(self, request, kind: str):
        vendor = self.get_vendor()
        file = getattr(vendor, kind)
        if not file:
            raise Http404
        return file_response(file, getattr(vendor, f"{kind}_content_type"))

    def post(self, request, kind: str):
        vendor = self.get_vendor()
        if vendor.approval_status in (A.SUSPENDED, A.REJECTED):
            raise PermissionDenied("Your store can't be changed now.")
        upload = request.FILES.get("file")
        content_type = validate_upload(upload, allowed=IMAGE_TYPES, max_bytes=4 * 1024 * 1024)
        old = getattr(vendor, kind)
        if old:
            old.delete(save=False)
        setattr(vendor, kind, upload)
        setattr(vendor, f"{kind}_content_type", content_type)
        vendor.save(update_fields=[kind, f"{kind}_content_type", "updated_at"])
        return Response(_payload(vendor, request))


# --------------------------------------------------------------------------- #
# Dashboard
# --------------------------------------------------------------------------- #
def _earnings(vendor) -> dict:
    rows = VendorFulfillment.objects.filter(vendor=vendor)
    live = rows.exclude(settlement_status=SettlementStatus.VOID)
    agg = live.aggregate(gross=Sum("subtotal"), commission=Sum("commission"), net=Sum("vendor_net"))
    by_state = dict(live.values("settlement_status").annotate(n=Sum("vendor_net")).values_list("settlement_status", "n"))
    zero = Decimal("0")
    return {
        "gross_sales": money(agg["gross"] or zero), "commission": money(agg["commission"] or zero),
        "net_earnings": money(agg["net"] or zero), "pending": money(by_state.get(SettlementStatus.PENDING) or zero),
        "payable": money(by_state.get(SettlementStatus.PAYABLE) or zero),
        "paid_out": money(by_state.get(SettlementStatus.SETTLED) or zero),
        "orders": live.count(),
    }


@extend_schema(tags=["seller"], responses=OpenApiTypes.OBJECT)
class DashboardView(SellerAPIView):
    def get(self, request):
        vendor = self.approved_vendor()
        products = Product.objects.filter(vendor=vendor)
        states = {"published": 0, "pending_review": 0, "draft": 0, "rejected": 0, "inactive": 0, "disabled": 0}
        for product in products:
            states[vendor_products.listing_state(product)] += 1
        open_orders = VendorFulfillment.objects.filter(vendor=vendor, status__in=[
            FulfillmentStatus.PENDING, FulfillmentStatus.ACCEPTED]).exclude(order__status="cancelled")
        low_stock = (StockItem.objects.filter(warehouse=vendor.warehouse, variant__product__vendor=vendor)
                     .annotate(avail=F("quantity") - F("reserved")).filter(avail__lte=3).count()
                     if vendor.warehouse_id else 0)
        return Response({"store": _payload(vendor, request), "products": states, "earnings": _earnings(vendor),
                         "orders_to_prepare": open_orders.count(), "low_stock": low_stock})


# --------------------------------------------------------------------------- #
# Products
# --------------------------------------------------------------------------- #
def _stock(vendor, variant_ids) -> dict:
    rows = StockItem.objects.filter(variant_id__in=list(variant_ids), warehouse=vendor.warehouse_id)
    return {s.variant_id: {"quantity": s.quantity, "reserved": s.reserved, "available": s.quantity - s.reserved}
            for s in rows}


def _products(vendor):
    return (Product.objects.filter(vendor=vendor).select_related("category")
            .prefetch_related("variants", Prefetch("images", queryset=ProductImage.objects.filter(variant__isnull=True)),
                              "specifications"))


@extend_schema(tags=["seller"], request=SellerProductWriteSerializer, responses=OpenApiTypes.OBJECT)
class ProductListView(SellerAPIView):
    def get(self, request):
        vendor = self.approved_vendor()
        qs = _products(vendor).order_by("-updated_at", "-id")
        if search := request.query_params.get("search", "").strip()[:100]:
            qs = qs.filter(Q(name__icontains=search) | Q(sku__icontains=search))
        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        stock = _stock(vendor, [v.pk for p in page for v in p.variants.all()])
        return paginator.get_paginated_response([seller_product_payload(p, request, stock=stock) for p in page])

    def post(self, request):
        vendor = self.approved_vendor()
        s = SellerProductWriteSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        product = run(vendor_products.save, vendor, s.to_service(vendor, None), request=request)
        return Response(_detail(vendor, product.pk, request), status=status.HTTP_201_CREATED)


def _detail(vendor, pk, request) -> dict:
    product = get_object_or_404(_products(vendor), pk=pk)
    return seller_product_payload(product, request, stock=_stock(vendor, [v.pk for v in product.variants.all()]),
                                  detail=True)


@extend_schema(tags=["seller"], request=SellerProductWriteSerializer, responses=OpenApiTypes.OBJECT)
class ProductDetailView(SellerAPIView):
    def get(self, request, pk: int):
        return Response(_detail(self.approved_vendor(), pk, request))

    def patch(self, request, pk: int):
        vendor = self.approved_vendor()
        product = get_object_or_404(Product.objects.filter(vendor=vendor), pk=pk)
        s = SellerProductWriteSerializer(data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        run(vendor_products.save, vendor, s.to_service(vendor, product), product=product, request=request)
        return Response(_detail(vendor, pk, request))

    def delete(self, request, pk: int):
        vendor = self.approved_vendor()
        product = get_object_or_404(Product.objects.filter(vendor=vendor), pk=pk)
        result = run(vendor_products.delete, vendor, product, request=request)
        return Response({"result": result})


@extend_schema(tags=["seller"], responses=OpenApiTypes.OBJECT)
class ProductImageUploadView(SellerAPIView):
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, pk: int):
        vendor = self.approved_vendor()
        product = get_object_or_404(Product.objects.filter(vendor=vendor), pk=pk)
        upload = request.FILES.get("file")
        content_type = validate_upload(upload, allowed=IMAGE_TYPES)
        run(vendor_products.add_image, vendor, product, upload, content_type, request=request)
        return Response(_detail(vendor, pk, request), status=status.HTTP_201_CREATED)


@extend_schema(tags=["seller"], responses=OpenApiTypes.OBJECT)
class ProductImageDetailView(SellerAPIView):
    def _get(self, vendor, pk, image_id):
        return get_object_or_404(ProductImage.objects.select_related("product"), pk=image_id, product_id=pk,
                                 product__vendor=vendor)

    def post(self, request, pk: int, image_id: int):
        """Make this the main image."""
        vendor = self.approved_vendor()
        run(vendor_products.make_primary, vendor, self._get(vendor, pk, image_id))
        return Response(_detail(vendor, pk, request))

    def delete(self, request, pk: int, image_id: int):
        vendor = self.approved_vendor()
        run(vendor_products.remove_image, vendor, self._get(vendor, pk, image_id), request=request)
        return Response(_detail(vendor, pk, request))


@extend_schema(tags=["seller"], responses={(200, "image/*"): OpenApiTypes.BINARY})
class ImageFileView(SellerAPIView):
    """The vendor's own product images, including drafts customers can't see."""

    throttle_classes = []

    def get(self, request, pk: int):
        image = get_object_or_404(ProductImage, pk=pk, product__vendor__owner=request.user)
        return file_response(image.file, image.content_type)


@extend_schema(tags=["seller"], responses=OpenApiTypes.OBJECT)
class StockView(SellerAPIView):
    """Set units on hand: {"variant": id, "quantity": n}."""

    def post(self, request, pk: int):
        vendor = self.approved_vendor()
        variant_id = request.data.get("variant")
        try:
            quantity = int(request.data.get("quantity"))
        except (TypeError, ValueError):
            return Response({"error": {"code": "invalid", "message": "Enter a whole number.",
                                       "details": {"quantity": ["Enter a whole number."]}}}, status=400)
        variant = get_object_or_404(ProductVariant.objects.select_related("product"), pk=variant_id,
                                    product_id=pk, product__vendor=vendor)
        run(vendor_products.set_stock, vendor, variant, quantity, request=request)
        return Response(_detail(vendor, pk, request))


# --------------------------------------------------------------------------- #
# Orders (this vendor's part of each order)
# --------------------------------------------------------------------------- #
def _fulfillments(vendor):
    return (VendorFulfillment.objects.filter(vendor=vendor)
            .select_related("order__customer", "order__shop__city", "payout")
            .prefetch_related(Prefetch("items", queryset=OrderItem.objects.order_by("id")), "events"))


@extend_schema(tags=["seller"], responses=OpenApiTypes.OBJECT)
class OrderListView(SellerAPIView):
    def get(self, request):
        vendor = self.approved_vendor()
        qs = _fulfillments(vendor)
        state = request.query_params.get("status")
        if state == "open":
            qs = qs.filter(status__in=[FulfillmentStatus.PENDING, FulfillmentStatus.ACCEPTED, FulfillmentStatus.READY])
        elif state in FulfillmentStatus.values:
            qs = qs.filter(status=state)
        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs.order_by("-created_at", "-id"), request, view=self)
        return paginator.get_paginated_response([fulfillment_payload(f, request) for f in page])


@extend_schema(tags=["seller"], responses=OpenApiTypes.OBJECT)
class OrderDetailView(SellerAPIView):
    def get(self, request, pk: int):
        vendor = self.approved_vendor()
        return Response(fulfillment_payload(get_object_or_404(_fulfillments(vendor), pk=pk), request, detail=True))


@extend_schema(tags=["seller"], request=None, responses=OpenApiTypes.OBJECT)
class OrderActionView(SellerAPIView):
    ACTIONS = {"accept": FulfillmentStatus.ACCEPTED, "ready": FulfillmentStatus.READY}

    def post(self, request, pk: int, action: str):
        if action not in self.ACTIONS:
            raise Http404
        vendor = self.approved_vendor()
        fulfillment = get_object_or_404(VendorFulfillment.objects.filter(vendor=vendor), pk=pk)
        run(services.vendor_advance, fulfillment, self.ACTIONS[action], vendor=vendor,
            note=str(request.data.get("note", ""))[:255], request=request)
        return Response(fulfillment_payload(get_object_or_404(_fulfillments(vendor), pk=pk), request, detail=True))


# --------------------------------------------------------------------------- #
# Earnings and payouts
# --------------------------------------------------------------------------- #
@extend_schema(tags=["seller"], responses=OpenApiTypes.OBJECT)
class EarningsView(SellerAPIView):
    def get(self, request):
        vendor = self.approved_vendor()
        payouts = VendorPayout.objects.filter(vendor=vendor).annotate(orders=Count("fulfillments"))[:50]
        return Response({
            "summary": _earnings(vendor),
            "payout_schedule": MarketplaceSettings.load().payout_schedule,
            "payout_account": {"method": vendor.get_payout_method_display() if vendor.payout_method else None,
                               "provider": vendor.payout_provider, "account_name": vendor.payout_account_name,
                               "account_number": vendor.payout_account_number},
            "payouts": [{"reference": p.reference, "amount": money(p.amount), "method": p.get_method_display(),
                         "transaction_reference": p.transaction_reference, "paid_at": p.paid_at, "orders": p.orders}
                        for p in payouts],
        })
