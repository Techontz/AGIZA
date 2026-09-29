"""
Marketplace fixtures: the customer-app shop (AGIZA's own stock in a Dar es Salaam warehouse)
plus two self-service vendors, A and B, each approved with its own store location in Dar,
and a published product each. Built through the real APIs and services.
"""
import pytest
from rest_framework.test import APIClient

from apps.accounts.constants import StaffLevel
from apps.catalog.models import Product
from apps.marketplace.models import MarketplaceSettings
from apps.storefront.tests.conftest import (  # noqa: F401  (fixtures re-exported)
    APP,
    PASSWORD,
    account,
    app,
    client_for_account,
    home,
    make_account,
    other_app,
    shop,
    sms,
)

SELLER = f"{APP}/seller"


def application(**extra):
    from apps.locations.models import City

    return {"name": "Kariakoo Electronics", "city": City.objects.get(name="Dar es Salaam", country__iso2="TZ").pk,
            "business_address": "Msimbazi St, Kariakoo", "contact_person": "Juma Ally", "business_type": "company",
            "phone": "+255713000001", "legal_name": "Kariakoo Electronics Ltd", "tin": "123-456-789",
            "payout_method": "mobile_money", "payout_provider": "M-Pesa", "payout_account_name": "Juma Ally",
            "payout_account_number": "0713000001", **extra}


def product_payload(category, **extra):
    return {"name": "Tecno Spark 20", "category": category.pk, "price": "320000", "weight_kg": "0.4",
            "stock": 10, "status": "active", "description": "6.6\" display, 128GB", **extra}


class Seller:
    """A vendor with its signed-in owner client."""

    def __init__(self, vendor, client):
        self.vendor = vendor
        self.client = client


@pytest.fixture
def staff(client_for):
    return client_for(StaffLevel.TOP_ADMIN)


@pytest.fixture
def make_seller(db, shop, staff):  # noqa: F811  (shop: re-exported fixture)
    """Apply → approve → add a published product. Returns Seller(vendor, owner client)."""
    MarketplaceSettings.load()

    def _make(name, phone, product_name, price="320000", weight="0.4", stock=10, approve_product=True):
        owner = client_for_account(make_account(phone=phone, name=f"{name} Owner"))
        res = owner.post(f"{SELLER}/store/", application(name=name, phone=f"+{phone}"), format="json")
        assert res.status_code == 201, res.content
        vendor_id = res.json()["id"]
        res = staff.post(f"/api/catalog/vendors/{vendor_id}/review/", {"status": "approved"}, format="json")
        assert res.status_code == 200, res.content
        res = owner.post(f"{SELLER}/products/", product_payload(shop.product.category, name=product_name, price=price,
                                                                weight_kg=weight, stock=stock), format="json")
        assert res.status_code == 201, res.content
        product_id = res.json()["id"]
        if approve_product:
            res = staff.post(f"/api/catalog/products/{product_id}/moderate/", {"action": "approve"}, format="json")
            assert res.status_code == 200, res.content
        from apps.catalog.models import Vendor

        seller = Seller(Vendor.objects.get(pk=vendor_id), owner)
        seller.product = Product.objects.get(pk=product_id)
        seller.variant = seller.product.variants.get(is_default=True)
        return seller

    return _make


@pytest.fixture
def vendor_a(make_seller):
    return make_seller("Vendor A Electronics", "255713000001", "Tecno Spark 20", price="320000")


@pytest.fixture
def vendor_b(make_seller):
    return make_seller("Vendor B Fashion", "255713000002", "Kitenge Dress", price="45000", weight="0.3")


@pytest.fixture
def anon():
    return APIClient()

