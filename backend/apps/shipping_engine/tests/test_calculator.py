"""RateCalculator behaviour: pricing models, weights, selection, overrides, currency."""
from datetime import date, timedelta
from decimal import Decimal as D

import pytest

from apps.shipping_engine.calculator import RateCalculationError, RateCalculator, Shipment
from apps.shipping_engine.constants import AppliesTo, PricingModel, Status
from apps.shipping_engine.models import ExchangeRate, Route, RuleOverride

TODAY = date(2026, 9, 25)


def ship(world, **kw) -> Shipment:
    defaults = dict(
        origin_country=world.cn,
        destination_country=world.tz,
        method=world.air,
        weight_kg=D("10"),
        quantity=1,
        on_date=TODAY,
    )
    defaults.update(kw)
    return Shipment(**defaults)


def local(world, **kw) -> Shipment:
    base = dict(origin_country=world.tz, origin_city=world.dar, destination_country=None,
                destination_city=world.mwanza, method=world.bus)
    return ship(world, **{**base, **kw})


def calc(world, shipment):
    world.settings.refresh_from_db()
    return RateCalculator(world.settings).calculate(shipment)


# 1. Per KG ------------------------------------------------------------------ #
def test_per_kg_uses_actual_weight_and_converts_to_tzs(world, make_rule):
    make_rule(rate=D("12"))
    r = calc(world, ship(world, weight_kg=D("10")))
    assert r["status"] == "priced"
    p = r["pricing"]
    assert p["chargeable_weight_kg"] == D("10.0") and p["weight_basis"] == "actual"
    assert p["amount"] == D("120.00") and p["source_currency"] == "USD"
    assert p["total"] == D("306000") and p["total_display"] == "TSh 306,000"
    assert r["summary"]["shipping_cost_display"] == "TSh 306,000"


def test_per_kg_weight_rounding_modes(world, make_rule):
    make_rule(rate=D("10"))
    assert calc(world, ship(world, weight_kg=D("10.2")))["pricing"]["chargeable_weight_kg"] == D("10.5")
    world.settings.weight_rounding = "one_kg"
    world.settings.save()
    assert calc(world, ship(world, weight_kg=D("10.2")))["pricing"]["chargeable_weight_kg"] == D("11")
    world.settings.weight_rounding = "exact"
    world.settings.save()
    assert calc(world, ship(world, weight_kg=D("10.2")))["pricing"]["amount"] == D("102.00")


# 2. Per CBM ----------------------------------------------------------------- #
def test_per_cbm(world, make_rule):
    make_rule(pricing_model=PricingModel.PER_CBM, rate=D("300"))
    r = calc(world, ship(world, length_cm=D("100"), width_cm=D("50"), height_cm=D("40"), quantity=2))
    assert r["measurements"]["cbm"] == D("0.4")
    assert r["pricing"]["units"] == D("0.4") and r["pricing"]["amount"] == D("120.00")


def test_per_cbm_requires_dimensions(world, make_rule):
    make_rule(pricing_model=PricingModel.PER_CBM, rate=D("300"))
    with pytest.raises(RateCalculationError) as exc:
        calc(world, ship(world))
    assert exc.value.field == "dimensions"


# 3 & 8. Per volumetric weight, volumetric > actual ------------------------- #
def test_per_vol_weight_uses_volumetric_when_greater(world, make_rule):
    make_rule(pricing_model=PricingModel.PER_VOL_WEIGHT, rate=D("10"), volumetric_divisor=5000)
    r = calc(world, ship(world, weight_kg=D("8"), length_cm=D("50"), width_cm=D("40"), height_cm=D("30")))
    p = r["pricing"]
    assert p["volumetric_weight_kg"] == D("12.000") and p["volumetric_divisor"] == 5000
    assert p["weight_basis"] == "volumetric" and p["chargeable_weight_kg"] == D("12.0")
    assert p["amount"] == D("120.00")
    assert any("volumetric 12 KG > actual 8 KG" in s["text"] for s in r["explanation"])


# 7. Actual > volumetric ----------------------------------------------------- #
def test_per_vol_weight_uses_actual_when_greater(world, make_rule):
    make_rule(pricing_model=PricingModel.PER_VOL_WEIGHT, rate=D("10"), volumetric_divisor=5000)
    r = calc(world, ship(world, weight_kg=D("20"), length_cm=D("50"), width_cm=D("40"), height_cm=D("30")))
    assert r["pricing"]["weight_basis"] == "actual"
    assert r["pricing"]["chargeable_weight_kg"] == D("20.0") and r["pricing"]["amount"] == D("200.00")


# 9. Every divisor, plus the global default --------------------------------- #
@pytest.mark.parametrize("divisor,expected", [(5000, "12"), (6000, "10"), (3000, "20"), (4000, "15")])
def test_each_volumetric_divisor(world, make_rule, divisor, expected):
    make_rule(pricing_model=PricingModel.PER_VOL_WEIGHT, rate=D("1"), volumetric_divisor=divisor)
    r = calc(world, ship(world, weight_kg=D("1"), length_cm=D("50"), width_cm=D("40"), height_cm=D("30")))
    assert r["pricing"]["volumetric_weight_kg"] == D(expected)
    assert r["pricing"]["volumetric_divisor"] == divisor


def test_rule_without_divisor_uses_global_default(world, make_rule):
    make_rule(pricing_model=PricingModel.PER_VOL_WEIGHT, rate=D("1"))
    assert calc(world, ship(world, weight_kg=D("1"), length_cm=D("50"), width_cm=D("40"), height_cm=D("30")))[
        "pricing"
    ]["volumetric_divisor"] == 5000
    world.settings.default_volumetric_divisor = 6000
    world.settings.save()
    r = calc(world, ship(world, weight_kg=D("1"), length_cm=D("50"), width_cm=D("40"), height_cm=D("30")))
    assert r["pricing"]["volumetric_divisor"] == 6000 and r["pricing"]["volumetric_weight_kg"] == D("10")


def test_manual_cbm_input_drives_volumetric_weight(world, make_rule):
    world.settings.cbm_method = "manual"
    world.settings.save()
    make_rule(pricing_model=PricingModel.PER_VOL_WEIGHT, rate=D("1"), volumetric_divisor=5000)
    r = calc(world, ship(world, weight_kg=D("1"), cbm=D("0.06")))
    assert r["measurements"]["cbm_source"] == "manual" and r["pricing"]["volumetric_weight_kg"] == D("12")


# 4. Per item ---------------------------------------------------------------- #
def test_per_item(world, make_rule):
    make_rule(pricing_model=PricingModel.PER_ITEM, rate=D("50"))
    r = calc(world, ship(world, quantity=3, weight_kg=D("1.5")))
    assert r["pricing"]["units"] == D("3") and r["pricing"]["amount"] == D("150.00")
    assert r["measurements"]["actual_weight_kg"] == D("4.5")


# 5. Fixed shipment ---------------------------------------------------------- #
def test_fixed_shipment_in_local_currency(world, make_rule):
    make_rule(route=world.dar_zone_c, method=world.bus, pricing_model=PricingModel.FIXED, rate=D("45000"), currency="TZS")
    r = calc(world, local(world, weight_kg=D("30")))
    assert r["pricing"]["amount"] == D("45000.00") and r["pricing"]["exchange_rate"] == D("1")
    assert r["pricing"]["total"] == D("45000")


# 6. Manual quote ------------------------------------------------------------ #
def test_manual_quote_rule(world, make_rule):
    make_rule(pricing_model=PricingModel.MANUAL, rate=None)
    r = calc(world, ship(world))
    assert r["status"] == "manual_quote" and r["pricing"] is None and r["summary"] is None
    assert r["rule"]["pricing_model"] == PricingModel.MANUAL


def test_manual_profile_forces_manual_quote(world, make_rule):
    make_rule(rate=D("12"))
    r = calc(world, ship(world, profile=world.manual_profile))
    assert r["status"] == "manual_quote"
    assert any("requires a manual quote" in s["text"] for s in r["explanation"])


# 10. Minimum charge --------------------------------------------------------- #
def test_minimum_charge_raises_small_shipments(world, make_rule):
    make_rule(rate=D("12"), minimum_charge=D("30"))
    r = calc(world, ship(world, weight_kg=D("1")))
    assert r["pricing"]["subtotal"] == D("12.00")
    assert r["pricing"]["amount"] == D("30") and r["pricing"]["minimum_applied"] is True
    big = calc(world, ship(world, weight_kg=D("5")))
    assert big["pricing"]["amount"] == D("60.00") and big["pricing"]["minimum_applied"] is False


def test_minimum_charge_can_be_disabled(world, make_rule):
    make_rule(rate=D("12"), minimum_charge=D("30"))
    world.settings.apply_minimum_charge = False
    world.settings.save()
    assert calc(world, ship(world, weight_kg=D("1")))["pricing"]["amount"] == D("12.00")


# 11. Specificity (same priority tier) --------------------------------------- #
def test_city_route_beats_zone_route(world, make_rule):
    city_route = Route.objects.create(type="local", origin_country=world.tz, origin_city=world.dar,
                                      destination_country=world.tz, destination_city=world.mwanza)
    city_route.methods.set([world.bus])
    make_rule(route=world.dar_zone_c, method=world.bus, rate=D("1500"), currency="TZS")
    city_rule = make_rule(route=city_route, method=world.bus, rate=D("1200"), currency="TZS")
    r = calc(world, local(world))
    assert r["rule"]["code"] == city_rule.code and r["route"]["label"] == "Dar es Salaam → Mwanza"
    assert r["considered"][0]["reason"].startswith("Same priority but less specific")


def test_narrower_conditions_win_within_same_route(world, make_rule):
    make_rule(rate=D("12"))
    heavy = make_rule(rate=D("9"), min_weight_kg=D("100"))
    light = make_rule(rate=D("15"), max_weight_kg=D("20"))
    assert calc(world, ship(world, weight_kg=D("5")))["rule"]["code"] == light.code
    assert calc(world, ship(world, weight_kg=D("150")))["rule"]["code"] == heavy.code
    r = calc(world, ship(world, weight_kg=D("50")))
    assert r["rule"]["rate"] == D("12")
    reasons = {c["code"]: c["reason"] for c in r["considered"]}
    assert "above the rule maximum" in reasons[light.code] and "below the rule minimum" in reasons[heavy.code]


# 12. Priority: product > profile > general ---------------------------------- #
def test_rule_priority_order(world, make_rule):
    general = make_rule(rate=D("12"))
    profile_rule = make_rule(applies_to=AppliesTo.PROFILE, profile=world.drone, pricing_model=PricingModel.PER_ITEM, rate=D("50"))
    product_rule = make_rule(applies_to=AppliesTo.PRODUCT, product_sku="DJI-MAVIC-3", pricing_model=PricingModel.PER_ITEM, rate=D("65"))

    r = calc(world, ship(world, profile=world.drone, product_sku="DJI-MAVIC-3"))
    assert r["rule"]["code"] == product_rule.code and r["rule"]["priority"] == 1
    assert [c["code"] for c in r["considered"]] == [profile_rule.code, general.code]

    r = calc(world, ship(world, profile=world.drone))
    assert r["rule"]["code"] == profile_rule.code and r["rule"]["priority"] == 2
    assert r["special_handling"] == ["Contains battery", "Special documentation"]
    assert r["requires_special_handling"] is True

    r = calc(world, ship(world, profile=world.electronics))
    assert r["rule"]["code"] == general.code and r["rule"]["priority"] == 3
    reasons = {c["code"]: c["reason"] for c in r["considered"]}
    assert "Drone" in reasons[profile_rule.code] and "DJI-MAVIC-3" in reasons[product_rule.code]


# 13. Overrides -------------------------------------------------------------- #
def _override(world, route, **kw):
    defaults = dict(route=route, pricing_model=PricingModel.PER_KG, rate=D("22"), currency="USD",
                    reason="Q4 promotion", start_date=TODAY - timedelta(days=1), end_date=TODAY + timedelta(days=30))
    defaults.update(kw)
    return RuleOverride.objects.create(**defaults)


def test_active_override_replaces_rate(world, make_rule):
    make_rule(applies_to=AppliesTo.PROFILE, profile=world.electronics, rate=D("25"))
    ov = _override(world, world.cn_tz, profile=world.electronics)
    r = calc(world, ship(world, profile=world.electronics))
    assert r["override"]["code"] == ov.code
    assert r["override"]["original_rate_display"] == "$25/KG" and r["override"]["override_rate_display"] == "$22/KG"
    assert r["pricing"]["amount"] == D("220.00")


def test_expired_inactive_or_other_profile_overrides_ignored(world, make_rule):
    make_rule(rate=D("25"))
    _override(world, world.cn_tz, start_date=TODAY - timedelta(days=30), end_date=TODAY - timedelta(days=1))
    _override(world, world.cn_tz, status=Status.INACTIVE)
    _override(world, world.cn_tz, profile=world.drone)
    r = calc(world, ship(world, profile=world.electronics))
    assert r["override"] is None and r["pricing"]["amount"] == D("250.00")


def test_destination_override_only_for_that_destination_and_can_turn_manual_into_fixed(world, make_rule):
    make_rule(route=world.dar_zone_c, method=world.bus, pricing_model=PricingModel.MANUAL, rate=None, currency="TZS")
    ov = _override(world, world.dar_zone_c, destination_region=world.kagera, pricing_model=PricingModel.FIXED,
                   rate=D("45000"), currency="TZS", reason="Ferry agreement")
    bukoba = calc(world, local(world, destination_city=world.bukoba))
    assert bukoba["status"] == "priced" and bukoba["override"]["code"] == ov.code
    assert bukoba["pricing"]["total"] == D("45000")
    mwanza = calc(world, local(world))
    assert mwanza["status"] == "manual_quote" and mwanza["override"] is None


def test_most_specific_override_wins(world, make_rule):
    make_rule(route=world.dar_zone_c, method=world.bus, rate=D("1500"), currency="TZS")
    _override(world, world.dar_zone_c, rate=D("1800"), currency="TZS")
    city_ov = _override(world, world.dar_zone_c, destination_city=world.bukoba, rate=D("2000"), currency="TZS")
    assert calc(world, local(world, destination_city=world.bukoba))["override"]["code"] == city_ov.code


# 14. No matching rule / route (fallback setting) --------------------------- #
@pytest.mark.parametrize("fallback,status", [("manual_quote", "manual_quote"), ("block", "blocked"), ("error", "no_rule")])
def test_no_matching_rule_follows_fallback(world, fallback, status):
    world.settings.no_rule_fallback = fallback
    world.settings.save()
    r = calc(world, ship(world))
    assert r["status"] == status and r["rule"] is None
    assert any(not s["ok"] and "No active rule" in s["text"] for s in r["explanation"])


def test_no_route_follows_fallback(world):
    r = calc(world, ship(world, origin_country=world.ae))
    assert r["status"] == "manual_quote"
    assert any("No active route" in s["text"] for s in r["explanation"])


# 15. Inactive rules / routes ------------------------------------------------ #
def test_inactive_rules_and_routes_are_ignored(world, make_rule):
    general = make_rule(rate=D("12"))
    make_rule(applies_to=AppliesTo.PROFILE, profile=world.electronics, rate=D("25"), status=Status.INACTIVE)
    r = calc(world, ship(world, profile=world.electronics))
    assert r["rule"]["code"] == general.code
    assert all(c["code"] != general.code for c in r["considered"])

    world.cn_tz.status = Status.INACTIVE
    world.cn_tz.save()
    assert calc(world, ship(world))["rule"] is None


# 16. Currency conversion ---------------------------------------------------- #
def test_currency_conversion_uses_latest_rate_on_date(world, make_rule):
    make_rule(rate=D("10"))
    ExchangeRate.objects.create(base_currency="USD", quote_currency="TZS", rate=D("2600"), effective_date=date(2026, 9, 1))
    ExchangeRate.objects.create(base_currency="USD", quote_currency="TZS", rate=D("2700"), effective_date=date(2026, 12, 1))
    r = calc(world, ship(world, weight_kg=D("1")))
    assert r["pricing"]["exchange_rate"] == D("2600") and r["pricing"]["total"] == D("26000")
    assert r["pricing"]["target_currency"] == "TZS"


def test_currency_conversion_via_inverse_rate(world, make_rule):
    make_rule(rate=D("100"), currency="AED")
    ExchangeRate.objects.create(base_currency="TZS", quote_currency="AED", rate=D("0.0014"), effective_date=date(2026, 1, 1))
    r = calc(world, ship(world, weight_kg=D("1")))
    assert r["pricing"]["exchange_rate"] == D("714.285714")
    assert r["pricing"]["total"] == D("71429")


def test_missing_exchange_rate_is_an_error(world, make_rule):
    make_rule(rate=D("100"), currency="CNY")
    with pytest.raises(RateCalculationError) as exc:
        calc(world, ship(world, weight_kg=D("1")))
    assert exc.value.code == "missing_exchange_rate"


# 17. Route selection -------------------------------------------------------- #
def test_destination_resolves_through_region_to_zone(world, make_rule):
    make_rule(route=world.dar_zone_c, method=world.bus, rate=D("1500"), currency="TZS")
    r = calc(world, local(world, destination_city=world.bukoba, weight_kg=D("2")))
    assert r["route"]["label"] == "Dar es Salaam → Zone C — Long Distance"
    assert any("Bukoba → Zone C" in s["text"] for s in r["explanation"])
    assert r["pricing"]["total"] == D("3000")


def test_explicit_zone_destination_and_wrong_origin(world, make_rule):
    make_rule(route=world.dar_zone_c, method=world.bus, rate=D("1500"), currency="TZS")
    r = calc(world, ship(world, origin_country=world.tz, origin_city=world.dar, destination_country=None,
                         destination_zone=world.zone_c, method=world.bus))
    assert r["status"] == "priced"
    other = calc(world, local(world, origin_city=world.arusha))
    assert other["status"] == "manual_quote" and other["route"] is None


# 18. Shipping method selection --------------------------------------------- #
def test_method_selects_its_own_rule(world, make_rule):
    make_rule(route=world.dar_zone_c, method=world.bus, rate=D("1500"), currency="TZS")
    rider_rule = make_rule(route=world.dar_zone_c, method=world.rider, rate=D("800"), currency="TZS")
    r = calc(world, local(world, method=world.rider, weight_kg=D("2")))
    assert r["rule"]["code"] == rider_rule.code and r["method"]["code"] == "RIDER"


def test_method_not_on_route_and_method_weight_limit(world, make_rule):
    make_rule(route=world.dar_zone_c, method=world.bus, rate=D("1500"), currency="TZS")
    r = calc(world, local(world, method=world.air))
    assert r["status"] == "manual_quote"
    assert any("not available on this route" in s["text"] and "Bus Cargo" in s["text"] for s in r["explanation"])
    heavy = calc(world, local(world, weight_kg=D("60")))
    assert heavy["status"] == "blocked" and "at most 50 KG" in heavy["message"]


# 19. Invalid input ---------------------------------------------------------- #
@pytest.mark.parametrize(
    "changes,field",
    [
        ({"weight_kg": D("0")}, "weight_kg"),
        ({"quantity": 0}, "quantity"),
        ({"destination_country": None}, "destination"),
        ({"length_cm": D("10")}, "dimensions"),
        ({"origin_city": "mwanza"}, "origin_city"),
    ],
)
def test_invalid_shipments_are_rejected(world, changes, field):
    if changes.get("origin_city") == "mwanza":
        changes["origin_city"] = world.mwanza  # a Tanzanian city with origin China
    with pytest.raises(RateCalculationError) as exc:
        calc(world, ship(world, **changes))
    assert exc.value.field == field


def test_inactive_method_still_prices_existing_routes_but_inactive_profile_rejected(world, make_rule):
    make_rule(rate=D("12"))
    world.air.status = Status.INACTIVE
    world.air.save()
    r = calc(world, ship(world))
    assert r["status"] == "priced"
    assert any("Air Cargo is inactive" in s["text"] for s in r["explanation"])
    world.electronics.status = Status.INACTIVE
    world.electronics.save()
    with pytest.raises(RateCalculationError):
        calc(world, ship(world, profile=world.electronics))
