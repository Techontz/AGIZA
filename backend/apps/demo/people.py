"""
Demo data for People & Support, from the Figma Make mock records: service
providers, extra customers, the Settings tag rules (evaluated for real),
manual tags, interests detected from orders, a draft campaign, quick
replies and the Chat & Customer Support conversations.
"""
from datetime import timedelta
from decimal import Decimal as D

from django.utils import timezone

from apps.accounts.models import User
from apps.chat import services as chat
from apps.chat.models import Conversation, Message, QuickReply
from apps.core.seeding import Seeder, seeded_ids
from apps.crm import services as crm
from apps.crm.models import Campaign, CampaignRecipient, CustomerInterest, CustomerTag, Tag, TagRule, TagRuleRun
from apps.locations.models import City
from apps.notifications.models import Notification
from apps.orders.models import Order
from apps.parties.models import Customer, ServiceProvider
from apps.quotes import services as quotes
from apps.quotes.models import QuoteRequest, QuoteStatusHistory
from apps.tasks.models import Task

SEED = "people"
FLUSH_ORDER = [Notification, Task, Message, Conversation, QuickReply, CampaignRecipient, Campaign, TagRuleRun,
               CustomerTag, CustomerInterest, TagRule, Tag, QuoteStatusHistory, QuoteRequest, ServiceProvider,
               Customer]

PROVIDERS = [
    ("Juma Plumbing Services", "juma.plumbing@email.com", "+255 789 111 222", "Plumbing, Pipe repair", "Dar es Salaam",
     "4.5"),
    ("Grace Cleaning Co.", "grace.cleaning@email.com", "+255 789 111 223", "Cleaning, Fumigation", "Dar es Salaam",
     "4.8"),
    ("Kilimanjaro Solar Installers", "info@kilisolar.co.tz", "+255 754 900 111", "Solar installation, Electrical",
     "Arusha", "4.6"),
    ("Mwanza AC Technicians", "service@mwanzaac.co.tz", "+255 768 440 220", "AC installation, Maintenance", "Mwanza",
     None),
]
CUSTOMERS = [("Maria Komba", "maria.komba@email.com", "+255 765 123 458", "inactive", 200),
             ("Peter Nyerere", "peter.nyerere@email.com", "+255 765 123 459", "active", 300),
             ("Amina Juma", "amina.juma@email.com", "+255 789 012 345", "active", 20)]
# The Settings design's rules, plus one more example.
RULES = [
    ("VIP Customers", "VIP", [("total_spent", ">", "1000000")]),
    ("Electronics Buyers", "electronics_buyer", [("category", "includes", "electronics")]),
    ("Inactive Users", "inactive", [("inactive_days", ">", "30")]),
    ("Repeat Customers", "repeat_customer", [("total_orders", ">", "2")]),
]
MANUAL_TAGS = [("John Mwamba", "repeat_customer"), ("Peter Nyerere", "bulk_buyer"), ("Fatuma Hassan", "whatsapp_first")]
QUICK_REPLIES = ["Let me prepare a quote for you", "Please confirm the quantity", "Payment instructions will follow",
                 "Your order is being processed", "I'll check with our procurement team",
                 "Expected delivery time is 3-5 days"]


def seed(stdout=None) -> Seeder:
    s = Seeder(SEED, stdout)
    actor = User.objects.filter(is_superuser=True).order_by("id").first()
    staff = {u.full_name: u for u in User.objects.filter(email__endswith="@agiza.demo")}
    now = timezone.now()

    def track(obj):
        if obj is not None:
            s.register(obj)
        return obj

    for name, email, phone, services, city, rating in PROVIDERS:
        s.get_or_create(ServiceProvider, name=name, defaults={
            "email": email, "phone": phone, "services": services, "rating": D(rating) if rating else None,
            "city": City.objects.get(name=city, country__iso2="TZ")})
    for name, email, phone, status, age_days in CUSTOMERS:
        customer, created = s.get_or_create(Customer, full_name=name, defaults={
            "email": email, "phone": phone, "status": status, "preferred_channel": "whatsapp"})
        if created:
            Customer.objects.filter(pk=customer.pk).update(created_at=now - timedelta(days=age_days))
    for text_i, text in enumerate(QUICK_REPLIES):
        s.get_or_create(QuickReply, text=text, defaults={"sort_order": text_i})

    # ---- Interests from real orders, then the tag rules --------------------
    for customer in Customer.objects.all():
        crm.recompute_interests(customer)
    for row in CustomerInterest.objects.all():
        track(row)
    if not TagRule.objects.filter(pk__in=seeded_ids(SEED, TagRule)).exists():
        for name, tag, conditions in RULES:
            rule = crm.save_rule(name=name, tag_name=tag, enabled=True, user=actor,
                                 conditions=[{"field": f, "operator": o, "value": v} for f, o, v in conditions])
            track(rule)
            track(rule.tag)
        for cust, tag in MANUAL_TAGS:
            customer = Customer.objects.filter(full_name=cust).first()
            if customer and not CustomerTag.objects.filter(customer=customer, tag__name=tag).exists():
                track(crm.add_manual_tag(customer, tag, user=actor))
        s.created += len(RULES)
    for model in (CustomerTag, TagRuleRun, Tag):
        for row in model.objects.all():
            track(row)

    if not Campaign.objects.filter(pk__in=seeded_ids(SEED, Campaign)).exists():
        campaign = track(Campaign.objects.create(
            name="Summer Electronics Sale", channel="sms", created_by=actor, interests=["electronics"],
            message="Hi {name}! Up to 15% off smartphones and laptops this week at Agiza. Reply YES for a quote.",
            audience_count=crm.audience(interests=["electronics"]).count()))
        campaign.tags.set(Tag.objects.filter(name="electronics_buyer"))

    # ---- Chat & Customer Support -------------------------------------------
    if not Conversation.objects.filter(pk__in=seeded_ids(SEED, Conversation)).exists():
        _conversations(s, track, staff, actor)
    for row in Notification.objects.all():
        track(row)
    return s


def _conversations(s, track, staff, actor):
    sarah, ahmed = staff.get("Sarah Mtui", actor), staff.get("Ahmed Salim", actor)
    hassan, emmanuel = staff.get("Hassan Mohamed", actor), staff.get("Emmanuel Mollel", actor)

    def customer(name):
        return Customer.objects.filter(full_name=name).first()

    def inbound(channel, handle, name, text):
        return chat.receive(channel=channel, handle=handle, name=name, body=text)

    # CHAT-001 — Fatuma: smartphones quote on WhatsApp
    fatuma = customer("Fatuma Hassan")
    msg = inbound("whatsapp", "+255 712 345 678", "Fatuma Hassan",
                  "Hello! I need help importing 50 smartphones from China")
    conv = track(msg.conversation)
    if fatuma and conv.customer_id is None:
        chat.link(conv, user=sarah, customer=fatuma)
    chat.assign(conv, sarah, user=actor)
    chat.send_message(conv, user=sarah, body="Hi Fatuma! I'd be happy to help you with that. Let me prepare a "
                                              "detailed quotation for you.")
    chat.add_note(conv, user=sarah, body="Client is a returning customer. Previously ordered 30 units in March. "
                                          "Good payment record.")
    if fatuma:
        quote = chat.create_quote(conv, user=sarah, service_type="international",
                                  description="50 × Smartphone Model X Pro, air cargo China → Dar es Salaam",
                                  origin="China", destination="Dar es Salaam")
        quote = quotes.respond(quote, amount=D("23250000"), estimated_delivery=timezone.localdate() + timedelta(days=7),
                       notes="50 units at TSh 450,000 + TSh 375,000 shipping, valid 7 days", user=sarah)
        chat.send_quote(conv, quote, user=sarah)
        track(quote)
    inbound("whatsapp", conv.contact_handle, "Fatuma Hassan", "Thank you! This looks good. How do I proceed with "
                                                               "payment?")

    # CHAT-002 — John Mwamba on Facebook: where is my delivery (follow-up due)
    john = customer("John Mwamba")
    msg = inbound("facebook", "fb-4402187", "John Mwamba", "Hi, I paid yesterday. When will my order ship?")
    conv = track(msg.conversation)
    shipping_order = Order.objects.filter(customer=john, status="shipping_to_destination").first() if john else None
    if john:
        chat.link(conv, user=hassan, customer=john, order=shipping_order)
    chat.assign(conv, hassan, user=actor)
    ref = shipping_order.reference if shipping_order else "your order"
    chat.send_message(conv, user=hassan, body=f"Hello John! {ref} is currently in transit. Expected delivery: next "
                                               "week.")
    chat.add_note(conv, user=hassan, body="Payment verified. Shipment departed the Dubai hub.")
    inbound("facebook", "fb-4402187", "John Mwamba", f"Where is my delivery? Order #{ref}")
    chat.set_follow_up(conv, at=timezone.now() + timedelta(hours=2), user=hassan)

    # CHAT-003 — Grace Kimaro on TikTok: new beauty inquiry
    msg = inbound("tiktok", "tt-grace.kimaro", "Grace Kimaro",
                  "Hi! I saw your TikTok video about beauty product imports. Can you help me?")
    conv = track(msg.conversation)
    grace = customer("Grace Kimaro")
    if grace:
        chat.link(conv, user=ahmed, customer=grace)
    chat.assign(conv, ahmed, user=actor)
    chat.send_message(conv, user=ahmed, body="Hello Grace! Absolutely! What products are you looking for?")
    inbound("tiktok", "tt-grace.kimaro", "Grace Kimaro", "I'm interested in ordering beauty products")
    Conversation.objects.filter(pk=conv.pk).update(last_customer_message_at=timezone.now() - timedelta(hours=3))

    # CHAT-004 — David Lyimo: paid order (high value)
    david = customer("David Lyimo")
    msg = inbound("whatsapp", "+255 713 567 890", "David Lyimo",
                  "I've sent the payment for the camera")
    conv = track(msg.conversation)
    paid_order = Order.objects.filter(customer=david, order_type="shop").first() if david else None
    if david:
        chat.link(conv, user=sarah, customer=david, order=paid_order)
    chat.assign(conv, sarah, user=actor)
    chat.send_message(conv, user=sarah, body="Thank you David, we're confirming it with Finance now.")
    inbound("whatsapp", conv.contact_handle, "David Lyimo", "Payment completed! Thank you")

    # CHAT-005 — Amina Juma on the web: bulk discount question (new)
    amina = customer("Amina Juma")
    msg = inbound("web", "+255 789 012 345", "Amina Juma",
                  "Can I get a discount for bulk orders?")
    conv = track(msg.conversation)
    if amina:
        chat.link(conv, user=emmanuel, customer=amina)
    chat.assign(conv, emmanuel, user=actor)
    chat.escalate(conv, to="management", note="Bulk discount request — needs a manager's approval", user=emmanuel)
    for task in Task.objects.filter(description__contains=conv.reference):
        track(task)
    for conv_ in Conversation.objects.filter(pk__in=seeded_ids(SEED, Conversation)):
        for m in conv_.messages.all():
            track(m)
