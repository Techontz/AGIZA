"""
Orders with imported items are paid when ordered (ShopDetails.prepayment_required) and must be
fully paid by ShopDetails.payment_due_at (Shipping Engine settings → payment window). After the
deadline an unpaid order is cancelled the usual way (shop.cancel): local reservations are
released, imported items were never bought, the status history and audit trail record why, and
the customer is told.

Pending online payments are checked with the provider first, so money paid in time is never
lost to the job. A payment that completes after the cancellation is not applied: the payments
module flags it for finance to refund (GatewayPayment.needs_attention), and the customer is told.

Run every few minutes: `python manage.py expire_unpaid_orders`.
"""
from __future__ import annotations

import logging

from django.db import transaction
from django.utils import timezone

from apps.core.workflow import WorkflowError

from . import shop
from .models import Order
from .services import payment_summary
from .workflows import OrderType, ShopStatus

logger = logging.getLogger("apps.orders")

EXPIRED_REASON = "Payment deadline passed"


def due_for_expiry(now=None):
    now = now or timezone.now()
    return (Order.objects.filter(order_type=OrderType.SHOP, status=ShopStatus.PENDING,
                                 shop__prepayment_required=True, shop__payment_due_at__lte=now)
            .select_related("shop", "customer").order_by("shop__payment_due_at"))


def _confirm_pending(order: Order):
    from apps.payments import services as payments
    from apps.payments.models import GatewayPayment

    for gateway in GatewayPayment.objects.filter(order=order, status=GatewayPayment.Status.PENDING):
        payments.confirm(gateway)  # unreachable provider: stays pending, still caught if it pays later


def expire(order: Order, now=None) -> bool:
    """Cancel one overdue unpaid order. False when it was paid (or changed) in the meantime."""
    now = now or timezone.now()
    _confirm_pending(order)
    with transaction.atomic():
        order = Order.objects.select_for_update().select_related("shop", "customer").get(pk=order.pk)
        details = order.shop
        if (order.status != ShopStatus.PENDING or not details.prepayment_required
                or details.payment_due_at is None or details.payment_due_at > now):
            return False
        summary = payment_summary(order)
        if not summary.due or summary.due <= 0:
            return False  # paid in time
        deadline = timezone.localtime(details.payment_due_at).strftime("%d %b %Y %H:%M")
        shop.cancel(order, user=None, reason=f"{EXPIRED_REASON} ({deadline}): the order with imported items "
                                             f"wasn't fully paid, so nothing was bought.")
        if summary.paid and summary.paid > 0:
            _flag_part_payment(order, summary.paid)
        _tell_customer(order, deadline, summary.paid)
    logger.info("Expired unpaid order %s (deadline %s)", order.reference, deadline)
    return True


def expire_due(now=None) -> list[str]:
    """Expire every overdue unpaid order; one failure doesn't stop the others."""
    expired = []
    for order in due_for_expiry(now):
        try:
            if expire(order, now):
                expired.append(order.reference)
        except WorkflowError as exc:
            logger.error("Couldn't expire %s: %s", order.reference, exc.message)
    return expired


def _flag_part_payment(order: Order, paid):
    from apps.accounts.constants import Module
    from apps.notifications import services as notifications
    from apps.notifications.models import Notification

    notifications.notify(notifications.users_with(Module.FINANCE), kind=Notification.Kind.SYSTEM,
                         title=f"Refund needed · {order.reference}",
                         body=f"The order expired unpaid but {paid:,.2f} {order.currency} had been paid. "
                              f"Refund it or agree the next step with the customer.",
                         link="/finance/payments")


def _tell_customer(order: Order, deadline: str, paid):
    from apps.storefront.notifications import notify

    body = (f"We didn't receive full payment by {deadline}, so order {order.reference} was cancelled and the "
            f"imported items were not bought.")
    if paid and paid > 0:
        body += f" AGIZA will contact you to refund the {paid:,.0f} {order.currency} you paid."
    notify(order.customer, title=f"Order {order.reference} cancelled", body=body,
           data={"type": "order_status", "order": order.reference, "screen": "order"})
    if not hasattr(order.customer, "account"):  # a guest has no app inbox: text them (once saved) if SMS is set up
        phone = order.customer.phone
        transaction.on_commit(lambda: _sms(phone, f"AGIZA: {body}"))


def _sms(phone: str, body: str):
    from apps.notifications.providers import NotConfigured, SendError, SmsProvider

    if not phone:
        return
    try:
        SmsProvider().send(phone, body[:300])
    except (NotConfigured, SendError) as exc:
        logger.warning("Expiry SMS not sent: %s", exc)
