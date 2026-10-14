"""The customer sees who is bringing their order (driver name and phone) and the proof-of-delivery photos."""
import base64

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.accounts.constants import StaffLevel
from apps.deliveries import services as deliveries
from apps.inventory.models import StockItem
from apps.orders import services as order_services
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


@pytest.mark.usefixtures("one_order_per_checkout")
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


def test_balance_due_needs_an_admin_to_release_the_delivery(order, staff, driver, client_for):
    from apps.core.workflow import WorkflowError
    from apps.orders import services as order_services

    delivery = deliveries.create_delivery(order, user=staff.user, delivery_address="Plot 12")
    deliveries.assign_driver(delivery, driver, user=staff.user)
    row = staff.get(f"/api/deliveries/{delivery.pk}/").json()
    assert row["payment"]["due"] == f"{order.total_amount:.2f}" and row["payment"]["release"]["blocked"] is True
    with pytest.raises(WorkflowError, match="admin approves"):
        deliveries.transition(delivery, "out_for_delivery", user=staff.user)
    url = f"/api/orders/shop/{order.pk}/release-approval/"
    assert client_for(StaffLevel.SALES).post(url, {"approved": True, "note": "x"}, format="json").status_code == 403
    admin = client_for(StaffLevel.TOP_ADMIN)
    assert admin.post(url, {"approved": True}, format="json").status_code == 400  # a reason is required
    res = admin.post(url, {"approved": True, "note": "Pays cash on delivery"}, format="json")
    assert res.status_code == 200 and res.json()["release"]["approved"] is True
    assert res.json()["release"]["blocked"] is False and res.json()["release"]["note"] == "Pays cash on delivery"
    deliveries.transition(delivery, "out_for_delivery", user=staff.user)
    assert staff.get(f"/api/deliveries/{delivery.pk}/").json()["payment"]["release"]["approved"] is True
    order.refresh_from_db()
    assert order_services.release_blocked(order) is None


def test_customer_sees_driver_and_proof_photos(app, other_app, order, staff, driver):
    url = f"{APP}/orders/{order.reference}/"
    order_services.set_release_approval(order, approved=True, note="Cash on delivery", user=staff.user)
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


def test_customer_pays_part_of_the_balance_any_time(app, order, monkeypatch):
    from types import SimpleNamespace

    monkeypatch.setattr("apps.payments.services.available", lambda: True)
    started = []

    def start_checkout(o, *, phone, together=False, amount=None):
        started.append(amount)
        return SimpleNamespace(status="pending", gateway_url="https://pay.example/c", provider_order_id="S1")

    monkeypatch.setattr("apps.payments.services.start_checkout", start_checkout)
    card = next(c for c in app.get(f"{APP}/orders/").json()["results"] if c["reference"] == order.reference)
    assert card["can_pay"] is True and card["amount_due"] == f"{order.total_amount:.2f}"
    detail = app.get(f"{APP}/orders/{order.reference}/").json()
    assert detail["min_payment"] == "1000"
    url = f"{APP}/orders/{order.reference}/pay/"
    assert app.post(url, {"amount": "500"}, format="json").status_code == 400  # below the minimum
    too_much = app.post(url, {"amount": str(order.total_amount + 1)}, format="json")
    assert too_much.status_code == 400 and "up to" in str(too_much.json())
    assert app.post(url, {"amount": "200000"}, format="json").status_code == 200
    assert app.post(url).status_code == 200  # no amount: the whole balance
    assert [str(a) if a is not None else None for a in started] == ["200000", None]


def test_my_balance_in_the_app(app, order):
    body = app.get(f"{APP}/account/balance/").json()
    # One checkout can make several orders (one per product): all of them are owed.
    assert float(body["owed_by_customer"]) >= float(order.total_amount) and float(body["net"]) > 0
    assert body["owed_to_customer"] == "0.00"
    assert order.reference in [o["reference"] for o in body["orders"]]


def test_invoice_and_receipt_pdfs_for_customer_and_staff(app, other_app, order, staff):
    from apps.orders import services as order_services

    order_services.record_payment(order, amount=order.total_amount / 2, method="cash", user=staff.user,
                                  reference="CASH-1")
    for kind in ("invoice", "receipt"):
        res = app.get(f"{APP}/orders/{order.reference}/{kind}/")
        assert res.status_code == 200 and res["Content-Type"] == "application/pdf"
        body = res.content
        assert body.startswith(b"%PDF-1.4") and body.rstrip().endswith(b"%%EOF")
        assert order.reference.encode() in body and b"CASH-1" in body
        assert ("INVOICE" if kind == "invoice" else "RECEIPT").encode() in body
        assert other_app.get(f"{APP}/orders/{order.reference}/{kind}/").status_code == 404
        staff_res = staff.get(f"/api/orders/shop/{order.pk}/document/?kind={kind}")
        assert staff_res.status_code == 200 and staff_res.content.startswith(b"%PDF")
    assert b"PARTLY PAID" in app.get(f"{APP}/orders/{order.reference}/invoice/").content
    assert staff.get(f"/api/orders/shop/{order.pk}/document/?kind=quote").status_code == 400
