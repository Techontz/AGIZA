"""People: the six tabs (customers, staff, shippers, shop vendors, service providers, drivers)."""
import pytest

from apps.accounts.constants import StaffLevel
from apps.catalog.models import Vendor
from apps.locations.models import City, Country, Warehouse
from apps.shipping_engine.models import Carrier

pytestmark = pytest.mark.django_db


def test_people_stats_and_role_filters(ops, client_for, buyer):
    client_for(StaffLevel.DRIVER, full_name="Hassan Mohammed")
    Carrier.objects.create(name="Silent Ocean", type="international_sea")
    Vendor.objects.create(name="Mama Saida Shop")
    stats = ops.get("/api/people/stats/").json()
    assert stats["customer"] == 1 and stats["driver"] == 1 and stats["shipper"] == 1 and stats["shop_vendor"] == 1
    assert stats["staff"] >= 1 and stats["service_provider"] == 0
    drivers = ops.get("/api/staff/?role=driver").json()["results"]
    assert [d["full_name"] for d in drivers] == ["Hassan Mohammed"] and drivers[0]["total_orders"] == 0
    assert all(s["staff_level"] != "driver" for s in ops.get("/api/staff/?role=staff").json()["results"])
    assert client_for(StaffLevel.FINANCE).get("/api/people/stats/").status_code == 403


def test_service_providers_crud_and_rating(ops, client_for):
    dar = City.objects.get(name="Dar es Salaam", country__iso2="TZ")
    res = ops.post("/api/service-providers/", {"name": "Juma Plumbing Services", "phone": "+255789111222",
                                               "services": "Plumbing", "city": dar.id, "rating": "4.5"}, format="json")
    assert res.status_code == 201 and res.json()["reference"].startswith("SERV-")
    assert ops.post("/api/service-providers/", {"name": "X", "rating": "7"}, format="json").status_code == 400
    pid = res.json()["id"]
    assert ops.patch(f"/api/service-providers/{pid}/", {"status": "inactive"}, format="json").json()["status"] == \
        "inactive"
    sales = client_for(StaffLevel.SALES)  # people: view
    assert sales.get("/api/service-providers/").status_code == 200
    assert sales.post("/api/service-providers/", {"name": "Y"}, format="json").status_code == 403


def test_shippers_services_warehouses_and_rating(ops):
    tz = Country.objects.get(iso2="CN")
    hub = Warehouse.objects.create(name="Guangzhou Consolidation Hub", type="consolidation", country=tz,
                                   city=City.objects.get(name="Guangzhou"))
    carrier = Carrier.objects.create(name="Silent Ocean", type="international_sea")
    res = ops.patch(f"/api/shipping-engine/carriers/{carrier.id}/", {
        "services": ["sea_cargo", "air_cargo"], "warehouses": [hub.id], "rating": "4.8", "origins": [tz.id]},
        format="json")
    assert res.status_code == 200, res.json()
    body = res.json()
    assert body["services"] == ["sea_cargo", "air_cargo"] and body["rating"] == "4.8"
    assert body["warehouse_names"][0]["name"] == "Guangzhou Consolidation Hub" and body["total_orders"] == 0
