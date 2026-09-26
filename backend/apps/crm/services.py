"""
Tag rules engine, interests and campaign audiences.

Customer metrics are annotated in SQL (one query), so rules and audiences
are evaluated by the database:
  total_spent      payments received minus refunds, on orders not cancelled
  total_orders     orders not cancelled
  last_order_at    most recent order
  last_activity_at most recent order or chat message from the customer
Conditions of a rule are ANDed. A rule adds its tag to every matching
customer and removes it from customers it tagged earlier that no longer
match; tags added by hand are never touched by rules.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import (
    Count,
    DateTimeField,
    DecimalField,
    Exists,
    IntegerField,
    Max,
    OuterRef,
    Q,
    Subquery,
    Sum,
    Value,
)
from django.db.models.functions import Cast, Coalesce, Greatest
from django.utils import timezone

from apps.core.audit import record_audit
from apps.core.dates import local_day_bounds
from apps.core.workflow import WorkflowError
from apps.orders.models import Order, OrderItem, Payment
from apps.parties.models import Customer

from .models import (
    Campaign,
    CampaignRecipient,
    CustomerInterest,
    CustomerTag,
    RuleField,
    RuleOperator,
    Tag,
    TagRule,
    TagRuleCondition,
    TagRuleRun,
)

MONEY = DecimalField(max_digits=16, decimal_places=2)
ZERO = Value(Decimal("0"), output_field=MONEY)
EPOCH = Value(datetime(2000, 1, 1, tzinfo=UTC), output_field=DateTimeField())
ACTIVE_DAYS = 30


# --------------------------------------------------------------------------- #
# Metrics
# --------------------------------------------------------------------------- #
def with_metrics(qs=None):
    qs = qs if qs is not None else Customer.objects.all()
    live = Order.objects.filter(customer=OuterRef("pk")).exclude(status="cancelled").order_by()
    paid = (Payment.objects.filter(order__customer=OuterRef("pk")).exclude(order__status="cancelled").order_by()
            .values("order__customer")
            .annotate(s=Coalesce(Sum("amount", filter=~Q(kind=Payment.Kind.REFUND)), ZERO)
                      - Coalesce(Sum("amount", filter=Q(kind=Payment.Kind.REFUND)), ZERO)).values("s"))
    count = live.values("customer").annotate(n=Count("id")).values("n")
    last_order = live.values("customer").annotate(m=Max("created_at")).values("m")
    from apps.chat.models import Message

    last_msg = (Message.objects.filter(conversation__customer=OuterRef("pk"), sender="customer").order_by()
                .values("conversation__customer").annotate(m=Max("created_at")).values("m"))
    return qs.annotate(
        total_spent=Coalesce(Subquery(paid, output_field=MONEY), ZERO),
        total_orders=Coalesce(Subquery(count, output_field=IntegerField()), 0),
        last_order_at=Subquery(last_order, output_field=DateTimeField()),
        last_message_at_=Subquery(last_msg, output_field=DateTimeField()),
    ).annotate(last_activity_at=Cast(  # MySQL's GREATEST/COALESCE would otherwise return text
        Greatest(Coalesce("last_order_at", EPOCH), Coalesce("last_message_at_", EPOCH), Coalesce("created_at", EPOCH)),
        output_field=DateTimeField()))


def _number(value: str, *, integer: bool = False):
    try:
        return int(Decimal(value)) if integer else Decimal(value)
    except (InvalidOperation, ValueError) as exc:
        raise WorkflowError(f"“{value}” isn't a number.", field="conditions") from exc


def condition_q(field: str, operator: str, value: str) -> Q:
    now = timezone.now()
    if field == RuleField.CATEGORY:
        if operator not in (RuleOperator.INCLUDES, RuleOperator.EQ):
            raise WorkflowError("Use “Includes” or “Equals” with the interest category.", field="conditions")
        lookup = "label__iexact" if operator == RuleOperator.EQ else "label__icontains"
        return Q(Exists(CustomerInterest.objects.filter(customer=OuterRef("pk"), **{lookup: value.strip()})))
    if operator == RuleOperator.INCLUDES:
        raise WorkflowError("“Includes” only applies to the interest category.", field="conditions")
    if field in (RuleField.TOTAL_SPENT, RuleField.TOTAL_ORDERS):
        num = _number(value, integer=field == RuleField.TOTAL_ORDERS)
        name = field
        return {">": Q(**{f"{name}__gt": num}), "<": Q(**{f"{name}__lt": num}), "=": Q(**{name: num})}[operator]
    days = _number(value, integer=True)
    column = "last_activity_at" if field == RuleField.INACTIVE_DAYS else "last_order_at"
    cutoff = now - timedelta(days=days)
    base = Q() if field == RuleField.INACTIVE_DAYS else Q(last_order_at__isnull=False)
    if operator == ">":  # more than N days ago
        return base & Q(**{f"{column}__lt": cutoff})
    if operator == "<":
        return base & Q(**{f"{column}__gt": cutoff})
    start, end = local_day_bounds((now - timedelta(days=days)).date())
    return base & Q(**{f"{column}__gte": start, f"{column}__lt": end})


def rule_q(rule: TagRule) -> Q:
    q = Q()
    for c in rule.conditions.all():
        q &= condition_q(c.field, c.operator, c.value)
    return q


# --------------------------------------------------------------------------- #
# Tags
# --------------------------------------------------------------------------- #
def get_tag(name: str) -> Tag:
    clean = name.strip().lower().replace(" ", "_")
    if not clean:
        raise WorkflowError("Enter a tag.", field="name")
    tag, _ = Tag.objects.get_or_create(name=clean[:60])
    return tag


@transaction.atomic
def add_manual_tag(customer: Customer, name: str, *, user, request=None) -> CustomerTag:
    tag = get_tag(name)
    link, created = CustomerTag.objects.get_or_create(customer=customer, tag=tag, defaults={
        "source": CustomerTag.Source.MANUAL, "assigned_by": user})
    if not created:
        raise WorkflowError(f"{customer.full_name} already has the tag “{tag.name}”.", field="name")
    record_audit(action="update", request=request, actor=user, instance=customer, changes={"tag_added": [None, tag.name]})
    return link


@transaction.atomic
def remove_tag(customer: Customer, link_id: int, *, user, request=None):
    link = CustomerTag.objects.filter(customer=customer, pk=link_id).select_related("tag").first()
    if link is None:
        raise WorkflowError("Tag not found.", field="tag")
    if link.source == CustomerTag.Source.RULE:
        raise WorkflowError(f"“{link.tag.name}” is assigned by a tag rule; change or disable the rule instead.",
                            conflict=True)
    link.delete()
    record_audit(action="update", request=request, actor=user, instance=customer,
                 changes={"tag_removed": [link.tag.name, None]})


@transaction.atomic
def evaluate_rule(rule: TagRule, *, trigger: str, user=None, customers=None, request=None) -> TagRuleRun | None:
    """Apply one rule to all customers (or only `customers`) and record the run."""
    rule = TagRule.objects.select_for_update().select_related("tag").get(pk=rule.pk)
    scope = with_metrics(Customer.objects.filter(pk__in=[c.pk for c in customers]) if customers is not None
                         else Customer.objects.all())
    if not rule.enabled:
        matched = set()
    else:
        matched = set(scope.filter(rule_q(rule)).values_list("pk", flat=True))
    scope_ids = set(scope.values_list("pk", flat=True))
    existing = CustomerTag.objects.filter(tag=rule.tag, customer_id__in=scope_ids)
    has_tag = set(existing.values_list("customer_id", flat=True))
    to_add = matched - has_tag
    CustomerTag.objects.bulk_create([
        CustomerTag(customer_id=cid, tag=rule.tag, source=CustomerTag.Source.RULE, rule=rule, assigned_by=user)
        for cid in to_add
    ])
    stale = existing.filter(source=CustomerTag.Source.RULE, rule=rule).exclude(customer_id__in=matched)
    removed = stale.count()
    stale.delete()
    if customers is None:
        rule.last_run_at = timezone.now()
        rule.last_matched = len(matched)
        rule.save(update_fields=["last_run_at", "last_matched", "updated_at"])
    if customers is not None and not to_add and not removed:
        return None
    run = TagRuleRun.objects.create(rule=rule, matched=len(matched), added=len(to_add), removed=removed,
                                    trigger=trigger, run_by=user)
    if customers is None:
        record_audit(action="update", request=request, actor=user, instance=rule,
                     changes={"run": [None, {"matched": len(matched), "added": len(to_add), "removed": removed,
                                             "trigger": trigger}]})
    return run


def evaluate_all(*, trigger: str, user=None) -> list[TagRuleRun]:
    return [r for r in (evaluate_rule(rule, trigger=trigger, user=user)
                        for rule in TagRule.objects.prefetch_related("conditions")) if r]


@transaction.atomic
def save_rule(*, name: str, tag_name: str, conditions: list[dict], enabled: bool, user, rule: TagRule | None = None,
              request=None) -> TagRule:
    if not conditions:
        raise WorkflowError("Add at least one condition.", field="conditions")
    for c in conditions:  # validate before saving
        condition_q(c["field"], c["operator"], str(c["value"]))
    tag = get_tag(tag_name)
    created = rule is None
    if created:
        rule = TagRule.objects.create(name=name, tag=tag, enabled=enabled, created_by=user)
    else:
        old_tag = rule.tag
        rule.name, rule.enabled = name, enabled
        if old_tag.pk != tag.pk:  # the rule now assigns a different tag: drop what it assigned before
            CustomerTag.objects.filter(rule=rule, tag=old_tag, source=CustomerTag.Source.RULE).delete()
            rule.tag = tag
        rule.save()
        rule.conditions.all().delete()
    TagRuleCondition.objects.bulk_create([
        TagRuleCondition(rule=rule, field=c["field"], operator=c["operator"], value=str(c["value"]))
        for c in conditions
    ])
    record_audit(action="create" if created else "update", request=request, actor=user, instance=rule,
                 changes={"tag": [None, tag.name], "enabled": [None, enabled],
                          "conditions": [None, [f"{c['field']} {c['operator']} {c['value']}" for c in conditions]]})
    evaluate_rule(rule, trigger="save", user=user)
    return rule


@transaction.atomic
def delete_rule(rule: TagRule, *, user, request=None):
    CustomerTag.objects.filter(rule=rule, source=CustomerTag.Source.RULE).delete()
    record_audit(action="delete", request=request, actor=user, instance=rule, changes={"tag": [rule.tag.name, None]})
    rule.delete()


# --------------------------------------------------------------------------- #
# Interests (detected from what the customer orders)
# --------------------------------------------------------------------------- #
def recompute_interests(customer: Customer) -> list[CustomerInterest]:
    from apps.catalog.models import Category

    tops = {c.name.lower(): c for c in Category.objects.filter(parent__isnull=True)}
    spend: dict[str, Decimal] = {}
    shop_items = (OrderItem.objects.filter(order__customer=customer).exclude(order__status="cancelled")
                  .select_related("variant__product__category"))
    for item in shop_items:
        label = item.variant.product.category.name.lower()
        spend[label] = spend.get(label, Decimal("0")) + item.line_total
    other = Order.objects.filter(customer=customer).exclude(status="cancelled").exclude(order_type="shop")
    for order in other:
        text = order.item_details.lower()
        for label in tops:
            first_word = label.split()[0]
            if label in text or (len(first_word) > 3 and first_word in text):
                spend[label] = spend.get(label, Decimal("0")) + (order.total_amount or Decimal("1"))
    total = sum(spend.values(), Decimal("0"))
    manual = set(customer.interests.filter(source=CustomerInterest.Source.MANUAL).values_list("label", flat=True))
    kept = []
    for label, amount in spend.items():
        if label in manual:  # staff set this interest; don't override it
            continue
        confidence = max(1, min(100, round(amount / total * 100))) if total else 1
        obj, _ = CustomerInterest.objects.update_or_create(
            customer=customer, label=label, source=CustomerInterest.Source.COMPUTED,
            defaults={"confidence": confidence, "category": tops.get(label)})
        kept.append(obj.pk)
    CustomerInterest.objects.filter(customer=customer, source=CustomerInterest.Source.COMPUTED).exclude(
        pk__in=kept).delete()
    return list(customer.interests.all())


def refresh_customer(customer: Customer, user=None):
    """After customer activity: update interests, then re-check every enabled rule for this customer."""
    recompute_interests(customer)
    for rule in TagRule.objects.filter(enabled=True).prefetch_related("conditions"):
        evaluate_rule(rule, trigger="activity", user=user, customers=[customer])


# --------------------------------------------------------------------------- #
# Campaign audiences
# --------------------------------------------------------------------------- #
def audience(*, tags=(), interests=(), activity: str = "all", min_orders: int = 0):
    """Active customers matching every chosen criterion (any of the tags, any of the interests)."""
    qs = with_metrics(Customer.objects.filter(status=Customer.Status.ACTIVE))
    tag_names = [t.name if isinstance(t, Tag) else str(t).lower() for t in tags]
    if tag_names:
        qs = qs.filter(Exists(CustomerTag.objects.filter(customer=OuterRef("pk"), tag__name__in=tag_names)))
    if interests:
        q = Q()
        for label in interests:
            q |= Q(label__iexact=str(label).strip())
        qs = qs.filter(Exists(CustomerInterest.objects.filter(q, customer=OuterRef("pk"))))
    cutoff = timezone.now() - timedelta(days=ACTIVE_DAYS)
    if activity == Campaign.Activity.ACTIVE:
        qs = qs.filter(last_activity_at__gte=cutoff)
    elif activity == Campaign.Activity.INACTIVE:
        qs = qs.filter(last_activity_at__lt=cutoff)
    if min_orders:
        qs = qs.filter(total_orders__gte=min_orders)
    return qs


def estimate(**criteria) -> dict:
    qs = audience(**criteria)
    counts = qs.aggregate(total=Count("id"), with_phone=Count("id", filter=~Q(phone="")),
                          with_email=Count("id", filter=~Q(email="")))
    return {"total": counts["total"], "sms": counts["with_phone"], "whatsapp": counts["with_phone"],
            "email": counts["with_email"]}


def _destination(customer: Customer, channel: str) -> str:
    return customer.email if channel == Campaign.Channel.EMAIL else customer.phone


@transaction.atomic
def send_campaign(campaign: Campaign, *, user, request=None) -> Campaign:
    """Snapshot the audience and send through the channel's provider (if connected)."""
    from apps.notifications.providers import NotConfigured, SendError, get_provider

    campaign = Campaign.objects.select_for_update().get(pk=campaign.pk)
    if campaign.status not in (Campaign.Status.DRAFT, Campaign.Status.NOT_SENT):
        raise WorkflowError("This campaign was already sent.", conflict=True)
    customers = list(audience(tags=campaign.tags.all(), interests=campaign.interests, activity=campaign.activity,
                              min_orders=campaign.min_orders))
    if not customers:
        raise WorkflowError("No customers match this audience.", conflict=True)
    campaign.recipients.all().delete()
    rows = [CampaignRecipient(campaign=campaign, customer=c, destination=_destination(c, campaign.channel))
            for c in customers]
    CampaignRecipient.objects.bulk_create(rows)
    provider = get_provider(campaign.channel)
    sent = failed = 0
    note = ""
    for r in campaign.recipients.select_related("customer"):
        if not r.destination:
            r.status, r.error = CampaignRecipient.Status.SKIPPED, "No contact for this channel"
        elif not provider.configured():
            r.status, r.error = CampaignRecipient.Status.PENDING, "Channel not configured"
        else:
            try:
                provider.send(r.destination, campaign.message.replace("{name}", r.customer.full_name.split()[0]),
                              campaign.subject)
                r.status, r.sent_at = CampaignRecipient.Status.SENT, timezone.now()
                sent += 1
            except (NotConfigured, SendError) as exc:
                r.status, r.error = CampaignRecipient.Status.FAILED, str(exc)[:255]
                failed += 1
        r.save(update_fields=["status", "error", "sent_at"])
    campaign.audience_count = len(customers)
    campaign.sent_count, campaign.failed_count = sent, failed
    if not provider.configured():
        campaign.status = Campaign.Status.NOT_SENT
        try:
            provider.send("", "")
        except NotConfigured as exc:
            note = str(exc)
    else:
        campaign.status = Campaign.Status.SENT if failed == 0 else Campaign.Status.PARTIAL
        campaign.sent_at = timezone.now()
    campaign.status_note = note[:255]
    campaign.save(update_fields=["audience_count", "sent_count", "failed_count", "status", "sent_at", "status_note",
                                 "updated_at"])
    record_audit(action="status_change", request=request, actor=user, instance=campaign,
                 changes={"status": ["draft", campaign.status], "audience": [None, len(customers)], "sent": [None, sent]})
    return campaign
