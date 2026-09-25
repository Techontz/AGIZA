"""Intake & Quotes: respond → customer reply → approve & create order (transactional)."""
import pytest

from apps.accounts.constants import StaffLevel
from apps.accounts.models import RolePermission
from apps.orders.models import Order, OrderStatusHistory
from apps.quotes import services as quote_services
from apps.quotes.models import QuoteRequest, QuoteStatusHistory

from .conftest import QUOTES

pytestmark = pytest.mark.django_db


@pytest.fixture
def new_quote(admin, customer):
    def _make(service_type="express", **extra):
        payload = {"customer_id": customer.id, "service_type": service_type,
                   "description": "Laptop delivery", "origin": "Dar es Salaam", "destination": "Arusha", **extra}
        res = admin.post(f"{QUOTES}/", payload, format="json")
        assert res.status_code == 201, res.json()
        return res.json()

    return _make


def respond(client, qid, amount="45000"):
    return client.post(f"{QUOTES}/{qid}/respond/", {"quoted_amount": amount, "estimated_delivery": "2026-10-10",
                                                     "response_notes": "Includes insurance"}, format="json")


@pytest.fixture
def answered(admin, new_quote):
    def _make(service_type="express", **extra):
        q = new_quote(service_type, **extra)
        assert respond(admin, q["id"]).status_code == 200
        res = admin.post(f"{QUOTES}/{q['id']}/reply/", {"accepted": True}, format="json")
        assert res.json()["status"] == "answered"
        return res.json()

    return _make


def test_create_quote(new_quote):
    q = new_quote()
    assert q["reference"].startswith("Q-") and q["status"] == "new" and q["customer"]["full_name"] == "Juma Mwangi"
    assert QuoteStatusHistory.objects.filter(quote_id=q["id"], to_status="new").exists()


def test_respond_and_reply_lifecycle(admin, new_quote):
    q = new_quote()
    assert respond(admin, q["id"], amount="0").status_code == 400
    res = respond(admin, q["id"])
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "waiting_reply" and body["quoted_amount"] == "45000.00"
    assert body["responded_by"]["full_name"]

    declined = admin.post(f"{QUOTES}/{q['id']}/reply/", {"accepted": False, "note": "Too expensive"}, format="json")
    assert declined.json()["status"] == "declined"
    assert respond(admin, q["id"], amount="40000").json()["status"] == "waiting_reply"  # re-quote
    assert admin.post(f"{QUOTES}/{q['id']}/reply/", {"accepted": True}, format="json").json()["status"] == "answered"
    notes = [h["note"] for h in admin.get(f"{QUOTES}/{q['id']}/history/").json()]
    assert "Too expensive" in notes


def test_reply_only_when_waiting(admin, new_quote):
    q = new_quote()
    assert admin.post(f"{QUOTES}/{q['id']}/reply/", {"accepted": True}, format="json").status_code == 409


def test_approve_express_creates_accepted_order(admin, answered, cities):
    q = answered("express")
    res = admin.post(f"{QUOTES}/{q['id']}/approve/", {
        "pickup_address": "Kariakoo", "pickup_city": cities["Dar es Salaam"].id,
        "delivery_address": "Clock Tower", "delivery_city": cities["Arusha"].id, "package_size": "medium",
    }, format="json")
    assert res.status_code == 201, res.json()
    created = res.json()["created_order"]
    assert created["reference"].startswith("EXP-") and res.json()["status"] == "approved"
    order = Order.objects.get(pk=created["id"])
    assert order.status == "accepted" and str(order.total_amount) == "45000.00"
    assert order.source_quote_id == q["id"] and order.express.estimated_delivery_at is not None
    assert OrderStatusHistory.objects.filter(order=order, to_status="accepted", note__contains=q["reference"]).exists()
    # Approving twice is refused.
    assert admin.post(f"{QUOTES}/{q['id']}/approve/", {"pickup_address": "x", "delivery_address": "y"},
                      format="json").status_code == 409


def test_approve_international_and_country_guess(admin, answered, china):
    q = answered("international", origin="China", destination="Dar es Salaam")
    defaults = admin.get(f"{QUOTES}/{q['id']}/approval-defaults/").json()
    assert defaults["source_country"] == china.id
    assert admin.post(f"{QUOTES}/{q['id']}/approve/", {}, format="json").status_code == 400
    res = admin.post(f"{QUOTES}/{q['id']}/approve/", {"source_country": china.id, "order_class": "bulk",
                                                       "installment_plan": True}, format="json")
    order = Order.objects.get(pk=res.json()["created_order"]["id"])
    assert order.reference.startswith("INT-") and order.status == "pending_payment"
    assert order.department == "procurement" and order.installment_plan is True
    assert order.international.order_class == "bulk"


def test_approve_equipment_requires_details(admin, answered):
    q = answered("equipment", origin="", destination="")
    missing = admin.post(f"{QUOTES}/{q['id']}/approve/", {}, format="json")
    assert missing.status_code == 400 and {"service_type", "equipment"} <= set(missing.json()["error"]["details"])
    res = admin.post(f"{QUOTES}/{q['id']}/approve/", {"service_type": "installation", "equipment": "Solar heater"},
                     format="json")
    order = Order.objects.get(pk=res.json()["created_order"]["id"])
    assert order.reference.startswith("EQ-") and order.status == "approved"


def test_approve_is_atomic(admin, answered, monkeypatch):
    q = answered("express")
    before = Order.objects.count()

    def boom(*args, **kwargs):
        raise RuntimeError("simulated failure after the order was created")

    monkeypatch.setattr(quote_services, "_move", boom)
    quote = QuoteRequest.objects.get(pk=q["id"])
    with pytest.raises(RuntimeError):
        quote_services.approve(quote, user=None, order_details={"pickup_address": "a", "delivery_address": "b"})
    assert Order.objects.count() == before  # the order was rolled back with the failed approval
    quote.refresh_from_db()
    assert quote.status == "answered"


def test_approval_permissions(client_for, answered):
    q = answered("express")
    RolePermission.objects.filter(staff_level="data_entry", module="orders").update(access="view")
    data_entry = client_for(StaffLevel.DATA_ENTRY)  # intake = edit, orders now view
    res = data_entry.post(f"{QUOTES}/{q['id']}/approve/", {"pickup_address": "a", "delivery_address": "b"}, format="json")
    assert res.status_code == 403
    assert client_for(StaffLevel.FINANCE).post(f"{QUOTES}/{q['id']}/respond/", {"quoted_amount": "1"},
                                               format="json").status_code == 403  # intake = view
    assert client_for(StaffLevel.DRIVER).get(f"{QUOTES}/").status_code == 403


def test_stats_filter_search_and_edit_rules(admin, new_quote, answered):
    new_quote(description="Industrial oven installation", service_type="equipment")
    answered()
    stats = admin.get(f"{QUOTES}/stats/").json()
    assert stats["new"] == 1 and stats["answered"] == 1
    assert admin.get(f"{QUOTES}/?status=answered").json()["count"] == 1
    assert admin.get(f"{QUOTES}/?search=oven").json()["count"] == 1
    assert admin.get(f"{QUOTES}/?service_type=equipment").json()["count"] == 1
    responded = answered()
    assert admin.patch(f"{QUOTES}/{responded['id']}/", {"origin": "Mwanza"}, format="json").status_code == 400
