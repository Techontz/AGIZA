"""
N+1 guard: every list endpoint, on the full demo data, must answer a page with
a bounded number of queries (independent of how many rows the page holds).
"""
import pytest
from django.core.management import call_command
from django.db import connection
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from apps.accounts.constants import StaffLevel

pytestmark = pytest.mark.django_db

LISTS = [
    "orders/express/", "orders/international/", "orders/equipment/", "orders/shop/", "quotes/",
    "procurement/orders/", "procurement/suppliers/", "shipping/parcels/", "shipping/shipments/", "deliveries/",
    "returns/", "tasks/?state=any", "catalog/products/", "catalog/vendors/", "catalog/categories/", "catalog/options/",
    "inventory/stock/", "warehouses/", "finance/order-payments/", "finance/payments/", "finance/invoices/",
    "finance/wallets/", "finance/installment-plans/", "customers/", "staff/", "service-providers/",
    "shipping-engine/carriers/", "crm/tag-rules/", "crm/campaigns/", "chat/conversations/", "audit-logs/",
]
MAX_QUERIES = 25


@pytest.fixture(scope="module")
def demo(django_db_setup, django_db_blocker):
    with django_db_blocker.unblock(), override_settings(DEBUG=True):
        from apps.accounts.models import User
        from apps.core.models import ReferenceSequence

        counters = dict(ReferenceSequence.objects.values_list("prefix", "last_value"))
        if not User.objects.filter(email="querycount@agiza.test").exists():
            User.objects.create_superuser(email="querycount@agiza.test", password="x-Passw0rd-123",
                                          full_name="Query Count", staff_level=StaffLevel.TOP_ADMIN)
        call_command("seed_demo_data", verbosity=0)
    yield
    with django_db_blocker.unblock(), override_settings(DEBUG=True):
        call_command("seed_demo_data", "--flush", verbosity=0)
        User.objects.filter(email="querycount@agiza.test").delete()
        # This data was committed outside the per-test transactions: put reference numbering back too.
        ReferenceSequence.objects.exclude(prefix__in=counters).delete()
        for prefix, value in counters.items():
            ReferenceSequence.objects.filter(prefix=prefix).update(last_value=value)


@pytest.mark.parametrize("path", LISTS)
def test_list_endpoints_have_bounded_queries(demo, path):
    from apps.accounts.models import User

    client = APIClient()
    client.force_authenticate(User.objects.get(email="querycount@agiza.test"))
    sep = "&" if "?" in path else "?"
    with CaptureQueriesContext(connection) as small:
        assert client.get(f"/api/{path}{sep}page_size=2").status_code == 200
    with CaptureQueriesContext(connection) as big:
        res = client.get(f"/api/{path}{sep}page_size=50")
        assert res.status_code == 200
    assert len(big) <= MAX_QUERIES, f"{path}: {len(big)} queries"
    assert len(big) - len(small) <= 3, f"{path}: queries grow with rows ({len(small)} → {len(big)})"
