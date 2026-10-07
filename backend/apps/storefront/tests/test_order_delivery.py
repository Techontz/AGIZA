"""The customer sees who is bringing their order (driver name and phone) and the proof-of-delivery photos."""
import base64

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.accounts.constants import StaffLevel
from apps.deliveries import services as deliveries
from apps.inventory.models import StockItem
from apps.orders.models import Order

from .conftest import APP

pytestmark = pytest.mark.django_db

PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
)


def png(name="photo.png"):
    return SimpleUploadedFile(name, PNG, content_type="image/png")


@pytest.fixture
def order(app, shop, home):
    app.post(f"{APP}/cart/items/", {"variant": shop.variant.pk, "quantity": 2}, format="json")
    app.post(f"{APP}/cart/items/", {"variant": shop.cable_variant.pk, "quantity": 1}, format="json")
    res = app.post(f"{APP}/checkout/place-order/", {"address": home.pk, "shipping_method": shop.rider.pk,
                                                    "payment_method": "pay_later",
                                                    "idempotency_key": "delivery-key-0001"}, format="json")
    assert res.status_code == 201, res.json()
    return Order.objects.get(reference=res.json()["order"]["reference"])


@pytest.fixture
def staff(client_for):
    return client_for(StaffLevel.ADMIN_L2)


@pytest.fixture
def driver(make_user):
    return make_user(StaffLevel.DRIVER, full_name="Hassan Mohamed", phone="+255700111222")


def test_staff_see_sku_bin_and_warehouse_of_each_line(order, shop, staff):
    StockItem.objects.filter(variant=shop.variant, warehouse=shop.warehouse).update(bin_code="A-01-3")
    shop.cable.bin_code = "SHELF-9"  # no bin on the stock row: the product's bin is used
    shop.cable.save(update_fields=["bin_code"])
    deliveries.create_delivery(order, user=staff.user, delivery_address="Plot 12")
    row = staff.get("/api/deliveries/", {"customer": order.customer_id}).json()["results"][0]
    items = {i["sku"]: i for i in row["items"]}
    assert items["A54"]["bin_code"] == "A-01-3" and items["A54"]["quantity"] == 2
    assert items["A54"]["warehouse"] == "Dar Central" and items["A54"]["product_name"] == "Galaxy A54"
    assert items["CBL"]["bin_code"] == "SHELF-9"
    group = staff.get("/api/deliveries/by-customer/").json()["results"][0]
    assert group["count"] == 1 and group["deliveries"][0]["items"] == row["items"]


def test_customer_sees_driver_and_proof_photos(app, other_app, order, staff, driver):
    url = f"{APP}/orders/{order.reference}/"
    delivery = deliveries.create_delivery(order, user=staff.user, delivery_address="Plot 12")
    body = app.get(url).json()["delivery"]
    assert body["status"] == "pending" and body["driver"] is None and body["photos"] == []
    deliveries.assign_driver(delivery, driver, user=staff.user)
    body = app.get(url).json()["delivery"]
    assert body["driver"] == {"name": "Hassan Mohamed", "phone": "+255700111222"}
    deliveries.transition(delivery, "out_for_delivery", user=staff.user)
    deliveries.complete(delivery, user=staff.user, signature_name="Neema Joseph",
                        photos=[(png("a.png"), "image/png"), (png("b.png"), "image/png")])
    body = app.get(url).json()["delivery"]
    assert body["status"] == "delivered" and body["received_by"] == "Neema Joseph"
    assert body["driver"]["phone"] == "+255700111222" and len(body["photos"]) == 2
    photo_url = body["photos"][0]["url"]
    assert f"/api/app/orders/{order.reference}/delivery-photos/" in photo_url
    res = app.get(photo_url)
    assert res.status_code == 200 and b"".join(res.streaming_content) == PNG
    # Another customer (or a staff token) can't open it.
    assert other_app.get(photo_url).status_code == 404
    assert staff.get(photo_url).status_code in (401, 403)
    photo_id = body["photos"][0]["id"]
    assert app.get(f"{APP}/orders/NOPE-1/delivery-photos/{photo_id}/").status_code == 404
