"""Tasks: SLA views, status changes, ownership, notes and automatic quotation tasks."""
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.accounts.constants import StaffLevel
from apps.tasks.models import Task

pytestmark = pytest.mark.django_db

TASKS = "/api/tasks"


def iso(delta):
    return (timezone.now() + delta).isoformat()


def new_task(client, **extra):
    payload = {"task_type": "verify_payment", "description": "Verify partial payment", "sla_deadline":
               iso(timedelta(hours=5)), "department": "finance", "priority": "high", **extra}
    res = client.post(f"{TASKS}/", payload, format="json")
    assert res.status_code == 201, res.json()
    return res.json()


def test_create_views_and_stats(ops, client_for, make_intl):
    order = make_intl()
    other = client_for(StaffLevel.SALES).user
    mine = new_task(ops, owner=ops.user.id, order=order.id)
    assert mine["reference"].startswith("TSK-") and mine["linked_item"] == {
        "kind": "international-order", "id": order.id, "reference": order.reference, "order_type": "international"}
    assert mine["owner"]["full_name"] == ops.user.full_name and mine["is_overdue"] is False
    new_task(ops, sla_deadline=iso(timedelta(hours=-2)), owner=other.id)  # overdue
    new_task(ops, sla_deadline=iso(timedelta(days=3)))  # unassigned
    assert ops.get(f"{TASKS}/?view=mine").json()["count"] == 1
    assert ops.get(f"{TASKS}/?view=unassigned").json()["count"] == 1
    overdue = ops.get(f"{TASKS}/?view=overdue").json()
    assert overdue["count"] == 1 and overdue["results"][0]["is_overdue"] is True
    stats = ops.get(f"{TASKS}/stats/").json()
    assert stats["mine"] == 1 and stats["unassigned"] == 1 and stats["overdue"] == 1 and stats["total"] == 3
    # Default ordering is by SLA deadline (most urgent first).
    results = ops.get(f"{TASKS}/").json()["results"]
    assert results[0]["is_overdue"] is True
    assert ops.get(f"{TASKS}/?search={order.reference}").json()["count"] == 1


def test_task_links_to_one_item_only(ops, make_intl):
    from apps.parties.models import Customer
    from apps.quotes.models import QuoteRequest

    quote = QuoteRequest.objects.create(customer=Customer.objects.first(), service_type="express",
                                        description="Docs to Arusha")
    order = make_intl()
    res = ops.post(f"{TASKS}/", {"task_type": "other", "description": "x", "sla_deadline": iso(timedelta(hours=1)),
                                 "order": order.id, "quote": quote.id}, format="json")
    assert res.status_code == 400


def test_status_changes_completion_and_reopening(ops, client_for):
    task = new_task(ops)
    url = f"{TASKS}/{task['id']}"
    body = ops.post(f"{url}/status/", {"status": "blocked", "note": "Missing permit"}, format="json").json()
    assert body["status"] == "blocked"
    sales = client_for(StaffLevel.SALES)  # tasks: edit
    assert sales.post(f"{url}/status/", {"status": "cancelled"}, format="json").status_code == 403
    body = sales.post(f"{url}/complete/", {"note": "Done"}, format="json").json()
    assert body["status"] == "completed" and body["completed_at"] and body["is_open"] is False
    assert ops.get(f"{TASKS}/").json()["count"] == 0  # open tasks only by default
    assert ops.get(f"{TASKS}/?state=closed").json()["count"] == 1
    assert ops.patch(url + "/", {"description": "x"}, format="json").status_code == 409
    assert sales.post(f"{url}/status/", {"status": "in_progress"}, format="json").status_code == 403
    assert ops.post(f"{url}/status/", {"status": "in_progress"}, format="json").json()["completed_at"] is None
    activity = [a["kind"] for a in ops.get(f"{url}/activity/").json()]
    assert activity == ["created", "status", "status", "status"]


def test_owner_and_notes(ops, client_for):
    task = new_task(ops)
    url = f"{TASKS}/{task['id']}"
    owner = client_for(StaffLevel.FINANCE, full_name="Sarah Mtui").user
    body = ops.post(f"{url}/assign/", {"owner": owner.id}, format="json").json()
    assert body["owner"]["full_name"] == "Sarah Mtui"
    assert ops.post(f"{url}/notes/", {"body": "  "}, format="json").status_code == 400
    notes = ops.post(f"{url}/notes/", {"body": "Customer sent payment receipt"}, format="json").json()
    assert notes[-1]["body"] == "Customer sent payment receipt"
    detail = ops.get(url + "/").json()
    assert [n["body"] for n in detail["notes"]] == ["Customer sent payment receipt"]
    assert ops.post(f"{url}/assign/", {"owner": None}, format="json").json()["owner"] is None
    assert client_for(StaffLevel.DRIVER).get(f"{TASKS}/").status_code == 403


def test_new_quotation_opens_a_generate_quote_task_closed_by_the_reply(ops, buyer):
    res = ops.post("/api/quotes/", {"customer_id": buyer.id, "service_type": "express",
                                    "description": "Urgent documents to Arusha"}, format="json")
    assert res.status_code == 201, res.json()
    task = Task.objects.get(quote_id=res.json()["id"])
    assert task.task_type == "generate_quote" and task.department == "sales"
    assert task.sla_deadline - task.created_at >= timedelta(hours=23)
    ops.post(f"/api/quotes/{res.json()['id']}/respond/", {"quoted_amount": "45000",
                                                          "estimated_delivery": "2026-10-10", "notes": ""},
             format="json")
    task.refresh_from_db()
    assert task.status == "completed"
