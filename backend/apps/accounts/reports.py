"""
Reporting dashboard: client and order figures for a period, compared with the
period of the same length just before it.
"""
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.db.models import Count, DecimalField, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.orders.models import Order
from apps.orders.workflows import TERMINAL, OrderType
from apps.parties.models import Customer

from .constants import Module
from .permissions import HasModulePermission

PERIODS = ("7d", "30d", "90d", "this_month", "this_year", "custom")
ZERO = Value(Decimal("0"), output_field=DecimalField(max_digits=16, decimal_places=2))


def _start(day: date) -> datetime:
    return timezone.make_aware(datetime.combine(day, time.min))


def _range(day_from: date, day_to: date) -> dict:
    """created_at filter for whole local days (no per-row timezone conversion in SQL)."""
    return {"created_at__gte": _start(day_from), "created_at__lt": _start(day_to + timedelta(days=1))}


def change(current, previous) -> dict:
    """% change vs the previous period. previous = 0: no percentage, direction from the current value."""
    current, previous = Decimal(current), Decimal(previous)
    if previous == 0:
        return {"percent": None if current else 0.0, "direction": "up" if current > 0 else "flat"}
    pct = float(((current - previous) / previous * 100).quantize(Decimal("0.1")))
    return {"percent": pct, "direction": "up" if pct > 0 else "down" if pct < 0 else "flat"}


def resolve_period(params) -> tuple[str, date, date]:
    period = params.get("period") or "30d"
    if period not in PERIODS:
        raise ValidationError({"period": f"Choose one of: {', '.join(PERIODS)}."})
    today = timezone.localdate()
    if period == "custom":
        try:
            day_from = date.fromisoformat(params.get("date_from", ""))
            day_to = date.fromisoformat(params.get("date_to", ""))
        except ValueError:
            raise ValidationError({"date_from": "A custom period needs date_from and date_to (YYYY-MM-DD)."}) from None
        if day_from > day_to:
            raise ValidationError({"date_to": "date_to must be on or after date_from."})
        if (day_to - day_from).days > 366 * 5:
            raise ValidationError({"date_from": "A period can span at most five years."})
        return period, day_from, day_to
    if period == "this_month":
        return period, today.replace(day=1), today
    if period == "this_year":
        return period, today.replace(month=1, day=1), today
    return period, today - timedelta(days=int(period[:-1]) - 1), today


def _buckets(day_from: date, day_to: date) -> tuple[str, list[date]]:
    days = (day_to - day_from).days + 1
    if days <= 62:
        return "day", [day_from + timedelta(days=i) for i in range(days)]
    if days <= 371:
        first = day_from - timedelta(days=day_from.weekday())  # Monday
        return "week", [first + timedelta(weeks=i) for i in range((day_to - first).days // 7 + 1)]
    out, d = [], day_from.replace(day=1)
    while d <= day_to:
        out.append(d)
        d = (d.replace(day=28) + timedelta(days=4)).replace(day=1)
    return "month", out


def _bucket_of(day: date, interval: str) -> date:
    if interval == "week":
        return day - timedelta(days=day.weekday())
    if interval == "month":
        return day.replace(day=1)
    return day


class ReportsDashboardView(APIView):
    """Reporting dashboard. Cancelled orders are left out of order counts and amounts."""

    module = Module.AUDIT_LOGS
    permission_classes = [HasModulePermission]

    @extend_schema(tags=["reports"], responses=OpenApiTypes.OBJECT, parameters=[
        OpenApiParameter("period", str, enum=PERIODS),
        OpenApiParameter("date_from", OpenApiTypes.DATE), OpenApiParameter("date_to", OpenApiTypes.DATE)])
    def get(self, request):
        period, day_from, day_to = resolve_period(request.query_params)
        prev_to = day_from - timedelta(days=1)
        prev_from = prev_to - (day_to - day_from)

        orders = Order.objects.exclude(status="cancelled")
        current, previous = orders.filter(**_range(day_from, day_to)), orders.filter(**_range(prev_from, prev_to))

        def totals(qs) -> dict:
            row = qs.aggregate(count=Count("id"), amount=Coalesce(Sum("total_amount"), ZERO))
            return {"count": row["count"], "total_amount": f"{row['amount']:.2f}"}

        cur, prev = totals(current), totals(previous)
        new_clients = Customer.objects.filter(**_range(day_from, day_to)).count()
        prev_clients = Customer.objects.filter(**_range(prev_from, prev_to)).count()
        active = Order.objects.exclude(status__in=TERMINAL)

        by_type = {r["order_type"]: r for r in current.order_by().values("order_type")
                   .annotate(count=Count("id"), amount=Coalesce(Sum("total_amount"), ZERO))}

        interval, starts = _buckets(day_from, day_to)
        counts: dict[date, list] = {d: [0, Decimal("0")] for d in starts}
        for created_at, amount in current.values_list("created_at", "total_amount"):
            key = _bucket_of(timezone.localtime(created_at).date(), interval)
            if key in counts:
                counts[key][0] += 1
                counts[key][1] += amount or 0

        return Response({
            "period": {"key": period, "from": day_from, "to": day_to},
            "previous": {"from": prev_from, "to": prev_to},
            "total_clients": Customer.objects.count(),
            "new_clients": {"count": new_clients, "previous": prev_clients, "change": change(new_clients, prev_clients)},
            "clients_with_active_orders": active.values("customer_id").distinct().count(),
            "active_orders": active.count(),
            "orders": {
                "current": cur,
                "previous": prev,
                "count_change": change(cur["count"], prev["count"]),
                "amount_change": change(cur["total_amount"], prev["total_amount"]),
            },
            "orders_by_type": [
                {"order_type": t.value, "label": t.label, "count": by_type[t.value]["count"] if t.value in by_type else 0,
                 "total_amount": f"{by_type[t.value]['amount'] if t.value in by_type else Decimal('0'):.2f}"}
                for t in OrderType
            ],
            "series": {
                "interval": interval,
                "points": [{"start": d, "count": c, "total_amount": f"{a:.2f}"} for d, (c, a) in counts.items()],
            },
        })
