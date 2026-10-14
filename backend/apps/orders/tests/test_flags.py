"""Exception flags on orders: raised by Procurement / Shipping staff, and automatically when orders stall."""
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.accounts.constants import StaffLevel
from apps.orders import alerts
from apps.orders.models import Order, OrderFlag, OrderStatusHistory
from apps.procurement.models import ProcurementOrder
from apps.storefront.models import CustomerNotification

from .conftest import INTL

pytestmark = pytest.mark.django_db
FLAGS = "/api/order-flags/"


@pytest.fixture
def intl(admin, customer, china):
    def _make(**extra):
        payload = {"customer": customer.id, "item_details": "Galaxy A54 × 20", "source_country": china.id,
                   "total_amount": "2500000", **extra}
        res = admin.post(f"{INTL}/", payload, format="json")
        assert res.status_code == 201, res.json()
        return Order.objects.get(pk=res.json()["id"])

    return _make


def test_procurement_staff_raise_and_resolve_a_flag(intl, admin, client_for):
    order = intl()
    procurement = client_for(StaffLevel.PROCUREMENT)
    res = procurement.post(FLAGS, {"order": order.pk, "kind": "angry_client", "note": "Called twice today",
                                   "department": "procurement"}, format="json")
    assert res.status_code == 201, res.json()
    flag = res.json()
    assert flag["kind_display"] == "Angry Client" and flag["automatic"] is False
    # The same kind again keeps one open flag (with the newer note).
    again = procurement.post(FLAGS, {"order": order.pk, "kind": "angry_client", "note": "Wants a refund"},
                             format="json")
    assert again.json()["id"] == flag["id"] and again.json()["note"] == "Wants a refund"
    assert procurement.post(FLAGS, {"order": order.pk, "kind": "other"}, format="json").status_code == 400
    assert procurement.post(FLAGS, {"order": order.pk, "kind": "procurement_stalled"},
                            format="json").status_code == 400  # automatic kinds can't be raised by hand
    # It shows on the order, in Needs Attention, and in Procurement's list.
    body = admin.get(f"{INTL}/{order.pk}/").json()
    assert [f["kind"] for f in body["flags"]] == ["angry_client"] and body["needs_attention"] is True
    assert admin.get(f"{INTL}/?tab=attention").json()["count"] == 1
    assert admin.get(f"{INTL}/?flagged=true").json()["count"] == 1
    row = procurement.get("/api/procurement/orders/").json()["results"][0]
    assert row["order"]["flags"][0]["note"] == "Wants a refund"
    # Customers never hear about internal flags.
    assert not CustomerNotification.objects.filter(customer=order.customer, body__startswith="Status:").exists()

    resolved = procurement.post(f"{FLAGS}{flag['id']}/resolve/", {"note": "Refunded the shipping fee"}, format="json")
    assert resolved.status_code == 200 and resolved.json()["resolved_by"] is not None
    assert procurement.post(f"{FLAGS}{flag['id']}/resolve/", {}, format="json").status_code == 409
    assert admin.get(f"{INTL}/{order.pk}/").json()["flags"] == []
    notes = list(OrderStatusHistory.objects.filter(order=order).values_list("note", flat=True))
    assert "Flag raised — Angry Client: Called twice today" in notes
    assert "Flag resolved — Angry Client: Refunded the shipping fee" in notes
    assert procurement.get(f"{FLAGS}?order={order.pk}&open=false").json()["count"] == 1


def test_drivers_cannot_raise_flags(intl, client_for):
    order = intl()
    driver = client_for(StaffLevel.DRIVER)
    assert driver.post(FLAGS, {"order": order.pk, "kind": "needs_care"}, format="json").status_code == 403


def test_automatic_flags_for_stalled_procurement_and_close_delivery(intl, admin):
    stalled, fresh, waiting = intl(), intl(), intl(installment_plan=True)
    old = timezone.now() - timedelta(days=4)
    ProcurementOrder.objects.filter(order__in=[stalled, waiting]).update(created_at=old)
    shipping = intl(service_type="deliver_for_me")  # with Shipping from the start
    shipping.international.estimated_delivery = timezone.localdate() + timedelta(days=2)
    shipping.international.save()

    assert alerts.refresh_automatic() == {"raised": 2, "resolved": 0}
    kinds = dict(OrderFlag.objects.filter(resolved_at__isnull=True).values_list("order_id", "kind"))
    assert kinds == {stalled.pk: "procurement_stalled", shipping.pk: "delivery_due_soon"}
    assert fresh.pk not in kinds and waiting.pk not in kinds  # unapproved installments aren't procurement's yet
    note = OrderFlag.objects.get(order=shipping).note
    assert "2 day(s) left" in note
    # Running again changes nothing.
    assert alerts.refresh_automatic() == {"raised": 0, "resolved": 0}

    # A later expected date clears "date close" straight away; the stalled one clears once it moves on.
    later = (timezone.localdate() + timedelta(days=20)).isoformat()
    admin.patch(f"{INTL}/{shipping.pk}/", {"estimated_delivery": later}, format="json")
    assert not OrderFlag.objects.filter(order=shipping, resolved_at__isnull=True).exists()
    ProcurementOrder.objects.filter(order=stalled).update(status="supplier_shipped")
    assert alerts.refresh_automatic() == {"raised": 0, "resolved": 1}
    assert OrderFlag.objects.get(order=stalled).resolution_note == "Cleared automatically"
