from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.response import Response

from apps.catalog.models import ProductImage
from apps.core.exceptions import ConflictError
from apps.core.pagination import StandardPagination
from apps.core.workflow import run
from apps.deliveries.models import Delivery
from apps.orders import shop
from apps.orders.models import Order, OrderItem
from apps.orders.services import payment_summary
from apps.orders.workflows import OrderType, ShopStatus, status_label
from apps.payments import services as payments
from apps.payments.models import GatewayPayment

from ..catalog import image_url, primary_image
from ..serializers import CancelSerializer, OrderCardSerializer, order_group
from ..tracking import cargo_milestones, timeline
from .base import CustomerAPIView

GROUPS = {"active", "completed", "cancelled"}


def customer_orders(customer):
    """The customer's orders, and only theirs (other ids simply don't exist here: 404)."""
    return (
        Order.objects.filter(customer=customer)
        .select_related("shop__city", "shop__shipping_method", "international__source_country")
        .prefetch_related(
            Prefetch("items", queryset=OrderItem.objects.select_related("variant__product").prefetch_related(
                Prefetch("variant__product__images", queryset=ProductImage.objects.filter(variant__isnull=True),
                         to_attr="shop_images"))),
            "payments", "status_history",
            Prefetch("deliveries", queryset=Delivery.objects.prefetch_related("events")),
        )
    )


def _items(order, request) -> list[dict]:
    return [{"name": i.product_name, "variant_name": i.variant_name, "sku": i.sku, "quantity": i.quantity,
             "unit_price": str(i.unit_price), "line_total": str(i.line_total),
             "product_id": i.variant.product_id,
             "image": image_url(request, primary_image(i.variant.product))} for i in order.items.all()]


def _delivery(order) -> dict | None:
    deliveries = list(order.deliveries.all())
    if not deliveries:
        return None
    d = deliveries[-1]
    return {"reference": d.reference, "status": d.status, "status_display": d.get_status_display(),
            "scheduled_at": d.scheduled_at, "delivered_at": d.delivered_at}


def customer_can_cancel(order: Order, summary=None) -> bool:
    """Only unpaid shop orders AGIZA hasn't started preparing; anything paid needs a refund through staff."""
    summary = summary or payment_summary(order)
    return order.order_type == OrderType.SHOP and order.status == ShopStatus.PENDING and summary.paid <= 0


def order_detail_payload(order: Order, request) -> dict:
    card = OrderCardSerializer(order, context={"request": request}).data
    summary = payment_summary(order)
    body = {
        **card,
        "notes": order.notes,
        "items": _items(order, request) if order.order_type == OrderType.SHOP else [],
        "payment": {k: (str(v) if v is not None and k != "status" else v) for k, v in summary.as_dict.items()},
        "payments": [{"amount": str(p.amount), "method": p.get_method_display(), "paid_at": p.paid_at,
                      "kind": p.kind} for p in order.payments.all()],
        "timeline": timeline(order),
        "delivery": _delivery(order),
        "can_cancel": customer_can_cancel(order, summary),
        "can_pay": (payments.available() and order.status != "cancelled" and bool(summary.due)
                    and summary.due > 0),
    }
    if order.order_type == OrderType.SHOP:
        details = order.shop
        subtotal = sum((i.line_total for i in order.items.all()), 0)
        city = details.city.name if details.city_id else ""
        body["shipping"] = {
            "address": ", ".join(p for p in (details.shipping_address, details.area, city) if p), "city": city,
            "area": details.area, "method": details.shipping_method.name if details.shipping_method_id else None,
            "estimated_delivery": details.estimated_delivery or None,
        }
        body["amounts"] = {"subtotal": str(subtotal), "shipping_fee": str(details.delivery_fee),
                           "total": str(order.total_amount)}
        body["payment_preference"] = details.payment_preference or None
    elif order.order_type == OrderType.INTERNATIONAL:
        details = order.international
        body["international"] = {"service": details.get_service_type_display(),
                                 "source_country": details.source_country.name,
                                 "tracking_number": details.tracking_number,
                                 "estimated_delivery": details.estimated_delivery}
        body["cargo"] = cargo_milestones(order)
    return body


@extend_schema(tags=["app: orders"], responses=OrderCardSerializer(many=True),
               parameters=[OpenApiParameter("group", str, enum=sorted(GROUPS))])
class OrderListView(CustomerAPIView):
    def get(self, request):
        orders = list(customer_orders(self.customer).order_by("-created_at", "-id"))
        group = request.query_params.get("group")
        if group in GROUPS:
            orders = [o for o in orders if order_group(o) == group]
        paginator = StandardPagination()
        page = paginator.paginate_queryset(orders, request, view=self)
        return paginator.get_paginated_response(OrderCardSerializer(page, many=True, context={"request": request}).data)


class _OrderView(CustomerAPIView):
    def get_order(self, reference: str) -> Order:
        return get_object_or_404(customer_orders(self.customer), reference=reference)


@extend_schema(tags=["app: orders"], responses=OpenApiTypes.OBJECT)
class OrderDetailView(_OrderView):
    def get(self, request, reference: str):
        return Response(order_detail_payload(self.get_order(reference), request))


@extend_schema(tags=["app: orders"], request=CancelSerializer, responses=OpenApiTypes.OBJECT)
class OrderCancelView(_OrderView):
    """Customers may cancel a shop order until AGIZA starts preparing it."""

    def post(self, request, reference: str):
        order = self.get_order(reference)
        s = CancelSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        if order.order_type != OrderType.SHOP or order.status != ShopStatus.PENDING:
            raise ConflictError("This order can no longer be cancelled in the app. Contact AGIZA support.")
        if not customer_can_cancel(order):
            raise ConflictError("This order is paid. Contact AGIZA support to cancel it and arrange a refund.")
        run(shop.cancel, order, user=None, reason=f"Cancelled by the customer in the app: {s.validated_data['reason']}",
            request=request)
        return Response(order_detail_payload(self.get_order(reference), request))


@extend_schema(tags=["app: orders"], request=None, responses=OpenApiTypes.OBJECT)
class OrderPayView(_OrderView):
    """Start (or resume) a mobile-money payment for what's due on the order."""

    throttle_scope = "checkout"

    def post(self, request, reference: str):
        from .shopping import start_payment

        order = self.get_order(reference)
        result = start_payment(order, request.user)
        if result["status"] == "failed":
            raise ConflictError(result["message"])
        return Response(result)


@extend_schema(tags=["app: orders"], request=None, responses=OpenApiTypes.OBJECT)
class OrderPaymentCheckView(_OrderView):
    """Ask the gateway about pending payments (after the customer returns from the checkout page)."""

    throttle_scope = "checkout"

    def post(self, request, reference: str):
        order = self.get_order(reference)
        pending = GatewayPayment.objects.filter(order=order, status=GatewayPayment.Status.PENDING)
        results = [payments.confirm(g) for g in pending]
        order = self.get_order(reference)
        return Response({
            "payment": {k: (str(v) if v is not None and k != "status" else v)
                        for k, v in payment_summary(order).as_dict.items()},
            "gateway": [{"reference": g.provider_order_id, "status": g.status, "amount": str(g.amount)}
                        for g in results],
            "status_display": status_label(order.order_type, order.status),
        })
