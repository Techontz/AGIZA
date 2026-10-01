"""
Website checkout without an account (the app always signs in).

A guest's order is opened with a signed link (`token`) returned when the order is placed:
it shows that one order, starts or checks its mobile-money payment, and nothing else.
Cancelling and returns need an account; signing up with the same phone number brings
the order into it.
"""
import logging

from django.core import signing
from django.http import Http404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.core.exceptions import ConflictError
from apps.core.workflow import WorkflowError
from apps.orders.models import Order, PaymentPreference, ShopDetails

from .. import checkout
from ..phone import normalize_phone
from ..serializers import GuestCheckoutPreviewSerializer, GuestPlaceOrderSerializer, quote_payload
from .base import PublicAPIView
from .orders import check_payments, customer_orders, order_detail_payload
from .shopping import _channel, start_payment

logger = logging.getLogger("apps.storefront")

TOKEN_SALT = "storefront.guest-order"
TOKEN_MAX_AGE = 60 * 60 * 24 * 180  # the order link works for six months


def guest_order_token(order: Order) -> str:
    return signing.dumps(order.reference, salt=TOKEN_SALT)


def _guest_order(reference: str, token: str) -> Order:
    try:
        signed = signing.loads(token or "", salt=TOKEN_SALT, max_age=TOKEN_MAX_AGE)
    except signing.BadSignature:
        raise Http404
    if signed != reference:
        raise Http404
    order = Order.objects.filter(reference=reference).only("customer_id").first()
    if order is None:
        raise Http404
    return customer_orders(order.customer_id).get(reference=reference)


def guest_order_payload(order: Order, request) -> dict:
    # Cancelling and returns are for signed-in customers (the guest's phone number isn't verified).
    return {**order_detail_payload(order, request), "can_cancel": False, "can_return": False, "returns": []}


class _GuestCheckoutView(PublicAPIView):
    def check_permissions(self, request):
        super().check_permissions(request)
        if _channel(request) != ShopDetails.Channel.WEB:
            raise Http404  # guest checkout is a website feature


@extend_schema(tags=["app: checkout"], request=GuestCheckoutPreviewSerializer, responses=OpenApiTypes.OBJECT)
class GuestCheckoutPreviewView(_GuestCheckoutView):
    """The review screen for a visitor: their browser cart priced for the delivery city."""

    def post(self, request):
        s = GuestCheckoutPreviewSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        quote = checkout.guest_preview(s.validated_data["items"], city=s.validated_data["city"],
                                       shipping_method_id=s.validated_data.get("shipping_method"),
                                       import_method_id=s.validated_data.get("import_method"))
        return Response(quote_payload(quote, request))


@extend_schema(tags=["app: checkout"], request=GuestPlaceOrderSerializer, responses=OpenApiTypes.OBJECT)
class GuestPlaceOrderView(_GuestCheckoutView):
    throttle_scope = "guest_checkout"

    def post(self, request):
        s = GuestPlaceOrderSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        data = s.validated_data
        try:
            order, created = checkout.place_guest_order(
                items=data["items"], full_name=data["full_name"], phone=data["phone"], email=data["email"],
                city=data["city"], line1=data["line1"], area=data["area"], shipping_method_id=data["shipping_method"],
                import_method_id=data.get("import_method"),
                payment_method=data["payment_method"], notes=data["notes"], idempotency_key=data["idempotency_key"],
                expected_total=data.get("expected_total"), request=request,
            )
        except checkout.PriceChanged as exc:
            return Response({"error": {"code": "price_changed", "message": exc.message, "details": quote_payload(
                exc.preview, request)}}, status=status.HTTP_409_CONFLICT)
        except WorkflowError as exc:
            logger.info("Guest checkout refused: %s", exc.message)
            if exc.conflict:
                raise ConflictError(exc.message)
            raise ValidationError({exc.field or "non_field_errors": [exc.message]})
        payment = None
        if created and order.shop.payment_preference == PaymentPreference.MOBILE_MONEY:
            payment = start_payment(order, data["phone"])
        order = customer_orders(order.customer_id).get(pk=order.pk)
        body = {"order": guest_order_payload(order, request), "created": created, "payment": payment,
                "token": guest_order_token(order)}
        return Response(body, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


TOKEN_PARAM = OpenApiParameter("token", str, required=True, description="The link returned when the order was placed")


@extend_schema(tags=["app: orders"], parameters=[TOKEN_PARAM], responses=OpenApiTypes.OBJECT)
class GuestOrderDetailView(PublicAPIView):
    def get(self, request, reference: str):
        order = _guest_order(reference, request.query_params.get("token", ""))
        return Response(guest_order_payload(order, request))


@extend_schema(tags=["app: orders"], parameters=[TOKEN_PARAM], request=None, responses=OpenApiTypes.OBJECT)
class GuestOrderPayView(PublicAPIView):
    throttle_scope = "checkout"

    def post(self, request, reference: str):
        order = _guest_order(reference, request.query_params.get("token", ""))
        result = start_payment(order, normalize_phone(order.customer.phone))
        if result["status"] == "failed":
            raise ConflictError(result["message"])
        return Response(result)


@extend_schema(tags=["app: orders"], parameters=[TOKEN_PARAM], request=None, responses=OpenApiTypes.OBJECT)
class GuestOrderPaymentCheckView(PublicAPIView):
    throttle_scope = "checkout"

    def post(self, request, reference: str):
        token = request.query_params.get("token", "")
        return Response(check_payments(lambda: _guest_order(reference, token)))
