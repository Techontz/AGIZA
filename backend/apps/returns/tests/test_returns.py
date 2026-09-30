"""Returns: workflow, owning department, inspection, decision and refunds."""
import pytest

from apps.accounts.constants import StaffLevel
from apps.orders.models import Payment

pytestmark = pytest.mark.django_db

RET = "/api/returns"


@pytest.fixture
def paid(make_intl):
    return make_intl(paid="2500000")


def new_return(client, order, **extra):
    payload = {"order": order.id, "return_type": "damaged_item", "reason_code": "damaged_in_transit", **extra}
    res = client.post(f"{RET}/", payload, format="json")
    assert res.status_code == 201, res.json()
    return res.json()


def move(client, rid, status, note=""):
    return client.post(f"{RET}/{rid}/transition/", {"status": status, "note": note}, format="json")


def test_refund_workflow_owners_history_and_payment(ops, paid):
    ret = new_return(ops, paid, notes="Screen cracked")
    assert ret["reference"].startswith("RET-") and ret["status"] == "initiated" and ret["owner"] == "support"
    assert ret["exception_flag"] == "high_value_item"  # TSh 2.5M is a high-value item
    assert ret["return_value"] == "2500000.00" and ret["financial_impact"] == "refund_required"
    rid = ret["id"]
    assert move(ops, rid, "inspected").status_code == 409  # not reachable from Initiated
    assert move(ops, rid, "approved").status_code in (400, 409)
    assert move(ops, rid, "in_transit").json()["owner"] == "delivery"
    assert move(ops, rid, "received").json()["owner"] == "warehouse"
    assert ops.post(f"{RET}/{rid}/inspect/", {"item_condition": "damaged", "notes": ""},
                    format="json").status_code == 400
    body = ops.post(f"{RET}/{rid}/inspect/", {"item_condition": "damaged", "notes": "Cracked, box crushed"},
                    format="json").json()
    assert body["status"] == "inspected" and body["item_condition_display"] == "Damaged"
    too_much = ops.post(f"{RET}/{rid}/decide/", {"approve": True, "notes": "OK", "refund_amount": "3000000"},
                        format="json")
    assert too_much.status_code == 400 and "paid" in too_much.json()["error"]["message"]
    body = ops.post(f"{RET}/{rid}/decide/", {"approve": True, "notes": "Transit damage", "refund_amount": "2000000"},
                    format="json").json()
    assert body["status"] == "approved" and body["owner"] == "finance" and body["refund_amount"] == "2000000.00"
    assert ops.post(f"{RET}/{rid}/close/", {}, format="json").status_code == 400  # refund method required
    body = ops.post(f"{RET}/{rid}/close/", {"refund_method": "mobile_money", "refund_reference": "MP-1",
                                              "notes": "Paid out"}, format="json").json()
    assert body["status"] == "closed" and body["closed_at"]
    refund = Payment.objects.get(order=paid, kind="refund")
    assert refund.amount == 2000000 and refund.reference == "MP-1"
    summary = ops.get(f"/api/orders/international/{paid.id}/").json()["payment"]
    # The refunded goods are taken off the order (explicit adjustment): nothing is owed for them.
    assert summary["paid"] == "500000.00" and summary["total"] == "500000.00" and summary["due"] == "0.00"
    assert summary["status"] == "fully_paid"
    assert paid.adjustments.get().return_request_id == rid
    history = ops.get(f"{RET}/{rid}/history/").json()
    assert [h["to_status"] for h in history] == ["initiated", "in_transit", "received", "inspected", "approved",
                                                 "closed"]
    assert body["last_update"]["department"] == "finance"


def test_rejection_and_replacement_paths(ops, paid):
    early = new_return(ops, paid, return_type="delivery_failed", reason_code="address_incorrect")
    assert early["financial_impact"] == "no_refund"
    assert ops.post(f"{RET}/{early['id']}/decide/", {"approve": False, "notes": ""}, format="json").status_code == 400
    body = ops.post(f"{RET}/{early['id']}/decide/", {"approve": False, "notes": "Rescheduled instead"},
                    format="json").json()
    assert body["status"] == "rejected" and body["owner"] == "support"
    assert ops.post(f"{RET}/{early['id']}/close/", {}, format="json").json()["status"] == "closed"

    swap = new_return(ops, paid, return_type="wrong_item", reason_code="item_mismatch",
                      financial_impact="replacement_required")
    rid = swap["id"]
    move(ops, rid, "received")
    ops.post(f"{RET}/{rid}/inspect/", {"item_condition": "as_described", "notes": "Wrong size"}, format="json")
    body = ops.post(f"{RET}/{rid}/decide/", {"approve": True, "notes": "Send size 42"}, format="json").json()
    assert body["owner"] == "warehouse" and body["refund_amount"] is None
    assert ops.post(f"{RET}/{rid}/close/", {}, format="json").json()["status"] == "closed"
    assert not Payment.objects.filter(kind="refund").exists()
    assert ops.patch(f"{RET}/{rid}/", {"return_value": "1"}, format="json").status_code == 409
    assert ops.patch(f"{RET}/{rid}/", {"notes": "Replacement delivered"}, format="json").status_code == 200


def test_refund_needs_finance_or_returns_manage(ops, client_for, paid):
    rid = new_return(ops, paid)["id"]
    move(ops, rid, "received")
    ops.post(f"{RET}/{rid}/inspect/", {"item_condition": "damaged", "notes": "x"}, format="json")
    ops.post(f"{RET}/{rid}/decide/", {"approve": True, "notes": "ok", "refund_amount": "1000"}, format="json")
    sales = client_for(StaffLevel.SALES)  # returns: edit, finance: view
    res = sales.post(f"{RET}/{rid}/close/", {"refund_method": "cash"}, format="json")
    assert res.status_code == 403
    finance = client_for(StaffLevel.FINANCE)  # returns: edit, finance: manage
    assert finance.post(f"{RET}/{rid}/close/", {"refund_method": "cash"}, format="json").status_code == 200
    assert client_for(StaffLevel.DRIVER).get(f"{RET}/").status_code == 403


def test_reassign_filters_and_stats(ops, client_for, paid):
    handler = client_for(StaffLevel.DATA_ENTRY, full_name="Ahmed Msemo").user
    a = new_return(ops, paid, exception_flag="dispute")
    b = new_return(ops, paid, return_type="wrong_item", reason_code="item_mismatch", return_value="180000")
    body = ops.post(f"{RET}/{a['id']}/reassign/", {"handler": handler.id}, format="json").json()
    assert body["handler"]["full_name"] == "Ahmed Msemo" and body["handler"]["role"] == "Data Entry"
    ops.post(f"{RET}/{b['id']}/decide/", {"approve": False, "notes": "Not eligible"}, format="json")
    assert ops.get(f"{RET}/?tab=active").json()["count"] == 1
    assert ops.get(f"{RET}/?tab=completed").json()["count"] == 1
    assert ops.get(f"{RET}/?owner=support&status=initiated").json()["count"] == 1
    assert ops.get(f"{RET}/?search={paid.reference}").json()["count"] == 2
    assert ops.get(f"{RET}/?handler={handler.id}").json()["count"] == 1
    stats = ops.get(f"{RET}/stats/").json()
    assert stats == {"active": 1, "completed": 1, "with_exceptions": 1, "pending_refunds": "2500000.00"}
