"""Fixtures shared by the operations test suites (procurement, shipping, deliveries, returns, tasks)."""
from decimal import Decimal as D

import pytest

from apps.accounts.constants import StaffLevel
from apps.locations.models import City, Country
from apps.orders import services as order_services
from apps.parties.models import Customer


@pytest.fixture
def ops(client_for):
    """Admin Level 2: manage on every operations module, finance manage."""
    return client_for(StaffLevel.ADMIN_L2)


@pytest.fixture
def buyer(db):
    return Customer.objects.create(full_name="Fatuma Hassan", phone="+255712000009")


@pytest.fixture
def dar(db):
    return City.objects.get(name="Dar es Salaam", country__iso2="TZ")


@pytest.fixture
def make_intl(ops, buyer):
    """Create an international order through the service layer (as the API does)."""

    def _make(iso="CN", service="full_service", total="2500000", paid=None, **extra):
        order = order_services.create_order(
            "international", customer=buyer, item_details=extra.pop("items", "Samsung Galaxy A54 × 20"),
            user=ops.user, total_amount=D(total),
            details={"source_country": Country.objects.get(iso2=iso), "service_type": service,
                     "order_class": extra.pop("order_class", "simple"), **extra},
        )
        if paid:
            order_services.record_payment(order, amount=D(paid), method="bank_transfer", user=ops.user)
        return order

    return _make
