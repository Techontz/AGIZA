"""Cancelled Orders (reason required, history, resubmitting) and the Intake customer-type badge."""
import pytest

from apps.accounts.constants import StaffLevel
from apps.crm.models import CustomerTag, Tag
from apps.orders.models import Order, OrderStatusHistory

from .conftest import INTL, QUOTES, move

pytestmark = pytest.mark.django_db
CANCELLED = "/api/orders/cancelled"


@pytest.fixture
def intl(admin, customer, china):
    def _make(**extra):
        payload = {"customer": customer.id, "item_details": "Galaxy A54 × 20", "source_country": china.id,
                   "total_amount": "2500000", **extra}
        return admin.post(f"{INTL}/", payload, format="json").json()

    return _make


def test_cancelling_needs_a_reason_and_lands_in_cancelled_orders(admin, intl):
    order = intl()
    res = move(admin, INTL, order["id"], "cancelled")
    assert res.status_code == 400 and res.json()["error"]["details"]["note"]
    assert move(admin, INTL, order["id"], "cancelled", "Customer found it cheaper locally").status_code == 200
    rows = admin.get(f"{CANCELLED}/").json()["results"]
    assert [r["reference"] for r in rows] == [order["reference"]]
    row = rows[0]
    assert row["cancellation_reason"] == "Customer found it cheaper locally"
    assert row["cancelled_by"]["full_name"] and row["cancelled_at"] and row["can_resubmit"] is True
    history = admin.get(f"{CANCELLED}/{order['id']}/history/").json()
    assert history[-1]["to_status"] == "cancelled"
    assert admin.get(f"{CANCELLED}/?search=cheaper").json()["count"] == 1
    assert admin.get(f"{CANCELLED}/?order_type=express").json()["count"] == 0


def test_resubmit_creates_a_new_order_and_links_both(admin, intl, client_for):
    order = intl(service_type="full_service", order_class="fragile")
    move(admin, INTL, order["id"], "cancelled", "Wrong supplier link")
    url = f"{CANCELLED}/{order['id']}/resubmit/"
    assert client_for(StaffLevel.DRIVER).post(url, {}, format="json").status_code == 403
    res = admin.post(url, {"note": "Customer sent the right link"}, format="json")
    assert res.status_code == 201, res.json()
    new_ref = res.json()["new_order"]["reference"]
    new = Order.objects.get(reference=new_ref)
    assert new.status == "pending_payment" and new.customer_id == order["customer"]["id"]
    assert new.item_details == order["item_details"] and str(new.total_amount) == "2500000.00"
    assert new.international.order_class == "fragile" and new.procurement.status == "pending_sourcing"
    body = res.json()
    assert body["resubmitted_as"]["reference"] == new_ref and body["can_resubmit"] is False
    assert admin.post(url, {}, format="json").status_code == 409  # only once
    assert OrderStatusHistory.objects.filter(order=new, note__contains=order["reference"]).exists()
    assert admin.get(f"{CANCELLED}/?resubmitted=true").json()["count"] == 1
    # An open order can't be resubmitted.
    assert admin.post(f"{CANCELLED}/{new.pk}/resubmit/", {}, format="json").status_code == 404


def test_intake_badges_new_repeat_and_priority_customers(admin, customer, intl):
    def badge():
        q = admin.post(f"{QUOTES}/", {"customer_id": customer.id, "service_type": "international",
                                      "description": "Laptops"}, format="json").json()
        listed = next(r for r in admin.get(f"{QUOTES}/").json()["results"] if r["id"] == q["id"])
        assert listed["customer_type"] == q["customer_type"]
        return q["customer_type"]

    assert badge() == {"kind": "new", "label": "New Customer", "orders": 0, "priority": False}
    intl()
    assert badge()["kind"] == "repeat" and badge()["orders"] == 1
    CustomerTag.objects.create(customer=customer, tag=Tag.objects.create(name="VIP"), source="manual")
    assert badge() == {"kind": "priority", "label": "Priority", "orders": 1, "priority": True}
