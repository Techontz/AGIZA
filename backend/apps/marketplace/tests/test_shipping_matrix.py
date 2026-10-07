"""
Delivery pricing across the cases checkout must handle, all from the Shipping Engine: local only,
imported only, mixed, several sellers, several import origins, air / sea / pickup / rider / bus,
and what happens with a missing route, a missing weight or a disabled rule.
"""
from decimal import Decimal as D

import pytest

from apps.catalog.models import LocationKind, Product, ProductVariant
from apps.locations.models import Country
from apps.shipping_engine.constants import Scope
from apps.shipping_engine.models import Route, ShippingRule
from apps.storefront.tests.conftest import imported  # noqa: F401  (fixture)

from .conftest import APP

pytestmark = pytest.mark.django_db


def fill(client, lines):
    for variant, qty in lines:
        res = client.post(f"{APP}/cart/items/", {"variant": variant.pk, "quantity": qty}, format="json")
        assert res.status_code == 201, res.json()


def preview(client, address, **extra):
    return client.post(f"{APP}/checkout/preview/", {"address": address.pk, **extra}, format="json").json()


def options(quote, leg="shipping_options"):
    return {o["code"]: o for o in quote[leg] if o["available"]}


def test_local_only_keeps_the_dar_rider_minimum_and_free_pickup(app, home, shop):
    fill(app, [(shop.cable_variant, 1)])
    quote = preview(app, home)
    local = options(quote)
    assert local["RIDER"]["cost"] == "3000.00" and local["PICKUP"]["cost"] == "0.00"  # 3,000 minimum unchanged
    assert quote["import_options"] == [] and quote["prepayment_required"] is False and quote["customs"] is None
    assert [m["code"] for m in quote["payment_methods"]] == ["pay_later"]


def test_imported_only_air_with_rider_or_pickup(app, home, imported):  # noqa: F811
    fill(app, [(imported.drone_variant, 1)])
    quote = preview(app, home, shipping_method=imported.rider.pk)
    assert options(quote, "import_options")["AIR"]["cost"] == "75000.00"
    assert quote["delivery_fee"] == "3000.00" and quote["shipping_fee"] == "78000.00"
    quote = preview(app, home, shipping_method=imported.pickup.pk)
    assert quote["delivery_fee"] == "0.00" and quote["shipping_fee"] == "75000.00"


def test_sea_freight_is_priced_per_cbm_when_dimensions_are_known(app, home, imported):  # noqa: F811
    rule = ShippingRule.objects.get(method=imported.sea)
    rule.pricing_model, rule.rate, rule.minimum_charge = "per_cbm", D("280"), D("50")
    rule.save()
    Product.objects.filter(pk=imported.drone.pk).update(length_cm=D("100"), width_cm=D("100"), height_cm=D("50"))
    fill(app, [(imported.drone_variant, 1)])
    quote = preview(app, home, import_method=imported.sea.pk)
    sea = options(quote, "import_options")["SEA"]
    assert sea["cost"] == "350000.00"  # 0.5 m³ × $280 = $140 × 2,500
    assert quote["selected_import_method"] == imported.sea.pk and quote["import_fee"] == "350000.00"


def test_mixed_cart_with_several_sellers(app, home, imported, vendor_a):  # noqa: F811
    fill(app, [(imported.cable_variant, 1), (vendor_a.variant, 1), (imported.drone_variant, 1)])
    quote = preview(app, home, shipping_method=imported.rider.pk)
    rider = options(quote)["RIDER"]
    # AGIZA's warehouse (with the drone once it arrives) and vendor A's shop: two rider pickups.
    assert sorted((s["label"], s["cost"]) for s in rider["shipments"]) == [
        ("From AGIZA, Dar es Salaam (with your imported items)", "3000.00"),
        ("From Vendor A Electronics, Dar es Salaam", "3000.00"),
    ]
    assert quote["import_fee"] == "75000.00" and quote["shipping_fee"] == "81000.00"
    assert quote["prepayment_required"] is True and quote["can_place_order"] is False  # mobile money not set up


def test_several_import_origins_are_separate_shipments(app, home, imported):  # noqa: F811
    ae = Country.objects.get(iso2="AE")
    route = Route.objects.create(type=Scope.INTERNATIONAL, origin_country=ae, destination_country=imported.tz)
    route.methods.set([imported.air])
    ShippingRule.objects.create(route=route, method=imported.air, applies_to="general", pricing_model="per_kg",
                                rate=D("18"), currency="USD", minimum_charge=D("40"), eta_min_days=5, eta_max_days=10)
    tv = Product.objects.create(name="QLED TV", sku="TV65", category=imported.product.category, price=D("2000000"),
                                status="active", location_kind=LocationKind.TRANSIT, origin_country=ae,
                                weight_kg=D("20"))
    tv_variant = ProductVariant.objects.create(product=tv, name="Default", sku="TV65", is_default=True)
    fill(app, [(imported.drone_variant, 1), (tv_variant, 1)])
    air = options(preview(app, home), "import_options")["AIR"]
    assert sorted((s["label"], s["cost"]) for s in air["shipments"]) == [
        ("From China", "75000.00"), ("From United Arab Emirates", "900000.00")]  # 20 kg × $18 × 2,500
    assert air["cost"] == "975000.00" and air["estimated_delivery"] == "7–14 days"


def test_bus_delivery_upcountry_and_a_manual_quote_route(app, imported, account):  # noqa: F811
    from apps.parties.models import Address

    mwanza = Address.objects.create(customer=account.customer, line1="Plot 3", city=imported.mwanza)
    fill(app, [(imported.cable_variant, 1)])
    quote = preview(app, mwanza)
    bus = next(o for o in quote["shipping_options"] if o["code"] == "BUS")
    # The fixture's Dar → Mwanza rule is manual: nothing can be priced, so the order may be placed and
    # AGIZA confirms the delivery cost before the customer pays.
    assert bus["manual_quote"] is True and "confirmed by AGIZA" in bus["message"]
    assert quote["can_place_order"] is True and quote["delivery_fee_pending"] is True
    ShippingRule.objects.filter(method=imported.bus).update(pricing_model="per_kg", rate=D("1200"))
    assert options(preview(app, mwanza))["BUS"]["cost"] == "600.00"  # 0.1 kg rounded up to 0.5 kg × 1,200


def test_missing_route_missing_weight_and_disabled_rule(app, home, imported):  # noqa: F811
    fill(app, [(imported.drone_variant, 1)])
    ShippingRule.objects.filter(method=imported.air).update(status="inactive")
    quote = preview(app, home)
    assert options(quote, "import_options") == {} and quote["can_place_order"] is False  # disabled rule
    ShippingRule.objects.filter(method=imported.air).update(status="active")
    Route.objects.filter(origin_country__iso2="CN").update(status="inactive")
    quote = preview(app, home)
    assert options(quote, "import_options") == {} and any("imported items" in i for i in quote["issues"])
    Route.objects.filter(origin_country__iso2="CN").update(status="active")
    Product.objects.filter(pk=imported.drone.pk).update(weight_kg=None)
    quote = preview(app, home)
    air = next(o for o in quote["import_options"] if o["code"] == "AIR")
    assert air["available"] is False and "can't be calculated" in air["message"]  # missing weight
    assert quote["can_place_order"] is False
