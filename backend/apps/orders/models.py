"""
Core orders. One `Order` row per order of any type (common fields, status,
money), with a one-to-one details row for type-specific data. Status changes
go only through `apps.orders.services`, which records OrderStatusHistory.
"""
from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q

from apps.core.models import TimeStampedModel
from apps.core.references import next_reference

from .workflows import REFERENCE_PREFIX, OrderType

POSITIVE = [MinValueValidator(Decimal("0"))]


class Department(models.TextChoices):
    UNASSIGNED = "unassigned", "Unassigned"
    PROCUREMENT = "procurement", "Procurement"
    SHIPPING = "shipping", "Shipping"
    DELIVERY = "delivery", "Delivery"
    SUPPORT = "support", "Support"


class Order(TimeStampedModel):
    reference = models.CharField(max_length=20, unique=True, editable=False)
    order_type = models.CharField(max_length=16, choices=OrderType.choices)
    customer = models.ForeignKey("parties.Customer", on_delete=models.PROTECT, related_name="orders")
    status = models.CharField(max_length=32, db_index=True)
    item_details = models.CharField(max_length=255, help_text='e.g. "2x Electronics Package (5kg)"')
    department = models.CharField(max_length=16, choices=Department.choices, default=Department.UNASSIGNED)
    handler = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="handled_orders"
    )
    currency = models.CharField(max_length=3, default="TZS")
    total_amount = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True, validators=POSITIVE)
    installment_plan = models.BooleanField(default=False, help_text="Customer pays in installments")
    installment_allowed = models.BooleanField(default=False, help_text="Admin approved proceeding on installments")
    notes = models.TextField(blank=True)
    source_quote = models.OneToOneField(
        "quotes.QuoteRequest", null=True, blank=True, on_delete=models.SET_NULL, related_name="created_order"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["order_type", "status"]),
            models.Index(fields=["order_type", "-created_at"]),
            models.Index(fields=["department"]),
        ]

    def __str__(self) -> str:
        return f"{self.reference} · {self.item_details}"

    def save(self, *args, **kwargs):
        if not self.reference:
            self.reference = next_reference(REFERENCE_PREFIX[OrderType(self.order_type)])
        super().save(*args, **kwargs)


class OrderStatusHistory(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="status_history")
    from_status = models.CharField(max_length=32, blank=True)
    to_status = models.CharField(max_length=32)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]
        indexes = [models.Index(fields=["order", "created_at"])]
        verbose_name_plural = "order status history"

    def __str__(self) -> str:
        return f"{self.order.reference}: {self.from_status or '∅'} → {self.to_status}"


class Payment(TimeStampedModel):
    """A payment recorded manually by staff against an order."""

    class Method(models.TextChoices):
        CASH = "cash", "Cash"
        MOBILE_MONEY = "mobile_money", "Mobile Money"
        BANK_TRANSFER = "bank_transfer", "Bank Transfer"
        CARD = "card", "Card"
        OTHER = "other", "Other"

    class Kind(models.TextChoices):
        ADVANCE = "advance", "Advance"
        INSTALLMENT = "installment", "Installment"
        BALANCE = "balance", "Balance / Full"
        REFUND = "refund", "Refund"

    order = models.ForeignKey(Order, on_delete=models.PROTECT, related_name="payments")
    amount = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])
    currency = models.CharField(max_length=3, default="TZS")
    method = models.CharField(max_length=16, choices=Method.choices)
    kind = models.CharField(max_length=12, choices=Kind.choices, default=Kind.BALANCE)
    reference = models.CharField(max_length=80, blank=True, help_text="Receipt / transaction number")
    paid_at = models.DateTimeField()
    notes = models.TextField(blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        ordering = ["-paid_at", "-id"]
        indexes = [models.Index(fields=["order", "paid_at"])]

    def __str__(self) -> str:
        return f"{self.order.reference} · {self.amount} {self.currency}"


def attachment_path(instance, filename):
    return f"orders/{instance.order_id}/{filename}"


class OrderAttachment(TimeStampedModel):
    """Package photos / documents. Served only through the authenticated API."""

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="attachments")
    file = models.FileField(upload_to=attachment_path)
    content_type = models.CharField(max_length=100, blank=True)
    caption = models.CharField(max_length=160, blank=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        ordering = ["created_at", "id"]


# --------------------------------------------------------------------------- #
# Type-specific details
# --------------------------------------------------------------------------- #
class PackageSize(models.TextChoices):
    SMALL = "small", "Small"
    MEDIUM = "medium", "Medium"
    LARGE = "large", "Large"


class Priority(models.TextChoices):
    STANDARD = "standard", "Standard"
    EXPRESS = "express", "Express"
    URGENT = "urgent", "Urgent"


class ExpressDetails(models.Model):
    order = models.OneToOneField(Order, on_delete=models.CASCADE, related_name="express", primary_key=True)
    pickup_address = models.CharField(max_length=255)
    pickup_city = models.ForeignKey("locations.City", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    delivery_address = models.CharField(max_length=255)
    delivery_city = models.ForeignKey("locations.City", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    priority = models.CharField(max_length=10, choices=Priority.choices, default=Priority.STANDARD)
    weight_kg = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True, validators=POSITIVE)
    package_size = models.CharField(max_length=8, choices=PackageSize.choices, blank=True)
    customer_package_size = models.CharField(
        max_length=8, choices=PackageSize.choices, blank=True, help_text="Size the customer selected"
    )
    # Quote
    estimated_delivery_at = models.DateTimeField(null=True, blank=True)
    advance_required = models.BooleanField(default=False)
    advance_amount = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True, validators=POSITIVE)
    quoted_at = models.DateTimeField(null=True, blank=True)
    quoted_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    # Delivery
    driver = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="express_deliveries"
    )

    class Meta:
        constraints = [
            models.CheckConstraint(
                name="express_advance_amount_when_required",
                condition=Q(advance_required=False) | Q(advance_amount__gt=0),
            ),
        ]


class Classification(models.TextChoices):
    SIMPLE = "simple", "Simple"
    BULK = "bulk", "Bulk"
    MACHINERY = "machinery", "Machinery"
    FRAGILE = "fragile", "Fragile"


class InternationalDetails(models.Model):
    class ServiceType(models.TextChoices):
        FULL_SERVICE = "full_service", "Full Service (Agiza sourcing)"
        DELIVER_FOR_ME = "deliver_for_me", "Deliver for Me"
        LOCAL_PURCHASE = "local_purchase", "Local Purchase"
        MARKETPLACE = "marketplace", "Marketplace"

    order = models.OneToOneField(Order, on_delete=models.CASCADE, related_name="international", primary_key=True)
    source_country = models.ForeignKey("locations.Country", on_delete=models.PROTECT, related_name="+")
    order_class = models.CharField(max_length=12, choices=Classification.choices, default=Classification.SIMPLE)
    service_type = models.CharField(max_length=16, choices=ServiceType.choices, default=ServiceType.FULL_SERVICE)
    # Filled by Procurement / Shipping (Phase 4 links these to their records).
    supplier_name = models.CharField(max_length=150, blank=True)
    tracking_number = models.CharField(max_length=80, blank=True)
    item_cost = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True, validators=POSITIVE)
    shipping_cost = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True, validators=POSITIVE)
    estimated_delivery = models.DateField(null=True, blank=True)


class EquipmentDetails(models.Model):
    class ServiceType(models.TextChoices):
        INSTALLATION = "installation", "Installation"
        PRODUCT_SETUP = "product_setup", "Product Setup"
        MAINTENANCE = "maintenance", "Maintenance"
        ELECTRONIC_REPAIR = "electronic_repair", "Electronic Repair"

    order = models.OneToOneField(Order, on_delete=models.CASCADE, related_name="equipment", primary_key=True)
    service_type = models.CharField(max_length=20, choices=ServiceType.choices)
    equipment = models.CharField(max_length=160)
    classification = models.CharField(max_length=12, choices=Classification.choices, default=Classification.SIMPLE)
    city = models.ForeignKey("locations.City", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    site_address = models.CharField(max_length=255, blank=True)
    technician = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="equipment_jobs"
    )
    technician_assigned_at = models.DateTimeField(null=True, blank=True)
    expected_date = models.DateTimeField(null=True, blank=True)
    priority = models.CharField(max_length=10, choices=[("high", "High"), ("medium", "Medium"), ("low", "Low")], default="medium")
    needs_attention = models.BooleanField(default=False)
