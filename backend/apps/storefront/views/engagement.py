"""
Customer app / website: reviews, saved products, the notification inbox and return requests.
Every view is scoped to the signed-in customer (other customers' records are 404).
"""
from __future__ import annotations

from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from apps.catalog.models import ProductImage
from apps.core.pagination import StandardPagination
from apps.core.uploads import IMAGE_TYPES, file_response, validate_upload
from apps.core.workflow import run
from apps.marketplace import reviews
from apps.marketplace.models import ProductReview
from apps.orders.models import Order
from apps.returns import services as returns
from apps.returns.models import ReasonCode, ReturnAttachment, ReturnRequest

from .. import wishlist
from ..catalog import image_url, primary_image, visible_products
from ..models import CustomerNotification
from ..serializers import ProductCardSerializer, money
from .base import CustomerAPIView, PublicAPIView, WriteThrottleMixin
from .catalog import _card_context

MAX_EVIDENCE = 6


# --------------------------------------------------------------------------- #
# Reviews
# --------------------------------------------------------------------------- #
def _first_name(name: str) -> str:
    parts = (name or "").split()
    return f"{parts[0]} {parts[1][0]}." if len(parts) > 1 else (parts[0] if parts else "Customer")


def review_payload(r: ProductReview, *, mine: bool = False) -> dict:
    return {"id": r.pk, "rating": r.rating, "title": r.title, "body": r.body, "author": _first_name(r.customer.full_name),
            "verified_purchase": r.order_item_id is not None, "created_at": r.created_at, "edited_at": r.edited_at,
            "vendor_reply": r.vendor_reply or None, "vendor_replied_at": r.vendor_replied_at,
            **({"status": r.status, "product_id": r.product_id} if mine else {})}


class ReviewInput(serializers.Serializer):
    rating = serializers.IntegerField(min_value=1, max_value=5)
    title = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")
    body = serializers.CharField(max_length=2000, required=False, allow_blank=True, default="")


@extend_schema(tags=["app: reviews"], request=ReviewInput, responses=OpenApiTypes.OBJECT)
class ProductReviewsView(WriteThrottleMixin, PublicAPIView):
    """GET: a product's visible reviews (anyone). POST: write or edit my review (signed in, bought it)."""

    throttle_scope = "reviews"

    def get(self, request, pk: int):
        product = get_object_or_404(visible_products(), pk=pk)
        paginator = StandardPagination()
        page = paginator.paginate_queryset(reviews.visible_reviews(product), request, view=self)
        body = paginator.get_paginated_response([review_payload(r) for r in page]).data
        summary = reviews.product_ratings([product.pk]).get(product.pk, {"rating": None, "rating_count": 0})
        mine = None
        if hasattr(request.user, "customer"):
            own = ProductReview.objects.filter(product=product, customer=request.user.customer).first()
            mine = review_payload(own, mine=True) if own else None
            body["can_review"] = own is not None or reviews.purchase_of(request.user.customer, product) is not None
        else:
            body["can_review"] = False
        return Response({**body, **summary, "distribution": reviews.distribution(product), "mine": mine})

    def post(self, request, pk: int):
        if not hasattr(request.user, "customer"):
            return Response({"error": {"code": "not_authenticated", "message": "Sign in to write a review.",
                                       "details": None}}, status=401)
        product = get_object_or_404(visible_products(), pk=pk)
        s = ReviewInput(data=request.data)
        s.is_valid(raise_exception=True)
        review, created = run(reviews.submit, request.user.customer, product, account=request.user, request=request,
                              **s.validated_data)
        return Response(review_payload(review, mine=True), status=201 if created else 200)


@extend_schema(tags=["app: reviews"], responses=OpenApiTypes.OBJECT)
class MyReviewsView(CustomerAPIView):
    """My reviews, and the delivered purchases I can still review."""

    def get(self, request):
        mine = ProductReview.objects.filter(customer=self.customer).select_related("customer", "product")
        to_review = reviews.reviewable_items(self.customer)
        return Response({
            "reviews": [{**review_payload(r, mine=True), "product_name": r.product.name} for r in mine],
            "to_review": [{"product_id": i.variant.product_id, "name": i.product_name, "order": i.order.reference,
                           "image": image_url(request, primary_image(i.variant.product))} for i in to_review[:50]],
        })


@extend_schema(tags=["app: reviews"], responses=OpenApiTypes.OBJECT)
class MyReviewDetailView(CustomerAPIView):
    def delete(self, request, pk: int):
        get_object_or_404(ProductReview, pk=pk, customer=self.customer).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------- #
# Wishlist
# --------------------------------------------------------------------------- #
class WishlistInput(serializers.Serializer):
    product = serializers.IntegerField(min_value=1)


class WishlistMergeInput(serializers.Serializer):
    products = serializers.ListField(child=serializers.IntegerField(min_value=1), max_length=200)


def _wishlist_body(request, customer) -> dict:
    ids = list(wishlist.items(customer).values_list("product_id", flat=True))
    products = list(visible_products().filter(pk__in=ids))
    order = {pid: i for i, pid in enumerate(ids)}
    products.sort(key=lambda p: order[p.pk])
    return {"product_ids": ids,
            "products": ProductCardSerializer(products, many=True, context=_card_context(request, products)).data}


@extend_schema(tags=["app: wishlist"], request=WishlistInput, responses=OpenApiTypes.OBJECT)
class WishlistView(CustomerAPIView):
    def get(self, request):
        return Response(_wishlist_body(request, self.customer))

    def post(self, request):
        s = WishlistInput(data=request.data)
        s.is_valid(raise_exception=True)
        created = run(wishlist.add, self.customer, s.validated_data["product"])
        return Response(_wishlist_body(request, self.customer), status=201 if created else 200)


@extend_schema(tags=["app: wishlist"], responses=OpenApiTypes.OBJECT)
class WishlistItemView(CustomerAPIView):
    def delete(self, request, product_id: int):
        wishlist.remove(self.customer, product_id)
        return Response(_wishlist_body(request, self.customer))


@extend_schema(tags=["app: wishlist"], request=WishlistMergeInput, responses=OpenApiTypes.OBJECT)
class WishlistMergeView(CustomerAPIView):
    """Products a visitor saved in the browser join the account's list at sign-in."""

    def post(self, request):
        s = WishlistMergeInput(data=request.data)
        s.is_valid(raise_exception=True)
        wishlist.merge(self.customer, s.validated_data["products"])
        return Response(_wishlist_body(request, self.customer))


# --------------------------------------------------------------------------- #
# Notification inbox
# --------------------------------------------------------------------------- #
@extend_schema(tags=["app: notifications"], responses=OpenApiTypes.OBJECT)
class NotificationListView(CustomerAPIView):
    def get(self, request):
        qs = CustomerNotification.objects.filter(customer=self.customer)
        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        body = paginator.get_paginated_response([
            {"id": n.pk, "title": n.title, "body": n.body, "data": n.data, "read": n.read_at is not None,
             "created_at": n.created_at} for n in page]).data
        body["unread"] = qs.filter(read_at__isnull=True).count()
        return Response(body)


@extend_schema(tags=["app: notifications"], request=OpenApiTypes.OBJECT, responses=OpenApiTypes.OBJECT)
class NotificationReadView(CustomerAPIView):
    """Mark notifications read: {"ids": [..]} or {} for all."""

    def post(self, request):
        qs = CustomerNotification.objects.filter(customer=self.customer, read_at__isnull=True)
        ids = request.data.get("ids") if isinstance(request.data, dict) else None
        if isinstance(ids, list):
            qs = qs.filter(pk__in=[i for i in ids if isinstance(i, int)])
        qs.update(read_at=timezone.now())
        return Response({"unread": CustomerNotification.objects.filter(customer=self.customer,
                                                                       read_at__isnull=True).count()})


# --------------------------------------------------------------------------- #
# Returns
# --------------------------------------------------------------------------- #
REASONS = [{"code": c, "label": ReasonCode(c).label} for c in
           (ReasonCode.DAMAGED_IN_TRANSIT, ReasonCode.DEFECTIVE, ReasonCode.NOT_AS_DESCRIBED, ReasonCode.ITEM_MISMATCH,
            ReasonCode.CUSTOMER_CHANGED_MIND)]


def _order(customer, reference) -> Order:
    return get_object_or_404(Order.objects.filter(customer=customer), reference=reference)


def return_payload(ret: ReturnRequest, request, *, detail: bool = False) -> dict:
    label, refund = returns.customer_status(ret)
    body = {"reference": ret.reference, "order": ret.order.reference, "status": ret.status, "status_display": label,
            "refund_status": refund, "reason": ret.get_reason_code_display(), "items": ret.item_details,
            "value": money(ret.return_value), "refund_amount": money(ret.refund_amount) if ret.refund_amount else None,
            "created_at": ret.created_at, "message": ret.customer_message or None}
    if detail:
        body["explanation"] = ret.customer_note
        body["lines"] = [{"name": line.order_item.product_name, "variant_name": line.order_item.variant_name,
                          "quantity": line.quantity, "amount": money(line.amount),
                          "image": image_url(request, primary_image(line.order_item.variant.product))}
                         for line in ret.lines.all()]
        body["evidence"] = [request.build_absolute_uri(f"/api/app/returns/{ret.reference}/evidence/{a.pk}/")
                            for a in ret.attachments.all()]
        body["history"] = [{"status": returns.customer_status(_Shadow(ret, h.to_status))[0], "at": h.created_at}
                           for h in ret.history.all()]
        body["can_add_evidence"] = ret.status in ("initiated", "in_transit") and ret.attachments.count() < MAX_EVIDENCE
    return body


class _Shadow:
    """A return seen at an earlier status (for the customer-facing history labels)."""

    def __init__(self, ret, status_):
        self.status, self.financial_impact = status_, ret.financial_impact
        self.refund_payment_id = ret.refund_payment_id if status_ == "closed" else None

    def get_status_display(self):
        return self.status


def _returns(customer):
    return (ReturnRequest.objects.filter(order__customer=customer).select_related("order")
            .prefetch_related(Prefetch("lines__order_item__variant__product__images",
                                       queryset=ProductImage.objects.filter(variant__isnull=True),
                                       to_attr="shop_images"), "attachments", "history"))


class ReturnInput(serializers.Serializer):
    class Line(serializers.Serializer):
        item = serializers.IntegerField(min_value=1)
        quantity = serializers.IntegerField(min_value=1, max_value=1000)

    lines = Line(many=True, allow_empty=False, max_length=50)
    reason_code = serializers.CharField(max_length=24)
    explanation = serializers.CharField(max_length=2000)


@extend_schema(tags=["app: returns"], request=ReturnInput, responses=OpenApiTypes.OBJECT)
class OrderReturnsView(WriteThrottleMixin, CustomerAPIView):
    """GET: what can be returned from this order (and why not). POST: ask to return items."""

    throttle_scope = "returns"

    def get(self, request, reference: str):
        order = _order(self.customer, reference)
        open_ = order.order_type == "shop" and returns.return_window_open(order)
        items = [{"item": i.pk, "name": i.product_name, "variant_name": i.variant_name, "quantity": i.quantity,
                  "returnable": returns.returnable(i), "unit_price": money(i.unit_price)}
                 for i in order.items.exclude(fulfillment__status="cancelled")] if order.order_type == "shop" else []
        from apps.marketplace.models import MarketplaceSettings

        return Response({"can_return": open_ and any(i["returnable"] for i in items), "window_open": open_,
                         "window_days": MarketplaceSettings.load().return_window_days, "items": items,
                         "reasons": REASONS,
                         "returns": [return_payload(r, request) for r in _returns(self.customer).filter(order=order)]})

    def post(self, request, reference: str):
        order = _order(self.customer, reference)
        s = ReturnInput(data=request.data)
        s.is_valid(raise_exception=True)
        ret = run(returns.request_by_customer, order, lines=s.validated_data["lines"],
                  reason_code=s.validated_data["reason_code"], explanation=s.validated_data["explanation"],
                  request=request)
        return Response(return_payload(_returns(self.customer).get(pk=ret.pk), request, detail=True), status=201)


@extend_schema(tags=["app: returns"], responses=OpenApiTypes.OBJECT)
class ReturnListView(CustomerAPIView):
    def get(self, request):
        paginator = StandardPagination()
        page = paginator.paginate_queryset(_returns(self.customer), request, view=self)
        return paginator.get_paginated_response([return_payload(r, request) for r in page])


@extend_schema(tags=["app: returns"], responses=OpenApiTypes.OBJECT)
class ReturnDetailView(CustomerAPIView):
    def get(self, request, reference: str):
        ret = get_object_or_404(_returns(self.customer), reference=reference)
        return Response(return_payload(ret, request, detail=True))


@extend_schema(tags=["app: returns"], responses=OpenApiTypes.OBJECT)
class ReturnEvidenceView(WriteThrottleMixin, CustomerAPIView):
    """POST a photo (multipart `file`) while the return is open; GET one of my photos."""

    parser_classes = [MultiPartParser, FormParser]
    throttle_scope = "uploads"

    def post(self, request, reference: str):
        ret = get_object_or_404(_returns(self.customer), reference=reference)
        if ret.status not in ("initiated", "in_transit") or ret.attachments.count() >= MAX_EVIDENCE:
            return Response({"error": {"code": "conflict", "message": "You can't add photos to this return now.",
                                       "details": None}}, status=409)
        upload = request.FILES.get("file")
        content_type = validate_upload(upload, allowed=IMAGE_TYPES)
        ReturnAttachment.objects.create(return_request=ret, file=upload, content_type=content_type)
        return Response(return_payload(_returns(self.customer).get(pk=ret.pk), request, detail=True), status=201)


@extend_schema(tags=["app: returns"], responses={(200, "image/*"): OpenApiTypes.BINARY})
class ReturnEvidenceFileView(CustomerAPIView):
    throttle_classes = []

    def get(self, request, reference: str, pk: int):
        attachment = get_object_or_404(ReturnAttachment, pk=pk, return_request__reference=reference,
                                       return_request__order__customer=self.customer)
        return file_response(attachment.file, attachment.content_type)

