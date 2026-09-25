from datetime import timedelta
from decimal import Decimal as D

import pytest
from django.utils import timezone

from apps.accounts.constants import StaffLevel
from apps.locations.models import City, Country
from apps.parties.models import Customer

EXPRESS = "/api/orders/express"
INTL = "/api/orders/international"
EQUIP = "/api/orders/equipment"
QUOTES = "/api/quotes"


@pytest.fixture
def customer(db):
    return Customer.objects.create(full_name="Juma Mwangi", phone="+255712000001")


@pytest.fixture
def admin(client_for):
    return client_for(StaffLevel.ADMIN_L2)  # orders manage, finance manage, intake manage


@pytest.fixture
def driver(make_user):
    return make_user(StaffLevel.DRIVER, full_name="Hassan Mohamed")


@pytest.fixture
def cities(db):
    return {n: City.objects.get(name=n, country__iso2="TZ") for n in ("Dar es Salaam", "Mwanza", "Arusha")}


@pytest.fixture
def china(db):
    return Country.objects.get(iso2="CN")


def eta(days=1):
    return (timezone.now() + timedelta(days=days)).isoformat()


@pytest.fixture
def new_express(admin, customer, cities):
    def _make(**extra):
        payload = {
            "customer": customer.id,
            "item_details": "2x Electronics Package (5kg)",
            "pickup_address": "Kariakoo Market, Msimbazi St",
            "pickup_city": cities["Dar es Salaam"].id,
            "delivery_address": "Mwenge, Sam Nujoma Rd",
            "delivery_city": cities["Mwanza"].id,
            "priority": "express",
            "weight_kg": "5",
            "package_size": "small",
            **extra,
        }
        res = admin.post(f"{EXPRESS}/", payload, format="json")
        assert res.status_code == 201, res.json()
        return res.json()

    return _make


def quote(client, order_id, amount="25000", **extra):
    return client.post(f"{EXPRESS}/{order_id}/quote/", {"amount": amount, "estimated_delivery_at": eta(), **extra}, format="json")


def move(client, base, order_id, status, note=""):
    return client.post(f"{base}/{order_id}/transition/", {"status": status, "note": note}, format="json")


@pytest.fixture
def accepted_express(admin, new_express):
    def _make(**quote_extra):
        order = new_express()
        assert quote(admin, order["id"], **quote_extra).status_code == 200
        res = admin.post(f"{EXPRESS}/{order['id']}/quote-status/", {"status": "accepted"}, format="json")
        assert res.status_code == 200, res.json()
        return res.json()

    return _make


__all__ = ["D", "EXPRESS", "INTL", "EQUIP", "QUOTES", "eta", "quote", "move"]
