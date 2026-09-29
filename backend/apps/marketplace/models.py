"""
Multi-vendor marketplace records.

One customer checkout stays one `orders.Order` (one payment, one delivery to the
customer). Inside it, each seller's part is a `VendorFulfillment`: its lines, what
the seller has to prepare, the gross sales, AGIZA's commission and the seller's net
earnings (all captured when the order is placed). Products AGIZA sells itself form a
fulfillment with no vendor.

Money only moves outside the system: customers pay AGIZA through the existing payment
flow, and AGIZA settles vendors by transfer, recorded here as a `VendorPayout`.
"""
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q

from apps.core.models import TimeStampedModel
from apps.core.references import next_reference
from apps.core.uploads import safe_filename

PERCENT = [MinValueValidator(Decimal("0")), MaxValueValidator(Decimal("100"))]
POSITIVE = [MinValueValidator(Decimal("0"))]


class MarketplaceSettings(TimeStampedModel):
    """Singleton (pk=1): marketplace rules staff configure in the admin."""

    default_commission_percent = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal("10.00"), validators=PERCENT,
        help_text="AGIZA's commission on vendor sales when no category or vendor rate applies",
    )
    require_product_review = models.BooleanField(
        default=True, help_text="Vendor products (and changes to what they show) wait for AGIZA's approval",
    )
    vendor_applications_open = models.BooleanField(default=True)
    payout_schedule = models.CharField(max_length=160, blank=True, default="Weekly, for delivered and paid orders",
                                       help_text="Shown to vendors next to their earnings")
    return_window_days = models.PositiveSmallIntegerField(
        default=7, validators=[MaxValueValidator(90)],
        help_text="Days after delivery during which customers can ask to return items")
    auto_publish_reviews = models.BooleanField(
        default=True, help_text="Customer reviews go live at once (staff can still hide them); off = wait for approval")
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="+")

    class Meta:
        verbose_name_plural = "marketplace settings"

    def __str__(self) -> str:
        return "Marketplace settings"

    @classmethod
    def load(cls) -> "MarketplaceSettings":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class CategoryCommission(TimeStampedModel):
    """Commission for vendor sales in a category (a subcategory's own rate wins over its parent's)."""

    category = models.OneToOneField("catalog.Category", on_delete=models.CASCADE, related_name="commission")
    percent = models.DecimalField(max_digits=5, decimal_places=2, validators=PERCENT)

    class Meta:
        ordering = ["category__name"]

    def __str__(self) -> str:
        return f"{self.category}: {self.percent}%"


class VendorStatusHistory(models.Model):
    """Every step of a vendor's application and account status, with who did it and why."""

    vendor = models.ForeignKey("catalog.Vendor", on_delete=models.CASCADE, related_name="status_history")
    from_status = models.CharField(max_length=20, blank=True)
    to_status = models.CharField(max_length=20)
    note = models.TextField(blank=True)
    changed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="+")
    by_vendor = models.BooleanField(default=False, help_text="Done by the vendor (application, resubmission)")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]
        verbose_name_plural = "vendor status history"

    def __str__(self) -> str:
        return f"{self.vendor_id}: {self.from_status or '∅'} → {self.to_status}"


class FulfillmentStatus(models.TextChoices):
    PENDING = "pending", "New order"
    ACCEPTED = "accepted", "Preparing"
    READY = "ready", "Ready for pickup"
    SHIPPED = "shipped", "Collected by AGIZA"
    DELIVERED = "delivered", "Delivered"
    CANCELLED = "cancelled", "Cancelled"


class SettlementStatus(models.TextChoices):
    PENDING = "pending", "Pending (order not yet paid and delivered)"
    PAYABLE = "payable", "Payable"
    SETTLED = "settled", "Paid out"
    VOID = "void", "Void (order cancelled)"


# Vendors move their own part forward only this far; AGIZA's workflow does the rest.
VENDOR_TRANSITIONS = {
    FulfillmentStatus.PENDING: {FulfillmentStatus.ACCEPTED},
    FulfillmentStatus.ACCEPTED: {FulfillmentStatus.READY},
}


class PayoutBatch(TimeStampedModel):
    """A settlement run: the payouts AGIZA prepares together (one per vendor with a payable balance)."""

    reference = models.CharField(max_length=20, unique=True, editable=False)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="+")

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self) -> str:
        return self.reference

    def save(self, *args, **kwargs):
        if not self.reference:
            self.reference = next_reference("VBAT")
        super().save(*args, **kwargs)


class PayoutStatus(models.TextChoices):
    PROCESSING = "processing", "Processing"
    PAID = "paid", "Paid"
    FAILED = "failed", "Failed"
    REVERSED = "reversed", "Reversed"


class VendorPayout(TimeStampedModel):
    """
    A settlement to a vendor. The transfer itself happens outside the system (mobile money / bank);
    staff record its outcome. Creating a payout takes the vendor's whole payable balance off the
    ledger at once, so the same earnings can never be paid twice; a failed or reversed payout puts
    it back with a new ledger entry (history is never rewritten).
    """

    reference = models.CharField(max_length=20, unique=True, editable=False)
    vendor = models.ForeignKey("catalog.Vendor", on_delete=models.PROTECT, related_name="payouts")
    batch = models.ForeignKey(PayoutBatch, null=True, blank=True, on_delete=models.PROTECT, related_name="payouts")
    status = models.CharField(max_length=10, choices=PayoutStatus.choices, default=PayoutStatus.PAID, db_index=True)
    amount = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])
    currency = models.CharField(max_length=3, default="TZS")
    # What the amount is made of (from the ledger when the payout was created)
    gross_sales = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    commission = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    refund_deductions = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    adjustments = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    method = models.CharField(max_length=14, choices=[("mobile_money", "Mobile money"), ("bank", "Bank transfer"),
                                                      ("cash", "Cash"), ("other", "Other")])
    destination = models.CharField(max_length=255, blank=True, help_text="Payout account at the time (snapshot)")
    transaction_reference = models.CharField(max_length=80, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    failure_reason = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                    related_name="+", help_text="Who created the payout")
    processed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                     related_name="+", help_text="Who recorded the outcome")
    processed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self) -> str:
        return f"{self.reference} · {self.amount} {self.currency}"

    def save(self, *args, **kwargs):
        if not self.reference:
            self.reference = next_reference("VPAY")
        super().save(*args, **kwargs)


class IssueType(models.TextChoices):
    CANNOT_FULFILL = "cannot_fulfill", "Can't fulfil the order"
    ITEM_UNAVAILABLE = "item_unavailable", "Item unavailable"
    STOCK_DISCREPANCY = "stock_discrepancy", "Stock count was wrong"
    DAMAGED_ITEM = "damaged_item", "Item damaged"
    OTHER = "other", "Other fulfilment problem"


class VendorFulfillment(TimeStampedModel):
    order = models.ForeignKey("orders.Order", on_delete=models.CASCADE, related_name="fulfillments")
    vendor = models.ForeignKey("catalog.Vendor", null=True, blank=True, on_delete=models.PROTECT,
                               related_name="fulfillments", help_text="Empty = sold by AGIZA")
    status = models.CharField(max_length=10, choices=FulfillmentStatus.choices, default=FulfillmentStatus.PENDING,
                              db_index=True)
    origin = models.ForeignKey("locations.Warehouse", null=True, blank=True, on_delete=models.PROTECT,
                               related_name="+", help_text="Where AGIZA collects these items")
    item_count = models.PositiveIntegerField(default=0)
    subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"), validators=POSITIVE,
                                   help_text="Gross merchandise value of these lines")
    commission = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"), validators=POSITIVE)
    vendor_net = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"), validators=POSITIVE)
    shipping_fee = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"), validators=POSITIVE,
                                       help_text="Part of the customer's delivery fee for these items (AGIZA revenue)")
    settlement_status = models.CharField(max_length=8, choices=SettlementStatus.choices,
                                         default=SettlementStatus.PENDING, db_index=True)
    payout = models.ForeignKey(VendorPayout, null=True, blank=True, on_delete=models.PROTECT,
                               related_name="fulfillments")
    accepted_at = models.DateTimeField(null=True, blank=True)
    ready_at = models.DateTimeField(null=True, blank=True)
    # A problem the vendor reported (AGIZA decides what happens to this part of the order)
    issue_type = models.CharField(max_length=20, choices=IssueType.choices, blank=True)
    issue_note = models.TextField(blank=True)
    issue_reported_at = models.DateTimeField(null=True, blank=True)
    issue_resolved_at = models.DateTimeField(null=True, blank=True)
    issue_resolution = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["vendor", "status"]), models.Index(fields=["vendor", "settlement_status"])]

    @property
    def issue_open(self) -> bool:
        return bool(self.issue_reported_at) and not self.issue_resolved_at

    def __str__(self) -> str:
        return f"{self.order_id} · {self.vendor.name if self.vendor_id else 'AGIZA'}"

    @property
    def reference(self) -> str:
        """e.g. SHP-000123-V4 (V0 = AGIZA's own items)."""
        return f"{self.order.reference}-V{self.vendor_id or 0}"


class FulfillmentEvent(models.Model):
    fulfillment = models.ForeignKey(VendorFulfillment, on_delete=models.CASCADE, related_name="events")
    from_status = models.CharField(max_length=10, blank=True)
    to_status = models.CharField(max_length=10)
    note = models.CharField(max_length=255, blank=True)
    changed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="+")
    by_vendor = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self) -> str:
        return f"{self.fulfillment_id}: {self.from_status or '∅'} → {self.to_status}"



# --------------------------------------------------------------------------- #
# Vendor ledger (append-only)
# --------------------------------------------------------------------------- #
class LedgerKind(models.TextChoices):
    EARNING = "earning", "Sale earnings (order delivered and paid)"
    REFUND = "refund", "Refund deducted"
    ADJUSTMENT = "adjustment", "Adjustment"
    PAYOUT = "payout", "Payout"
    PAYOUT_REVERSAL = "payout_reversal", "Payout failed / reversed"


class VendorLedgerEntry(models.Model):
    """
    Every change to what AGIZA owes a vendor, as an immutable row. `amount` is the effect on the
    vendor's balance (+ owed to the vendor, − deducted or paid). `gross_amount` and
    `commission_amount` split sale and refund rows into the customer-facing value and AGIZA's share.
    `key` makes each posting idempotent (e.g. one earning row per fulfilment).
    The payable balance is the sum of the rows that are due (see `apps.marketplace.ledger`).
    """

    key = models.CharField(max_length=80, unique=True)
    vendor = models.ForeignKey("catalog.Vendor", on_delete=models.PROTECT, related_name="ledger")
    kind = models.CharField(max_length=16, choices=LedgerKind.choices)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    gross_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    commission_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    currency = models.CharField(max_length=3, default="TZS")
    fulfillment = models.ForeignKey(VendorFulfillment, null=True, blank=True, on_delete=models.PROTECT,
                                    related_name="ledger_entries")
    payout = models.ForeignKey(VendorPayout, null=True, blank=True, on_delete=models.PROTECT,
                               related_name="ledger_entries")
    return_request = models.ForeignKey("returns.ReturnRequest", null=True, blank=True, on_delete=models.PROTECT,
                                       related_name="ledger_entries")
    reference = models.CharField(max_length=80, blank=True, help_text="Order, return or payout reference")
    note = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="+")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        verbose_name_plural = "vendor ledger entries"
        indexes = [models.Index(fields=["vendor", "kind"])]

    def __str__(self) -> str:
        return f"{self.key}: {self.amount}"

    def save(self, *args, **kwargs):
        if self.pk is not None:
            raise ValidationError("Ledger entries can't be changed; post a new entry instead.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Ledger entries can't be deleted; post a reversing entry instead.")


# --------------------------------------------------------------------------- #
# Customer reviews
# --------------------------------------------------------------------------- #
class ReviewStatus(models.TextChoices):
    PUBLISHED = "published", "Published"
    PENDING = "pending", "Waiting for approval"
    FLAGGED = "flagged", "Flagged for review"
    HIDDEN = "hidden", "Hidden by AGIZA"


VISIBLE_REVIEW = (ReviewStatus.PUBLISHED, ReviewStatus.FLAGGED)


class ProductReview(TimeStampedModel):
    """
    A verified-purchase review: only a customer with a delivered order containing the product can
    write one, once per product (they can edit it). Ratings shown anywhere are computed from these.
    """

    product = models.ForeignKey("catalog.Product", on_delete=models.CASCADE, related_name="reviews")
    vendor = models.ForeignKey("catalog.Vendor", null=True, blank=True, on_delete=models.SET_NULL,
                               related_name="reviews", help_text="Seller of the product when reviewed")
    customer = models.ForeignKey("parties.Customer", on_delete=models.CASCADE, related_name="reviews")
    order_item = models.ForeignKey("orders.OrderItem", null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="+", help_text="The purchase that allows this review")
    rating = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)])
    title = models.CharField(max_length=120, blank=True)
    body = models.TextField(blank=True, max_length=2000)
    status = models.CharField(max_length=10, choices=ReviewStatus.choices, default=ReviewStatus.PUBLISHED,
                              db_index=True)
    edited_at = models.DateTimeField(null=True, blank=True)
    vendor_reply = models.TextField(blank=True, max_length=1000)
    vendor_replied_at = models.DateTimeField(null=True, blank=True)
    moderation_note = models.CharField(max_length=255, blank=True)
    moderated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                     related_name="+")
    flag_reason = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["product", "customer"], name="one_review_per_customer_product"),
            models.CheckConstraint(name="review_rating_1_to_5", condition=Q(rating__gte=1) & Q(rating__lte=5)),
        ]
        indexes = [models.Index(fields=["product", "status"]), models.Index(fields=["vendor", "status"])]

    def __str__(self) -> str:
        return f"{self.product_id} · {self.rating}★"


# --------------------------------------------------------------------------- #
# Vendor documents (private)
# --------------------------------------------------------------------------- #
def vendor_document_path(instance, filename):
    return f"private/vendors/{instance.vendor_id}/{safe_filename(filename)}"


class VendorDocument(TimeStampedModel):
    """Business documents a vendor provides for verification. Never public: staff and the owner only."""

    class Kind(models.TextChoices):
        BUSINESS_LICENSE = "business_license", "Business licence"
        TIN_CERTIFICATE = "tin_certificate", "TIN certificate"
        REGISTRATION = "registration", "Registration certificate"
        ID = "id", "Owner's ID"
        OTHER = "other", "Other"

    vendor = models.ForeignKey("catalog.Vendor", on_delete=models.CASCADE, related_name="documents")
    kind = models.CharField(max_length=20, choices=Kind.choices)
    file = models.FileField(upload_to=vendor_document_path)
    content_type = models.CharField(max_length=100)
    original_name = models.CharField(max_length=150, blank=True, help_text="Shown to staff only")

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self) -> str:
        return f"{self.vendor_id} · {self.kind}"
