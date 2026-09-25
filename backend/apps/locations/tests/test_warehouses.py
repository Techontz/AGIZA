import pytest

from apps.accounts.constants import StaffLevel
from apps.core.references import next_reference
from apps.locations.models import City, Country

pytestmark = pytest.mark.django_db


def test_reference_sequence_increments():
    assert next_reference("TST") == "TST-000001"
    assert next_reference("TST") == "TST-000002"
    assert next_reference("OTHER", width=3) == "OTHER-001"


def test_warehouse_codes_by_type_and_country(client_for):
    admin = client_for(StaffLevel.ADMIN_L2)
    tz, cn = Country.objects.get(iso2="TZ"), Country.objects.get(iso2="CN")
    dsm, gz = City.objects.get(name="Dar es Salaam"), City.objects.get(name="Guangzhou")

    def make(name, type_, country, city):
        res = admin.post(
            "/api/warehouses/", {"name": name, "type": type_, "country": country.id, "city": city.id}, format="json"
        )
        assert res.status_code == 201, res.json()
        return res.json()["code"]

    assert make("Dar Central", "fulfillment", tz, dsm) == "WH-TZ-001"
    assert make("Guangzhou Hub", "consolidation", cn, gz) == "WH-INT-001"
    assert make("Agiza Shop Kariakoo", "shop", tz, dsm) == "WH-SHOP-001"


def test_city_must_match_country(client_for):
    admin = client_for(StaffLevel.ADMIN_L2)
    res = admin.post(
        "/api/warehouses/",
        {
            "name": "Bad",
            "type": "fulfillment",
            "country": Country.objects.get(iso2="TZ").id,
            "city": City.objects.get(name="Dubai").id,
        },
        format="json",
    )
    assert res.status_code == 400
    assert "city" in res.json()["error"]["details"]


def test_reference_lists_available_to_any_staff(client_for):
    driver = client_for(StaffLevel.DRIVER)
    countries = driver.get("/api/countries/?is_sourcing_origin=true").json()
    assert {c["iso2"] for c in countries} == {"TZ", "CN", "US", "GB", "AE", "IN"}
    tz_id = next(c["id"] for c in countries if c["iso2"] == "TZ")
    assert len(driver.get(f"/api/regions/?country={tz_id}").json()) == 31
