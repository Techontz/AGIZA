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
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.core.models import TimeStampedModel
from apps.core.references import next_reference

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


class VendorPayout(TimeStampedModel):
    """A settlement AGIZA made to a vendor outside the system (mobile money / bank), recorded by staff."""

    reference = models.CharField(max_length=20, unique=True, editable=False)
    vendor = models.ForeignKey("catalog.Vendor", on_delete=models.PROTECT, related_name="payouts")
    amount = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])
    currency = models.CharField(max_length=3, default="TZS")
    method = models.CharField(max_length=14, choices=[("mobile_money", "Mobile money"), ("bank", "Bank transfer"),
                                                      ("cash", "Cash"), ("other", "Other")])
    transaction_reference = models.CharField(max_length=80, blank=True)
    paid_at = models.DateTimeField()
    notes = models.TextField(blank=True)
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                    related_name="+")

    class Meta:
        ordering = ["-paid_at", "-id"]

    def __str__(self) -> str:
        return f"{self.reference} · {self.amount} {self.currency}"

    def save(self, *args, **kwargs):
        if not self.reference:
            self.reference = next_reference("VPAY")
        super().save(*args, **kwargs)


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

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["vendor", "status"]), models.Index(fields=["vendor", "settlement_status"])]

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
