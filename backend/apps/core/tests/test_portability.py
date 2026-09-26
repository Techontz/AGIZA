"""
Behaviour that must be identical on PostgreSQL and MySQL: list fields,
uniqueness rules expressed without partial indexes / NULLS NOT DISTINCT, and
local-day date filtering without database time-zone tables.
"""
from datetime import date, datetime, time, timedelta

import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.catalog.models import Category, Product, ProductImage, ProductVariant
from apps.core.dates import local_day_bounds
from apps.core.fields import StringListFormField
from apps.locations.models import City, Country
from apps.shipping_engine.models import Carrier, Route, ShippingProfile, Zone, ZoneDestination

pytestmark = pytest.mark.django_db


def raises_integrity(fn):
    with pytest.raises(IntegrityError), transaction.atomic():
        fn()


# --------------------------------------------------------------------------- #
# List fields
# --------------------------------------------------------------------------- #
def test_list_fields_round_trip_in_order():
    carrier = Carrier.objects.create(name="Portable Cargo", type="international_air",
                                     specializations=["Standard Goods", "Électronique", "Drones"],
                                     services=["sea_cargo", "air_cargo"])
    profile = ShippingProfile.objects.create(name="Portable Profile", handling=["fragile", "contains_battery"])
    carrier.refresh_from_db()
    profile.refresh_from_db()
    assert carrier.specializations == ["Standard Goods", "Électronique", "Drones"]
    assert carrier.services == ["sea_cargo", "air_cargo"]
    assert profile.handling == ["fragile", "contains_battery"]
    assert Carrier.objects.create(name="Empty Lists", type="international_air").specializations == []


def test_list_field_search_matches_items():
    Carrier.objects.create(name="Search Me", type="international_air", specializations=["Oversized", "Drones"])
    assert list(Carrier.objects.filter(specializations__icontains="drones").values_list("name", flat=True)) == ["Search Me"]


def test_list_items_are_validated_like_the_old_array_field():
    profile = ShippingProfile(name="Bad Handling", handling=["fragile", "teleport"])
    with pytest.raises(ValidationError, match="not a valid choice"):
        profile.full_clean()
    carrier = Carrier(name="Too Long", type="international_air", specializations=["x" * 61])
    with pytest.raises(ValidationError, match="more than 60"):
        carrier.full_clean()
    carrier.specializations = ["x" * 60]
    carrier.full_clean()


def test_admin_form_field_uses_comma_separated_input():
    field = StringListFormField(required=False)
    assert field.clean(" fragile, contains_battery ,") == ["fragile", "contains_battery"]
    assert field.prepare_value(["a", "b"]) == "a,b"
    assert field.clean("") == []


# --------------------------------------------------------------------------- #
# Uniqueness rules (formerly partial indexes / NULLS NOT DISTINCT)
# --------------------------------------------------------------------------- #
def test_route_unique_even_when_parts_are_empty():
    tz, cn = Country.objects.get(iso2="TZ"), Country.objects.get(iso2="CN")
    Route.objects.create(type="international", origin_country=cn, destination_country=tz)
    raises_integrity(lambda: Route.objects.create(type="international", origin_country=cn, destination_country=tz))
    Route.objects.create(type="international", origin_country=tz, destination_country=cn)  # reverse direction is fine


def test_a_place_belongs_to_one_zone_only():
    dar = City.objects.get(name="Dar es Salaam")
    a = Zone.objects.create(name="Portable A", type="local")
    b = Zone.objects.create(name="Portable B", type="local")
    ZoneDestination.objects.create(zone=a, city=dar)
    raises_integrity(lambda: ZoneDestination.objects.create(zone=b, city=dar))
    ZoneDestination.objects.create(zone=b, country=Country.objects.get(iso2="KE"))  # empty city columns don't clash
    ZoneDestination.objects.create(zone=a, country=Country.objects.get(iso2="UG"))


def test_top_level_category_names_are_unique_but_subcategories_may_repeat():
    top = Category.objects.create(name="Portable Phones")
    raises_integrity(lambda: Category.objects.create(name="Portable Phones"))
    other = Category.objects.create(name="Portable Other")
    Category.objects.create(name="Accessories", parent=top)
    Category.objects.create(name="Accessories", parent=other)


def test_one_default_variant_and_one_primary_image_per_product():
    product = Product.objects.create(name="Portable Phone", sku="PORT-1", price=1000, category=Category.objects.create(name="Port"))
    ProductVariant.objects.create(product=product, name="A", sku="PORT-1-A", is_default=True)
    ProductVariant.objects.create(product=product, name="B", sku="PORT-1-B", is_default=False)
    ProductVariant.objects.create(product=product, name="C", sku="PORT-1-C", is_default=False)
    raises_integrity(lambda: ProductVariant.objects.create(product=product, name="D", sku="PORT-1-D", is_default=True))
    ProductImage.objects.create(product=product, is_primary=True)
    ProductImage.objects.create(product=product, is_primary=False)
    raises_integrity(lambda: ProductImage.objects.create(product=product, is_primary=True))


# --------------------------------------------------------------------------- #
# Dates
# --------------------------------------------------------------------------- #
def test_local_day_bounds_match_the_local_calendar_day():
    start, end = local_day_bounds(date(2026, 9, 26))
    local = timezone.get_current_timezone()
    assert start == datetime(2026, 9, 26, 0, 0, tzinfo=local)
    assert end - start == timedelta(days=1)
    # 23:30 local on the 25th is 20:30 UTC on the 25th: not "the 26th".
    late = timezone.make_aware(datetime.combine(date(2026, 9, 25), time(23, 30)))
    assert not (start <= late < end)
    early = timezone.make_aware(datetime.combine(date(2026, 9, 26), time(0, 15)))  # 21:15 UTC on the 25th
    assert start <= early < end
