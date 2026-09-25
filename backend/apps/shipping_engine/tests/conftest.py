"""Shared Shipping Engine fixtures: a small but realistic configuration."""
from datetime import date
from decimal import Decimal as D

import pytest

from apps.locations.models import City, Country, Region
from apps.shipping_engine.constants import AppliesTo, PricingModel, Scope, Status
from apps.shipping_engine.models import (
    EngineSettings,
    ExchangeRate,
    Route,
    ShippingMethod,
    ShippingProfile,
    ShippingRule,
    Zone,
    ZoneDestination,
)


class World:
    """Namespace of the objects created by the `world` fixture."""


@pytest.fixture
def world(db):
    w = World()
    w.tz = Country.objects.get(iso2="TZ")
    w.cn = Country.objects.get(iso2="CN")
    w.ae = Country.objects.get(iso2="AE")
    w.dar = City.objects.get(name="Dar es Salaam")
    w.mwanza = City.objects.get(name="Mwanza")
    w.arusha = City.objects.get(name="Arusha")
    w.bukoba = City.objects.get(name="Bukoba")
    w.kibaha = City.objects.get(name="Kibaha")
    w.kagera = Region.objects.get(name="Kagera", country=w.tz)

    w.air = ShippingMethod.objects.create(name="Air Cargo", code="AIR", category="air")
    w.sea = ShippingMethod.objects.create(name="Sea Freight", code="SEA", category="sea")
    w.bus = ShippingMethod.objects.create(name="Bus Cargo", code="BUS", category="land", max_weight_kg=D("50"))
    w.rider = ShippingMethod.objects.create(name="Rider Delivery", code="RIDER", category="local", max_weight_kg=D("15"))

    w.electronics = ShippingProfile.objects.create(name="Electronics", type="specialized", handling=["fragile"])
    w.drone = ShippingProfile.objects.create(
        name="Drone — Special Air Cargo", type="restricted", handling=["contains_battery", "special_documentation"]
    )
    w.manual_profile = ShippingProfile.objects.create(name="Manual Quote", type="manual")

    w.zone_c = Zone.objects.create(name="Zone C — Long Distance", type=Scope.LOCAL)
    ZoneDestination.objects.create(zone=w.zone_c, city=w.mwanza)
    ZoneDestination.objects.create(zone=w.zone_c, region=w.kagera)
    w.zone_a = Zone.objects.create(name="Zone A — Short Distance", type=Scope.LOCAL)
    ZoneDestination.objects.create(zone=w.zone_a, city=w.kibaha)

    w.cn_tz = Route.objects.create(type=Scope.INTERNATIONAL, origin_country=w.cn, destination_country=w.tz)
    w.cn_tz.methods.set([w.air, w.sea])
    w.dar_zone_c = Route.objects.create(type=Scope.LOCAL, origin_country=w.tz, origin_city=w.dar, destination_zone=w.zone_c)
    w.dar_zone_c.methods.set([w.bus, w.rider])

    ExchangeRate.objects.create(base_currency="USD", quote_currency="TZS", rate=D("2550"), effective_date=date(2026, 1, 1))
    w.settings = EngineSettings.load()
    return w


@pytest.fixture
def make_rule(world):
    def _make(route=None, method=None, **kw):
        route = route or world.cn_tz
        defaults = {
            "route": route,
            "method": method or world.air,
            "applies_to": AppliesTo.GENERAL,
            "pricing_model": PricingModel.PER_KG,
            "rate": D("12"),
            "currency": "USD" if route.type == Scope.INTERNATIONAL else "TZS",
            "status": Status.ACTIVE,
        }
        defaults.update(kw)
        return ShippingRule.objects.create(**defaults)

    return _make
