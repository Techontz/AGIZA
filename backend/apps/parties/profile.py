"""The customer detail view (People → Customer): everything is computed from real records."""
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.db.models import Q

from apps.accounts.models import AuditLog
from apps.crm.services import with_metrics
from apps.orders.models import Order
from apps.orders.serializers import _dec
from apps.orders.services import prefetched_net_paid
from apps.orders.workflows import status_label

from .models import Customer

TYPE_LABEL = {"international": "International", "shop": "E-commerce", "express": "Local Delivery",
              "equipment": "Equipment Support"}


def _category(order: Order, tops: list[str]) -> tuple[str, str]:
    items = list(order.items.all())
    if items:
        product = items[0].variant.product
        return product.category.name, product.subcategory.name if product.subcategory_id else ""
    text = order.item_details.lower()
    for name in tops:
        if name.lower().split()[0] in text:
            return name, ""
    return TYPE_LABEL.get(order.order_type, order.order_type), ""


def client_value(total_orders: int, total_spend: Decimal) -> str:
    if total_orders == 0:
        return "curious"
    if total_orders < 3:
        return "customer"
    if total_spend >= 10_000_000:
        return "high_value"
    return "repeating"


def customer_profile(customer: Customer) -> dict:
    from apps.catalog.models import Category
    from apps.crm.models import CustomerInterest, CustomerTag
    from apps.quotes.models import QuoteRequest
    from apps.returns.models import ReturnRequest

    metrics = with_metrics(Customer.objects.filter(pk=customer.pk)).get()
    tops = list(Category.objects.filter(parent__isnull=True).values_list("name", flat=True))
    orders = (Order.objects.filter(customer=customer).select_related("international__source_country")
              .prefetch_related("payments", "items__variant__product__category",
                                "items__variant__product__subcategory")
              .order_by("-created_at"))
    rows, spend = [], {}
    total_spend = Decimal("0")
    for o in orders:
        category, sub = _category(o, tops)
        paid = prefetched_net_paid(o)
        if o.status != "cancelled":
            total_spend += paid
            spend[category] = spend.get(category, Decimal("0")) + paid
        origin = o.international.source_country.display_name if o.order_type == "international" else "Tanzania"
        rows.append({"id": o.id, "reference": o.reference, "order_type": o.order_type,
                     "type": TYPE_LABEL.get(o.order_type, o.order_type), "date": o.created_at,
                     "product": o.item_details, "category": category, "subcategory": sub,
                     "amount": _dec(o.total_amount), "paid": _dec(paid), "status": o.status,
                     "status_display": status_label(o.order_type, o.status), "origin": origin})
    returns = [{"id": r.id, "reference": r.reference, "order": r.order.reference, "date": r.created_at,
                "product": r.item_details, "amount": _dec(r.refund_amount or r.return_value), "reason":
                r.get_reason_code_display(), "status": r.status, "status_display": r.get_status_display(),
                "outcome": r.get_financial_impact_display()}
               for r in ReturnRequest.objects.filter(order__customer=customer).select_related("order")]
    quotes = [{"id": q.id, "reference": q.reference, "date": q.created_at, "product": q.description[:80],
               "service_type": q.get_service_type_display(), "status": q.status,
               "status_display": q.get_status_display(), "message": q.description,
               "unanswered": q.status == "new", "quoted_amount": _dec(q.quoted_amount)}
              for q in QuoteRequest.objects.filter(customer=customer).order_by("-created_at")]
    tags = [{"id": t.id, "name": t.tag.name, "type": "system" if t.source == "rule" else "manual",
             "rule": t.rule.name if t.rule_id else None, "created_at": t.created_at}
            for t in CustomerTag.objects.filter(customer=customer).select_related("tag", "rule")]
    interests = [{"id": i.id, "label": i.label, "confidence": i.confidence, "source": i.source,
                  "category": i.category_id, "category_name": str(i.category) if i.category_id else None}
                 for i in CustomerInterest.objects.filter(customer=customer).select_related("category__parent")]
    order_ids = [str(o["id"]) for o in rows]
    activity = AuditLog.objects.filter(
        Q(content_type=ContentType.objects.get_for_model(Customer), object_id=str(customer.pk))
        | Q(content_type=ContentType.objects.get_for_model(Order), object_id__in=order_ids)
    ).select_related("actor").order_by("-created_at")[:30]
    top = sorted(spend.items(), key=lambda kv: kv[1], reverse=True)[:5]
    unanswered = sum(1 for q in quotes if q["unanswered"])
    return {
        "customer": {"id": customer.id, "reference": customer.reference, "full_name": customer.full_name,
                     "email": customer.email, "phone": customer.phone, "company_name": customer.company_name,
                     "status": customer.status, "created_at": customer.created_at},
        "client_value": client_value(metrics.total_orders, total_spend),
        "kpis": {"total_orders": metrics.total_orders, "total_spent": _dec(total_spend), "returns": len(returns),
                 "unanswered_quotes": unanswered, "last_activity_at": metrics.last_activity_at},
        "orders": rows, "returns": returns, "quotations": quotes, "tags": tags, "interests": interests,
        "category_spend": [{"category": c, "amount": _dec(a)} for c, a in top],
        "activity": [{"at": a.created_at, "action": a.get_action_display(), "object": a.object_repr,
                      "by": a.actor.full_name if a.actor else "System", "changes": a.changes} for a in activity],
    }

