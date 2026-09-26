"""
Procurement: sourcing the goods of international orders from suppliers.

One ProcurementOrder follows each Agiza-sourced international order
(Full Service, Local Purchase, Marketplace). Its status only changes through
`apps.procurement.services`, which also moves the international order
(Supplier Confirmed → Paid Supplier) and hands paid goods to Shipping.
"""
from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models

from apps.core.models import TimeStampedModel
from apps.core.references import next_reference

POSITIVE = [MinValueValidator(Decimal("0"))]


class Supplier(TimeStampedModel):
    reference = models.CharField(max_length=20, unique=True, editable=False)
    name = models.CharField(max_length=150, unique=True)
    country = models.ForeignKey("locations.Country", on_delete=models.PROTECT, related_name="suppliers")
    contact_person = models.CharField(max_length=150, blank=True)
    phone = models.CharField(max_length=32, blank=True)
    email = models.EmailField(blank=True)
    website = models.URLField(blank=True)
    address = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]
        indexes = [models.Index(fields=["country", "is_active"])]

    def __str__(self) -> str:
        return self.name

    def save(self, *args, **kwargs):
        if not self.reference:
            self.reference = next_reference("SUP", width=3)
        super().save(*args, **kwargs)


class ProcurementStatus(models.TextChoices):
    PENDING_SOURCING = "pending_sourcing", "Pending Sourcing"
    SUPPLIER_SELECTED = "supplier_selected", "Supplier Selected"
    PAID = "paid", "Paid"
    SUPPLIER_CANCELLED = "supplier_cancelled", "Supplier Canceled"
    RECEIVED_AT_CARGO = "received_at_cargo", "Received at Cargo"
    CANCELLED = "cancelled", "Cancelled"


class ExceptionFlag(models.TextChoices):
    PAYMENT_ISSUE = "payment_issue", "Payment Issue"
    SUPPLIER_DELAY = "supplier_delay", "Supplier Delay"
    QUALITY_CONCERN = "quality_concern", "Quality Concern"
    STOCK_UNAVAILABLE = "stock_unavailable", "Stock Unavailable"


class ProcurementOrder(TimeStampedModel):
    order = models.OneToOneField("orders.Order", on_delete=models.PROTECT, related_name="procurement")
    status = models.CharField(max_length=20, choices=ProcurementStatus.choices,
                              default=ProcurementStatus.PENDING_SOURCING, db_index=True)
    supplier = models.ForeignKey(Supplier, null=True, blank=True, on_delete=models.PROTECT, related_name="orders")
    supplier_order_number = models.CharField(max_length=80, blank=True, help_text="Supplier invoice / PO number")
    supplier_tracking_number = models.CharField(max_length=80, blank=True)
    operator = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                 related_name="procurement_orders")
    quantity = models.PositiveIntegerField(default=1)
    unit_cost = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True, validators=POSITIVE)
    item_cost = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True, validators=POSITIVE,
                                    help_text="Total paid to the supplier")
    currency = models.CharField(max_length=3, default="TZS")
    payment_reference = models.CharField(max_length=80, blank=True)
    exception_flag = models.CharField(max_length=20, choices=ExceptionFlag.choices, blank=True)
    expected_at_cargo = models.DateField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    received_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["operator"]), models.Index(fields=["exception_flag"])]

    def __str__(self) -> str:
        return f"Procurement {self.order.reference}"


class ProcurementStatusHistory(models.Model):
    procurement = models.ForeignKey(ProcurementOrder, on_delete=models.CASCADE, related_name="history")
    from_status = models.CharField(max_length=20, blank=True)
    to_status = models.CharField(max_length=20)
    changed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="+")
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]
        verbose_name_plural = "procurement status history"

    def __str__(self) -> str:
        return f"{self._meta.verbose_name} #{self.pk}"
