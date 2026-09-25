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
