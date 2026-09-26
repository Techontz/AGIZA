"""
Customer segmentation: tags (manual or assigned by rules), interests
(computed from what customers buy, or set by staff), the tag rules engine,
and campaigns whose audience is a real query over those segments.
"""
from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.core.models import TimeStampedModel
from apps.core.references import next_reference


class Tag(TimeStampedModel):
    name = models.CharField(max_length=60, unique=True, help_text='Lower-case label, e.g. "vip", "bulk_buyer"')

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name

    def save(self, *args, **kwargs):
        self.name = self.name.strip().lower().replace(" ", "_")
        super().save(*args, **kwargs)


class CustomerTag(models.Model):
    class Source(models.TextChoices):
        MANUAL = "manual", "Manual"
        RULE = "rule", "System (tag rule)"

    customer = models.ForeignKey("parties.Customer", on_delete=models.CASCADE, related_name="tag_links")
    tag = models.ForeignKey(Tag, on_delete=models.CASCADE, related_name="customer_links")
    source = models.CharField(max_length=8, choices=Source.choices)
    rule = models.ForeignKey("TagRule", null=True, blank=True, on_delete=models.SET_NULL, related_name="assignments")
    assigned_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                    related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]
        constraints = [models.UniqueConstraint(fields=["customer", "tag"], name="uniq_customer_tag")]
        indexes = [models.Index(fields=["tag", "source"])]


class CustomerInterest(models.Model):
    class Source(models.TextChoices):
        COMPUTED = "computed", "Detected from orders"
        MANUAL = "manual", "Added by staff"

    customer = models.ForeignKey("parties.Customer", on_delete=models.CASCADE, related_name="interests")
    label = models.CharField(max_length=80, help_text="Category name, lower-case")
    category = models.ForeignKey("catalog.Category", null=True, blank=True, on_delete=models.SET_NULL,
                                 related_name="+")
    confidence = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(100)])
    source = models.CharField(max_length=10, choices=Source.choices, default=Source.COMPUTED)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-confidence", "label"]
        constraints = [models.UniqueConstraint(fields=["customer", "label"], name="uniq_customer_interest")]
        indexes = [models.Index(fields=["label"])]


class RuleField(models.TextChoices):
    TOTAL_SPENT = "total_spent", "Total Spent (TSh)"
    TOTAL_ORDERS = "total_orders", "Total Orders"
    INACTIVE_DAYS = "inactive_days", "Inactive for (days)"
    CATEGORY = "category", "User Interest Category"
    LAST_ORDER_DAYS = "last_order_days", "Days Since Last Order"


class RuleOperator(models.TextChoices):
    GT = ">", "Greater than"
    LT = "<", "Less than"
    EQ = "=", "Equals"
    INCLUDES = "includes", "Includes"


class TagRule(TimeStampedModel):
    name = models.CharField(max_length=120)
    tag = models.ForeignKey(Tag, on_delete=models.PROTECT, related_name="rules")
    enabled = models.BooleanField(default=True)
    last_run_at = models.DateTimeField(null=True, blank=True)
    last_matched = models.PositiveIntegerField(default=0)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="+")

    class Meta:
        ordering = ["name", "id"]

    def __str__(self) -> str:
        return self.name


class TagRuleCondition(models.Model):
    rule = models.ForeignKey(TagRule, on_delete=models.CASCADE, related_name="conditions")
    field = models.CharField(max_length=16, choices=RuleField.choices)
    operator = models.CharField(max_length=8, choices=RuleOperator.choices)
    value = models.CharField(max_length=80)

    class Meta:
        ordering = ["id"]


class TagRuleRun(models.Model):
    """Outcome of evaluating a rule: how many matched and what changed."""

    rule = models.ForeignKey(TagRule, on_delete=models.CASCADE, related_name="runs")
    matched = models.PositiveIntegerField()
    added = models.PositiveIntegerField()
    removed = models.PositiveIntegerField()
    trigger = models.CharField(max_length=20, help_text="save / manual / scheduled / activity")
    run_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                               related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]


class Campaign(TimeStampedModel):
    class Channel(models.TextChoices):
        SMS = "sms", "SMS"
        EMAIL = "email", "Email"
        WHATSAPP = "whatsapp", "WhatsApp"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SENT = "sent", "Sent"
        PARTIAL = "partial", "Partially sent"
        NOT_SENT = "not_sent", "Not sent — channel not configured"
        CANCELLED = "cancelled", "Cancelled"

    class Activity(models.TextChoices):
        ALL = "all", "All Users"
        ACTIVE = "active", "Active (30 days)"
        INACTIVE = "inactive", "Inactive (30+ days)"

    reference = models.CharField(max_length=20, unique=True, editable=False)
    name = models.CharField(max_length=150)
    channel = models.CharField(max_length=10, choices=Channel.choices, default=Channel.SMS)
    subject = models.CharField(max_length=150, blank=True, help_text="Email subject")
    message = models.TextField()
    tags = models.ManyToManyField(Tag, blank=True, related_name="campaigns")
    interests = models.JSONField(default=list, blank=True, help_text="Interest labels")
    activity = models.CharField(max_length=10, choices=Activity.choices, default=Activity.ALL)
    min_orders = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT, db_index=True)
    audience_count = models.PositiveIntegerField(default=0)
    sent_count = models.PositiveIntegerField(default=0)
    failed_count = models.PositiveIntegerField(default=0)
    sent_at = models.DateTimeField(null=True, blank=True)
    status_note = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="+")

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self) -> str:
        return self.name

    def save(self, *args, **kwargs):
        if not self.reference:
            self.reference = next_reference("CMP", width=3)
        super().save(*args, **kwargs)


class CampaignRecipient(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        SENT = "sent", "Sent"
        FAILED = "failed", "Failed"
        SKIPPED = "skipped", "Skipped (no contact)"

    campaign = models.ForeignKey(Campaign, on_delete=models.CASCADE, related_name="recipients")
    customer = models.ForeignKey("parties.Customer", on_delete=models.CASCADE, related_name="+")
    destination = models.CharField(max_length=150, blank=True)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.PENDING)
    error = models.CharField(max_length=255, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["id"]
        constraints = [models.UniqueConstraint(fields=["campaign", "customer"], name="uniq_campaign_recipient")]
