"""
Transaction chat: conversations with customers on WhatsApp, Facebook,
TikTok or the web, messages (customer, agent, system, internal notes),
quotation cards, ownership (assigned agent / active handler), follow-ups
and escalations. Everything is stored here; external channels connect
through webhooks when their credentials are configured.
"""
from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel
from apps.core.references import next_reference


class Channel(models.TextChoices):
    WHATSAPP = "whatsapp", "WhatsApp"
    FACEBOOK = "facebook", "Facebook"
    TIKTOK = "tiktok", "TikTok"
    WEB = "web", "Web"


class Conversation(TimeStampedModel):
    class Status(models.TextChoices):
        OPEN = "open", "Open"
        ARCHIVED = "archived", "Archived"

    class ResponseStatus(models.TextChoices):
        NEW = "new", "New"
        WAITING_TEAM = "waiting_team", "Waiting for Team"
        WAITING_CLIENT = "waiting_client", "Waiting for Client"
        URGENT = "urgent", "Urgent"

    class Department(models.TextChoices):
        SALES = "sales", "Sales"
        SUPPORT = "support", "Support"
        DELIVERY = "delivery", "Delivery"
        PROCUREMENT = "procurement", "Procurement"
        FINANCE = "finance", "Finance"
        MANAGEMENT = "management", "Manager"

    reference = models.CharField(max_length=20, unique=True, editable=False)
    channel = models.CharField(max_length=10, choices=Channel.choices)
    contact_name = models.CharField(max_length=150)
    contact_handle = models.CharField(max_length=150, help_text="Phone number, page-scoped id or username")
    external_thread_id = models.CharField(max_length=150, blank=True)
    customer = models.ForeignKey("parties.Customer", null=True, blank=True, on_delete=models.SET_NULL,
                                 related_name="conversations")
    order = models.ForeignKey("orders.Order", null=True, blank=True, on_delete=models.SET_NULL,
                              related_name="conversations")
    quote = models.ForeignKey("quotes.QuoteRequest", null=True, blank=True, on_delete=models.SET_NULL,
                              related_name="conversations")
    return_request = models.ForeignKey("returns.ReturnRequest", null=True, blank=True, on_delete=models.SET_NULL,
                                       related_name="conversations")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN, db_index=True)
    response_status = models.CharField(max_length=14, choices=ResponseStatus.choices, default=ResponseStatus.NEW)
    department = models.CharField(max_length=12, choices=Department.choices, default=Department.SALES)
    assigned_agent = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                       related_name="assigned_conversations")
    active_handler = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                       related_name="handled_conversations")
    handler_since = models.DateTimeField(null=True, blank=True)
    escalated_to = models.CharField(max_length=12, choices=Department.choices, blank=True)
    escalated_at = models.DateTimeField(null=True, blank=True)
    follow_up_at = models.DateTimeField(null=True, blank=True)
    follow_up_notified = models.BooleanField(default=False)
    last_message_at = models.DateTimeField(null=True, blank=True, db_index=True)
    last_message_preview = models.CharField(max_length=200, blank=True)
    last_customer_message_at = models.DateTimeField(null=True, blank=True)
    team_read_at = models.DateTimeField(null=True, blank=True, help_text="When staff last read the conversation")

    class Meta:
        ordering = ["-last_message_at", "-id"]
        indexes = [models.Index(fields=["channel", "contact_handle"]), models.Index(fields=["assigned_agent"])]

    def __str__(self) -> str:
        return f"{self.reference} · {self.contact_name}"

    def save(self, *args, **kwargs):
        if not self.reference:
            self.reference = next_reference("CHAT", width=3)
        super().save(*args, **kwargs)


class Message(models.Model):
    class Sender(models.TextChoices):
        CUSTOMER = "customer", "Customer"
        AGENT = "agent", "Agent"
        SYSTEM = "system", "System"
        INTERNAL = "internal", "Internal note"

    class Delivery(models.TextChoices):
        STORED = "stored", "Saved (channel not connected)"
        SENT = "sent", "Sent"
        DELIVERED = "delivered", "Delivered"
        READ = "read", "Read"
        FAILED = "failed", "Failed"
        RECEIVED = "received", "Received"

    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="messages")
    sender = models.CharField(max_length=8, choices=Sender.choices)
    body = models.TextField(blank=True)
    author = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                               related_name="+")
    quote = models.ForeignKey("quotes.QuoteRequest", null=True, blank=True, on_delete=models.SET_NULL,
                              related_name="chat_messages", help_text="Quotation card")
    delivery_status = models.CharField(max_length=10, choices=Delivery.choices, blank=True)
    delivery_error = models.CharField(max_length=255, blank=True)
    external_id = models.CharField(max_length=150, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["created_at", "id"]
        indexes = [models.Index(fields=["conversation", "created_at"])]

    def __str__(self) -> str:
        return f"{self._meta.verbose_name} #{self.pk}"


class QuickReply(TimeStampedModel):
    text = models.CharField(max_length=255)
    sort_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["sort_order", "id"]
        verbose_name_plural = "quick replies"

    def __str__(self) -> str:
        return self.text


class WebhookEvent(models.Model):
    """Raw inbound webhook payloads (kept for troubleshooting and replay)."""

    channel = models.CharField(max_length=10, choices=Channel.choices)
    payload = models.JSONField()
    processed = models.BooleanField(default=False)
    error = models.CharField(max_length=255, blank=True)
    received_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-received_at", "-id"]

    def __str__(self) -> str:
        return f"{self._meta.verbose_name} #{self.pk}"
