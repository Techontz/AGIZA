"""
Online payment flow:

1. `start_checkout` registers the amount due with Selcom and returns the hosted
   checkout page the customer opens (mobile money / card).
2. Selcom calls the webhook, or the app asks us to check. Either way `confirm`
   asks Selcom for the order's status; the webhook body itself is never trusted.
3. A completed payment is recorded with `orders.services.record_payment`, the
   same path staff use, so finance, invoices and the admin stay in step.
"""
from __future__ import annotations

import logging
import uuid
from datetime import timedelta
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.core.workflow import WorkflowError
from apps.orders import services as order_services
from apps.orders.models import Order, Payment

from . import selcom
from .models import GatewayPayment

logger = logging.getLogger("apps.payments")
REUSE_PENDING_FOR = timedelta(minutes=30)
COMPLETED = {"COMPLETED", "SUCCESS", "SUCCESSFUL"}
FAILED = {"CANCELLED", "CANCELED", "FAILED", "REJECTED", "EXPIRED", "USERCANCELLED"}


def available() -> bool:
    return selcom.configured()


def _together(order: Order) -> list[Order]:
    """The live orders of the order's checkout (one order per product), paid together at checkout."""
    from apps.orders import shop

    return [o for o in shop.checkout_orders(order) if o.status != "cancelled"]


def _checkout_reference(order: Order) -> str:
    details = getattr(order, "shop", None) if order.order_type == "shop" else None
    return details.checkout_reference if details else ""


def start_checkout(order: Order, *, phone: str, together: bool = False) -> GatewayPayment:
    """Open Selcom's checkout for what is due on the order — or, with `together`, on every order of its
    checkout (one cart split into an order per product), paid in one go right after ordering."""
    group = _checkout_reference(order) if together else ""
    if group:
        return _start(order, phone=phone, orders=_together(order), label=group)
    return _start(order, phone=phone, orders=[order], label=order.reference)


def _start(order: Order, *, phone: str, orders: list[Order], label: str) -> GatewayPayment:
    if not available():
        raise WorkflowError("Mobile money payment isn't available right now. Choose Pay later.", conflict=True)
    if order.status == "cancelled":
        raise WorkflowError("This order was cancelled.", conflict=True)
    if payment_deadline_passed(order):
        raise WorkflowError("The payment deadline for this order has passed.", conflict=True)
    due = sum((order_services.payment_summary(o).due or Decimal("0") for o in orders), Decimal("0"))
    if not due or due <= 0:
        raise WorkflowError("This order has nothing left to pay.", conflict=True)
    amount = due.quantize(Decimal("1"))  # Selcom takes whole shillings
    recent = (GatewayPayment.objects.filter(order=order, status=GatewayPayment.Status.PENDING, amount=amount,
                                            created_at__gte=timezone.now() - REUSE_PENDING_FOR)
              .exclude(gateway_url="").first())
    if recent:
        return recent  # a double tap reuses the checkout already opened

    gateway = GatewayPayment.objects.create(
        order=order, amount=amount, currency=order.currency, phone=phone,
        provider_order_id=f"AGIZA-{label}-{uuid.uuid4().hex[:8].upper()}",
    )
    customer = order.customer
    try:
        payload, response = selcom.create_order(
            order_id=gateway.provider_order_id, amount=f"{amount:.0f}", currency=order.currency,
            buyer_name=customer.full_name, buyer_email=customer.email or settings.SELCOM_FALLBACK_BUYER_EMAIL,
            buyer_phone=phone, remarks=f"AGIZA order {label}",
            items=max(sum(o.items.count() for o in orders), 1),
        )
    except selcom.SelcomError as exc:
        _fail(gateway, f"Gateway unreachable: {exc}")
        raise WorkflowError("We couldn't reach the payment provider. Please try again.")
    url = selcom.gateway_url(response)
    gateway.request_payload = payload
    gateway.response_payload = response
    if str(response.get("result", "")).upper() != "SUCCESS" or not url:
        gateway.save(update_fields=["request_payload", "response_payload", "updated_at"])
        _fail(gateway, str(response.get("message") or "Checkout was not created")[:255])
        raise WorkflowError("The payment provider declined the request. Please try again later.")
    gateway.gateway_url = url
    gateway.save(update_fields=["request_payload", "response_payload", "gateway_url", "updated_at"])
    return gateway


def _fail(gateway: GatewayPayment, reason: str):
    gateway.status = GatewayPayment.Status.FAILED
    gateway.failure_reason = reason[:255]
    gateway.save(update_fields=["status", "failure_reason", "updated_at"])


def _amount(value) -> Decimal | None:
    try:
        return Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, TypeError, ValueError):
        return None


def confirm(gateway: GatewayPayment) -> GatewayPayment:
    """Ask Selcom about the payment and apply the answer (idempotent)."""
    if gateway.status != GatewayPayment.Status.PENDING:
        return gateway
    try:
        answer = selcom.order_status(gateway.provider_order_id)
    except selcom.SelcomError:
        return gateway  # unknown for now; the next webhook or check retries
    state = str(answer.get("payment_status", "")).upper()
    with transaction.atomic():
        gateway = GatewayPayment.objects.select_for_update().get(pk=gateway.pk)
        if gateway.status != GatewayPayment.Status.PENDING:
            return gateway
        gateway.status_payload = answer.get("raw") or {}
        if state in COMPLETED:
            _complete(gateway, answer)
        elif state in FAILED:
            gateway.status = GatewayPayment.Status.FAILED
            gateway.failure_reason = f"Payment {state.lower()} at the provider"
        gateway.save()
    return gateway


def _complete(gateway: GatewayPayment, answer: dict):
    order = gateway.order
    received = _amount(answer.get("amount")) or gateway.amount
    reference = str(answer.get("transid") or answer.get("reference") or gateway.provider_order_id)[:80]
    gateway.provider_reference = reference
    gateway.completed_at = timezone.now()
    gateway.status = GatewayPayment.Status.COMPLETED
    group = _checkout_reference(order)
    if group and gateway.provider_order_id.startswith(f"AGIZA-{group}-"):
        _complete_together(gateway, received, reference, group)
        return
    due = order_services.payment_summary(order).due or Decimal("0")
    amount = min(received, due)
    if amount <= 0:
        _needs_attention(gateway, f"Received {received} {gateway.currency} but nothing was due on {order.reference}.")
        return
    try:
        payment = order_services.record_payment(
            order, amount=amount, method=Payment.Method.MOBILE_MONEY, user=None, reference=reference,
            kind=Payment.Kind.BALANCE if amount >= due else Payment.Kind.ADVANCE,
            notes=f"Paid in the AGIZA app via Selcom ({gateway.provider_order_id})",
        )
    except WorkflowError as exc:
        _needs_attention(gateway, f"Received {received} {gateway.currency} but it couldn't be applied: {exc.message}")
        if order.status == "cancelled":  # e.g. paid after the payment deadline: never revives the order
            _tell_customer_late(gateway, received)
        return
    gateway.payment = payment
    if received > amount:
        _needs_attention(gateway, f"Received {received} {gateway.currency}; only {amount} was due. Refund the difference.")


def _complete_together(gateway: GatewayPayment, received: Decimal, reference: str, group: str):
    """One payment for a whole checkout: recorded on each of its orders, up to what each one owes."""
    left, first = received, None
    for order in _together(gateway.order):
        due = order_services.payment_summary(order).due or Decimal("0")
        amount = min(left, due)
        if amount <= 0:
            continue
        try:
            payment = order_services.record_payment(
                order, amount=amount, method=Payment.Method.MOBILE_MONEY, user=None, reference=reference,
                kind=Payment.Kind.BALANCE if amount >= due else Payment.Kind.ADVANCE,
                notes=f"Paid in the AGIZA app via Selcom ({gateway.provider_order_id}, checkout {group})",
            )
        except WorkflowError as exc:
            _needs_attention(gateway, f"Received {received} {gateway.currency} for checkout {group}; "
                                      f"{order.reference} couldn't take its part: {exc.message}")
            continue
        first = first or payment
        left -= amount
    gateway.payment = first
    if first is None:
        _needs_attention(gateway, f"Received {received} {gateway.currency} but nothing was due on checkout {group}.")
    elif left > 0:
        _needs_attention(gateway, f"Received {received} {gateway.currency}; {left} more than checkout {group} owed. "
                                  f"Refund the difference.")


def payment_deadline_passed(order) -> bool:
    details = getattr(order, "shop", None) if order.order_type == "shop" else None
    return bool(details and details.prepayment_required and details.payment_due_at
                and details.payment_due_at <= timezone.now())


def _tell_customer_late(gateway: GatewayPayment, received):
    from apps.storefront.notifications import notify

    order = gateway.order
    notify(order.customer, title=f"Payment received for cancelled order {order.reference}",
           body=f"We received {received:,.0f} {gateway.currency} after order {order.reference} was cancelled. "
                f"It was not applied to the order; AGIZA will contact you to refund it.",
           data={"type": "order_status", "order": order.reference, "screen": "order"})


def _needs_attention(gateway: GatewayPayment, reason: str):
    from apps.accounts.constants import Module
    from apps.notifications import services as notifications
    from apps.notifications.models import Notification

    logger.warning("Gateway payment %s needs attention: %s", gateway.provider_order_id, reason)
    gateway.needs_attention = True
    gateway.failure_reason = reason[:255]
    notifications.notify(notifications.users_with(Module.FINANCE), kind=Notification.Kind.SYSTEM,
                         title=f"Online payment needs attention · {gateway.order.reference}", body=reason,
                         link="/finance/payments")


def handle_webhook(payload: dict) -> GatewayPayment | None:
    order_id = str(payload.get("order_id") or "")
    gateway = GatewayPayment.objects.filter(provider_order_id=order_id).select_related("order").first()
    if gateway is None:
        logger.warning("Selcom webhook for an unknown order id %r", order_id)
        return None
    return confirm(gateway)
