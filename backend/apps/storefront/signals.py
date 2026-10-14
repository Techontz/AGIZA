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

# Customers hear only about the major steps of their order (the app's tracking shows every step):
# {order type: {status: message}}.
MAJOR_STEPS = {
    "shop": {
        "processing": "Confirmed — we're preparing your order.",
        "shipping_to_destination": "Your imported items are on their way to Tanzania.",
        "arrived": "Your imported items have arrived in Tanzania.",
        "shipped": "On its way to you.",
        "delivered": "Delivered. Enjoy!",
        "cancelled": "Your order was cancelled.",
    },
    "international": {
        "supplier_confirmed": "Confirmed — we're buying your items from the supplier.",
        "sent_to_consolidation": "Your goods reached our warehouse abroad.",
        "shipping_to_destination": "Shipped — on its way to Tanzania.",
        "ready_for_collection": "Arrived in Tanzania and ready for delivery / collection.",
        "completed": "Delivered. Thank you for shipping with AGIZA!",
        "cancelled": "Your order was cancelled.",
    },
    "express": {
        "driver_assigned": "A driver is assigned to your delivery.",
        "picked_up": "Your parcel was picked up.",
        "arrived": "Your parcel arrived in the destination city.",
        "delivered": "Delivered.",
        "cancelled": "Your delivery was cancelled.",
    },
    "equipment": {
        "approved": "Your service request is approved.",
        "assigned": "A technician is assigned.",
        "completed": "Your service is complete.",
        "cancelled": "Your service request was cancelled.",
    },
}


@receiver(post_save, sender=OrderStatusHistory, dispatch_uid="storefront_order_status_push")
def order_status_changed(sender, instance: OrderStatusHistory, created: bool, **kwargs):
    if not created or not instance.from_status:  # creation is confirmed in the app itself
        return
    if instance.from_status == instance.to_status:  # a note (approval, new date…): not a status change
        return
    from apps.orders.expiry import EXPIRED_REASON

    if instance.note.startswith(EXPIRED_REASON):  # orders.expiry tells the customer why, in its own words
        return
    order = instance.order
    message = MAJOR_STEPS.get(order.order_type, {}).get(instance.to_status)
    if message is None:  # an intermediate step: visible in the app's tracking, not pushed
        return
    notify_customer(order.customer, title=f"Order {order.reference}: {status_label(order.order_type, instance.to_status)}",
                    body=message, data={"type": "order_status", "order": order.reference, "screen": "order"})


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
    from .views.requests import _room_key, _room_title

    _, room_title = _room_title(conversation)
    notify_customer(conversation.customer, title=f"New message · {room_title}", body=instance.body[:180],
                    data={"type": "chat_message", "conversation": conversation.pk, "screen": "chat",
                          "room": _room_key(conversation), "room_title": room_title})
