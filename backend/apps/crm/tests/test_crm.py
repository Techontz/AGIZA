"""Tag rules engine (real evaluation), manual tags, interests, campaign audiences and sending."""
from datetime import timedelta
from decimal import Decimal as D

import pytest
from django.core import mail
from django.test import override_settings
from django.utils import timezone

from apps.accounts.constants import StaffLevel
from apps.crm import services
from apps.crm.models import CustomerTag, TagRuleRun
from apps.orders import services as order_services
from apps.parties.models import Customer

pytestmark = pytest.mark.django_db

RULES = "/api/crm/tag-rules"
CAMP = "/api/crm/campaigns"


@pytest.fixture
def people(ops, make_intl, buyer):
    """buyer: 2 orders, 3M paid; quiet: no orders, created long ago; small: 1 order 100k."""
    make_intl(total="2000000", paid="2000000", items="Electronics - Smartphones")
    make_intl(total="1000000", paid="1000000", items="Electronics - Laptops")
    quiet = Customer.objects.create(full_name="Maria Komba", phone="+255765123458", email="maria@example.com")
    Customer.objects.filter(pk=quiet.pk).update(created_at=timezone.now() - timedelta(days=60))
    small = Customer.objects.create(full_name="Peter Nyerere", phone="+255765123459")
    order_services.create_order("international", customer=small, item_details="Fashion - Shoes", user=ops.user,
                                total_amount=D("100000"),
                                details={"source_country": order_services.Order.objects.first().international
                                         .source_country})
    return {"buyer": buyer, "quiet": quiet, "small": small}


def rule(ops, name, tag, *conditions, enabled=True):
    res = ops.post(f"{RULES}/", {"name": name, "tag": tag, "enabled": enabled, "conditions": [
        {"field": f, "operator": o, "value": v} for f, o, v in conditions]}, format="json")
    assert res.status_code == 201, res.json()
    return res.json()


def tags_of(customer):
    return set(CustomerTag.objects.filter(customer=customer).values_list("tag__name", flat=True))


def test_rules_actually_execute_and_stay_in_sync(ops, people):
    vip = rule(ops, "VIP Customers", "VIP", ("total_spent", ">", "1000000"))
    assert vip["tag"] == "vip" and vip["last_matched"] == 1 and vip["tagged_customers"] == 1
    assert tags_of(people["buyer"]) == {"vip"}
    rule(ops, "Inactive Users", "inactive", ("inactive_days", ">", "30"))
    assert tags_of(people["quiet"]) == {"inactive"}
    assert "inactive" not in tags_of(people["small"])
    rule(ops, "Repeat", "repeat_customer", ("total_orders", ">", "1"), ("last_order_days", "<", "7"))
    assert tags_of(people["buyer"]) == {"vip", "repeat_customer"}
    # Raise the threshold: the rule removes the tag it gave earlier.
    ops.patch(f"{RULES}/{vip['id']}/", {"name": "VIP Customers", "tag": "vip", "enabled": True, "conditions": [
        {"field": "total_spent", "operator": ">", "value": "5000000"}]}, format="json")
    assert "vip" not in tags_of(people["buyer"])
    # Disabling a rule removes its tags; runs are recorded.
    body = ops.post(f"{RULES}/{vip['id']}/toggle/").json()
    assert body["enabled"] is False
    assert TagRuleRun.objects.filter(rule_id=vip["id"]).count() >= 3
    assert ops.get(f"{RULES}/{vip['id']}/runs/").json()[0]["trigger"] == "save"


def test_category_rule_uses_computed_interests_and_manual_tags_survive(ops, people):
    from apps.catalog.models import Category

    Category.objects.create(name="Electronics")
    services.recompute_interests(people["buyer"])
    interests = {i.label: i.confidence for i in people["buyer"].interests.all()}
    assert interests == {"electronics": 100}
    rule(ops, "Electronics Buyers", "electronics_buyer", ("category", "includes", "electronics"))
    assert "electronics_buyer" in tags_of(people["buyer"])
    # A manual tag is kept even when a rule would remove the same tag.
    url = f"/api/customers/{people['small'].id}/tags/"
    assert ops.post(url, {"name": "Bulk Buyer"}, format="json").status_code == 201
    assert ops.post(url, {"name": "bulk_buyer"}, format="json").status_code == 400  # duplicate
    rule(ops, "Bulk", "bulk_buyer", ("total_orders", ">", "10"))
    assert "bulk_buyer" in tags_of(people["small"])
    links = ops.get(f"/api/customers/{people['buyer'].id}/profile/").json()["tags"]
    system = next(t for t in links if t["name"] == "electronics_buyer")
    assert system["type"] == "system"
    res = ops.delete(f"/api/customers/{people['buyer'].id}/tags/?link={system['id']}")
    assert res.status_code == 409  # rule tags are changed through the rule


def test_invalid_conditions_and_permissions(ops, client_for, people):
    bad = ops.post(f"{RULES}/", {"name": "x", "tag": "t", "conditions": [
        {"field": "total_spent", "operator": "includes", "value": "1"}]}, format="json")
    assert bad.status_code == 400
    bad = ops.post(f"{RULES}/", {"name": "x", "tag": "t", "conditions": [
        {"field": "total_orders", "operator": ">", "value": "lots"}]}, format="json")
    assert bad.status_code == 400
    assert ops.post(f"{RULES}/", {"name": "x", "tag": "t", "conditions": []}, format="json").status_code == 400
    admin1 = client_for(StaffLevel.ADMIN_L1)  # settings: view
    assert admin1.get(f"{RULES}/").status_code == 200
    assert admin1.post(f"{RULES}/", {"name": "x", "tag": "t", "conditions": [
        {"field": "total_orders", "operator": ">", "value": "1"}]}, format="json").status_code == 403


def test_customer_list_tags_metrics_and_profile(ops, people):
    rule(ops, "VIP", "vip", ("total_spent", ">", "1000000"))
    rows = ops.get("/api/customers/?tag=vip").json()["results"]
    assert [r["full_name"] for r in rows] == ["Fatuma Hassan"]
    assert rows[0]["total_orders"] == 2 and rows[0]["total_spent"] == "3000000.00"
    assert rows[0]["tags"][0]["type"] == "system"
    profile = ops.get(f"/api/customers/{people['buyer'].id}/profile/").json()
    assert profile["kpis"]["total_orders"] == 2 and profile["kpis"]["total_spent"] == "3000000.00"
    assert profile["client_value"] == "customer" and len(profile["orders"]) == 2
    assert profile["activity"]


def test_campaign_audience_is_a_real_query(ops, people):
    rule(ops, "VIP", "vip", ("total_spent", ">", "1000000"))
    est = ops.post(f"{CAMP}/estimate/", {}, format="json").json()
    assert est["total"] == 3 and est["email"] == 1
    assert ops.post(f"{CAMP}/estimate/", {"tags": ["vip"]}, format="json").json()["total"] == 1
    assert ops.post(f"{CAMP}/estimate/", {"activity": "inactive"}, format="json").json()["total"] == 1
    assert ops.post(f"{CAMP}/estimate/", {"activity": "active", "min_orders": 1},
                    format="json").json()["total"] == 2
    services.recompute_interests(people["small"])
    options = ops.get(f"{CAMP}/options/").json()
    assert "vip" in options["tags"] and options["channels"]["sms"] is False


def test_campaign_send_without_provider_is_not_faked(ops, people):
    res = ops.post(f"{CAMP}/", {"name": "Summer Sale", "channel": "sms", "message": "Hi {name}!", "min_orders": 1},
                   format="json").json()
    assert res["audience_count"] == 2 and res["status"] == "draft"
    sent = ops.post(f"{CAMP}/{res['id']}/send/").json()
    assert sent["status"] == "not_sent" and sent["sent_count"] == 0 and "SMS" in sent["status_note"]
    statuses = {r["status"] for r in ops.get(f"{CAMP}/{res['id']}/recipients/").json()}
    assert statuses == {"pending"}


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
def test_campaign_email_is_sent_through_the_backend(ops, people):
    res = ops.post(f"{CAMP}/", {"name": "Welcome back", "channel": "email", "subject": "We miss you",
                                "message": "Hello {name}", "activity": "inactive"}, format="json").json()
    sent = ops.post(f"{CAMP}/{res['id']}/send/").json()
    assert sent["status"] == "sent" and sent["sent_count"] == 1
    assert len(mail.outbox) == 1 and mail.outbox[0].to == ["maria@example.com"]
    assert mail.outbox[0].body == "Hello Maria"
    assert ops.post(f"{CAMP}/{res['id']}/send/").status_code == 409
