"""
Checkout for the customer app. The server prices everything:

    cart lines (live catalogue prices) + delivery fee (Shipping Engine) = total

A cart may hold products from several sellers: the customer still places one order and
pays once; the order service splits it into one part per seller (see apps.marketplace).

`preview` shows exactly what `place_order` will charge. `place_order` recomputes it
all under a lock on the cart, refuses if the total the customer saw has changed,
creates the shop order through `orders.shop.create_shop_order` (stock reserved),
and empties the cart only once the order exists. Repeating a request with the same
idempotency key returns the order already created.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from django.db import IntegrityError, transaction

from apps.core.workflow import WorkflowError
from apps.orders import shop
from apps.orders.models import Order, PaymentPreference, ShopDetails
from apps.parties.models import Address
from apps.payments import services as payments
from apps.shipping_engine.models import ShippingMethod

from . import cart as carts
from .models import CheckoutRequest
from .shipping import Line, allocation, delivery_options


class PriceChanged(WorkflowError):
    """The total changed since the customer reviewed it (price, stock or delivery fee update)."""

    def __init__(self, preview: dict):
        super().__init__("Your order total changed. Please review it again before placing the order.", conflict=True)
        self.preview = preview


def payment_methods() -> list[dict]:
    methods = []
    if payments.available():
        methods.append({"code": PaymentPreference.MOBILE_MONEY, "label": "Mobile money",
                        "description": "Pay now with mobile money or card on Selcom's secure checkout page."})
    methods.append({"code": PaymentPreference.PAY_LATER, "label": "Pay later",
                    "description": "Pay AGIZA by cash on delivery, bank transfer or Lipa number. We confirm your payment."})
    return methods


@dataclass
class Quote:
    summary: dict
    options: list[dict]
    selected: dict | None
    shipping_fee: Decimal | None
    total: Decimal | None
    issues: list[str]

    @property
    def can_place_order(self) -> bool:
        return not self.issues and self.selected is not None


def _quote(cart, address: Address, method_id: int | None) -> Quote:
    summary = carts.summarize(cart)
    issues = []
    if not summary["lines"]:
        issues.append("Your cart is empty.")
    if summary["has_issues"]:
        issues.append("Some items in your cart are unavailable or low on stock. Update your cart to continue.")
    lines = [Line(line["item"].variant, line["item"].quantity) for line in summary["lines"] if not line["issue"]]
    options = delivery_options(lines, address.city, currency=summary["currency"]) if lines else []
    available = [o for o in options if o["available"]]
    selected = None
    if method_id is not None:
        selected = next((o for o in available if o["method_id"] == method_id), None)
        if selected is None and lines:
            issues.append("The delivery option you chose isn't available for this address. Choose another.")
    elif available:
        selected = available[0]
    if lines and not available:
        issues.append("We can't deliver these items to this address yet. Try another address or contact AGIZA.")
    fee = selected["cost"] if selected else None
    total = summary["subtotal"] + fee if fee is not None else None
    return Quote(summary, options, selected, fee, total, issues)


def preview(customer, *, address: Address, shipping_method_id: int | None = None) -> Quote:
    return _quote(carts.cart_for(customer), address, shipping_method_id)


def place_order(customer, *, address: Address, shipping_method_id: int, payment_method: str, notes: str,
                idempotency_key: str, expected_total: Decimal | None, request=None) -> tuple[Order, bool]:
    """Returns (order, created). created=False when the idempotency key was already used."""
    if payment_method not in {m["code"] for m in payment_methods()}:
        raise WorkflowError("Choose a payment method.", field="payment_method")
    try:
        with transaction.atomic():
            cart = carts.cart_for(customer, lock=True)  # one checkout at a time per customer
            done = CheckoutRequest.objects.filter(customer=customer, key=idempotency_key).select_related("order").first()
            if done:
                return done.order, False
            quote = _quote(cart, address, shipping_method_id)
            if quote.issues:
                raise WorkflowError(quote.issues[0], conflict=True)
            if expected_total is not None and expected_total != quote.total:
                raise PriceChanged(quote)
            lines = quote.summary["lines"]
            order = shop.create_shop_order(
                customer=customer, user=None, request=request, channel=ShopDetails.Channel.APP,
                items=[{"variant": line["item"].variant, "quantity": line["item"].quantity} for line in lines],
                shipping_address=_address_text(address), city=address.city, area=address.area,
                customer_email=customer.email, delivery_fee=quote.shipping_fee, notes=notes.strip(),
                delivery_address=address, shipping_method=ShippingMethod.objects.get(pk=quote.selected["method_id"]),
                estimated_delivery=quote.selected["estimated_delivery"] or "", payment_preference=payment_method,
                shipping_allocation=allocation(quote.selected),
            )
            if order.total_amount != quote.total:  # defensive: the order service must charge what was quoted
                raise WorkflowError("The order total couldn't be confirmed. Please try again.", conflict=True)
            CheckoutRequest.objects.create(customer=customer, key=idempotency_key, order=order)
            cart.items.filter(pk__in=[line["item"].pk for line in lines]).delete()
            return order, True
    except IntegrityError:
        done = CheckoutRequest.objects.filter(customer=customer, key=idempotency_key).select_related("order").first()
        if done:
            return done.order, False
        raise


def _address_text(address: Address) -> str:
    """Street part only: ShopDetails keeps the area and city in their own fields (as staff-entered orders do)."""
    label = f"{address.label}: " if address.label else ""
    return f"{label}{address.line1}"[:255]
