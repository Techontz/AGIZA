"""
Quotation requests (Intake & Quotes). Lifecycle:
new -> (staff responds) waiting_reply -> (customer accepts) answered
    -> (approve) approved, which creates the real order in one transaction.
"""
from datetime import date
from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone

from apps.core.models import TimeStampedModel
from apps.core.references import next_reference


class ServiceType(models.TextChoices):
    INTERNATIONAL = "international", "International Order"
    EXPRESS = "express", "Express Delivery"
    EQUIPMENT = "equipment", "Equipment Support"


class QuoteStatus(models.TextChoices):
    NEW = "new", "New Quotation"
    WAITING_REPLY = "waiting_reply", "Waiting for Reply"
    ANSWERED = "answered", "Answered"
    DECLINED = "declined", "Declined by Customer"
    APPROVED = "approved", "Approved — Order Created"
    CANCELLED = "cancelled", "Cancelled"


QUOTE_TRANSITIONS = {
    QuoteStatus.NEW: {QuoteStatus.WAITING_REPLY, QuoteStatus.CANCELLED},
    QuoteStatus.WAITING_REPLY: {QuoteStatus.WAITING_REPLY, QuoteStatus.ANSWERED, QuoteStatus.DECLINED, QuoteStatus.CANCELLED},
    QuoteStatus.DECLINED: {QuoteStatus.WAITING_REPLY, QuoteStatus.CANCELLED},
    QuoteStatus.ANSWERED: {QuoteStatus.APPROVED, QuoteStatus.WAITING_REPLY, QuoteStatus.CANCELLED},
    QuoteStatus.APPROVED: set(),
    QuoteStatus.CANCELLED: set(),
}


class QuoteRequest(TimeStampedModel):
    reference = models.CharField(max_length=20, unique=True, editable=False)
    customer = models.ForeignKey("parties.Customer", on_delete=models.PROTECT, related_name="quote_requests")
    service_type = models.CharField(max_length=16, choices=ServiceType.choices)
    description = models.TextField()
    origin = models.CharField(max_length=120, blank=True, help_text='Where goods come from, e.g. "China"')
    destination = models.CharField(max_length=120, blank=True, help_text='e.g. "Dar es Salaam"')
    status = models.CharField(max_length=16, choices=QuoteStatus.choices, default=QuoteStatus.NEW, db_index=True)
    requested_at = models.DateTimeField(default=timezone.now)
    # Staff response
    quoted_amount = models.DecimalField(
        max_digits=14, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(Decimal("0.01"))]
    )
    currency = models.CharField(max_length=3, default="TZS")
    estimated_delivery = models.DateField(null=True, blank=True)
    response_notes = models.TextField(blank=True)
    responded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    responded_at = models.DateTimeField(null=True, blank=True)
    customer_replied_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    approved_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["-requested_at", "-id"]
        indexes = [models.Index(fields=["status", "-requested_at"]), models.Index(fields=["service_type"])]

    def __str__(self) -> str:
        return f"{self.reference} · {self.customer.full_name}"

    def save(self, *args, **kwargs):
        if not self.reference:
            self.reference = next_reference(f"Q-{date.today().year}", width=3)
        super().save(*args, **kwargs)


class QuoteStatusHistory(models.Model):
    quote = models.ForeignKey(QuoteRequest, on_delete=models.CASCADE, related_name="status_history")
    from_status = models.CharField(max_length=16, blank=True)
    to_status = models.CharField(max_length=16)
    changed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]
        verbose_name_plural = "quote status history"

    def __str__(self) -> str:
        return f"{self._meta.verbose_name} #{self.pk}"


def quote_photo_path(instance, filename):
    from apps.core.uploads import safe_filename

    return f"quotes/{instance.quote_id}/{safe_filename(filename)}"


class QuoteItem(TimeStampedModel):
    """One line of a "several items, one quotation" request. Staff price each line; the customer accepts the
    whole quotation; approval turns every line into its own order. Quotes without items (every app request and
    older quotes) keep the single description + quoted amount."""

    class ItemService(models.TextChoices):
        BUY_FOR_ME = "full_service", "Buy for me"
        DELIVER_FOR_ME = "deliver_for_me", "Deliver for me"

    quote = models.ForeignKey(QuoteRequest, on_delete=models.CASCADE, related_name="items")
    position = models.PositiveSmallIntegerField(default=0)
    name = models.CharField(max_length=200)
    quantity = models.PositiveIntegerField(default=1, validators=[MinValueValidator(1)])
    link = models.URLField(max_length=500, blank=True)
    category = models.CharField(max_length=120, blank=True)
    notes = models.TextField(blank=True)
    # International quotes: buy for me / deliver for me per item; a parcel the customer bought themselves
    # carries its tracking number and the country it ships from.
    service = models.CharField(max_length=16, choices=ItemService.choices, blank=True)
    tracking_number = models.CharField(max_length=80, blank=True)
    origin_country = models.ForeignKey("locations.Country", null=True, blank=True, on_delete=models.PROTECT,
                                       related_name="+")
    # Staff pricing: amount = the line total (unit_price x quantity when only the unit price is given).
    unit_price = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True,
                                     validators=[MinValueValidator(Decimal("0.01"))])
    amount = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True,
                                 validators=[MinValueValidator(Decimal("0.01"))])
    price_notes = models.TextField(blank=True)
    # The order this line became on approval (the first one is also Order.source_quote).
    created_order = models.ForeignKey("orders.Order", null=True, blank=True, on_delete=models.SET_NULL,
                                      related_name="quote_items")

    class Meta:
        ordering = ["position", "id"]

    def __str__(self) -> str:
        return f"{self.quote.reference} · {self.name}"

    @property
    def label(self) -> str:
        return f"{self.name} ×{self.quantity}" if self.quantity > 1 else self.name


class QuoteAttachment(TimeStampedModel):
    """Photos on a quotation: ones the customer adds to an app request (e.g. the parcel they want delivered)
    and ones AGIZA staff attach to their answer (e.g. the exact item found). Served only through the
    authenticated API; copied onto the order when the quote is approved."""

    quote = models.ForeignKey(QuoteRequest, on_delete=models.CASCADE, related_name="attachments")
    file = models.FileField(upload_to=quote_photo_path)
    content_type = models.CharField(max_length=100, blank=True)
    from_agiza = models.BooleanField(default=False, help_text="Attached by staff to the quotation (shown to the customer)")
    # Photos of one item of a multi-item quotation (they follow that item's order on approval).
    item = models.ForeignKey(QuoteItem, null=True, blank=True, on_delete=models.CASCADE, related_name="attachments")
    # Set when staff uploaded a customer-side photo on the customer's behalf (they may remove it again).
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                    related_name="+")

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self) -> str:
        return f"{self.quote.reference} photo #{self.pk}"
