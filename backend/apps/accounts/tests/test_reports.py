"""Reporting dashboard: clients, active orders, period vs previous period, series."""
from datetime import timedelta
from decimal import Decimal as D

import pytest
from django.utils import timezone

from apps.accounts.constants import StaffLevel
from apps.accounts.reports import change
from apps.orders import services as order_services
from apps.orders.models import Order
from apps.parties.models import Customer

pytestmark = pytest.mark.django_db

URL = "/api/reports/dashboard/"


def _order(user, customer, total, days_ago=0, status=None, order_type="equipment"):
    order = order_services.create_order(
        order_type, customer=customer, item_details="Solar inverter", user=user, total_amount=D(total),
        details={"service_type": "installation", "equipment": "Solar inverter"})
    fields = {"created_at": timezone.now() - timedelta(days=days_ago)}
    if status:
        fields["status"] = status
    Order.objects.filter(pk=order.pk).update(**fields)
    return order


def test_change_helper():
    assert change(150, 100) == {"percent": 50.0, "direction": "up"}
    assert change(D("75.00"), D("100.00")) == {"percent": -25.0, "direction": "down"}
    assert change(5, 5) == {"percent": 0.0, "direction": "flat"}
    assert change(3, 0) == {"percent": None, "direction": "up"}  # previous = 0
    assert change(0, 0) == {"percent": 0.0, "direction": "flat"}


def test_dashboard_figures_and_previous_period(client_for):
    admin = client_for(StaffLevel.ADMIN_L2)
    a = Customer.objects.create(full_name="Asha", phone="+255712000101")
    b = Customer.objects.create(full_name="Bakari", phone="+255712000102")
    old = Customer.objects.create(full_name="Old", phone="+255712000103")
    Customer.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=10))
    # this 7d window: 3 orders (one cancelled → ignored), previous 7d: 1 order
    _order(admin.user, a, "300000", days_ago=1)
    _order(admin.user, b, "100000", days_ago=2, status="completed")
    _order(admin.user, a, "999999", days_ago=1, status="cancelled")
    _order(admin.user, old, "200000", days_ago=9)
    _order(admin.user, old, "50000", days_ago=40)

    body = admin.get(f"{URL}?period=7d").json()
    today = timezone.localdate()
    assert body["period"] == {"key": "7d", "from": (today - timedelta(days=6)).isoformat(), "to": today.isoformat()}
    assert body["previous"] == {"from": (today - timedelta(days=13)).isoformat(),
                                "to": (today - timedelta(days=7)).isoformat()}
    assert body["total_clients"] == 3
    assert body["new_clients"] == {"count": 2, "previous": 1, "change": {"percent": 100.0, "direction": "up"}}
    # active = not delivered / completed / cancelled: a (1 order) and old (2 orders)
    assert body["active_orders"] == 3 and body["clients_with_active_orders"] == 2
    assert body["orders"]["current"] == {"count": 2, "total_amount": "400000.00"}
    assert body["orders"]["previous"] == {"count": 1, "total_amount": "200000.00"}
    assert body["orders"]["count_change"] == {"percent": 100.0, "direction": "up"}
    assert body["orders"]["amount_change"] == {"percent": 100.0, "direction": "up"}
    equip = next(t for t in body["orders_by_type"] if t["order_type"] == "equipment")
    assert equip == {"order_type": "equipment", "label": "Equipment Support", "count": 2, "total_amount": "400000.00"}
    assert body["series"]["interval"] == "day" and len(body["series"]["points"]) == 7
    assert sum(p["count"] for p in body["series"]["points"]) == 2
    assert body["series"]["points"][-1]["start"] == today.isoformat()

    # 30d: previous 30 days hold the 40-day-old order; a window with an empty previous period has no %
    month = admin.get(f"{URL}?period=30d").json()
    assert month["orders"]["current"]["count"] == 3 and month["orders"]["previous"]["count"] == 1
    drop = admin.get(f"{URL}?period=custom&date_from={(today - timedelta(days=45)).isoformat()}"
                     f"&date_to={(today - timedelta(days=30)).isoformat()}").json()
    assert drop["orders"]["current"]["count"] == 1 and drop["orders"]["previous"]["count"] == 0
    assert drop["orders"]["count_change"] == {"percent": None, "direction": "up"}  # previous = 0
    year = admin.get(f"{URL}?period=this_year").json()
    assert year["period"]["from"] == today.replace(month=1, day=1).isoformat()
    assert year["series"]["interval"] in ("day", "week")


def test_dashboard_decrease_and_empty(client_for):
    admin = client_for(StaffLevel.ADMIN_L2)
    c = Customer.objects.create(full_name="Asha", phone="+255712000101")
    Customer.objects.filter(pk=c.pk).update(created_at=timezone.now() - timedelta(days=10))
    _order(admin.user, c, "400000", days_ago=10, status="delivered")
    _order(admin.user, c, "100000", days_ago=1)
    body = admin.get(f"{URL}?period=7d").json()
    assert body["orders"]["count_change"] == {"percent": 0.0, "direction": "flat"}
    assert body["orders"]["amount_change"] == {"percent": -75.0, "direction": "down"}
    assert body["new_clients"] == {"count": 0, "previous": 1, "change": {"percent": -100.0, "direction": "down"}}
    empty = admin.get(f"{URL}?period=custom&date_from=2020-01-01&date_to=2020-01-31").json()
    assert empty["orders"]["current"] == {"count": 0, "total_amount": "0.00"}
    assert empty["orders"]["count_change"] == {"percent": 0.0, "direction": "flat"}
    assert empty["previous"] == {"from": "2019-12-01", "to": "2019-12-31"}


def test_dashboard_validation_and_permissions(client_for):
    admin = client_for(StaffLevel.ADMIN_L1)  # audit logs: view
    assert admin.get(f"{URL}?period=bogus").status_code == 400
    assert admin.get(f"{URL}?period=custom&date_from=2024-02-01").status_code == 400
    assert admin.get(f"{URL}?period=custom&date_from=2024-02-01&date_to=2024-01-01").status_code == 400
    long = admin.get(f"{URL}?period=custom&date_from=2023-01-01&date_to=2024-12-31").json()
    assert long["series"]["interval"] == "month" and len(long["series"]["points"]) == 24
    assert admin.get(URL).json()["period"]["key"] == "30d"
    assert client_for(StaffLevel.SALES).get(URL).status_code == 403
    assert client_for(StaffLevel.FINANCE).get(URL).status_code == 403
