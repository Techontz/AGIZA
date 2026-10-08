"""
Checkout for the customer app. The server prices everything:

    cart lines (live catalogue prices) + delivery fee (Shipping Engine) = total

Visitors on the website can also check out without an account (`guest_preview`,
`place_guest_order`): their browser cart is priced the same way, the order goes to the
customer record with that phone number (created if there is none), and signing up later
with the same number brings those orders into the new account.

A cart may hold products from several sellers: the customer still places one order and
pays once; the order service splits it into one part per seller (see apps.marketplace).

`preview` shows exactly what `place_order` will charge. `place_order` recomputes it
all under a lock on the cart, refuses if the total the customer saw has changed,
creates the shop order through `orders.shop.create_shop_order` (stock reserved),
and empties the cart only once the order exists. Repeating a request with the same
idempotency key returns the order already created.

Manual delivery quotes: when the Shipping Engine can't price the delivery to the address and
asks for a manual quote (not when it blocks it), the option is offered as "Delivery cost to be
confirmed by AGIZA". The order is placed without the delivery cost (ShopDetails.delivery_fee_pending),
can't be paid, and has no payment deadline until staff set the cost (orders.shop.set_delivery_fee),
which tells the customer to pay.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import timedelta
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.chat.services import find_customer
from apps.core.workflow import WorkflowError
from apps.orders import shop
from apps.orders.models import Order, PaymentPreference, ShopDetails
from apps.parties.models import Address, Customer
from apps.payments import services as payments
from apps.shipping_engine import customs
from apps.shipping_engine.calculator import RateCalculationError
from apps.shipping_engine.customs import Charges
from apps.shipping_engine.models import EngineSettings, ShippingMethod

from . import cart as carts
from .models import CheckoutRequest
from .shipping import (
    Line,
    allocation,
    combined_eta,
    delivery_options,
    import_options,
    manual_quote_reasons,
    origin_country,
    store_hub,
)

logger = logging.getLogger("apps.storefront")


class PriceChanged(WorkflowError):
    """The total changed since the customer reviewed it (price, stock or delivery fee update)."""

    def __init__(self, preview: dict):
        super().__init__("Your order total changed. Please review it again before placing the order.", conflict=True)
        self.preview = preview


MOBILE_MONEY = {"code": PaymentPreference.MOBILE_MONEY, "label": "Mobile money",
                "description": "Pay now with mobile money or card on Selcom's secure checkout page."}
PAY_LATER = {"code": PaymentPreference.PAY_LATER, "label": "Pay later",
             "description": "Pay AGIZA by cash on delivery, bank transfer or Lipa number. We confirm your payment."}


def payment_methods(*, prepayment: bool = False) -> list[dict]:
    """How the customer can pay. Orders with imported items are paid when ordering (AGIZA buys them abroad)."""
    methods = [MOBILE_MONEY] if payments.available() else []
    if not prepayment:
        methods.append(PAY_LATER)
    return methods


@dataclass
class Quote:
    summary: dict
    options: list[dict]
    selected: dict | None
    shipping_fee: Decimal | None
    total: Decimal | None
    issues: list[str]
    import_options: list[dict] = field(default_factory=list)
    import_selected: dict | None = None
    import_fee: Decimal = Decimal("0")
    delivery_fee: Decimal | None = None
    prepayment_required: bool = False
    payment_methods: list[dict] = field(default_factory=list)
    estimated_delivery: str = ""
    customs: Charges = field(default_factory=Charges)
    destination: object = None  # the delivery City (for the staff note when the cost must be set by hand)

    @property
    def delivery_fee_pending(self) -> bool:
        """The chosen delivery needs a manual quote: staff set its cost after the order is placed."""
        return bool(self.selected and self.selected.get("manual_quote"))

    @property
    def can_place_order(self) -> bool:
        return (not self.issues and self.selected is not None
                and (self.import_selected is not None or not self.prepayment_required))


def _choose(options: list[dict], method_id: int | None, *, manual: bool = False) -> tuple[dict | None, bool]:
    """
    (chosen option, whether the requested one was unavailable). No request: the cheapest available.
    manual: options needing a manual quote may be chosen too (offered only when nothing is priced).
    """
    priced = [o for o in options if o["available"]]
    available = priced + [o for o in options if manual and o.get("manual_quote")]
    if method_id is None:
        return (available[0] if available else None), False
    chosen = next((o for o in available if o["method_id"] == method_id), None)
    return chosen, chosen is None


def _quote(summary: dict, city, method_id: int | None, import_method_id: int | None = None) -> Quote:
    issues = []
    if not summary["lines"]:
        issues.append("Your cart is empty.")
    if summary["has_issues"]:
        issues.append("Some items in your cart are unavailable or low on stock. Update your cart to continue.")
    lines = [Line(line["item"].variant, line["item"].quantity) for line in summary["lines"] if not line["issue"]]
    currency = summary["currency"]
    imported = summary.get("has_imported", False)

    import_opts = import_options(lines, currency=currency) if imported else []
    import_selected, refused = _choose(import_opts, import_method_id)
    if refused:
        issues.append("The shipping option you chose for imported items isn't available. Choose another.")
    elif imported and import_selected is None:
        issues.append("We can't ship the imported items in your cart to Tanzania yet. Remove them or contact AGIZA.")

    options = delivery_options(lines, city, currency=currency) if lines else []
    selected, refused = _choose(options, method_id, manual=True)
    if refused and lines:
        issues.append("The delivery option you chose isn't available for this address. Choose another.")
    if lines and not any(o["available"] or o["manual_quote"] for o in options):
        issues.append("We can't deliver these items to this address yet. Try another address or contact AGIZA.")
    pending = bool(selected and selected["manual_quote"])  # delivery cost set by staff after ordering

    methods = payment_methods(prepayment=imported)
    if imported and not methods:
        issues.append("Orders with imported items are paid when you order, by mobile money or card, which isn't "
                      "available right now. Please try again later or contact AGIZA.")

    import_fee = import_selected["cost"] if import_selected else Decimal("0")
    delivery_fee = selected["cost"] if selected and not pending else None
    priced = (delivery_fee is not None or pending) and (import_selected is not None or not imported)
    fee = (delivery_fee or Decimal("0")) + import_fee if priced else None
    charges = _customs(summary, currency, import_fee, issues) if imported else Charges()
    # Pending delivery cost: the total so far (items, import shipping, customs); delivery is added by staff.
    total = summary["subtotal"] + fee + charges.included if fee is not None else None
    if pending:
        fee = None  # shown as "to be confirmed"; import_fee stays its own line
    eta = combined_eta(import_selected, selected) if selected else ""
    return Quote(summary, options, selected, fee, total, issues, import_options=import_opts,
                 import_selected=import_selected, import_fee=import_fee, delivery_fee=delivery_fee,
                 prepayment_required=imported, payment_methods=methods, estimated_delivery=eta, customs=charges,
                 destination=city)


def _customs(summary: dict, currency: str, import_fee: Decimal, issues: list[str]) -> Charges:
    """Import charges for the cart's imported items (Shipping Engine import-charge rules)."""
    hub = store_hub()
    items = [customs.Item(line["item"].variant.product, line["item"].quantity, line["line_total"],
                          getattr(origin_country(line["item"].variant.product, hub), "pk", None))
             for line in summary["lines"] if line["imported"] and not line["issue"]]
    try:
        return customs.calculate(items, currency=currency, import_shipping=import_fee)
    except RateCalculationError as exc:
        logger.error("Import charges unavailable: %s", exc.message)
        issues.append("Customs charges for the imported items are being updated. Please try again later.")
        return Charges()


def preview(customer, *, address: Address, shipping_method_id: int | None = None,
            import_method_id: int | None = None) -> Quote:
    return _quote(carts.summarize(carts.cart_for(customer)), address.city, shipping_method_id, import_method_id)


def _order_lines(quote: Quote) -> list[dict]:
    return [{"variant": line["item"].variant, "quantity": line["item"].quantity, "sourced_abroad": line["imported"]}
            for line in quote.summary["lines"]]


def _delivery_issue(quote: Quote) -> str:
    """Why staff must set the delivery cost by hand (what is missing in the Shipping Engine)."""
    lines = [Line(line["item"].variant, line["item"].quantity) for line in quote.summary["lines"] if not line["issue"]]
    if not lines or quote.destination is None:
        return ""
    try:
        return manual_quote_reasons(lines, quote.destination, currency=quote.summary["currency"])[:2000]
    except Exception:  # never let the staff note stop the customer's order
        logger.exception("Couldn't explain the manual delivery quote")
        return ""


def _shipping_fields(quote: Quote) -> dict:
    """What create_shop_order records about delivery: both legs, the fee split by seller, pay-first."""
    shares = allocation(quote.selected)
    if quote.import_selected:
        for vendor, part in allocation(quote.import_selected).items():
            shares[vendor] = shares.get(vendor, Decimal("0")) + part
    return {
        # Pending delivery cost: only the import shipping is charged for now (set_delivery_fee adds the rest).
        "delivery_fee": quote.import_fee if quote.delivery_fee_pending else quote.shipping_fee,
        "shipping_method": ShippingMethod.objects.get(pk=quote.selected["method_id"]),
        "estimated_delivery": quote.estimated_delivery or "",
        "shipping_allocation": shares,
        "import_shipping_method": (ShippingMethod.objects.get(pk=quote.import_selected["method_id"])
                                   if quote.import_selected else None),
        "import_fee": quote.import_fee,
        "prepayment_required": quote.prepayment_required,
        # No deadline while the delivery cost is pending: it starts when staff set the cost.
        "payment_due_at": payment_deadline() if quote.prepayment_required and not quote.delivery_fee_pending else None,
        "delivery_fee_pending": quote.delivery_fee_pending,
        "delivery_issue": _delivery_issue(quote) if quote.delivery_fee_pending else "",
        "customs_fee": quote.customs.included,
        "customs_status": quote.customs.status or "",
        "customs_charges": quote.customs.as_dict() if quote.customs.status else {},
    }


def payment_deadline():
    """When an order with imported items must be fully paid (Shipping Engine settings)."""
    hours = EngineSettings.load().import_payment_window_hours
    return timezone.now() + timedelta(hours=hours)


def _check_quote(quote: Quote, payment_method: str, expected_total: Decimal | None):
    if quote.issues:
        raise WorkflowError(quote.issues[0], conflict=True)
    if payment_method not in {m["code"] for m in quote.payment_methods}:
        if quote.prepayment_required:
            raise WorkflowError("Orders with imported items are paid when you order. Choose mobile money.",
                                field="payment_method")
        raise WorkflowError("Choose a payment method.", field="payment_method")
    if expected_total is not None and expected_total != quote.total:
        raise PriceChanged(quote)


def place_order(customer, *, address: Address, shipping_method_id: int, payment_method: str, notes: str,
                idempotency_key: str, expected_total: Decimal | None, request=None,
                channel: str = ShopDetails.Channel.APP, import_method_id: int | None = None) -> tuple[Order, bool]:
    """Returns (order, created). created=False when the idempotency key was already used."""
    if payment_method not in {m["code"] for m in payment_methods()}:
        raise WorkflowError("Choose a payment method.", field="payment_method")
    try:
        with transaction.atomic():
            cart = carts.cart_for(customer, lock=True)  # one checkout at a time per customer
            done = CheckoutRequest.objects.filter(customer=customer, key=idempotency_key).select_related("order").first()
            if done:
                return done.order, False
            quote = _quote(carts.summarize(cart), address.city, shipping_method_id, import_method_id)
            _check_quote(quote, payment_method, expected_total)
            lines = quote.summary["lines"]
            order = shop.create_shop_order(
                customer=customer, user=None, request=request, channel=channel, items=_order_lines(quote),
                shipping_address=_address_text(address), city=address.city, area=address.area,
                customer_email=customer.email, notes=notes.strip(), delivery_address=address,
                payment_preference=payment_method, **_shipping_fields(quote),
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


def guest_preview(items: list[dict], *, city, shipping_method_id: int | None = None,
                  import_method_id: int | None = None) -> Quote:
    """A visitor's browser cart, priced for a delivery city exactly like a signed-in checkout."""
    return _quote(carts.summarize_items(carts.guest_items(items)), city, shipping_method_id, import_method_id)


def _guest_customer(*, full_name: str, phone: str, email: str) -> Customer:
    """
    The customer with this phone number, or a new one. An existing record is never changed
    from a guest checkout (the number isn't verified), and an email that belongs to someone
    else is not copied onto a new record; the order still keeps the email typed for it.
    """
    customer = find_customer(phone, "web")
    if customer is None:
        if email and Customer.objects.filter(email=email).exists():
            email = ""
        customer = Customer.objects.create(full_name=full_name, email=email, phone=f"+{phone}",
                                           preferred_channel=Customer.Channel.WEB)
    return Customer.objects.select_for_update().get(pk=customer.pk)  # one checkout at a time per customer


def place_guest_order(*, items: list[dict], full_name: str, phone: str, email: str, city, line1: str, area: str,
                      shipping_method_id: int, payment_method: str, notes: str, idempotency_key: str,
                      expected_total: Decimal | None, request=None,
                      import_method_id: int | None = None) -> tuple[Order, bool]:
    """Website checkout without an account. Returns (order, created) like `place_order`."""
    if payment_method not in {m["code"] for m in payment_methods()}:
        raise WorkflowError("Choose a payment method.", field="payment_method")
    try:
        with transaction.atomic():
            customer = _guest_customer(full_name=full_name, phone=phone, email=email)
            done = CheckoutRequest.objects.filter(customer=customer, key=idempotency_key).select_related("order").first()
            if done:
                return done.order, False
            quote = guest_preview(items, city=city, shipping_method_id=shipping_method_id,
                                  import_method_id=import_method_id)
            _check_quote(quote, payment_method, expected_total)
            contact = f"Guest checkout: {full_name}, +{phone}"
            order = shop.create_shop_order(
                customer=customer, user=None, request=request, channel=ShopDetails.Channel.WEB,
                items=_order_lines(quote), shipping_address=line1[:255], city=city, area=area,
                customer_email=email or customer.email, notes="\n".join(p for p in (contact, notes.strip()) if p),
                payment_preference=payment_method, **_shipping_fields(quote),
            )
            if order.total_amount != quote.total:
                raise WorkflowError("The order total couldn't be confirmed. Please try again.", conflict=True)
            CheckoutRequest.objects.create(customer=customer, key=idempotency_key, order=order)
            return order, True
    except IntegrityError:
        customer = find_customer(phone, "web")
        done = customer and CheckoutRequest.objects.filter(customer=customer, key=idempotency_key).select_related(
            "order").first()
        if done:
            return done.order, False
        raise


def _address_text(address: Address) -> str:
    """Street part only: ShopDetails keeps the area and city in their own fields (as staff-entered orders do)."""
    label = f"{address.label}: " if address.label else ""
    return f"{label}{address.line1}"[:255]
