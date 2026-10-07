"""Endpoints the AGIZA store app needs: home sliders (managed by staff) and the import price calculator."""
from decimal import Decimal as D

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.catalog.models import MobileSlider
from apps.shipping_engine.models import ImportCharge

from .conftest import APP

pytestmark = pytest.mark.django_db

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


def test_staff_manage_sliders_and_the_app_sees_only_active_ones_with_images(api, client_for):
    staff = client_for("admin_l2")
    res = staff.post("/api/catalog/sliders/", {"title": "Big sale", "link": "https://agizastore.xyz/sale",
                                                "sort_order": 1}, format="json")
    assert res.status_code == 201, res.json()
    slider_id = res.json()["id"]
    assert api.get(f"{APP}/sliders/").json() == []  # no image yet: not shown
    upload = SimpleUploadedFile("banner.png", PNG, content_type="image/png")
    assert staff.post(f"/api/catalog/sliders/{slider_id}/image/", {"file": upload}, format="multipart").status_code == 200
    MobileSlider.objects.create(title="Hidden", is_active=False, image="catalog/sliders/x.png")
    rows = api.get(f"{APP}/sliders/").json()
    assert [r["title"] for r in rows] == ["Big sale"] and rows[0]["link"] == "https://agizastore.xyz/sale"
    assert rows[0]["image"].endswith(f"/api/app/sliders/{slider_id}/image/")
    image = api.get(f"{APP}/sliders/{slider_id}/image/")
    assert image.status_code == 200 and b"".join(image.streaming_content).startswith(b"\x89PNG")
    bad = SimpleUploadedFile("x.png", b"not an image", content_type="image/png")
    assert staff.post(f"/api/catalog/sliders/{slider_id}/image/", {"file": bad}, format="multipart").status_code == 400
    assert client_for("sales").post("/api/catalog/sliders/", {"title": "x"}, format="json").status_code == 403


def test_import_rates_come_from_the_shipping_engine(api, imported):
    body = api.get(f"{APP}/import-rates/").json()
    cn = [r for r in body["rates"] if r["country"]["code"] == "CN"]
    assert cn == [{"country": {"code": "CN", "name": "China"}, "unit": "kg", "rate": "12.00", "method": "Air Freight"}]
    assert body["taxes"] == []  # no duty configured: nothing invented
    assert any(c["code"] == "CN" for c in body["countries"]) and all(c["code"] != "TZ" for c in body["countries"])
    ImportCharge.objects.create(name="Import duty", kind="customs_duty", basis="percent", rate=D("25"),
                                origin_country=imported.drone.origin_country)
    taxes = api.get(f"{APP}/import-rates/").json()["taxes"]
    assert {t["condition"] for t in taxes} == {"all", "new", "second_hand"} and {t["tax"] for t in taxes} == {"0.25"}


def test_products_can_be_listed_with_details_for_the_store_app(api, shop):
    plain = api.get(f"{APP}/products/").json()["results"][0]
    assert "variants" not in plain and "description" not in plain
    full = api.get(f"{APP}/products/", {"expand": "details"}).json()["results"]
    galaxy = next(p for p in full if p["name"] == "Galaxy A54")
    assert galaxy["variants"][0]["id"] == shop.variant.pk and "description" in galaxy and "images" in galaxy


def test_receiving_warehouses_abroad_are_listed_with_their_addresses(api, shop):
    from apps.locations.models import City, Country, Warehouse

    cn = Country.objects.get(iso2="CN")
    city = City.objects.filter(country=cn).first() or City.objects.create(name="Guangzhou", country=cn, region=None)
    Warehouse.objects.create(name="Guangzhou Hub", type="consolidation", country=cn, city=city,
                             address="Room 8, Baiyun District", phone="+86 20 1234")
    Warehouse.objects.create(name="No address", type="consolidation", country=cn, city=city)
    rows = api.get(f"{APP}/warehouse-addresses/").json()["results"]
    assert [(r["type"], r["address"], r["country"]["code"]) for r in rows] == [
        ("Guangzhou Hub", "Room 8, Baiyun District", "CN")]  # Tanzanian and address-less warehouses aren't listed
