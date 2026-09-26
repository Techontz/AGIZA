"""International orders (workflow, payments, installments) and Equipment Support orders."""
import pytest

from apps.accounts.constants import StaffLevel
from apps.orders.models import OrderStatusHistory

from . import flows
from .conftest import EQUIP, INTL, move

pytestmark = pytest.mark.django_db


@pytest.fixture
def new_intl(admin, customer, china):
    def _make(**extra):
        payload = {"customer": customer.id, "item_details": "Samsung Galaxy A54 × 20", "source_country": china.id,
                   "total_amount": "2500000", **extra}
        res = admin.post(f"{INTL}/", payload, format="json")
        assert res.status_code == 201, res.json()
        return res.json()

    return _make


def test_international_full_workflow_moves_departments(admin, new_intl):
    """The order is moved by Procurement, cargo receipt, shipment milestones and delivery — never by hand."""
    order = new_intl()
    assert order["reference"].startswith("INT-") and order["status"] == "pending_payment"
    assert order["department"] == "procurement"
    departments = {}
    for stage in flows.STAGES:
        order = flows.walk(admin, order, stage)
        assert order["status"] == stage
        departments[stage] = order["department"]
    assert departments["paid_supplier"] == "procurement"
    assert departments["shipping_to_destination"] == "shipping"
    assert departments["ready_for_collection"] == "delivery"
    statuses = list(OrderStatusHistory.objects.filter(order_id=order["id"]).values_list("to_status", flat=True))
    assert statuses == ["pending_payment", *flows.STAGES]


def test_procurement_and_shipping_stages_cannot_be_set_by_hand(admin, new_intl):
    order = new_intl()
    for stage in ("paid_supplier", "sent_to_consolidation", "shipping_to_destination", "clearance",
                  "ready_for_collection"):
        assert move(admin, INTL, order["id"], stage).status_code in (400, 409), stage
    detail = admin.get(f"{INTL}/{order['id']}/").json()
    assert {t["value"] for t in detail["allowed_transitions"]} == {"supplier_confirmed", "issue_pending_payment",
                                                                   "cancelled"}


def test_international_invalid_transitions(admin, new_intl):
    order = new_intl()
    assert move(admin, INTL, order["id"], "clearance").status_code == 409
    move(admin, INTL, order["id"], "issue_pending_payment")
    assert move(admin, INTL, order["id"], "pending_payment").status_code == 200
    flows.walk(admin, order, "paid_supplier")
    assert move(admin, INTL, order["id"], "cancelled").status_code == 409  # too late once the supplier is paid


def test_payments_summary_overpayment_and_permissions(admin, client_for, new_intl):
    order = new_intl()
    url = f"{INTL}/{order['id']}/payments/"
    assert admin.post(url, {"amount": "1000000", "method": "bank_transfer"}, format="json").status_code == 201
    detail = admin.get(f"{INTL}/{order['id']}/").json()
    assert detail["payment"] == {"total": "2500000.00", "paid": "1000000.00", "due": "1500000.00", "status": "partial"}
    over = admin.post(url, {"amount": "2000000", "method": "cash"}, format="json")
    assert over.status_code == 400 and "outstanding balance" in over.json()["error"]["message"]
    assert client_for(StaffLevel.SALES).post(url, {"amount": "1", "method": "cash"}, format="json").status_code == 403
    finance = client_for(StaffLevel.FINANCE)
    assert finance.post(url, {"amount": "1500000", "method": "cash"}, format="json").status_code == 201
    assert admin.get(f"{INTL}/{order['id']}/").json()["payment"]["status"] == "fully_paid"
    assert len(admin.get(url).json()) == 2


def test_installments_need_attention_until_approved(admin, client_for, new_intl):
    order = new_intl(installment_plan=True)
    assert order["needs_attention"] is True and order["payment"]["status"] == "installment"
    assert admin.get(f"{INTL}/?tab=attention").json()["count"] == 1
    assert admin.get(f"{INTL}/stats/").json() == {"active": 0, "needs_attention": 1, "in_production": 0, "completed": 0}
    url = f"{INTL}/{order['id']}/installment-approval/"
    assert client_for(StaffLevel.SALES).post(url, {"allowed": True}, format="json").status_code == 403
    res = admin.post(url, {"allowed": True}, format="json")
    assert res.json()["needs_attention"] is False
    assert admin.get(f"{INTL}/?tab=active").json()["count"] == 1


def test_international_details_update_and_closed_orders(admin, new_intl):
    order = new_intl()
    res = admin.patch(f"{INTL}/{order['id']}/", {"supplier_name": "Shenzhen Tech Co.", "tracking_number": "SF-1",
                                                 "item_cost": "1800000", "shipping_cost": "200000"}, format="json")
    d = res.json()["details"]
    assert d["supplier_name"] == "Shenzhen Tech Co." and d["item_cost"] == "1800000.00"
    flows.walk(admin, order, "completed")
    assert admin.patch(f"{INTL}/{order['id']}/", {"supplier_name": "X"}, format="json").status_code == 409
    assert admin.patch(f"{INTL}/{order['id']}/", {"notes": "Collected"}, format="json").status_code == 200


def test_international_filters(admin, new_intl, china):
    from apps.locations.models import Country

    new_intl()
    new_intl(source_country=Country.objects.get(iso2="AE").id, service_type="deliver_for_me")
    assert admin.get(f"{INTL}/?origin=cn").json()["count"] == 1
    assert admin.get(f"{INTL}/?service_type=deliver_for_me").json()["count"] == 1
    assert admin.get(f"{INTL}/?search=Galaxy").json()["count"] == 2


# --------------------------------------------------------------------------- #
# Equipment support
# --------------------------------------------------------------------------- #
@pytest.fixture
def new_equipment(admin, customer, cities):
    def _make(**extra):
        payload = {"customer": customer.id, "item_details": "Industrial oven", "service_type": "installation",
                   "equipment": "Industrial Convection Oven", "classification": "machinery",
                   "city": cities["Dar es Salaam"].id, "total_amount": "2800000", **extra}
        res = admin.post(f"{EQUIP}/", payload, format="json")
        assert res.status_code == 201, res.json()
        return res.json()

    return _make


def test_equipment_workflow_with_technician_and_timeline(admin, client_for, new_equipment):
    tech = client_for(StaffLevel.DATA_ENTRY).user
    order = new_equipment()
    oid = order["id"]
    assert order["reference"].startswith("EQ-") and order["status"] == "pending"
    early = admin.post(f"{EQUIP}/{oid}/assign-technician/", {"user": tech.id}, format="json")
    assert early.status_code == 409

    assert move(admin, EQUIP, oid, "approved").status_code == 200
    assert move(admin, EQUIP, oid, "assigned").status_code == 400  # needs the assign action
    res = admin.post(f"{EQUIP}/{oid}/assign-technician/", {"user": tech.id}, format="json")
    assert res.json()["status"] == "assigned" and res.json()["details"]["technician"]["id"] == tech.id
    assert res.json()["handler"]["id"] == tech.id

    for status in ["on_site", "in_progress", "maintenance_required", "in_progress", "testing", "completed"]:
        assert move(admin, EQUIP, oid, status).status_code == 200, status
    timeline = admin.get(f"{EQUIP}/{oid}/").json()["service_timeline"]
    assert [step["done"] for step in timeline] == [True, True, True, True]
    assert move(admin, EQUIP, oid, "testing").status_code == 409


def test_equipment_expected_date_inline_edit(admin, new_equipment):
    order = new_equipment()
    res = admin.post(f"{EQUIP}/{order['id']}/expected-date/", {"expected_date": "2026-10-02T09:00:00+03:00"}, format="json")
    assert res.status_code == 200 and res.json()["details"]["expected_date"].startswith("2026-10-02")
    move(admin, EQUIP, order["id"], "cancelled")
    assert admin.post(f"{EQUIP}/{order['id']}/expected-date/", {"expected_date": "2026-10-03T09:00:00+03:00"},
                      format="json").status_code == 409


def test_equipment_tabs_stats_and_search(admin, new_equipment):
    a = new_equipment()
    new_equipment(equipment="CCTV System (8 cameras)", service_type="maintenance")
    admin.patch(f"{EQUIP}/{a['id']}/", {"needs_attention": True}, format="json")
    stats = admin.get(f"{EQUIP}/stats/").json()
    assert stats == {"active": 2, "pending_approval": 2, "in_progress": 0, "maintenance_alerts": 1}
    assert admin.get(f"{EQUIP}/?tab=attention").json()["count"] == 1
    assert admin.get(f"{EQUIP}/?search=cctv").json()["count"] == 1
    assert admin.get(f"{EQUIP}/?service_type=maintenance").json()["count"] == 1
