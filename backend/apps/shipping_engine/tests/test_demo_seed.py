from io import StringIO

import pytest
from django.core.management import call_command
from django.db.models import F
from django.test import override_settings
from django.utils import timezone

from apps.core.models import SeedRecord
from apps.shipping_engine.models import Carrier, ShippingRule

pytestmark = pytest.mark.django_db


def run(*args):
    out = StringIO()
    call_command("seed_demo_data", *args, stdout=out)
    return out.getvalue()


@override_settings(DEBUG=True)
def test_seed_is_idempotent_and_removable_without_touching_real_data():
    real = Carrier.objects.create(name="Real Carrier Ltd", type="local_ground")
    assert "created" in run("--only", "shipping")
    rules = ShippingRule.objects.count()
    assert rules == 19 and Carrier.objects.count() == 7

    assert "0 created" in run("--only", "shipping")  # second run adds nothing
    assert ShippingRule.objects.count() == rules

    run("--flush")
    assert ShippingRule.objects.count() == 0
    assert list(Carrier.objects.values_list("name", flat=True)) == [real.name]
    assert SeedRecord.objects.count() == 0


@override_settings(DEBUG=False)
def test_seed_refuses_production_without_force():
    from django.core.management.base import CommandError

    with pytest.raises(CommandError):
        run()


@override_settings(DEBUG=True)
def test_full_demo_set_including_orders_loads_and_flushes(make_user):
    from apps.accounts.constants import StaffLevel
    from apps.orders.models import Order, OrderStatusHistory
    from apps.quotes.models import QuoteRequest

    make_user(StaffLevel.TOP_ADMIN)  # seed actions are attributed to the first superuser
    run()
    assert Order.objects.filter(order_type="express").count() == 7
    assert Order.objects.filter(order_type="international", status="clearance").count() == 1
    assert QuoteRequest.objects.filter(status="answered").count() == 2
    # Statuses were reached through the workflow, so history exists for every step.
    order = Order.objects.get(order_type="express", status="in_transit")
    assert list(OrderStatusHistory.objects.filter(order=order).values_list("to_status", flat=True)) == [
        "waiting_quote", "quoted", "accepted", "driver_assigned", "picked_up", "at_agiza_center", "in_transit"]
    assert "0 created" in run("--only", "orders")
    assert "0 created" in run("--only", "operations")

    # Operations: the design's international orders reached their stages through the real modules.
    from apps.deliveries.models import Delivery, DeliveryPhoto
    from apps.procurement.models import ProcurementOrder
    from apps.returns.models import ReturnRequest
    from apps.shipping.models import CargoParcel, Shipment, ShipmentDocument
    from apps.tasks.models import Task

    grace = Order.objects.get(item_details__startswith="Home Appliances - 2x")
    assert grace.status == "clearance" and grace.cargo.shipment.status == "clearance"
    assert list(OrderStatusHistory.objects.filter(order=grace).values_list("to_status", flat=True)) == [
        "pending_payment", "supplier_confirmed", "paid_supplier", "sent_to_consolidation",
        "shipping_to_destination", "clearance"]
    assert ProcurementOrder.objects.filter(status="received_at_cargo").exists()
    assert CargoParcel.objects.filter(stage="waiting").count() >= 5
    assert CargoParcel.objects.filter(stage="ready").count() >= 4
    assert Shipment.objects.filter(status="shipping_to_destination").exists()
    assert ShipmentDocument.objects.filter(file__endswith=".pdf").count() == 2
    delivered = Delivery.objects.filter(status="delivered", order__order_type="international")
    assert delivered.count() == 4 and all(d.order.status == "completed" for d in delivered)
    assert DeliveryPhoto.objects.count() >= 4
    assert ReturnRequest.objects.filter(status="closed", refund_payment__isnull=False).count() == 1
    assert Task.objects.filter(sla_deadline__lt=timezone.now(), status="waiting_for_client").exists()

    # Commerce: catalogue with stock ledger, shop orders through fulfilment, finance records.
    from apps.catalog.models import Product
    from apps.finance.models import InstallmentPlan, Invoice, Wallet
    from apps.inventory.models import StockItem, StockMovement

    assert "0 created" in run("--only", "commerce")
    assert Product.objects.count() == 13
    assert StockItem.objects.filter(reserved__gt=0, reserved=F("quantity")).exists()  # the design's "Reserved"
    assert StockMovement.objects.filter(kind="transfer_in").count() >= 4  # shop floor
    assert Order.objects.filter(order_type="shop", status="delivered").count() == 1
    assert Invoice.objects.count() == 3 and Wallet.objects.count() == 2
    assert set(InstallmentPlan.objects.values_list("status", flat=True)) == {"active", "pending_approval"}

    # People & Support: the design's tag rules ran for real; conversations are stored.
    from apps.chat.models import Conversation
    from apps.crm.models import CustomerTag, TagRule

    assert "0 created" in run("--only", "people")
    assert TagRule.objects.count() == 4 and CustomerTag.objects.filter(source="rule").exists()
    assert Conversation.objects.count() == 5
    assert Conversation.objects.filter(customer__isnull=True).count() == 0

    # Removing only "orders" also removes "operations" (it builds on those orders).
    out = run("--flush", "--only", "orders")
    assert "operations" in out
    assert Order.objects.count() == 0 and Shipment.objects.count() == 0 and Delivery.objects.count() == 0
    assert SeedRecord.objects.exclude(seed="shipping").count() == 0
    run("--flush")
    assert Order.objects.count() == 0 and QuoteRequest.objects.count() == 0
    assert SeedRecord.objects.count() == 0
