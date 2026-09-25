from io import StringIO

import pytest
from django.core.management import call_command
from django.test import override_settings

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
    run("--flush")
    assert Order.objects.count() == 0 and QuoteRequest.objects.count() == 0
    assert SeedRecord.objects.count() == 0
