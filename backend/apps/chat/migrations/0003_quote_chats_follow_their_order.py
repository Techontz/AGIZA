from django.db import migrations


def link(apps, schema_editor):
    """Chats about quotations that were already approved continue as their order's chat."""
    Conversation = apps.get_model("chat", "Conversation")
    Order = apps.get_model("orders", "Order")
    for conv in Conversation.objects.filter(quote__isnull=False, order__isnull=True):
        order = Order.objects.filter(source_quote_id=conv.quote_id).first()
        if order:
            conv.order = order
            conv.save(update_fields=["order"])


class Migration(migrations.Migration):
    dependencies = [
        ("chat", "0002_conversation_return_request"),
        ("orders", "0010_shopdetails_delivery_fee_pending"),
    ]

    operations = [migrations.RunPython(link, migrations.RunPython.noop)]
