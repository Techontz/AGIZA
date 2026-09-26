"""
Demo data must be removable without a trace: after seeding every set and
flushing, only the append-only audit trail, reference numbering and the store
settings singleton may remain.
"""
import pytest
from django.apps import apps
from django.core.management import call_command
from django.test import override_settings

pytestmark = pytest.mark.django_db

KEPT = {"core.ReferenceSequence", "accounts.AuditLog", "catalog.StoreSettings"}


def counts():
    return {m._meta.label: m.objects.count() for m in apps.get_models()}


def test_seed_then_flush_leaves_no_demo_rows():
    before = counts()
    with override_settings(DEBUG=True):
        call_command("seed_demo_data", verbosity=0)
        call_command("seed_demo_data", verbosity=0)  # repeatable: a second run adds nothing
        call_command("seed_demo_data", "--flush", verbosity=0)
    after = counts()
    left = {label: after[label] - before[label] for label in after if label not in KEPT and after[label] != before[label]}
    assert left == {}
