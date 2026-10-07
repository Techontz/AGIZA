from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from django.urls import reverse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.response import Response

from apps.catalog.models import ProductImage
from apps.core.exceptions import ConflictError
from apps.core.pagination import StandardPagination
from apps.core.uploads import file_response
from apps.core.workflow import run
from apps.deliveries.models import Delivery, DeliveryPhoto
from apps.marketplace.models import VendorFulfillment
from apps.orders import shop
from apps.orders.models import Order, OrderItem
from apps.orders.services import payment_summary
from apps.orders.workflows import OrderType, ShopStatus, status_label
from apps.payments import services as payments
from apps.payments.models import GatewayPayment

from ..catalog import image_url, primary_image, seller_payload
from ..serializers import CancelSerializer, OrderCardSerializer, order_group
from ..tracking import cargo_milestones, timeline
from .base import CustomerAPIView

GROUPS = {"active", "completed", "cancelled"}


def customer_orders(customer):
    """The customer's orders, and only theirs (other ids simply don't exist here: 404)."""
    return (
        Order.objects.filter(customer=customer)
        .select_related("shop__city", "shop__shipping_method", "shop__import_shipping_method", "international__source_country")
        .prefetch_related(
            "adjustments", "returns__history",
            Prefetch("items", queryset=OrderItem.objects.select_related("variant__product", "vendor__city", "fulfillment")
                     .prefetch_related("return_lines__return_request")
                     .prefetch_related(
                Prefetch("variant__product__images", queryset=ProductImage.objects.filter(variant__isnull=True),
                         to_attr="shop_images"))),
            "payments", "status_history",
            Prefetch("fulfillments", queryset=VendorFulfillment.objects.select_related("vendor__city")
                     .order_by("vendor_id", "id")),
            Prefetch("deliveries", queryset=Delivery.objects.select_related("driver", "proof")
                     .prefetch_related("events", "photos")),
        )
    )


def _items(order, request) -> list[dict]:
    return [{"name": i.product_name, "variant_name": i.variant_name, "sku": i.sku, "quantity": i.quantity,
             "unit_price": str(i.unit_price), "line_total": str(i.line_total),
             "product_id": i.variant.product_id, "vendor": seller_payload(request, i.vendor), "item": i.pk,
             "sourced_abroad": i.sourced_abroad,
             "cancelled": bool(i.fulfillment_id and i.fulfillment.status == "cancelled"),
             "image": image_url(request, primary_image(i.variant.product))} for i in order.items.all()]


def _sellers(order, request) -> list[dict]:
    """Each seller's part of the order (one order and one payment for the customer). No commission here."""
    return [{"vendor": seller_payload(request, f.vendor), "status": f.status, "status_display": f.get_status_display(),
             "item_count": f.item_count, "subtotal": str(f.subtotal), "shipping_fee": str(f.shipping_fee)}
            for f in order.fulfillments.all()]


DRIVER_VISIBLE = {"assigned_driver", "out_for_delivery", "delivered"}


def _delivery(order, request=None) -> dict | None:
    """The order's latest delivery: status, the driver bringing it, and proof once delivered.
    Proof photos are listed only for the signed-in owner (guests can't open the customer photo route)."""
    deliveries = list(order.deliveries.all())
    if not deliveries:
        return None
    d = max(deliveries, key=lambda x: (x.created_at, x.id))
    driver = None
    if d.driver_id and d.status in DRIVER_VISIBLE:
        driver = {"name": d.driver.full_name, "phone": d.driver.phone}
    proof = getattr(d, "proof", None) if d.status == "delivered" else None
    viewer = getattr(getattr(request, "user", None), "customer", None) if request else None
    photos = []
    if d.status == "delivered" and viewer is not None and viewer.pk == order.customer_id:
        for p in d.photos.all():
            path = reverse("storefront:order-delivery-photo", args=[order.reference, p.pk])
            photos.append({"id": p.pk, "url": request.build_absolute_uri(path)})
    return {"reference": d.reference, "status": d.status, "status_display": d.get_status_display(),
            "scheduled_at": d.scheduled_at, "delivered_at": d.delivered_at, "driver": driver,
            "received_by": proof.signature_name if proof else None, "photos": photos}


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
        "delivery": _delivery(order, request),
        "can_cancel": customer_can_cancel(order, summary),
        "can_pay": (payments.available() and order.status != "cancelled" and bool(summary.due)
                    and summary.due > 0 and not payments.payment_deadline_passed(order)
                    and not card["delivery_fee_pending"]),  # card: waiting for AGIZA to set the delivery cost
    }
    if order.order_type == OrderType.SHOP:
        details = order.shop
        # As ordered: a seller's cancelled part is taken off by its adjustment line, so
        # subtotal + delivery + adjustments always adds up to the total.
        subtotal = sum((i.line_total for i in order.items.all()), 0)
        city = details.city.name if details.city_id else ""
        body["shipping"] = {
            "address": ", ".join(p for p in (details.shipping_address, details.area, city) if p), "city": city,
            "area": details.area, "method": details.shipping_method.name if details.shipping_method_id else None,
            "estimated_delivery": details.estimated_delivery or None,
            "import_method": details.import_shipping_method.name if details.import_shipping_method_id else None,
            "import_fee": str(details.import_fee),
        }
        body["prepayment_required"] = details.prepayment_required
        body["payment_due_at"] = details.payment_due_at if details.prepayment_required else None
        body["customs"] = details.customs_charges or None
        adjustments = [{"amount": str(a.amount), "reason": a.reason, "at": a.created_at,
                        "kind": "return_refund" if a.return_request_id else "seller_part"}
                       for a in order.adjustments.all()]
        body["amounts"] = {"subtotal": str(subtotal), "shipping_fee": str(details.delivery_fee),
                           "import_fee": str(details.import_fee), "customs_fee": str(details.customs_fee),
                           "total": str(order.total_amount)}
        body["adjustments"] = adjustments
        body["payment_preference"] = details.payment_preference or None
        body["sellers"] = _sellers(order, request)
        from apps.returns import services as returns

        body["can_return"] = returns.return_window_open(order) and any(
            returns.returnable(i) for i in order.items.all() if not (i.fulfillment and i.fulfillment.status == "cancelled"))
        body["returns"] = [{"reference": r.reference, "status_display": returns.customer_status(r)[0],
                            "refund_status": returns.customer_status(r)[1]} for r in order.returns.all()]
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


@extend_schema(tags=["app: orders"], responses={(200, "image/*"): OpenApiTypes.BINARY})
class OrderDeliveryPhotoView(CustomerAPIView):
    """A proof-of-delivery photo of the customer's own order."""

    throttle_classes = []

    def get(self, request, reference: str, photo_id: int):
        photo = get_object_or_404(DeliveryPhoto, pk=photo_id, delivery__order__reference=reference,
                                  delivery__order__customer=self.customer, delivery__status="delivered")
        response = file_response(photo.file, photo.content_type)
        response["Cache-Control"] = "private, max-age=604800, immutable"  # a photo's file never changes
        return response


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
        result = start_payment(order, request.user.phone)
        if result["status"] == "failed":
            raise ConflictError(result["message"])
        return Response(result)


@extend_schema(tags=["app: orders"], request=None, responses=OpenApiTypes.OBJECT)
class OrderPaymentCheckView(_OrderView):
    """Ask the gateway about pending payments (after the customer returns from the checkout page)."""

    throttle_scope = "checkout"

    def post(self, request, reference: str):
        return Response(check_payments(lambda: self.get_order(reference)))


def check_payments(get_order) -> dict:
    """Confirm the order's pending gateway payments with the provider; the order is read again afterwards."""
    pending = GatewayPayment.objects.filter(order=get_order(), status=GatewayPayment.Status.PENDING)
    results = [payments.confirm(g) for g in pending]
    order = get_order()
    return {
        "payment": {k: (str(v) if v is not None and k != "status" else v)
                    for k, v in payment_summary(order).as_dict.items()},
        "gateway": [{"reference": g.provider_order_id, "status": g.status, "amount": str(g.amount)} for g in results],
        "status_display": status_label(order.order_type, order.status),
    }
