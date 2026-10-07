import logging

from django.db import transaction
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.core.exceptions import ConflictError
from apps.core.workflow import WorkflowError, run
from apps.orders.models import Order, PaymentPreference
from apps.parties.models import Address
from apps.payments import services as payments

from .. import cart as carts
from .. import checkout
from ..models import CartItem
from ..serializers import (
    AddressSerializer,
    CartAddSerializer,
    CartQuantitySerializer,
    CheckoutPreviewSerializer,
    GuestCartSerializer,
    PlaceOrderSerializer,
    cart_payload,
    quote_payload,
)
from .base import CustomerAPIView, PublicAPIView
from .orders import order_detail_payload

logger = logging.getLogger("apps.storefront")


# --------------------------------------------------------------------------- #
# Addresses
# --------------------------------------------------------------------------- #
def _addresses(customer):
    return Address.objects.filter(customer=customer).select_related("city", "region", "country")


@transaction.atomic
def _save_address(serializer, customer, instance=None):
    make_default = serializer.validated_data.get("is_default", False) or not _addresses(customer).exists()
    if make_default:  # one default per customer (enforced here: MySQL has no partial unique indexes)
        _addresses(customer).exclude(pk=getattr(instance, "pk", None)).filter(is_default=True).update(is_default=False)
    return serializer.save(customer=customer, **({"is_default": True} if make_default else {}))


@extend_schema(tags=["app: addresses"], request=AddressSerializer, responses=AddressSerializer(many=True))
class AddressListView(CustomerAPIView):
    def get(self, request):
        return Response(AddressSerializer(_addresses(self.customer), many=True).data)

    def post(self, request):
        s = AddressSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        return Response(AddressSerializer(_save_address(s, self.customer)).data, status=status.HTTP_201_CREATED)


@extend_schema(tags=["app: addresses"], request=AddressSerializer, responses=AddressSerializer)
class AddressDetailView(CustomerAPIView):
    def _get(self, pk):
        return get_object_or_404(_addresses(self.customer), pk=pk)

    def get(self, request, pk: int):
        return Response(AddressSerializer(self._get(pk)).data)

    def patch(self, request, pk: int):
        address = self._get(pk)
        s = AddressSerializer(address, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        return Response(AddressSerializer(_save_address(s, self.customer, address)).data)

    @transaction.atomic
    def delete(self, request, pk: int):
        address = self._get(pk)
        was_default = address.is_default
        address.delete()
        if was_default:
            nxt = _addresses(self.customer).first()
            if nxt:
                nxt.is_default = True
                nxt.save(update_fields=["is_default", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------- #
# Cart
# --------------------------------------------------------------------------- #
class _CartView(CustomerAPIView):
    def cart_response(self, code=status.HTTP_200_OK):
        return Response(cart_payload(carts.summarize(carts.cart_for(self.customer)), self.request), status=code)


@extend_schema(tags=["app: cart"], responses=OpenApiTypes.OBJECT)
class CartView(_CartView):
    def get(self, request):
        return self.cart_response()

    def delete(self, request):
        carts.cart_for(self.customer).items.all().delete()
        return self.cart_response()


@extend_schema(tags=["app: cart"], request=CartAddSerializer, responses=OpenApiTypes.OBJECT)
class CartItemListView(_CartView):
    def post(self, request):
        s = CartAddSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        run(carts.add_item, self.customer, s.validated_data["variant"], s.validated_data["quantity"])
        return self.cart_response(status.HTTP_201_CREATED)


@extend_schema(tags=["app: cart"], request=CartQuantitySerializer, responses=OpenApiTypes.OBJECT)
class CartItemDetailView(_CartView):
    def _get(self, pk):
        return get_object_or_404(CartItem.objects.select_related("variant__product"),
                                 pk=pk, cart__customer=self.customer)

    def patch(self, request, pk: int):
        s = CartQuantitySerializer(data=request.data)
        s.is_valid(raise_exception=True)
        run(carts.set_quantity, self._get(pk), s.validated_data["quantity"])
        return self.cart_response()

    def delete(self, request, pk: int):
        self._get(pk).delete()
        return self.cart_response()


@extend_schema(tags=["app: cart"], request=GuestCartSerializer, responses=OpenApiTypes.OBJECT)
class GuestCartView(PublicAPIView):
    """A visitor's cart (kept in their browser) priced by the server, grouped by store like a saved cart."""

    def post(self, request):
        s = GuestCartSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        return Response(cart_payload(carts.summarize_items(carts.guest_items(s.validated_data["items"])), request))


@extend_schema(tags=["app: cart"], request=GuestCartSerializer, responses=OpenApiTypes.OBJECT)
class CartMergeView(_CartView):
    """After signing in: add what the visitor put in their browser cart to their saved cart."""

    def post(self, request):
        s = GuestCartSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        notes = carts.merge(self.customer, s.validated_data["items"])
        body = cart_payload(carts.summarize(carts.cart_for(self.customer)), request)
        return Response({**body, "notes": notes})


# --------------------------------------------------------------------------- #
# Checkout
# --------------------------------------------------------------------------- #
@extend_schema(tags=["app: checkout"], request=CheckoutPreviewSerializer, responses=OpenApiTypes.OBJECT)
class CheckoutPreviewView(CustomerAPIView):
    """Everything the review screen shows, priced by the server: lines, delivery options, fee and total."""

    def post(self, request):
        s = CheckoutPreviewSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        address = get_object_or_404(_addresses(self.customer), pk=s.validated_data["address"])
        quote = checkout.preview(self.customer, address=address,
                                 shipping_method_id=s.validated_data.get("shipping_method"),
                                 import_method_id=s.validated_data.get("import_method"))
        return Response(quote_payload(quote, request))


@extend_schema(tags=["app: checkout"], request=PlaceOrderSerializer, responses=OpenApiTypes.OBJECT)
class PlaceOrderView(CustomerAPIView):
    throttle_scope = "checkout"

    def post(self, request):
        s = PlaceOrderSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        data = s.validated_data
        address = get_object_or_404(_addresses(self.customer), pk=data["address"])
        try:
            order, created = checkout.place_order(
                self.customer, address=address, shipping_method_id=data["shipping_method"],
                import_method_id=data.get("import_method"),
                payment_method=data["payment_method"], notes=data["notes"], idempotency_key=data["idempotency_key"],
                expected_total=data.get("expected_total"), request=request, channel=_channel(request),
            )
        except checkout.PriceChanged as exc:
            logger.info("Checkout refused for customer %s: total changed", self.customer.pk)
            return Response({"error": {"code": "price_changed", "message": exc.message, "details": quote_payload(
                exc.preview, request)}}, status=status.HTTP_409_CONFLICT)
        except WorkflowError as exc:
            logger.info("Checkout refused for customer %s: %s", self.customer.pk, exc.message)
            if exc.conflict:
                raise ConflictError(exc.message)
            raise ValidationError({exc.field or "non_field_errors": [exc.message]})
        payment = None
        if (created and order.shop.payment_preference == PaymentPreference.MOBILE_MONEY
                and not order.shop.delivery_fee_pending):  # pending delivery cost: paid once AGIZA sets it
            payment = start_payment(order, request.user.phone)
        body = {"order": order_detail_payload(_reload(order), request), "created": created, "payment": payment}
        return Response(body, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


def _channel(request) -> str:
    """Where the order was placed, for staff reports: the website says so; otherwise it's the app."""
    from apps.orders.models import ShopDetails

    web = request.headers.get("X-Agiza-Channel", "").lower() == "web"
    return ShopDetails.Channel.WEB if web else ShopDetails.Channel.APP


def _reload(order: Order) -> Order:
    from .orders import customer_orders

    return customer_orders(order.customer).get(pk=order.pk)


DELIVERY_FEE_PENDING_MESSAGE = ("AGIZA is confirming the delivery cost of this order. We'll notify you when "
                                "it's set, then you can pay.")


def start_payment(order: Order, phone: str) -> dict:
    """Open a mobile-money checkout. A failure never undoes the order: the customer can retry from it."""
    if order.order_type == "shop" and getattr(order, "shop", None) and order.shop.delivery_fee_pending:
        return {"status": "failed", "message": DELIVERY_FEE_PENDING_MESSAGE, "checkout_url": None}
    try:
        gateway = payments.start_checkout(order, phone=phone)
    except WorkflowError as exc:
        return {"status": "failed", "message": exc.message, "checkout_url": None}
    return {"status": gateway.status, "message": "", "checkout_url": gateway.gateway_url,
            "reference": gateway.provider_order_id}
