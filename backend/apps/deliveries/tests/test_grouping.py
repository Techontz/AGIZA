"""Deliveries grouped by customer: one row per client, driver phone, and group assign / complete with one proof."""
import base64

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.accounts.constants import StaffLevel
from apps.deliveries import services
from apps.deliveries.models import Delivery, DeliveryPhoto
from apps.orders import services as order_services
from apps.parties.models import Customer

pytestmark = pytest.mark.django_db

DEL = "/api/deliveries"
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
)


def png(name="photo.png"):
    return SimpleUploadedFile(name, PNG, content_type="image/png")


@pytest.fixture
def driver_client(client_for):
    return client_for(StaffLevel.DRIVER, full_name="Hassan Mohamed", phone="+255700111222")


@pytest.fixture
def deliver(ops):
    """A pending delivery of a new international order for the given customer."""

    def _make(customer, items="Samsung Galaxy A54 × 20", address="Plot 4, Mikocheni"):
        from apps.locations.models import Country

        order = order_services.create_order(
            "international", customer=customer, item_details=items, user=ops.user,
            details={"source_country": Country.objects.get(iso2="CN"), "service_type": "full_service",
                     "order_class": "simple"},
        )
        return services.create_delivery(order, user=ops.user, delivery_address=address)

    return _make


@pytest.fixture
def other(db):
    return Customer.objects.create(full_name="Baraka Mushi", phone="+255765000111")


def test_by_customer_groups_each_clients_deliveries(ops, deliver, buyer, other, driver_client):
    a, b, c = deliver(buyer, "Phones"), deliver(buyer, "Laptops"), deliver(buyer, "Cables")
    deliver(other, "Shoes")
    ops.post(f"{DEL}/{a.id}/assign-driver/", {"driver": driver_client.user.id}, format="json")
    body = ops.get(f"{DEL}/by-customer/?tab=pending").json()
    assert body["count"] == 2
    rows = {r["customer"]["full_name"]: r for r in body["results"]}
    mine = rows["Fatuma Hassan"]
    assert mine["count"] == 3 and mine["customer"]["phone"] == "+255712000009"
    assert {d["id"] for d in mine["deliveries"]} == {a.id, b.id, c.id}
    assert {s["status"]: s["count"] for s in mine["statuses"]} == {"pending": 2, "assigned_driver": 1}
    assert mine["drivers"] == [{"id": driver_client.user.id, "full_name": "Hassan Mohamed", "phone": "+255700111222"}]
    assert mine["destination"] == "Plot 4, Mikocheni"
    assert rows["Baraka Mushi"]["count"] == 1
    # International orders show their one item, without SKU or bin.
    item = mine["deliveries"][0]["items"][0]
    assert item["sku"] == "" and item["bin_code"] == "" and item["quantity"] >= 1
    # The plain list can be filtered to one customer; the driver carries a phone number.
    listing = ops.get(f"{DEL}/?customer={buyer.id}").json()
    assert listing["count"] == 3
    driven = next(d for d in listing["results"] if d["id"] == a.id)
    assert driven["driver"]["phone"] == "+255700111222"
    assert ops.get(f"{DEL}/by-customer/?customer={other.id}").json()["count"] == 1
    # Drivers see only the groups of their own deliveries.
    mine_only = driver_client.get(f"{DEL}/by-customer/").json()
    assert mine_only["count"] == 1 and mine_only["results"][0]["count"] == 1


def test_bulk_assign_driver_one_customer_only(ops, deliver, buyer, other, driver_client):
    a, b = deliver(buyer), deliver(buyer)
    elsewhere = deliver(other)
    mixed = ops.post(f"{DEL}/bulk-assign-driver/", {"deliveries": [a.id, elsewhere.id],
                                                    "driver": driver_client.user.id}, format="json")
    assert mixed.status_code == 400 and "one customer" in str(mixed.json())
    not_driver = ops.post(f"{DEL}/bulk-assign-driver/", {"deliveries": [a.id, b.id], "driver": ops.user.id},
                          format="json")
    assert not_driver.status_code == 400
    assert Delivery.objects.filter(driver__isnull=False).count() == 0
    res = ops.post(f"{DEL}/bulk-assign-driver/", {"deliveries": [a.id, b.id], "driver": driver_client.user.id},
                   format="json")
    assert res.status_code == 200, res.json()
    assert [d["status"] for d in res.json()] == ["assigned_driver", "assigned_driver"]
    assert all(d["driver"]["phone"] == "+255700111222" for d in res.json())
    # Drivers can't assign, and unknown deliveries are 404.
    assert driver_client.post(f"{DEL}/bulk-assign-driver/", {"deliveries": [a.id], "driver": driver_client.user.id},
                              format="json").status_code == 403
    assert ops.post(f"{DEL}/bulk-assign-driver/", {"deliveries": [a.id, 999999], "driver": driver_client.user.id},
                    format="json").status_code == 404


def test_bulk_complete_applies_one_proof_to_every_delivery(ops, deliver, buyer, other, driver_client):
    a, b = deliver(buyer), deliver(buyer)
    elsewhere = deliver(other)
    ops.post(f"{DEL}/bulk-assign-driver/", {"deliveries": [a.id, b.id], "driver": driver_client.user.id},
             format="json")
    for d in (a, b):
        driver_client.post(f"{DEL}/{d.id}/transition/", {"status": "out_for_delivery"}, format="json")
    # The driver can't complete a delivery that isn't theirs.
    assert driver_client.post(f"{DEL}/bulk-complete/", {"deliveries": [a.id, elsewhere.id],
                                                        "signature_name": "Fatuma"},
                              format="multipart").status_code == 404
    mixed = ops.post(f"{DEL}/bulk-complete/", {"deliveries": [a.id, elsewhere.id], "signature_name": "Fatuma"},
                     format="multipart")
    assert mixed.status_code in (400, 409)
    assert driver_client.post(f"{DEL}/bulk-complete/", {"deliveries": [a.id, b.id], "signature_name": " "},
                              format="multipart").status_code == 400
    res = driver_client.post(f"{DEL}/bulk-complete/", {
        "deliveries": [a.id, b.id], "signature_name": "Fatuma Hassan", "notes": "Both parcels handed over",
        "signature_image": png("sig.png"), "photos": [png("a.png"), png("b.png")],
    }, format="multipart")
    assert res.status_code == 200, res.json()
    rows = res.json()
    assert [r["status"] for r in rows] == ["delivered", "delivered"]
    for row in rows:
        assert row["proof"]["signature_name"] == "Fatuma Hassan" and len(row["proof"]["photos"]) == 2
        assert row["proof"]["signature_url"]
        photo = ops.get(f"/api/{row['proof']['photos'][0]['url']}/")
        assert photo.status_code == 200 and b"".join(photo.streaming_content) == PNG
    assert DeliveryPhoto.objects.count() == 4
    # Not out for delivery any more: all or nothing.
    c = deliver(buyer)
    again = ops.post(f"{DEL}/bulk-complete/", {"deliveries": [c.id], "signature_name": "Fatuma"},
                     format="multipart")
    assert again.status_code == 409 and Delivery.objects.get(pk=c.pk).status == "pending"


def test_delivery_team_corrects_item_sku_and_bin_code(ops, deliver, buyer, other, client_for):
    d = deliver(buyer, "Phones")
    key = ops.get(f"{DEL}/{d.id}/").json()["items"][0]["key"]
    assert key == "item"
    res = ops.post(f"{DEL}/{d.id}/item-label/", {"key": key, "sku": " SKU-77 ", "bin_code": "A-03"}, format="json")
    assert res.status_code == 200, res.json()
    item = res.json()["items"][0]
    assert (item["sku"], item["bin_code"]) == ("SKU-77", "A-03")
    item = ops.post(f"{DEL}/{d.id}/item-label/", {"key": key, "bin_code": "B-11"}, format="json").json()["items"][0]
    assert (item["sku"], item["bin_code"]) == ("SKU-77", "B-11")  # only what was sent changes
    assert ops.post(f"{DEL}/{d.id}/item-label/", {"key": "line:999", "sku": "X"}, format="json").status_code in (400, 409)
    assert ops.post(f"{DEL}/{d.id}/item-label/", {"key": key}, format="json").status_code == 400

    # A driver edits only the deliveries assigned to them.
    mine = client_for(StaffLevel.DRIVER, full_name="Juma Ali", phone="+255700333444")
    stranger = client_for(StaffLevel.DRIVER, full_name="Neema Joseph", phone="+255700555666")
    ops.post(f"{DEL}/{d.id}/assign-driver/", {"driver": mine.user.id}, format="json")
    assert mine.post(f"{DEL}/{d.id}/item-label/", {"key": key, "bin_code": "C-01"}, format="json").status_code == 200
    assert stranger.post(f"{DEL}/{d.id}/item-label/", {"key": key, "bin_code": "Z"}, format="json").status_code == 404
    assert Delivery.objects.get(pk=d.pk).item_labels == {key: {"sku": "SKU-77", "bin_code": "C-01"}}
