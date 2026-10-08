"""Shipping & Tracking: cargo receipt, shipments, milestones, documents and order synchronisation."""
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.accounts.constants import StaffLevel
from apps.locations.models import Country
from apps.orders.models import Order, OrderStatusHistory
from apps.orders.tests import flows
from apps.procurement import services as procurement
from apps.procurement.models import ProcurementOrder, Supplier
from apps.shipping.models import CargoParcel
from apps.shipping_engine.models import Carrier, ShippingMethod

pytestmark = pytest.mark.django_db

PARCELS = "/api/shipping/parcels"
SHIP = "/api/shipping/shipments"
PDF = b"%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n"


@pytest.fixture
def carrier(db):
    return Carrier.objects.create(name="Silent Ocean", type="international_sea")


@pytest.fixture
def sea(db):
    return ShippingMethod.objects.create(name="Sea Cargo", code="SEA", category="sea")


@pytest.fixture
def paid_order(ops, make_intl):
    """An order whose supplier has been paid and shipped: goods are Waiting to Receive."""

    def _make(iso="CN", **kw):
        order = make_intl(iso=iso, paid="2500000", **kw)
        supplier, _ = Supplier.objects.get_or_create(name=f"Supplier {iso}",
                                                     defaults={"country": Country.objects.get(iso2=iso)})
        proc = procurement.select_supplier(order.procurement, supplier=supplier, user=ops.user, item_cost=100)
        procurement.mark_paid(proc, user=ops.user)
        procurement.mark_shipped(proc, user=ops.user, supplier_tracking_number=f"TRK-{order.reference}")
        return order

    return _make


def receive(client, order, **extra):
    parcel = CargoParcel.objects.get(order=order)
    return client.post(f"{PARCELS}/{parcel.id}/receive/", {"weight_kg": "150", "cbm": "2.5", **extra}, format="json")


def create(client, orders, carrier, method, city, **extra):
    ids = [CargoParcel.objects.get(order=o).id for o in orders]
    return client.post(f"{SHIP}/", {"parcels": ids, "shipper": carrier.id, "shipping_method": method.id,
                                    "destination_city": city.id, **extra}, format="json")


def test_receiving_goods_moves_order_to_consolidation(ops, paid_order):
    order = paid_order()
    waiting = ops.get(f"{PARCELS}/?stage=waiting").json()
    assert waiting["count"] == 1 and waiting["results"][0]["source"] == "agiza_procured"
    res = receive(ops, order, weight_type="estimated")
    assert res.status_code == 200, res.json()
    body = res.json()
    assert body["stage"] == "ready" and body["order"]["status"] == "sent_to_consolidation"
    assert body["exception_flags"] == ["weight-not-confirmed"]
    assert order.procurement.__class__.objects.get(pk=order.procurement.pk).status == "received_at_cargo"
    assert receive(ops, order).status_code == 409  # already received
    assert ops.get(f"{PARCELS}/?stage=ready").json()["count"] == 1


def test_deliver_for_me_orders_start_waiting_to_receive_and_ship_once_paid(ops, make_intl, carrier, sea, dar):
    order = make_intl(iso="AE", service="deliver_for_me", tracking_number="DXB-9")
    assert order.status == "waiting_to_receive" and order.department == "shipping"
    assert not ProcurementOrder.objects.filter(order=order).exists()
    waiting = ops.get(f"{PARCELS}/?stage=waiting").json()["results"]
    assert [(p["order"]["reference"], p["supplier_tracking_number"]) for p in waiting] == [(order.reference, "DXB-9")]
    assert "payment-pending" in waiting[0]["exception_flags"]
    # Unpaid goods can be received...
    body = receive(ops, order).json()
    assert body["stage"] == "ready" and body["order"]["status"] == "sent_to_consolidation"
    assert "payment-pending" in body["exception_flags"]
    # ...but can't be loaded into a shipment until the customer pays.
    res = create(ops, [order], carrier, sea, dar)
    assert res.status_code == 409 and "payment" in res.json()["error"]["message"]
    ops.post(f"/api/orders/international/{order.id}/payments/", {"amount": "2500000", "method": "cash"}, format="json")
    assert "payment-pending" not in ops.get(f"{PARCELS}/{body['id']}/").json()["exception_flags"]
    assert create(ops, [order], carrier, sea, dar).status_code == 201
    statuses = list(OrderStatusHistory.objects.filter(order=order).values_list("to_status", flat=True))
    assert statuses == ["waiting_to_receive", "sent_to_consolidation"]


def test_deliver_for_me_order_can_be_cancelled_while_waiting(ops, make_intl):
    order = make_intl(iso="AE", service="deliver_for_me")
    res = ops.post(f"/api/orders/international/{order.id}/transition/", {"status": "cancelled"}, format="json")
    assert res.status_code == 200, res.json()
    assert CargoParcel.objects.get(order=order).stage == "cancelled"


def test_marking_a_waiting_parcel_lost(ops, client_for, paid_order, make_intl):
    order = paid_order()
    parcel = CargoParcel.objects.get(order=order)
    url = f"{PARCELS}/{parcel.id}/lost/"
    assert client_for(StaffLevel.SALES).post(url, {"reason": "x"}, format="json").status_code == 403
    assert ops.post(url, {"reason": "  "}, format="json").status_code == 400
    res = ops.post(url, {"reason": "Courier lost the box"}, format="json")
    assert res.status_code == 200, res.json()
    body = res.json()
    assert body["stage"] == "lost" and body["lost_reason"] == "Courier lost the box" and body["lost_at"]
    assert body["order"]["status"] == "waiting_to_receive"  # the order keeps its status, with a note
    note = OrderStatusHistory.objects.filter(order=order).last()
    assert note.from_status == note.to_status == "waiting_to_receive" and "Courier lost the box" in note.note
    proc = ProcurementOrder.objects.get(order=order)
    assert proc.exception_flag == "parcel_lost" and proc.history.last().note == "Parcel lost: Courier lost the box"
    # It leaves the waiting list and shows under Lost.
    assert ops.get(f"{PARCELS}/?stage=waiting").json()["count"] == 0
    assert ops.get(f"{PARCELS}/?stage=lost").json()["count"] == 1
    stats = ops.get(f"{SHIP}/stats/").json()
    assert stats["waiting"] == 0 and stats["lost"] == 1
    assert ops.post(url, {"reason": "again"}, format="json").status_code == 409
    # The supplier is cancelled and a new one ships: the same parcel is expected again.
    procurement.cancel_supplier(proc, user=ops.user, reason="Lost in transit")
    parcel.refresh_from_db()
    assert parcel.stage == "cancelled"  # no longer listed as Lost: these goods won't come
    assert ops.get(f"{PARCELS}/?stage=lost").json()["count"] == 0
    proc.refresh_from_db()
    procurement.select_supplier(proc, supplier=proc.supplier, user=ops.user)
    procurement.mark_paid(proc, user=ops.user)
    procurement.mark_shipped(proc, user=ops.user, supplier_tracking_number="NEW-1")
    parcel.refresh_from_db()
    assert parcel.stage == "waiting" and parcel.supplier_tracking_number == "NEW-1"
    assert parcel.lost_at is None and parcel.lost_reason == ""  # the old loss doesn't follow the new goods
    assert receive(ops, order).json()["order"]["status"] == "sent_to_consolidation"


def test_a_lost_parcel_that_turns_up_can_still_be_received(ops, make_intl):
    order = make_intl(iso="AE", service="deliver_for_me")
    parcel = CargoParcel.objects.get(order=order)
    ops.post(f"{PARCELS}/{parcel.id}/lost/", {"reason": "Not delivered by courier"}, format="json")
    body = receive(ops, order).json()
    assert body["stage"] == "ready" and body["order"]["status"] == "sent_to_consolidation"


def test_create_shipment_validates_parcels(ops, paid_order, make_intl, carrier, sea, dar):
    cn = paid_order("CN")
    ae = paid_order("AE")
    receive(ops, cn)
    receive(ops, ae)
    res = create(ops, [cn, ae], carrier, sea, dar)
    assert res.status_code == 400 and "one origin" in res.json()["error"]["message"]
    waiting = paid_order("CN")
    assert create(ops, [waiting], carrier, sea, dar).status_code == 409  # not received yet
    unpaid = make_intl(iso="CN", service="deliver_for_me")
    receive(ops, unpaid)
    res = create(ops, [unpaid], carrier, sea, dar)
    assert res.status_code == 409 and "payment" in res.json()["error"]["message"]
    res = create(ops, [cn], carrier, sea, dar, eta="2026-11-01")
    assert res.status_code == 201, res.json()
    body = res.json()
    assert body["cargo_id"].startswith("CARGO-") and body["shipment_number"].startswith("SH-CN-TZ-")
    assert body["status"] == "created" and body["weight_kg"] == "150.000" and len(body["orders"]) == 1
    assert body["shipping_method"]["type"] == "sea"
    # The second shipment the same day gets a distinct number.
    receive(ops, waiting)
    second = create(ops, [waiting], carrier, sea, dar).json()
    assert second["shipment_number"] == body["shipment_number"] + "-2"


def test_add_and_remove_orders_only_before_loading(ops, paid_order, carrier, sea, dar):
    a, b = paid_order(), paid_order()
    receive(ops, a)
    receive(ops, b)
    shipment = create(ops, [a], carrier, sea, dar).json()
    pb = CargoParcel.objects.get(order=b).id
    res = ops.post(f"{SHIP}/{shipment['id']}/add-parcels/", {"parcels": [pb]}, format="json")
    assert len(res.json()["orders"]) == 2 and res.json()["weight_kg"] == "300.000"
    res = ops.post(f"{SHIP}/{shipment['id']}/remove-parcel/", {"parcel": pb}, format="json")
    assert len(res.json()["orders"]) == 1 and CargoParcel.objects.get(pk=pb).stage == "ready"
    for step in ("booked", "loaded"):
        ops.post(f"{SHIP}/{shipment['id']}/transition/", {"status": step}, format="json")
    assert ops.post(f"{SHIP}/{shipment['id']}/add-parcels/", {"parcels": [pb]}, format="json").status_code == 409


def test_milestones_move_orders_and_complete_creates_deliveries(ops, paid_order, carrier, sea, dar):
    order = paid_order()
    receive(ops, order)
    sid = create(ops, [order], carrier, sea, dar).json()["id"]
    for step in flows.SHIPMENT_PATH:
        res = ops.post(f"{SHIP}/{sid}/transition/", {"status": step, "location": "Port"}, format="json")
        assert res.status_code == 200, (step, res.json())
    body = res.json()
    assert body["status"] == "completed" and body["allowed_transitions"] == []
    assert body["departed_at"] and body["arrived_at"]
    stats = ops.get(f"{SHIP}/stats/").json()  # it leaves the active list and counts as delivered
    assert stats["active"] == 0 and stats["delivered"] == 1
    timeline = body["orders"][0]["timeline"]
    assert [m["status"] for m in timeline] == ["completed"] * 7
    assert timeline[2]["label"] == "Loaded on Vessel"
    statuses = list(OrderStatusHistory.objects.filter(order=order).values_list("to_status", flat=True))
    assert statuses[-3:] == ["shipping_to_destination", "clearance", "ready_for_collection"]
    order.refresh_from_db()
    assert order.department == "delivery" and CargoParcel.objects.get(order=order).stage == "arrived"
    deliveries = ops.get(f"/api/deliveries/?order={order.id}").json()
    assert deliveries["count"] == 1 and deliveries["results"][0]["status"] == "pending"


def test_cancelling_an_open_shipment_releases_orders(ops, paid_order, carrier, sea, dar):
    order = paid_order()
    receive(ops, order)
    sid = create(ops, [order], carrier, sea, dar).json()["id"]
    ops.post(f"{SHIP}/{sid}/transition/", {"status": "booked"}, format="json")
    res = ops.post(f"{SHIP}/{sid}/transition/", {"status": "cancelled", "note": "Vessel overbooked"}, format="json")
    assert res.json()["status"] == "cancelled" and res.json()["orders"] == []
    parcel = CargoParcel.objects.get(order=order)
    assert parcel.stage == "ready" and parcel.shipment_id is None


def test_tracking_updates_alerts_eta_and_timeline(ops, paid_order, carrier, sea, dar):
    order = paid_order()
    receive(ops, order)
    sid = create(ops, [order], carrier, sea, dar).json()["id"]
    res = ops.post(f"{SHIP}/{sid}/events/", {"description": "Vessel departed Shanghai", "location": "Shanghai"},
                   format="json")
    assert res.status_code == 201 and res.json()[-1]["description"] == "Vessel departed Shanghai"
    assert ops.post(f"{SHIP}/{sid}/events/", {"description": ""}, format="json").status_code == 400
    body = ops.patch(f"{SHIP}/{sid}/", {"alert": "customs_hold", "alert_note": "Missing permit",
                                         "eta": "2026-12-01"}, format="json").json()
    assert body["alert"] == "customs_hold" and body["alert_display"] == "Customs Hold" and body["eta"] == "2026-12-01"
    kinds = [e["kind"] for e in ops.get(f"{SHIP}/{sid}/events/").json()]
    assert kinds.count("alert") == 1 and "update" in kinds
    stats = ops.get(f"{SHIP}/stats/").json()
    assert stats["alerts"] == 1 and stats["active"] == 1
    assert ops.get(f"{SHIP}/?alert=any").json()["count"] == 1
    assert ops.get(f"{SHIP}/?method=sea&origin=cn").json()["count"] == 1
    assert ops.get(f"{SHIP}/?method=air-cargo").json()["count"] == 0
    assert ops.get(f"{SHIP}/?search={order.reference}").json()["count"] == 1


def test_documents_upload_validation_and_download(ops, client_for, paid_order, carrier, sea, dar):
    order = paid_order()
    receive(ops, order)
    sid = create(ops, [order], carrier, sea, dar).json()["id"]
    url = f"{SHIP}/{sid}/documents/"
    fake = SimpleUploadedFile("bol.pdf", b"not really a pdf", content_type="application/pdf")
    res = ops.post(url, {"file": fake}, format="multipart")
    assert res.status_code == 400 and "contents" in res.json()["error"]["message"]
    exe = SimpleUploadedFile("x.exe", b"MZ\x90", content_type="application/x-msdownload")
    assert ops.post(url, {"file": exe}, format="multipart").status_code == 400
    doc = SimpleUploadedFile("bol.pdf", PDF, content_type="application/pdf")
    res = ops.post(url, {"file": doc, "name": "Bill of Lading.pdf", "notes": "Original BoL"}, format="multipart")
    assert res.status_code == 201, res.json()
    item = res.json()[0]
    assert item["name"] == "Bill of Lading.pdf" and item["url"] == f"shipping/documents/{item['id']}/file"
    download = ops.get(f"/api/{item['url']}/")
    assert download.status_code == 200 and download["Content-Type"] == "application/pdf"
    assert b"".join(download.streaming_content).startswith(b"%PDF")
    assert client_for(StaffLevel.DRIVER).get(f"/api/{item['url']}/").status_code == 403


def test_shipping_permissions(ops, client_for, paid_order, carrier, sea, dar):
    order = paid_order()
    sales = client_for(StaffLevel.SALES)  # shipping: view
    assert sales.get(f"{PARCELS}/").status_code == 200
    assert receive(sales, order).status_code == 403
    assert receive(client_for(StaffLevel.PROCUREMENT), order).status_code == 200  # shipping: edit
    assert client_for(StaffLevel.DRIVER).get(f"{SHIP}/").status_code == 403


def test_shipment_status_can_jump_forward_applying_skipped_steps(ops, paid_order, carrier, sea, dar):
    a, b = paid_order(), paid_order()
    receive(ops, a)
    receive(ops, b)
    shipment = create(ops, [a, b], carrier, sea, dar).json()
    sid = shipment["id"]
    assert [t["value"] for t in shipment["allowed_transitions"]] == [
        "booked", "loaded", "export_cleared", "shipping_to_destination", "clearance", "completed", "cancelled"]
    # Created → Clearance in one go: departure and arrival recorded, orders walk every step.
    res = ops.post(f"{SHIP}/{sid}/transition/", {"status": "clearance", "location": "Dar Port"}, format="json")
    assert res.status_code == 200, res.json()
    body = res.json()
    assert body["status"] == "clearance" and body["departed_at"] and body["arrived_at"]
    assert [t["value"] for t in body["allowed_transitions"]] == ["completed"]  # no going back, no cancelling
    events = ops.get(f"{SHIP}/{sid}/events/").json()
    assert [e["to_status"] for e in events if e["kind"] == "status"] == [
        "created", "booked", "loaded", "export_cleared", "shipping_to_destination", "clearance"]
    assert "also recorded" in events[-1]["description"] and events[-1]["location"] == "Dar Port"
    assert [m["status"] for m in body["orders"][0]["timeline"]] == ["completed"] * 6 + ["pending"]
    for order in (a, b):
        statuses = list(OrderStatusHistory.objects.filter(order=order).values_list("to_status", flat=True))
        assert statuses[-3:] == ["sent_to_consolidation", "shipping_to_destination", "clearance"]
    # Backwards and late cancellation are refused.
    for status in ("loaded", "created", "cancelled", "clearance"):
        assert ops.post(f"{SHIP}/{sid}/transition/", {"status": status}, format="json").status_code == 409, status
    res = ops.post(f"{SHIP}/{sid}/transition/", {"status": "completed"}, format="json")
    assert res.json()["status"] == "completed" and res.json()["allowed_transitions"] == []
    for order in (a, b):
        assert Order.objects.get(pk=order.pk).status == "ready_for_collection"
        assert CargoParcel.objects.get(order=order).stage == "arrived"
        assert ops.get(f"/api/deliveries/?order={order.id}").json()["count"] == 1


def test_shipment_can_jump_straight_to_ready_for_collection(ops, paid_order, carrier, sea, dar):
    order = paid_order()
    receive(ops, order)
    sid = create(ops, [order], carrier, sea, dar).json()["id"]
    ops.post(f"{SHIP}/{sid}/transition/", {"status": "loaded"}, format="json")
    assert ops.post(f"{SHIP}/{sid}/transition/", {"status": "cancelled"}, format="json").status_code == 409
    res = ops.post(f"{SHIP}/{sid}/transition/", {"status": "completed"}, format="json")
    assert res.status_code == 200, res.json()
    order.refresh_from_db()
    assert order.status == "ready_for_collection" and order.department == "delivery"
    statuses = list(OrderStatusHistory.objects.filter(order=order).values_list("to_status", flat=True))
    assert statuses[-4:] == ["sent_to_consolidation", "shipping_to_destination", "clearance", "ready_for_collection"]
    assert ops.get(f"/api/deliveries/?order={order.id}").json()["results"][0]["status"] == "pending"
