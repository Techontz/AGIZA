"""Customer app fixtures: a stocked Dar es Salaam shop, a Shipping Engine setup and signed-in customers."""
from datetime import date
from decimal import Decimal as D

import pytest
from rest_framework.test import APIClient

from apps.accounts.constants import StaffLevel
from apps.catalog.models import Category, LocationKind, Product, ProductVariant, StoreSettings
from apps.inventory import services as inventory
from apps.locations.models import City, Country, Warehouse
from apps.parties.models import Address, Customer
from apps.shipping_engine.constants import Scope
from apps.shipping_engine.models import ExchangeRate, Route, ShippingMethod, ShippingProfile, ShippingRule
from apps.storefront.auth import issue_tokens
from apps.storefront.models import CustomerAccount

PASSWORD = "Mzigo-Salama-2026"
APP = "/api/app"


class Sms:
    """Stands in for the SMS provider: records messages so tests can read the code."""

    sent: list[tuple[str, str]] = []

    @staticmethod
    def configured() -> bool:
        return True

    def send(self, to, body, subject=""):
        Sms.sent.append((to, body))
        return "test-id"

    @classmethod
    def last_code(cls) -> str:
        return cls.sent[-1][1].split("code is ")[1][:6]


@pytest.fixture
def sms(monkeypatch):
    Sms.sent = []
    monkeypatch.setattr("apps.storefront.otp.SmsProvider", Sms)
    return Sms


class Shop:
    """Namespace for the `shop` fixture's objects."""


@pytest.fixture
def shop(db, make_user):
    s = Shop()
    s.tz = Country.objects.get(iso2="TZ")
    s.dar = City.objects.get(name="Dar es Salaam", country=s.tz)
    s.mwanza = City.objects.get(name="Mwanza", country=s.tz)
    s.warehouse = Warehouse.objects.create(name="Dar Central", type="fulfillment", country=s.tz, city=s.dar)
    store = StoreSettings.load()
    store.location = s.dar
    store.save()

    s.rider = ShippingMethod.objects.create(name="Rider Delivery", code="RIDER", category="local")
    s.pickup = ShippingMethod.objects.create(name="Pickup In Store", code="PICKUP", category="local")
    s.bus = ShippingMethod.objects.create(name="Bus Cargo", code="BUS", category="land")
    s.manual_profile = ShippingProfile.objects.create(name="Manual Quote", type="manual")
    local = Route.objects.create(type=Scope.LOCAL, origin_country=s.tz, origin_city=s.dar,
                                 destination_country=s.tz, destination_city=s.dar)
    local.methods.set([s.rider, s.pickup])
    s.rider_rule = ShippingRule.objects.create(route=local, method=s.rider, applies_to="general",
                                               pricing_model="per_kg", rate=D("800"), currency="TZS",
                                               minimum_charge=D("3000"), eta_min_days=0, eta_max_days=1)
    ShippingRule.objects.create(route=local, method=s.pickup, applies_to="general", pricing_model="fixed",
                                rate=D("0"), currency="TZS", eta_min_days=0, eta_max_days=0)
    upcountry = Route.objects.create(type=Scope.LOCAL, origin_country=s.tz, origin_city=s.dar,
                                     destination_country=s.tz, destination_city=s.mwanza)
    upcountry.methods.set([s.bus])
    ShippingRule.objects.create(route=upcountry, method=s.bus, applies_to="general", pricing_model="manual",
                                currency="TZS", eta_min_days=1, eta_max_days=2)

    category = Category.objects.create(name="Phones")
    s.product = Product.objects.create(name="Galaxy A54", sku="A54", category=category, price=D("850000"),
                                       purchase_cost=D("700000"), status="active", location=s.warehouse,
                                       weight_kg=D("0.5"))
    s.variant = ProductVariant.objects.create(product=s.product, name="Default", sku="A54", is_default=True)
    s.cable = Product.objects.create(name="USB-C Cable", sku="CBL", category=category, price=D("15000"),
                                     status="active", location=s.warehouse, weight_kg=D("0.1"))
    s.cable_variant = ProductVariant.objects.create(product=s.cable, name="Default", sku="CBL", is_default=True)
    s.draft = Product.objects.create(name="Unreleased Phone", sku="DRAFT", category=category, price=D("1"),
                                     status="draft", location=s.warehouse)
    s.draft_variant = ProductVariant.objects.create(product=s.draft, name="Default", sku="DRAFT", is_default=True)
    s.admin = make_user(StaffLevel.TOP_ADMIN)
    inventory.receive(s.variant, s.warehouse, 5, user=s.admin)
    inventory.receive(s.cable_variant, s.warehouse, 50, user=s.admin)
    inventory.receive(s.draft_variant, s.warehouse, 5, user=s.admin)
    return s


def make_account(phone="255712345678", name="Neema Joseph", email=""):
    customer = Customer.objects.create(full_name=name, phone=f"+{phone}", email=email)
    account = CustomerAccount(customer=customer, phone=phone)
    account.set_password(PASSWORD)
    account.save()
    return account


def client_for_account(account) -> APIClient:
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {issue_tokens(account)['access']}")
    client.account = account
    return client


@pytest.fixture
def account(db):
    return make_account()


@pytest.fixture
def app(account):
    return client_for_account(account)


@pytest.fixture
def other_app(db):
    return client_for_account(make_account(phone="255765000111", name="Baraka Mushi"))


@pytest.fixture
def home(account, shop):
    return Address.objects.create(customer=account.customer, label="Home", line1="Plot 12, Mikocheni B",
                                  area="Mikocheni", city=shop.dar, is_default=True)


@pytest.fixture
def imported(shop):
    """A drone sourced from China (no stock in Tanzania), with China → Tanzania air freight at $12/kg (min $30)."""
    cn = Country.objects.get(iso2="CN")
    shop.air = ShippingMethod.objects.create(name="Air Freight", code="AIR", category="air")
    shop.sea = ShippingMethod.objects.create(name="Sea Freight", code="SEA", category="sea")
    route = Route.objects.create(type=Scope.INTERNATIONAL, origin_country=cn, destination_country=shop.tz)
    route.methods.set([shop.air, shop.sea])
    ShippingRule.objects.create(route=route, method=shop.air, applies_to="general", pricing_model="per_kg",
                                rate=D("12"), currency="USD", minimum_charge=D("30"), eta_min_days=7, eta_max_days=14)
    ShippingRule.objects.create(route=route, method=shop.sea, applies_to="general", pricing_model="manual",
                                currency="USD", eta_min_days=25, eta_max_days=40)
    ExchangeRate.objects.create(base_currency="USD", quote_currency="TZS", rate=D("2500"), effective_date=date(2026, 1, 1))
    shop.drone = Product.objects.create(name="Mini Drone", sku="DRN", category=shop.product.category, price=D("500000"),
                                        status="active", location_kind=LocationKind.TRANSIT, origin_country=cn,
                                        weight_kg=D("2"))
    shop.drone_variant = ProductVariant.objects.create(product=shop.drone, name="Default", sku="DRN", is_default=True)
    return shop


@pytest.fixture
def selcom(monkeypatch):
    """Mobile money available; opening a payment returns Selcom's page."""
    monkeypatch.setattr("apps.payments.services.available", lambda: True)
    started = []

    def start(order, phone):
        started.append(order.reference)
        return {"status": "pending", "message": "", "checkout_url": "https://pay.example/checkout", "reference": "S1"}

    monkeypatch.setattr("apps.storefront.views.shopping.start_payment", start)
    monkeypatch.setattr("apps.storefront.views.guest.start_payment", start)
    return started
