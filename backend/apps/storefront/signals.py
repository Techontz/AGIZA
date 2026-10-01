"""
Push notifications for what customers care about, driven by the records the
workflows already write (no changes to the order, quote or payment services):
order status changes, quotations ready, payments received and support replies.
"""
from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.chat.models import Message
from apps.orders.models import OrderStatusHistory, Payment
from apps.orders.workflows import status_label
from apps.quotes.models import QuoteStatus, QuoteStatusHistory

from .push import notify_customer


@receiver(post_save, sender=OrderStatusHistory, dispatch_uid="storefront_order_status_push")
def order_status_changed(sender, instance: OrderStatusHistory, created: bool, **kwargs):
    if not created or not instance.from_status:  # creation is confirmed in the app itself
        return
    from apps.orders.expiry import EXPIRED_REASON

    if instance.note.startswith(EXPIRED_REASON):  # orders.expiry tells the customer why, in its own words
        return
    order = instance.order
    notify_customer(order.customer, title=f"Order {order.reference}",
                    body=f"Status: {status_label(order.order_type, instance.to_status)}",
                    data={"type": "order_status", "order": order.reference, "screen": "order"})


@receiver(post_save, sender=QuoteStatusHistory, dispatch_uid="storefront_quote_push")
def quote_changed(sender, instance: QuoteStatusHistory, created: bool, **kwargs):
    if not created:
        return
    quote = instance.quote
    if instance.to_status == QuoteStatus.WAITING_REPLY:
        title, body = "Your quotation is ready", f"{quote.reference}: review the price and accept or decline."
    elif instance.to_status == QuoteStatus.APPROVED:
        title, body = "Order confirmed", f"{quote.reference} is now an order. Track it in the app."
    else:
        return
    notify_customer(quote.customer, title=title, body=body,
                    data={"type": "quotation", "quote": quote.pk, "screen": "quotation"})


@receiver(post_save, sender=Payment, dispatch_uid="storefront_payment_push")
def payment_received(sender, instance: Payment, created: bool, **kwargs):
    if not created or instance.kind == Payment.Kind.REFUND:
        return
    order = instance.order
    notify_customer(order.customer, title="Payment received",
                    body=f"{instance.amount:,.0f} {instance.currency} for order {order.reference}. Thank you!",
                    data={"type": "payment", "order": order.reference, "screen": "order"})


@receiver(post_save, sender=Message, dispatch_uid="storefront_chat_push")
def support_replied(sender, instance: Message, created: bool, **kwargs):
    if not created or instance.sender != Message.Sender.AGENT:
        return
    conversation = instance.conversation
    if conversation.channel != "web" or conversation.customer_id is None:
        return
    notify_customer(conversation.customer, title="New message from AGIZA Support", body=instance.body[:180],
                    data={"type": "chat_message", "conversation": conversation.pk, "screen": "chat"})
