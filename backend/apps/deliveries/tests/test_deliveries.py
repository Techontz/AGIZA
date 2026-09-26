"""Deliveries: last-mile workflow, proof of delivery, driver scoping and order synchronisation."""
import base64

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.accounts.constants import StaffLevel
from apps.deliveries.models import Delivery, DeliveryProof
from apps.orders.tests import flows
from apps.returns.models import ReturnRequest

pytestmark = pytest.mark.django_db

DEL = "/api/deliveries"
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
)


def png(name="photo.png"):
    return SimpleUploadedFile(name, PNG, content_type="image/png")


@pytest.fixture
def arrived(ops, make_intl):
    """An international order whose shipment has arrived: it has a pending delivery."""

    def _make(**kw):
        order = make_intl(**kw)
        flows.walk(ops, {"id": order.id, "reference": order.reference}, "ready_for_collection")
        return Delivery.objects.get(order=order)

    return _make


@pytest.fixture
def driver_client(client_for):
    return client_for(StaffLevel.DRIVER, full_name="Hassan Mohamed")


def test_full_delivery_with_proof_completes_the_order(ops, arrived, driver_client):
    delivery = arrived()
    url = f"{DEL}/{delivery.id}"
    assert ops.post(f"{url}/transition/", {"status": "out_for_delivery"}, format="json").status_code == 409
    not_driver = ops.post(f"{url}/assign-driver/", {"driver": ops.user.id}, format="json")
    assert not_driver.status_code == 400 and "not a driver" in not_driver.json()["error"]["message"]
    body = ops.post(f"{url}/assign-driver/", {"driver": driver_client.user.id,
                                               "scheduled_at": "2026-10-01T10:00:00Z"}, format="json").json()
    assert body["status"] == "assigned_driver" and body["driver"]["full_name"] == "Hassan Mohamed"
    # The driver works the delivery from their own account.
    assert driver_client.post(f"{url}/transition/", {"status": "out_for_delivery"}, format="json").status_code == 200
    bad = driver_client.post(f"{url}/complete/", {"signature_name": "Fatuma", "photos": [
        SimpleUploadedFile("x.png", b"GIF89a", content_type="image/png")]}, format="multipart")
    assert bad.status_code == 400
    assert driver_client.post(f"{url}/complete/", {"signature_name": " "}, format="multipart").status_code == 400
    res = driver_client.post(f"{url}/complete/", {
        "signature_name": "Fatuma Hassan", "notes": "Customer verified ID.",
        "signature_image": png("sig.png"), "photos": [png("a.png"), png("b.png")],
    }, format="multipart")
    assert res.status_code == 200, res.json()
    body = res.json()
    assert body["status"] == "delivered" and body["order"]["status"] == "completed"
    proof = body["proof"]
    assert proof["signature_name"] == "Fatuma Hassan" and len(proof["photos"]) == 2 and proof["signature_url"]
    sig = driver_client.get(f"/api/{proof['signature_url']}/")
    assert sig.status_code == 200 and b"".join(sig.streaming_content) == PNG
    assert ops.get(f"/api/{proof['photos'][0]['url']}/").status_code == 200
    events = [e["to_status"] for e in ops.get(f"{url}/events/").json()]
    assert events == ["pending", "assigned_driver", "out_for_delivery", "delivered"]
    assert ops.post(f"{url}/transition/", {"status": "failed", "note": "x"}, format="json").status_code == 409


def test_drivers_only_see_and_touch_their_own_deliveries(ops, arrived, driver_client, client_for):
    mine, other = arrived(), arrived(items="Another order")
    ops.post(f"{DEL}/{mine.id}/assign-driver/", {"driver": driver_client.user.id}, format="json")
    listing = driver_client.get(f"{DEL}/").json()
    assert listing["count"] == 1 and listing["results"][0]["id"] == mine.id
    assert driver_client.get(f"{DEL}/{other.id}/").status_code == 404
    assert driver_client.post(f"{DEL}/{other.id}/transition/", {"status": "cancelled"},
                              format="json").status_code == 404
    assert driver_client.post(f"{DEL}/{mine.id}/assign-driver/", {"driver": driver_client.user.id},
                              format="json").status_code == 403
    assert driver_client.get(f"{DEL}/stats/").json()["pending"] == 1
    assert client_for(StaffLevel.PROCUREMENT).get(f"{DEL}/").status_code == 403  # deliveries: none


def test_failed_rescheduled_and_returned(ops, arrived, driver_client):
    delivery = arrived()
    url = f"{DEL}/{delivery.id}"
    ops.post(f"{url}/assign-driver/", {"driver": driver_client.user.id}, format="json")
    ops.post(f"{url}/transition/", {"status": "out_for_delivery"}, format="json")
    assert ops.post(f"{url}/transition/", {"status": "failed"}, format="json").status_code == 400  # needs a reason
    body = ops.post(f"{url}/transition/", {"status": "failed", "exception_flag": "customer_unavailable"},
                    format="json").json()
    assert body["status"] == "failed" and body["attempts"] == 1
    assert body["exception_flag_display"] == "Customer Unavailable"
    assert ops.post(f"{url}/transition/", {"status": "rescheduled"}, format="json").status_code == 400
    body = ops.post(f"{url}/transition/", {"status": "rescheduled", "scheduled_at": "2026-10-02T09:00:00Z"},
                    format="json").json()
    assert body["status"] == "rescheduled" and body["scheduled_at"].startswith("2026-10-02")
    ops.post(f"{url}/transition/", {"status": "out_for_delivery"}, format="json")
    ops.post(f"{url}/transition/", {"status": "failed", "note": "Shop closed"}, format="json")
    body = ops.post(f"{url}/transition/", {"status": "returned", "note": "Back to warehouse"}, format="json").json()
    assert body["status"] == "returned"
    ret = ReturnRequest.objects.get(order_id=delivery.order_id)
    assert ret.return_type == "delivery_failed" and ret.status == "in_transit" and ret.owner == "delivery"
    assert ret.handler == driver_client.user and ret.delivery_id == delivery.id


def test_create_manual_delivery_and_list_filters(ops, arrived, buyer, dar, make_intl):
    delivery = arrived()
    # Only one open delivery per order.
    dup = ops.post(f"{DEL}/", {"order": delivery.order_id, "delivery_address": "Plot 1"}, format="json")
    assert dup.status_code == 409
    order = make_intl(items="Collected order")
    res = ops.post(f"{DEL}/", {"order": order.id, "delivery_address": "Mikocheni Beach Road", "destination_city": dar.id,
                               "destination_area": "Mikocheni", "delivery_type": "same_day"}, format="json")
    assert res.status_code == 201, res.json()
    body = res.json()
    assert body["reference"].startswith("DEL-") and body["source"] == "international"
    assert body["recipient_name"] == "Fatuma Hassan"
    assert ops.get(f"{DEL}/?tab=pending&source=international").json()["count"] == 2
    assert ops.get(f"{DEL}/?tab=completed").json()["count"] == 0
    assert ops.get(f"{DEL}/?search=Mikocheni").json()["count"] == 1
    assert ops.get(f"{DEL}/?status=pending&delivery_type=same_day").json()["count"] == 1
    stats = ops.get(f"{DEL}/stats/").json()
    assert stats["pending"] == 2 and stats["delivered_today"] == 0


def test_express_orders_drive_their_delivery(ops, client_for, buyer, dar):
    from apps.orders.tests.conftest import EXPRESS, eta

    driver = client_for(StaffLevel.DRIVER).user
    order = ops.post(f"{EXPRESS}/", {"customer": buyer.id, "item_details": "Documents", "pickup_address": "Kariakoo",
                                      "pickup_city": dar.id, "delivery_address": "Mwenge", "delivery_city": dar.id,
                                      "priority": "urgent"}, format="json").json()
    oid = order["id"]
    ops.post(f"{EXPRESS}/{oid}/quote/", {"amount": "25000", "estimated_delivery_at": eta()}, format="json")
    ops.post(f"{EXPRESS}/{oid}/transition/", {"status": "accepted"}, format="json")
    ops.post(f"{EXPRESS}/{oid}/assign-driver/", {"user": driver.id}, format="json")
    delivery = Delivery.objects.get(order_id=oid)
    assert delivery.status == "assigned_driver" and delivery.driver == driver
    assert delivery.delivery_type == "same_day" and delivery.delivery_address == "Mwenge"
    ops.post(f"{EXPRESS}/{oid}/transition/", {"status": "picked_up"}, format="json")
    delivery.refresh_from_db()
    assert delivery.status == "out_for_delivery"
    # Completing here needs the express order to have arrived first.
    res = ops.post(f"{DEL}/{delivery.id}/complete/", {"signature_name": "Juma"}, format="multipart")
    assert res.status_code == 409 and "Arrived" in res.json()["error"]["message"]
    assert not DeliveryProof.objects.filter(delivery=delivery).exists()  # rolled back
    for step in ("in_transit", "arrived"):
        ops.post(f"{EXPRESS}/{oid}/transition/", {"status": step}, format="json")
    res = ops.post(f"{DEL}/{delivery.id}/complete/", {"signature_name": "Juma"}, format="multipart")
    assert res.json()["status"] == "delivered" and res.json()["order"]["status"] == "delivered"
    # Express deliveries can't be created or cancelled from Deliveries.
    assert ops.post(f"{DEL}/", {"order": oid, "delivery_address": "x"}, format="json").status_code == 409


def test_express_delivered_elsewhere_can_get_proof_later(ops, client_for, buyer, dar):
    from apps.orders.tests.conftest import EXPRESS, eta

    driver = client_for(StaffLevel.DRIVER).user
    oid = ops.post(f"{EXPRESS}/", {"customer": buyer.id, "item_details": "Parcel", "pickup_address": "A",
                                    "delivery_address": "B"}, format="json").json()["id"]
    ops.post(f"{EXPRESS}/{oid}/quote/", {"amount": "10000", "estimated_delivery_at": eta()}, format="json")
    ops.post(f"{EXPRESS}/{oid}/transition/", {"status": "accepted"}, format="json")
    ops.post(f"{EXPRESS}/{oid}/assign-driver/", {"user": driver.id}, format="json")
    for step in ("picked_up", "in_transit", "arrived", "delivered"):
        ops.post(f"{EXPRESS}/{oid}/transition/", {"status": step}, format="json")
    delivery = Delivery.objects.get(order_id=oid)
    assert delivery.status == "delivered" and delivery.delivered_at
    res = ops.post(f"{DEL}/{delivery.id}/proof/", {"signature_name": "Amina", "photos": [png()]}, format="multipart")
    assert res.status_code == 200 and len(res.json()["proof"]["photos"]) == 1
