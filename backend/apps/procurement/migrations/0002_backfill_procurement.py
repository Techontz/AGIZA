"""
Open procurement records for international orders created before the
Procurement module existed (non-destructive: only adds rows).
"""
from django.db import migrations

RECEIVED = {"sent_to_consolidation", "shipping_to_destination", "clearance", "ready_for_collection", "completed"}
PAID = {"paid_supplier", "in_production"}


def backfill(apps, schema_editor):
    Order = apps.get_model("orders", "Order")
    Supplier = apps.get_model("procurement", "Supplier")
    ProcurementOrder = apps.get_model("procurement", "ProcurementOrder")
    History = apps.get_model("procurement", "ProcurementStatusHistory")
    Sequence = apps.get_model("core", "ReferenceSequence")

    orders = Order.objects.filter(order_type="international", procurement__isnull=True).exclude(
        international__service_type="deliver_for_me")
    for order in orders.select_related("international"):
        details = order.international
        supplier = None
        if details.supplier_name:
            supplier = Supplier.objects.filter(name=details.supplier_name).first()
            if supplier is None:
                seq, _ = Sequence.objects.get_or_create(prefix="SUP")
                seq.last_value += 1
                seq.save()
                supplier = Supplier.objects.create(name=details.supplier_name, country_id=details.source_country_id,
                                                   reference=f"SUP-{seq.last_value:03d}")
        if order.status == "cancelled":
            status = "cancelled"
        elif order.status in RECEIVED:
            status = "received_at_cargo"
        elif order.status in PAID:
            status = "paid"
        else:
            status = "supplier_selected" if supplier else "pending_sourcing"
        proc = ProcurementOrder.objects.create(
            order=order, status=status, supplier=supplier, supplier_tracking_number=details.tracking_number,
            operator_id=order.handler_id, item_cost=details.item_cost, currency=order.currency,
        )
        History.objects.create(procurement=proc, to_status=status, note="Opened for an existing order")


class Migration(migrations.Migration):
    dependencies = [
        ("procurement", "0001_initial"),
        ("orders", "0002_initial"),
        ("core", "0002_seedrecord"),
    ]

    operations = [migrations.RunPython(backfill, migrations.RunPython.noop)]
