"""Procurement: suppliers, supplier selection, supplier payment and the link to international orders."""
import pytest

from apps.accounts.constants import StaffLevel
from apps.accounts.models import AuditLog
from apps.locations.models import Country
from apps.orders.models import OrderStatusHistory
from apps.procurement.models import ProcurementOrder, Supplier
from apps.shipping.models import CargoParcel

pytestmark = pytest.mark.django_db

SUP = "/api/procurement/suppliers"
PROC = "/api/procurement/orders"


@pytest.fixture
def supplier(db):
    return Supplier.objects.create(name="Shenzhen Tech Co.", country=Country.objects.get(iso2="CN"))


def proc_of(order):
    return ProcurementOrder.objects.get(order=order)


def test_supplier_crud_permissions_and_protection(ops, client_for, make_intl):
    china = Country.objects.get(iso2="CN")
    res = ops.post(f"{SUP}/", {"name": "Yiwu Trading", "country": china.id, "email": "sales@yiwu.test"}, format="json")
    assert res.status_code == 201 and res.json()["reference"].startswith("SUP-")
    sid = res.json()["id"]
    assert res.json()["country_detail"]["iso2"] == "CN"
    assert ops.get(f"{SUP}/?country=cn&search=yiwu").json()["count"] == 1
    sales = client_for(StaffLevel.SALES)  # procurement: view
    assert sales.get(f"{SUP}/").status_code == 200
    assert sales.post(f"{SUP}/", {"name": "X", "country": china.id}, format="json").status_code == 403
    assert client_for(StaffLevel.DRIVER).get(f"{SUP}/").status_code == 403
    # A supplier used by an order can't be deleted.
    order = make_intl(paid="2500000")
    ops.post(f"{PROC}/{proc_of(order).id}/select-supplier/", {"supplier": sid}, format="json")
    assert ops.delete(f"{SUP}/{sid}/").status_code == 409
    assert ops.patch(f"{SUP}/{sid}/", {"is_active": False}, format="json").json()["is_active"] is False
    assert AuditLog.objects.filter(object_repr="Yiwu Trading", action="create").exists()


def test_procurement_opens_for_agiza_sourced_orders_only(make_intl):
    full = make_intl()
    dfm = make_intl(iso="AE", service="deliver_for_me", tracking_number="DXB-1")
    assert proc_of(full).status == "pending_sourcing"
    assert not ProcurementOrder.objects.filter(order=dfm).exists()
    parcel = CargoParcel.objects.get(order=dfm)
    assert parcel.stage == "waiting" and parcel.source == "client_purchased"
    assert parcel.supplier_tracking_number == "DXB-1"


def test_select_supplier_confirms_order_only_when_customer_paid(ops, make_intl, supplier):
    unpaid = make_intl()
    res = ops.post(f"{PROC}/{proc_of(unpaid).id}/select-supplier/",
                   {"supplier": supplier.id, "item_cost": "1800000", "quantity": 20}, format="json")
    assert res.status_code == 200, res.json()
    body = res.json()
    assert body["status"] == "supplier_selected" and body["supplier"]["name"] == "Shenzhen Tech Co."
    assert body["order"]["status"] == "pending_payment"  # customer hasn't paid: order waits
    unpaid.refresh_from_db()
    assert unpaid.international.supplier_name == "Shenzhen Tech Co."
    assert unpaid.international.item_cost == 1800000
    # Supplier can't be paid until the customer has paid.
    res = ops.post(f"{PROC}/{proc_of(unpaid).id}/mark-paid/", {}, format="json")
    assert res.status_code == 409 and "installment" in res.json()["error"]["message"]

    paid = make_intl(paid="2500000")
    body = ops.post(f"{PROC}/{proc_of(paid).id}/select-supplier/", {"supplier": supplier.id}, format="json").json()
    assert body["order"]["status"] == "supplier_confirmed"


def test_installment_plan_approved_allows_supplier_payment(ops, make_intl, supplier):
    order = make_intl(paid="500000")
    order.installment_plan = order.installment_allowed = True
    order.save()
    pid = proc_of(order).id
    ops.post(f"{PROC}/{pid}/select-supplier/", {"supplier": supplier.id, "item_cost": "1800000"}, format="json")
    res = ops.post(f"{PROC}/{pid}/mark-paid/", {"payment_reference": "TT-99", "supplier_tracking_number": "SZ-1"},
                   format="json")
    assert res.status_code == 200, res.json()
    assert res.json()["status"] == "paid" and res.json()["order"]["status"] == "paid_supplier"


def test_mark_paid_then_shipped_expects_goods_at_cargo(ops, make_intl, supplier):
    order = make_intl(paid="2500000")
    pid = proc_of(order).id
    assert ops.post(f"{PROC}/{pid}/mark-paid/", {}, format="json").status_code == 409  # no supplier yet
    ops.post(f"{PROC}/{pid}/select-supplier/", {"supplier": supplier.id}, format="json")
    res = ops.post(f"{PROC}/{pid}/mark-paid/", {}, format="json")
    assert res.status_code == 400 and "item cost" in res.json()["error"]["message"]
    ops.patch(f"{PROC}/{pid}/", {"item_cost": "1800000", "expected_at_cargo": "2026-10-10"}, format="json")
    assert ops.post(f"{PROC}/{pid}/mark-shipped/", {"supplier_tracking_number": "SZ-1"},
                    format="json").status_code == 409  # not paid yet
    body = ops.post(f"{PROC}/{pid}/mark-paid/", {"payment_reference": "TT-1"}, format="json").json()
    assert body["order"]["status"] == "paid_supplier" and body["paid_at"]
    assert body["actions"] == ["mark_shipped", "cancel_supplier"]
    # Paid isn't shipped: nothing is expected at cargo yet.
    assert not CargoParcel.objects.filter(order=order).exists()
    # The supplier's tracking number is mandatory to mark the goods shipped.
    assert ops.post(f"{PROC}/{pid}/mark-shipped/", {}, format="json").status_code == 400
    res = ops.post(f"{PROC}/{pid}/mark-shipped/", {"supplier_tracking_number": "  "}, format="json")
    assert res.status_code == 400
    body = ops.post(f"{PROC}/{pid}/mark-shipped/", {"supplier_tracking_number": "SZ-2026"}, format="json").json()
    assert body["status"] == "supplier_shipped" and body["shipped_at"] and body["actions"] == ["cancel_supplier"]
    assert body["order"]["status"] == "waiting_to_receive" and body["supplier_tracking_number"] == "SZ-2026"
    order.refresh_from_db()
    assert order.department == "shipping" and order.international.tracking_number == "SZ-2026"
    parcel = CargoParcel.objects.get(order=order)
    assert parcel.stage == "waiting" and parcel.source == "agiza_procured"
    assert str(parcel.estimated_arrival) == "2026-10-10" and parcel.supplier_tracking_number == "SZ-2026"
    # A corrected tracking number follows the expected parcel.
    ops.patch(f"{PROC}/{pid}/", {"supplier_tracking_number": "SZ-2026-B"}, format="json")
    assert CargoParcel.objects.get(order=order).supplier_tracking_number == "SZ-2026-B"
    # Costs are locked once paid; the supplier can no longer be swapped.
    assert ops.patch(f"{PROC}/{pid}/", {"item_cost": "1"}, format="json").status_code == 409
    assert ops.post(f"{PROC}/{pid}/select-supplier/", {"supplier": supplier.id}, format="json").status_code == 409
    assert ops.post(f"{PROC}/{pid}/mark-shipped/", {"supplier_tracking_number": "X"},
                    format="json").status_code == 409  # already shipped
    history = ops.get(f"{PROC}/{pid}/history/").json()
    assert [h["to_status"] for h in history] == ["pending_sourcing", "supplier_selected", "paid", "supplier_shipped"]


def test_supplier_cancellation_after_shipping_goes_back_to_supplier_selection(ops, make_intl, supplier):
    order = make_intl(paid="2500000")
    pid = proc_of(order).id
    ops.post(f"{PROC}/{pid}/select-supplier/", {"supplier": supplier.id, "item_cost": "100",
                                                "supplier_order_number": "PO-1"}, format="json")
    ops.post(f"{PROC}/{pid}/mark-paid/", {"payment_reference": "TT-1"}, format="json")
    ops.post(f"{PROC}/{pid}/mark-shipped/", {"supplier_tracking_number": "SZ-1"}, format="json")
    assert ops.post(f"{PROC}/{pid}/cancel-supplier/", {"reason": " "}, format="json").status_code == 400
    body = ops.post(f"{PROC}/{pid}/cancel-supplier/", {"reason": "Failed to ship"}, format="json").json()
    assert body["status"] == "supplier_cancelled" and body["actions"] == ["select_supplier"]
    # The order is back at supplier selection, and that supplier order's details are cleared...
    assert body["order"]["status"] == "supplier_confirmed"
    assert (body["supplier_order_number"], body["supplier_tracking_number"], body["payment_reference"],
            body["paid_at"], body["shipped_at"]) == ("", "", "", None, None)
    assert CargoParcel.objects.get(order=order).stage == "cancelled"
    order.refresh_from_db()
    assert order.department == "procurement" and order.international.tracking_number == ""
    # ...but kept in the history.
    note = ops.get(f"{PROC}/{pid}/history/").json()[-1]["note"]
    assert "Failed to ship" in note and "TT-1" in note and "SZ-1" in note
    assert OrderStatusHistory.objects.filter(order=order, from_status="waiting_to_receive",
                                             to_status="supplier_confirmed").exists()
    # A new supplier can be selected, paid and shipped again.
    other = Supplier.objects.create(name="Guangzhou Supplies", country=supplier.country)
    assert ops.post(f"{PROC}/{pid}/select-supplier/", {"supplier": other.id}, format="json").json()["status"] == \
        "supplier_selected"
    res = ops.post(f"{PROC}/{pid}/mark-paid/", {"payment_reference": "TT-2"}, format="json")
    assert res.status_code == 200, res.json()
    assert res.json()["order"]["status"] == "paid_supplier"
    body = ops.post(f"{PROC}/{pid}/mark-shipped/", {"supplier_tracking_number": "GZ-2"}, format="json").json()
    assert body["status"] == "supplier_shipped" and body["order"]["status"] == "waiting_to_receive"
    parcel = CargoParcel.objects.get(order=order)
    assert parcel.stage == "waiting" and parcel.supplier_tracking_number == "GZ-2"


def test_supplier_cancellation_after_payment_and_production(ops, make_intl, supplier):
    order = make_intl(paid="2500000")
    pid = proc_of(order).id
    ops.post(f"{PROC}/{pid}/select-supplier/", {"supplier": supplier.id, "item_cost": "100"}, format="json")
    ops.post(f"{PROC}/{pid}/mark-paid/", {}, format="json")
    move = f"/api/orders/international/{order.id}/transition/"
    assert ops.post(move, {"status": "in_production"}, format="json").status_code == 200
    # Going back to Supplier Confirmed is only possible by cancelling the supplier.
    assert ops.post(move, {"status": "supplier_confirmed"}, format="json").status_code == 409
    statuses = {t["value"] for t in ops.get(f"/api/orders/international/{order.id}/").json()["allowed_transitions"]}
    assert "supplier_confirmed" not in statuses
    body = ops.post(f"{PROC}/{pid}/cancel-supplier/", {"reason": "Out of stock"}, format="json").json()
    assert body["order"]["status"] == "supplier_confirmed" and body["paid_at"] is None
    ops.post(f"{PROC}/{pid}/select-supplier/", {"supplier": supplier.id}, format="json")
    assert ops.post(f"{PROC}/{pid}/mark-paid/", {}, format="json").status_code == 200


def test_supplier_cancellation_before_payment_keeps_order_status(ops, make_intl, supplier):
    order = make_intl(paid="2500000")
    pid = proc_of(order).id
    ops.post(f"{PROC}/{pid}/select-supplier/", {"supplier": supplier.id, "item_cost": "100"}, format="json")
    body = ops.post(f"{PROC}/{pid}/cancel-supplier/", {"reason": "No reply"}, format="json").json()
    assert body["status"] == "supplier_cancelled" and body["order"]["status"] == "supplier_confirmed"
    assert not CargoParcel.objects.filter(order=order).exists()


def test_order_cancellation_cancels_procurement(ops, make_intl):
    order = make_intl()
    res = ops.post(f"/api/orders/international/{order.id}/transition/", {"status": "cancelled"}, format="json")
    assert res.status_code == 200
    assert proc_of(order).status == "cancelled"


def test_procurement_list_filters_stats_and_permissions(ops, client_for, make_intl, supplier):
    a = make_intl(paid="2500000", items="Smartphones")
    make_intl(iso="GB", items="Machinery parts")
    ops.post(f"{PROC}/{proc_of(a).id}/select-supplier/", {"supplier": supplier.id, "item_cost": "1800000"},
             format="json")
    ops.patch(f"{PROC}/{proc_of(a).id}/", {"exception_flag": "supplier_delay", "operator": ops.user.id},
              format="json")
    assert ops.get(f"{PROC}/?origin=gb").json()["count"] == 1
    assert ops.get(f"{PROC}/?status=supplier_selected").json()["count"] == 1
    assert ops.get(f"{PROC}/?search=Shenzhen").json()["count"] == 1
    assert ops.get(f"{PROC}/?exception=any").json()["count"] == 1
    assert ops.get(f"{PROC}/?operator={ops.user.id}").json()["count"] == 1
    stats = ops.get(f"{PROC}/stats/").json()
    assert stats == {"total": 2, "pending_sourcing": 1, "paid": 0, "shipped": 0, "received_at_cargo": 0,
                     "with_exceptions": 1, "total_value": "1800000.00"}
    sales = client_for(StaffLevel.SALES)  # view only
    assert sales.get(f"{PROC}/").status_code == 200
    assert sales.post(f"{PROC}/{proc_of(a).id}/mark-paid/", {}, format="json").status_code == 403
    assert client_for(StaffLevel.PROCUREMENT).post(f"{PROC}/{proc_of(a).id}/mark-paid/", {},
                                                   format="json").status_code == 200


def test_procurement_shows_the_customer_and_staff_photos(ops, client_for, make_intl):
    from django.core.files.uploadedfile import SimpleUploadedFile

    from apps.orders.models import OrderAttachment

    order = make_intl()
    png = b"\x89PNG\r\n\x1a\n" + b"0" * 32
    mine = OrderAttachment.objects.create(order=order, file=SimpleUploadedFile("a.png", png), content_type="image/png",
                                          caption="Customer photo")
    OrderAttachment.objects.create(order=order, file=SimpleUploadedFile("b.png", png), content_type="image/png",
                                   caption="AGIZA quotation photo")
    proc = proc_of(order)
    photos = ops.get(f"{PROC}/{proc.id}/").json()["photos"]
    assert [p["from_customer"] for p in photos] == [True, False]
    assert ops.get(f"{PROC}/").json()["results"][0]["photos"][0]["id"] == mine.id
    procurement = client_for(StaffLevel.PROCUREMENT)
    res = procurement.get(f"/api/{photos[0]['url']}/")
    assert res.status_code == 200 and b"".join(res.streaming_content if res.streaming else [res.content]) == png
    other = make_intl()
    assert procurement.get(f"{PROC}/{proc_of(other).id}/photos/{mine.id}/file/").status_code == 404
    assert client_for(StaffLevel.DRIVER).get(f"/api/{photos[0]['url']}/").status_code == 403
