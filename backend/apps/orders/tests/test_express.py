"""Express Delivery workflow: quote → accept → driver → 5 tracking steps."""
import base64
import io

import pytest

from apps.accounts.constants import StaffLevel
from apps.accounts.models import AuditLog
from apps.orders.models import Order, OrderStatusHistory

from .conftest import EXPRESS, eta, move, quote

pytestmark = pytest.mark.django_db


def test_create_starts_waiting_quote_with_history_and_audit(new_express):
    order = new_express()
    assert order["reference"].startswith("EXP-") and order["status"] == "waiting_quote"
    assert order["stage"] == "waiting_quote" and order["status_display"] == "Waiting Quote"
    assert order["details"]["customer_package_size"] == "small" and order["details"]["package_size"] == "small"
    h = OrderStatusHistory.objects.get(order_id=order["id"])
    assert (h.from_status, h.to_status) == ("", "waiting_quote")
    assert AuditLog.objects.filter(action="create", object_id=str(order["id"]), content_type__model="order").exists()


def test_create_validation(admin, customer):
    res = admin.post(f"{EXPRESS}/", {"customer": customer.id, "item_details": "Box"}, format="json")
    assert res.status_code == 400
    assert {"pickup_address", "delivery_address"} <= set(res.json()["error"]["details"])


def test_package_size_adjustment_only_before_acceptance(admin, new_express, accepted_express):
    order = new_express()
    res = admin.post(f"{EXPRESS}/{order['id']}/package-size/", {"package_size": "medium"}, format="json")
    assert res.status_code == 200
    assert res.json()["details"]["package_size"] == "medium"
    assert res.json()["details"]["customer_package_size"] == "small"  # the customer's choice is kept

    accepted = accepted_express()
    assert admin.post(f"{EXPRESS}/{accepted['id']}/package-size/", {"package_size": "large"}, format="json").status_code == 409


def test_quote_validation_and_lifecycle(admin, new_express):
    order = new_express()
    oid = order["id"]
    assert quote(admin, oid, amount="0").status_code == 400
    bad_advance = quote(admin, oid, advance_required=True, advance_amount="30000")
    assert bad_advance.status_code == 400 and "advance_amount" in bad_advance.json()["error"]["details"]
    assert quote(admin, oid, advance_required=True).status_code == 400

    res = quote(admin, oid, advance_required=True, advance_amount="10000")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "quoted" and body["total_amount"] == "25000.00"
    assert body["details"]["advance_amount"] == "10000.00" and body["details"]["quoted_by"]

    # Editing a quoted quote keeps the status but leaves a history entry.
    res = quote(admin, oid, amount="27000")
    assert res.json()["status"] == "quoted" and res.json()["total_amount"] == "27000.00"
    assert OrderStatusHistory.objects.filter(order_id=oid, from_status="quoted", to_status="quoted", note="Quote updated").exists()

    # Customer rejects, staff re-quote, customer accepts.
    assert admin.post(f"{EXPRESS}/{oid}/quote-status/", {"status": "rejected"}, format="json").json()["status"] == "rejected"
    assert quote(admin, oid, amount="22000").json()["status"] == "quoted"
    assert admin.post(f"{EXPRESS}/{oid}/quote-status/", {"status": "accepted"}, format="json").json()["status"] == "accepted"

    # Editing an accepted quote sends it back for the customer's approval.
    assert quote(admin, oid, amount="23000").json()["status"] == "quoted"


def test_quote_status_requires_a_quote(admin, new_express):
    order = new_express()
    res = admin.post(f"{EXPRESS}/{order['id']}/quote-status/", {"status": "accepted"}, format="json")
    assert res.status_code == 409 and "Waiting Quote" in res.json()["error"]["message"]


def test_driver_assignment_rules(admin, client_for, new_express, accepted_express, driver):
    not_driver = client_for(StaffLevel.SALES).user
    order = new_express()
    early = admin.post(f"{EXPRESS}/{order['id']}/assign-driver/", {"user": driver.id}, format="json")
    assert early.status_code == 409

    accepted = accepted_express()
    wrong = admin.post(f"{EXPRESS}/{accepted['id']}/assign-driver/", {"user": not_driver.id}, format="json")
    assert wrong.status_code == 400 and "not a driver" in wrong.json()["error"]["message"]

    res = admin.post(f"{EXPRESS}/{accepted['id']}/assign-driver/", {"user": driver.id}, format="json")
    assert res.status_code == 200
    assert res.json()["status"] == "driver_assigned" and res.json()["stage"] == "in_progress"
    assert res.json()["details"]["driver"]["full_name"] == "Hassan Mohamed"


def test_advance_payment_must_be_received_before_dispatch(admin, accepted_express, driver):
    order = accepted_express(advance_required=True, advance_amount="10000")
    blocked = admin.post(f"{EXPRESS}/{order['id']}/assign-driver/", {"user": driver.id}, format="json")
    assert blocked.status_code == 409 and "advance payment" in blocked.json()["error"]["message"]

    pay = admin.post(f"{EXPRESS}/{order['id']}/payments/",
                     {"amount": "10000", "method": "mobile_money", "kind": "advance", "reference": "MP123"}, format="json")
    assert pay.status_code == 201
    res = admin.post(f"{EXPRESS}/{order['id']}/assign-driver/", {"user": driver.id}, format="json")
    assert res.status_code == 200 and res.json()["payment"]["paid"] == "10000.00"


def test_five_step_tracking_and_invalid_transitions(admin, accepted_express, driver):
    order = accepted_express()
    oid = order["id"]
    admin.post(f"{EXPRESS}/{oid}/assign-driver/", {"user": driver.id}, format="json")

    skip = move(admin, EXPRESS, oid, "delivered")
    assert skip.status_code == 409 and "Driver Assigned" in skip.json()["error"]["message"]

    for step in ["picked_up", "at_agiza_center", "in_transit", "arrived", "delivered"]:
        res = move(admin, EXPRESS, oid, step, note=f"now {step}")
        assert res.status_code == 200, (step, res.json())
        assert res.json()["status"] == step
    assert res.json()["allowed_transitions"] == []
    assert move(admin, EXPRESS, oid, "in_transit").status_code == 409  # delivered is final

    history = admin.get(f"{EXPRESS}/{oid}/history/").json()
    assert [h["to_status"] for h in history][-5:] == ["picked_up", "at_agiza_center", "in_transit", "arrived", "delivered"]
    assert history[-1]["note"] == "now delivered" and history[-1]["changed_by"]["full_name"]
    assert history[-1]["to_status_display"] == "Delivered"
    assert AuditLog.objects.filter(action="status_change", object_id=str(oid)).count() >= 7


def test_action_only_statuses_cannot_be_set_directly(admin, new_express, accepted_express):
    order = new_express()
    res = move(admin, EXPRESS, order["id"], "quoted")
    assert res.status_code == 400 and "quote" in res.json()["error"]["message"]
    accepted = accepted_express()
    assert move(admin, EXPRESS, accepted["id"], "driver_assigned").status_code == 400
    assert move(admin, EXPRESS, accepted["id"], "teleported").status_code == 400


def test_cancel_requires_manage(client_for, new_express):
    order = new_express()
    sales = client_for(StaffLevel.SALES)  # orders = edit
    assert move(sales, EXPRESS, order["id"], "cancelled").status_code == 403
    manager = client_for(StaffLevel.ADMIN_L2)
    assert move(manager, EXPRESS, order["id"], "cancelled").json()["status"] == "cancelled"


def test_stats_stage_filter_search_and_pagination(admin, new_express, accepted_express, customer):
    for _ in range(3):
        new_express()
    accepted_express()
    for i in range(22):
        new_express(item_details=f"Parcel-{i}")
    stats = admin.get(f"{EXPRESS}/stats/").json()
    assert stats == {"waiting_quote": 25, "quoted": 1, "in_progress": 0, "delivered": 0}
    assert admin.get(f"{EXPRESS}/?stage=quoted").json()["count"] == 1
    assert admin.get(f"{EXPRESS}/?search=Parcel-12").json()["count"] == 1
    page = admin.get(f"{EXPRESS}/?page=2&page_size=10").json()
    assert page["count"] == 26 and len(page["results"]) == 10 and page["total_pages"] == 3
    assert admin.get(f"{EXPRESS}/?search={customer.phone}").json()["count"] == 26


def test_suggest_price_uses_the_shipping_engine(admin, new_express, cities):
    from decimal import Decimal as D

    from apps.shipping_engine.models import Route, ShippingMethod, ShippingRule

    bus = ShippingMethod.objects.create(name="Bus Cargo", code="BUS", category="land")
    route = Route.objects.create(type="local", origin_country=cities["Dar es Salaam"].country,
                                 origin_city=cities["Dar es Salaam"], destination_country=cities["Mwanza"].country,
                                 destination_city=cities["Mwanza"])
    route.methods.set([bus])
    ShippingRule.objects.create(route=route, method=bus, pricing_model="per_kg", rate=D("1200"), currency="TZS")
    order = new_express()
    res = admin.post(f"{EXPRESS}/{order['id']}/suggest-price/", {"method": bus.id}, format="json")
    assert res.status_code == 200, res.json()
    assert res.json()["total"] == "6000" and res.json()["weight_source"] == "declared"


# A valid 1×1 PNG (avoids a Pillow dependency just for tests).
PNG_1PX = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


def _png() -> io.BytesIO:
    buf = io.BytesIO(PNG_1PX)
    buf.name = "parcel.png"
    return buf


def test_attachments_upload_list_and_download(admin, client_for, new_express, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    order = new_express()
    res = admin.post(f"{EXPRESS}/{order['id']}/attachments/", {"file": _png(), "caption": "Front"}, format="multipart")
    assert res.status_code == 201
    att = res.json()[0]
    assert att["url"] == f"orders/attachments/{att['id']}/file"
    download = admin.get(f"/api/{att['url']}/")
    assert download.status_code == 200 and download["Content-Type"] == "image/png"
    assert b"".join(download.streaming_content).startswith(b"\x89PNG")

    bad = io.BytesIO(b"MZ fake exe")
    bad.name = "virus.exe"
    assert admin.post(f"{EXPRESS}/{order['id']}/attachments/", {"file": bad}, format="multipart").status_code == 400
    # View-only staff may see photos but not upload.
    finance = client_for(StaffLevel.FINANCE)
    assert finance.get(f"{EXPRESS}/{order['id']}/attachments/").status_code == 200
    assert finance.post(f"{EXPRESS}/{order['id']}/attachments/", {"file": _png()}, format="multipart").status_code == 403
    assert Order.objects.get(pk=order["id"]).attachments.count() == 1


def test_role_permissions(client_for, customer, cities):
    payload = {"customer": customer.id, "item_details": "Box", "pickup_address": "A", "delivery_address": "B"}
    assert client_for(StaffLevel.DATA_ENTRY).post(f"{EXPRESS}/", payload, format="json").status_code == 201
    finance = client_for(StaffLevel.FINANCE)  # orders = view
    assert finance.get(f"{EXPRESS}/").status_code == 200
    assert finance.post(f"{EXPRESS}/", payload, format="json").status_code == 403
    assert client_for(StaffLevel.DRIVER).get(f"{EXPRESS}/").status_code == 403


def test_quote_datetime_is_required(admin, new_express):
    order = new_express()
    res = admin.post(f"{EXPRESS}/{order['id']}/quote/", {"amount": "1000"}, format="json")
    assert res.status_code == 400 and "estimated_delivery_at" in res.json()["error"]["details"]
    assert eta()  # helper used elsewhere
