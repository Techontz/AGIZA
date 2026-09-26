"""
Finance: invoices (from a quotation, an order, or manual), customer wallets
with a transaction ledger, and installment plans with their schedule.

Payments against orders are `orders.Payment` (manual payments, never more
than the outstanding balance). Money always moves through
`apps.finance.services`, inside transactions, with audit entries.
"""
from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q

from apps.core.models import TimeStampedModel
from apps.core.references import next_reference

POSITIVE = [MinValueValidator(Decimal("0"))]
MONEY = {"max_digits": 14, "decimal_places": 2}


class InvoiceStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    SENT = "sent", "Sent"
    PAID = "paid", "Paid"
    VOID = "void", "Void"


class Invoice(TimeStampedModel):
    class Source(models.TextChoices):
        QUOTE = "quote", "From quotation"
        ORDER = "order", "From order"
        MANUAL = "manual", "New invoice"

    reference = models.CharField(max_length=24, unique=True, editable=False)
    source = models.CharField(max_length=8, choices=Source.choices)
    customer = models.ForeignKey("parties.Customer", on_delete=models.PROTECT, related_name="invoices")
    quote = models.ForeignKey("quotes.QuoteRequest", null=True, blank=True, on_delete=models.PROTECT,
                              related_name="invoices")
    order = models.ForeignKey("orders.Order", null=True, blank=True, on_delete=models.PROTECT, related_name="invoices")
    status = models.CharField(max_length=6, choices=InvoiceStatus.choices, default=InvoiceStatus.DRAFT, db_index=True)
    currency = models.CharField(max_length=3, default="TZS")
    issue_date = models.DateField()
    due_date = models.DateField(null=True, blank=True)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0"),
                                   help_text="VAT % applied to the subtotal (0 = no VAT line)")
    notes = models.TextField(blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    # Manual invoices are settled here; order invoices follow the order's payments.
    paid_at = models.DateTimeField(null=True, blank=True)
    payment_method = models.CharField(max_length=16, blank=True)
    payment_reference = models.CharField(max_length=80, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="+")

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.CheckConstraint(name="invoice_source_link", condition=(
                Q(source="quote", quote__isnull=False) | Q(source="order", order__isnull=False) | Q(source="manual")
            )),
            models.CheckConstraint(name="invoice_due_after_issue",
                                   condition=Q(due_date__isnull=True) | Q(due_date__gte=models.F("issue_date"))),
        ]

    def __str__(self) -> str:
        return self.reference

    def save(self, *args, **kwargs):
        if not self.reference:
            self.reference = next_reference(f"INV-{self.issue_date.year}", width=3)
        super().save(*args, **kwargs)


class InvoiceItem(models.Model):
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="items")
    description = models.CharField(max_length=255)
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("1"),
                                   validators=[MinValueValidator(Decimal("0.01"))])
    unit_price = models.DecimalField(**MONEY, validators=POSITIVE)
    amount = models.DecimalField(**MONEY, validators=POSITIVE)

    class Meta:
        ordering = ["id"]


# --------------------------------------------------------------------------- #
# Wallets
# --------------------------------------------------------------------------- #

    def __str__(self) -> str:
        return f"{self._meta.verbose_name} #{self.pk}"
class Wallet(TimeStampedModel):
    customer = models.OneToOneField("parties.Customer", on_delete=models.PROTECT, related_name="wallet")
    balance = models.DecimalField(**MONEY, default=Decimal("0"))
    currency = models.CharField(max_length=3, default="TZS")

    class Meta:
        constraints = [models.CheckConstraint(name="wallet_balance_not_negative", condition=Q(balance__gte=0))]

    def __str__(self) -> str:
        return f"Wallet {self.customer.reference}: {self.balance}"


class WalletTransaction(models.Model):
    class Kind(models.TextChoices):
        CREDIT = "credit", "Credit"
        DEBIT = "debit", "Debit"

    class Source(models.TextChoices):
        TOP_UP = "top_up", "Top-up / deposit"
        REFUND = "refund", "Refund"
        ORDER_PAYMENT = "order_payment", "Order payment"
        ADJUSTMENT = "adjustment", "Adjustment"

    wallet = models.ForeignKey(Wallet, on_delete=models.PROTECT, related_name="transactions")
    kind = models.CharField(max_length=6, choices=Kind.choices)
    source = models.CharField(max_length=14, choices=Source.choices)
    amount = models.DecimalField(**MONEY, validators=[MinValueValidator(Decimal("0.01"))])
    balance_after = models.DecimalField(**MONEY)
    order = models.ForeignKey("orders.Order", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    payment = models.OneToOneField("orders.Payment", null=True, blank=True, on_delete=models.PROTECT,
                                   related_name="wallet_transaction")
    method = models.CharField(max_length=16, blank=True, help_text="How a top-up was received")
    reference = models.CharField(max_length=80, blank=True)
    note = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["wallet", "created_at"])]


# --------------------------------------------------------------------------- #
# Installments
# --------------------------------------------------------------------------- #

    def __str__(self) -> str:
        return f"{self._meta.verbose_name} #{self.pk}"
class PlanStatus(models.TextChoices):
    PENDING_APPROVAL = "pending_approval", "Pending Approval"
    ACTIVE = "active", "Active"
    COMPLETED = "completed", "Completed"
    REJECTED = "rejected", "Rejected"
    CANCELLED = "cancelled", "Cancelled"


class InstallmentPlan(TimeStampedModel):
    order = models.OneToOneField("orders.Order", on_delete=models.PROTECT, related_name="installment_schedule")
    status = models.CharField(max_length=16, choices=PlanStatus.choices, default=PlanStatus.PENDING_APPROVAL,
                              db_index=True)
    total_amount = models.DecimalField(**MONEY, validators=POSITIVE)
    number_of_installments = models.PositiveSmallIntegerField(validators=[MinValueValidator(1)])
    interval_days = models.PositiveSmallIntegerField(default=30)
    notes = models.TextField(blank=True)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                    related_name="+")
    approved_at = models.DateTimeField(null=True, blank=True)
    decision_note = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="+")

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self) -> str:
        return f"Plan {self.order.reference}"


class Installment(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PARTIAL = "partial", "Partially paid"
        PAID = "paid", "Paid"

    plan = models.ForeignKey(InstallmentPlan, on_delete=models.CASCADE, related_name="installments")
    sequence = models.PositiveSmallIntegerField()
    due_date = models.DateField()
    amount = models.DecimalField(**MONEY, validators=[MinValueValidator(Decimal("0.01"))])
    paid_amount = models.DecimalField(**MONEY, default=Decimal("0"), validators=POSITIVE)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.PENDING)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["plan", "sequence"]
        constraints = [
            models.UniqueConstraint(fields=["plan", "sequence"], name="uniq_installment_sequence"),
            models.CheckConstraint(name="installment_paid_within_amount",
                                   condition=Q(paid_amount__lte=models.F("amount"))),
        ]

    def __str__(self) -> str:
        return f"{self._meta.verbose_name} #{self.pk}"
