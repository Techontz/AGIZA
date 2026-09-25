"""Shipping Engine REST API: CRUD, validation, audit, filters, permissions, calculate."""
from datetime import date, timedelta
from decimal import Decimal as D

import pytest

from apps.accounts.constants import StaffLevel
from apps.accounts.models import AuditLog
from apps.shipping_engine.models import EngineSettings, ExchangeRate, ShippingRule

BASE = "/api/shipping-engine"
pytestmark = pytest.mark.django_db


@pytest.fixture
def admin(client_for):
    return client_for(StaffLevel.ADMIN_L2)


def err(res):
    return res.json()["error"]


# --------------------------------------------------------------------------- #
# Zones
# --------------------------------------------------------------------------- #
def test_zone_create_with_mixed_destinations_and_clash(admin, world):
    res = admin.post(f"{BASE}/zones/", {
        "name": "Zone D — Remote", "type": "local", "description": "Remote regions",
        "destinations": [{"kind": "city", "ref_id": world.arusha.id}, {"kind": "region", "ref_id": world.kagera.id + 1}],
        "status": "active",
    }, format="json")
    assert res.status_code == 201, res.json()
    body = res.json()
    assert {d["kind"] for d in body["destinations"]} == {"city", "region"}

    clash = admin.post(f"{BASE}/zones/", {
        "name": "Another", "type": "local", "destinations": [{"kind": "city", "ref_id": world.mwanza.id}],
    }, format="json")
    assert clash.status_code == 400
    assert "already belongs to Zone C" in err(clash)["message"]

    wrong_kind = admin.post(f"{BASE}/zones/", {
        "name": "EAC", "type": "international", "destinations": [{"kind": "city", "ref_id": world.dar.id}],
    }, format="json")
    assert wrong_kind.status_code == 400


def test_zone_list_counts_and_search(admin, world, make_rule):
    make_rule(route=world.dar_zone_c, method=world.bus, currency="TZS", rate=D("1500"))
    zones = admin.get(f"{BASE}/zones/?search=bukoba").json()
    # Bukoba is in Kagera region (a zone C member); search matches member names only.
    assert zones["count"] == 0
    zones = admin.get(f"{BASE}/zones/?search=kagera").json()
    assert zones["count"] == 1 and zones["results"][0]["rules_count"] == 1 and zones["results"][0]["routes_count"] == 1


def test_zone_in_use_cannot_be_deleted(admin, world):
    res = admin.delete(f"{BASE}/zones/{world.zone_c.id}/")
    assert res.status_code == 409 and err(res)["code"] == "conflict"
    assert admin.delete(f"{BASE}/zones/{world.zone_a.id}/").status_code == 204


# --------------------------------------------------------------------------- #
# Routes
# --------------------------------------------------------------------------- #
def test_route_type_is_derived_and_validated(admin, world):
    res = admin.post(f"{BASE}/routes/", {
        "origin_country": world.tz.id, "origin_city": world.dar.id,
        "destination_city": world.arusha.id, "methods": [world.bus.id],
    }, format="json")
    assert res.status_code == 201, res.json()
    assert res.json()["type"] == "local" and res.json()["label"] == "Dar es Salaam → Arusha"
    assert res.json()["destination_kind"] == "city"

    dup = admin.post(f"{BASE}/routes/", {
        "origin_country": world.tz.id, "origin_city": world.dar.id,
        "destination_city": world.arusha.id, "methods": [world.bus.id],
    }, format="json")
    assert dup.status_code == 400 and "already exists" in err(dup)["message"]

    no_city = admin.post(f"{BASE}/routes/", {
        "origin_country": world.tz.id, "destination_city": world.arusha.id, "methods": [world.bus.id],
    }, format="json")
    assert no_city.status_code == 400 and "origin_city" in err(no_city)["details"]

    intl = admin.post(f"{BASE}/routes/", {
        "origin_country": world.ae.id, "destination_country": world.tz.id, "methods": [world.air.id],
    }, format="json")
    assert intl.status_code == 201 and intl.json()["type"] == "international"


def test_route_list_filters_rule_counts_and_eta(admin, world, make_rule):
    make_rule(eta_min_days=7, eta_max_days=14)
    make_rule(method=world.sea, eta_min_days=25, eta_max_days=40)
    res = admin.get(f"{BASE}/routes/?type=international").json()
    assert res["count"] == 1
    row = res["results"][0]
    assert row["rules_count"] == 2 and row["estimated_delivery"] == "7–40 days"
    assert set(row["method_names"]) == {"Air Cargo", "Sea Freight"}
    assert admin.get(f"{BASE}/routes/?type=local&search=zone").json()["count"] == 1


# --------------------------------------------------------------------------- #
# Rules
# --------------------------------------------------------------------------- #
def rule_payload(world, **kw):
    data = {
        "route": world.cn_tz.id, "method": world.air.id, "applies_to": "general",
        "pricing_model": "per_kg", "rate": "12", "minimum_charge": "30",
        "eta_min_days": 7, "eta_max_days": 14, "status": "active",
    }
    data.update(kw)
    return data


def test_rule_create_defaults_currency_and_formats(admin, world):
    res = admin.post(f"{BASE}/rules/", rule_payload(world), format="json")
    assert res.status_code == 201, res.json()
    body = res.json()
    assert body["code"].startswith("SR-") and body["currency"] == "USD"
    assert body["rate_display"] == "$12/KG" and body["minimum_charge_display"] == "$30.00"
    assert body["estimated_delivery"] == "7–14 days" and body["priority"] == 3
    assert AuditLog.objects.filter(action="create", object_id=str(body["id"])).exists()


def test_rule_validation(admin, world):
    bad_method = admin.post(f"{BASE}/rules/", rule_payload(world, method=world.bus.id), format="json")
    assert bad_method.status_code == 400 and "not offered" in err(bad_method)["details"]["method"][0]

    no_rate = admin.post(f"{BASE}/rules/", rule_payload(world, rate=None), format="json")
    assert no_rate.status_code == 400 and "rate" in err(no_rate)["details"]

    no_profile = admin.post(f"{BASE}/rules/", rule_payload(world, applies_to="profile"), format="json")
    assert no_profile.status_code == 400 and "profile" in err(no_profile)["details"]

    bad_range = admin.post(f"{BASE}/rules/", rule_payload(world, min_weight_kg="20", max_weight_kg="5"), format="json")
    assert bad_range.status_code == 400

    manual = admin.post(f"{BASE}/rules/", rule_payload(world, pricing_model="manual", rate="99", volumetric_divisor=5000),
                        format="json")
    assert manual.status_code == 201
    assert manual.json()["rate"] is None and manual.json()["rate_display"] == "Manual"

    vol = admin.post(f"{BASE}/rules/", rule_payload(world, method=world.sea.id, pricing_model="per_vol_weight",
                                                     volumetric_divisor=6000), format="json")
    assert vol.status_code == 201 and vol.json()["volumetric_divisor"] == 6000

    bad_divisor = admin.post(f"{BASE}/rules/", rule_payload(world, method=world.sea.id, min_weight_kg="1",
                                                            pricing_model="per_vol_weight", volumetric_divisor=7000),
                             format="json")
    assert bad_divisor.status_code == 400


def test_duplicate_active_rule_rejected(admin, world):
    assert admin.post(f"{BASE}/rules/", rule_payload(world), format="json").status_code == 201
    dup = admin.post(f"{BASE}/rules/", rule_payload(world, rate="15"), format="json")
    assert dup.status_code == 400 and "already exists" in err(dup)["message"]
    # An inactive copy is allowed (e.g. a prepared future price).
    assert admin.post(f"{BASE}/rules/", rule_payload(world, rate="15", status="inactive"), format="json").status_code == 201


def test_rule_filters_search_and_pagination(admin, world, make_rule):
    for i in range(25):
        make_rule(rate=D("10") + i, min_weight_kg=D(i), max_weight_kg=D(i) + D("0.5"))
    make_rule(route=world.dar_zone_c, method=world.bus, applies_to="profile", profile=world.electronics, rate=D("1500"))
    assert admin.get(f"{BASE}/rules/?type=local").json()["count"] == 1
    page = admin.get(f"{BASE}/rules/?type=international&page_size=10&page=3").json()
    assert page["count"] == 25 and len(page["results"]) == 5
    assert admin.get(f"{BASE}/rules/?search=electronics").json()["count"] == 1
    assert admin.get(f"{BASE}/rules/?applies_to=profile").json()["count"] == 1


def test_rule_deactivate_and_update_is_audited(admin, world, make_rule):
    rule = make_rule()
    res = admin.patch(f"{BASE}/rules/{rule.id}/", {"status": "inactive"}, format="json")
    assert res.status_code == 200
    log = AuditLog.objects.filter(action="update", object_id=str(rule.id)).latest("created_at")
    assert log.changes["status"] == ["active", "inactive"]


# --------------------------------------------------------------------------- #
# Overrides
# --------------------------------------------------------------------------- #
def test_override_destination_must_be_inside_route(admin, world, make_rule):
    make_rule(route=world.dar_zone_c, method=world.bus, rate=D("1500"), currency="TZS")
    today = date.today()
    ok = admin.post(f"{BASE}/overrides/", {
        "route": world.dar_zone_c.id, "destination_region": world.kagera.id, "pricing_model": "per_kg",
        "rate": "2000", "reason": "Carrier price increase", "start_date": str(today),
        "end_date": str(today + timedelta(days=10)),
    }, format="json")
    assert ok.status_code == 201, ok.json()
    body = ok.json()
    assert body["currency"] == "TZS" and body["destination_label"] == "Kagera"
    assert body["original_rule"]["rate_display"] == "TSh 1,500/KG" and body["override_rate_display"] == "TSh 2,000/KG"
    assert body["is_current"] is True

    outside = admin.post(f"{BASE}/overrides/", {
        "route": world.dar_zone_c.id, "destination_city": world.arusha.id, "pricing_model": "per_kg",
        "rate": "2000", "reason": "x", "start_date": str(today), "end_date": str(today),
    }, format="json")
    assert outside.status_code == 400 and "not in Zone C" in err(outside)["message"]

    bad_dates = admin.post(f"{BASE}/overrides/", {
        "route": world.dar_zone_c.id, "pricing_model": "per_kg", "rate": "2000", "reason": "x",
        "start_date": str(today), "end_date": str(today - timedelta(days=1)),
    }, format="json")
    assert bad_dates.status_code == 400

    manual = admin.post(f"{BASE}/overrides/", {
        "route": world.dar_zone_c.id, "pricing_model": "manual", "rate": "1", "reason": "x",
        "start_date": str(today), "end_date": str(today),
    }, format="json")
    assert manual.status_code == 400

    assert admin.get(f"{BASE}/overrides/?current=true").json()["count"] == 1


# --------------------------------------------------------------------------- #
# Methods, profiles, carriers
# --------------------------------------------------------------------------- #
def test_methods_crud_stats_and_code_uniqueness(admin, world):
    res = admin.post(f"{BASE}/methods/", {"name": "Courier", "code": "courier", "category": "air"}, format="json")
    assert res.status_code == 201 and res.json()["code"] == "COURIER"
    dup = admin.post(f"{BASE}/methods/", {"name": "Courier 2", "code": "COURIER", "category": "air"}, format="json")
    assert dup.status_code == 400
    stats = admin.get(f"{BASE}/methods/stats/").json()
    assert stats == {"air": 2, "sea": 1, "land": 1, "local": 1}
    assert admin.delete(f"{BASE}/methods/{world.bus.id}/").status_code == 409  # used by a route
    assert admin.delete(f"{BASE}/methods/{res.json()['id']}/").status_code == 204


def test_profile_duplicate_and_handling_validation(admin, world):
    res = admin.post(f"{BASE}/profiles/{world.drone.id}/duplicate/")
    assert res.status_code == 201
    assert res.json()["name"] == "Drone — Special Air Cargo (copy)" and res.json()["status"] == "inactive"
    assert res.json()["handling_display"] == ["Contains battery", "Special documentation"]
    bad = admin.post(f"{BASE}/profiles/", {"name": "X", "type": "standard", "handling": ["teleport"]}, format="json")
    assert bad.status_code == 400


def test_carrier_route_count_from_rules(admin, world, make_rule):
    res = admin.post(f"{BASE}/carriers/", {
        "name": "SF Express", "type": "international_air", "origins": [world.cn.id],
        "specializations": ["Electronics", " ", "Standard Goods"],
    }, format="json")
    assert res.status_code == 201 and res.json()["specializations"] == ["Electronics", "Standard Goods"]
    carrier_id = res.json()["id"]
    rule = make_rule()
    rule.carrier_id = carrier_id
    rule.save()
    row = admin.get(f"{BASE}/carriers/?search=sf").json()["results"][0]
    assert row["routes_count"] == 1 and row["origin_names"] == ["China"]


# --------------------------------------------------------------------------- #
# Settings, exchange rates, overview
# --------------------------------------------------------------------------- #
def test_settings_update_is_audited_and_manage_only(admin, client_for, world):
    res = admin.patch(f"{BASE}/settings/", {"default_volumetric_divisor": 6000, "weight_rounding": "one_kg"}, format="json")
    assert res.status_code == 200 and res.json()["default_volumetric_divisor"] == 6000
    assert EngineSettings.load().weight_rounding == "one_kg"
    assert AuditLog.objects.filter(action="update", content_type__model="enginesettings").exists()
    assert admin.patch(f"{BASE}/settings/", {"default_volumetric_divisor": 7000}, format="json").status_code == 400
    assert admin.patch(f"{BASE}/settings/", {"exchange_rate_source": "auto"}, format="json").status_code == 400

    l1 = client_for(StaffLevel.ADMIN_L1)  # shipping_engine = view
    assert l1.get(f"{BASE}/settings/").status_code == 200
    assert l1.patch(f"{BASE}/settings/", {"weight_rounding": "exact"}, format="json").status_code == 403


def test_exchange_rate_same_day_replaces(admin, world):
    first = admin.post(f"{BASE}/exchange-rates/", {"base_currency": "USD", "quote_currency": "TZS", "rate": "2600"}, format="json")
    assert first.status_code == 201
    again = admin.post(f"{BASE}/exchange-rates/", {"base_currency": "USD", "quote_currency": "TZS", "rate": "2610"}, format="json")
    assert again.status_code == 201 and again.json()["id"] == first.json()["id"]
    assert ExchangeRate.objects.filter(base_currency="USD", effective_date=date.today()).get().rate == D("2610")
    current = admin.get(f"{BASE}/settings/").json()["current_rates"]
    assert {"base_currency": "USD", "quote_currency": "TZS", "rate": "2610.000000"}.items() <= next(
        r for r in current if r["base_currency"] == "USD"
    ).items()
    same = admin.post(f"{BASE}/exchange-rates/", {"base_currency": "USD", "quote_currency": "USD", "rate": "1"}, format="json")
    assert same.status_code == 400


def test_overview_stats_and_recent_rules(admin, world, make_rule):
    make_rule()
    make_rule(route=world.dar_zone_c, method=world.bus, pricing_model="manual", rate=None, currency="TZS")
    body = admin.get(f"{BASE}/overview/?type=local").json()
    assert body["stats"]["active_routes"] == 2 and body["stats"]["manual_quote_rules"] == 1
    assert body["stats"]["zones"] == 2 and body["stats"]["profiles"] == 3
    assert [r["destination_label"] for r in body["recent_rules"]] == ["Zone C — Long Distance"]
    assert admin.get(f"{BASE}/overview/?type=nowhere").status_code == 400


# --------------------------------------------------------------------------- #
# Calculate endpoint
# --------------------------------------------------------------------------- #
def calc_payload(world, **kw):
    data = {"origin_country": world.cn.id, "destination_country": world.tz.id, "method": world.air.id,
            "profile": world.drone.id, "weight_kg": "1.5", "quantity": 1,
            "length_cm": "30", "width_cm": "25", "height_cm": "15"}
    data.update(kw)
    return data


def test_calculate_returns_explained_result_with_string_money(admin, world, make_rule):
    make_rule(rate=D("12"))
    make_rule(applies_to="profile", profile=world.drone, pricing_model="per_item", rate=D("50"), minimum_charge=D("50"),
              eta_min_days=7, eta_max_days=14)
    res = admin.post(f"{BASE}/calculate/", calc_payload(world), format="json")
    assert res.status_code == 200, res.json()
    body = res.json()
    assert body["status"] == "priced"
    assert body["summary"] == {
        "shipping_cost": "127500", "shipping_cost_display": "TSh 127,500", "shipping_method": "Air Cargo",
        "estimated_delivery": "7–14 days", "applicable_rule": body["rule"]["code"], "carrier": None,
        "requires_special_handling": True,
    }
    assert body["measurements"]["cbm"] == "0.01125"
    assert body["pricing"]["exchange_rate"] == "2550"
    assert body["considered"][0]["rate_display"] == "$12/KG"
    assert all(isinstance(step["text"], str) for step in body["explanation"])


def test_calculate_invalid_input_returns_400(admin, world):
    for bad in ({"weight_kg": "0"}, {"destination_country": None}, {"length_cm": "10", "width_cm": None},
                {"method": 999999}, {"quantity": 0}):
        res = admin.post(f"{BASE}/calculate/", calc_payload(world, **bad), format="json")
        assert res.status_code == 400, bad
        assert err(res)["code"] == "validation_error"


def test_calculate_missing_exchange_rate_is_400(admin, world, make_rule):
    make_rule(rate=D("12"), currency="CNY")
    res = admin.post(f"{BASE}/calculate/", calc_payload(world, profile=None), format="json")
    assert res.status_code == 400 and "No exchange rate" in err(res)["message"]


# --------------------------------------------------------------------------- #
# 20. Permissions
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "level,calc_code,create_code",
    [
        (StaffLevel.TOP_ADMIN, 200, 201),
        (StaffLevel.ADMIN_L2, 200, 201),  # manage
        (StaffLevel.ADMIN_L1, 200, 403),  # view only
        (StaffLevel.SALES, 200, 403),  # view only
        (StaffLevel.DATA_ENTRY, 200, 403),  # no engine access, but orders=edit lets it price shipments
        (StaffLevel.DRIVER, 403, 403),  # no access at all
    ],
)
def test_engine_permissions(client_for, world, make_rule, level, calc_code, create_code):
    make_rule(rate=D("12"))
    client = client_for(level)
    assert client.post(f"{BASE}/calculate/", calc_payload(world, profile=None), format="json").status_code == calc_code
    created = client.post(f"{BASE}/methods/", {"name": f"M-{level}", "code": f"M{level[:4]}", "category": "air"},
                          format="json")
    assert created.status_code == create_code


def test_view_only_users_cannot_delete_or_edit(client_for, world, make_rule):
    rule = make_rule()
    sales = client_for(StaffLevel.SALES)
    assert sales.get(f"{BASE}/rules/").status_code == 200
    assert sales.patch(f"{BASE}/rules/{rule.id}/", {"rate": "1"}, format="json").status_code == 403
    assert sales.delete(f"{BASE}/rules/{rule.id}/").status_code == 403
    assert ShippingRule.objects.get(pk=rule.id).rate == D("12")
    assert client_for(StaffLevel.DATA_ENTRY).get(f"{BASE}/rules/").status_code == 403
