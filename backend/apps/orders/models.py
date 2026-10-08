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
from apps.core.uploads import safe_filename

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
    # What the order costs Agiza (Finance → Order Payments). Empty = derived from
    # procurement / order lines / the international cost breakdown.
    purchase_cost = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True, validators=POSITIVE)
    shipping_cost = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True, validators=POSITIVE)
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
        WALLET = "wallet", "Customer Wallet"
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
    return f"orders/{instance.order_id}/{safe_filename(filename)}"


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

    def __str__(self) -> str:
        return f"{self._meta.verbose_name} #{self.pk}"


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

    def __str__(self) -> str:
        return f"{self._meta.verbose_name} #{self.pk}"


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
    service_provider = models.ForeignKey("parties.ServiceProvider", null=True, blank=True, on_delete=models.SET_NULL,
                                         related_name="jobs", help_text="External provider doing the work")
    expected_date = models.DateTimeField(null=True, blank=True)
    priority = models.CharField(max_length=10, choices=[("high", "High"), ("medium", "Medium"), ("low", "Low")], default="medium")
    needs_attention = models.BooleanField(default=False)

    def __str__(self) -> str:
        return f"{self._meta.verbose_name} #{self.pk}"


class PaymentPreference(models.TextChoices):
    PAY_LATER = "pay_later", "Pay later (cash, bank or mobile money to AGIZA)"
    MOBILE_MONEY = "mobile_money", "Mobile money (Selcom checkout)"


class ShopDetails(models.Model):
    class Channel(models.TextChoices):
        WEB = "web", "Online store"
        APP = "app", "Mobile app"
        WHATSAPP = "whatsapp", "WhatsApp"
        SHOP = "shop", "Physical shop"
        MANUAL = "manual", "Entered by staff"

    order = models.OneToOneField(Order, on_delete=models.CASCADE, related_name="shop", primary_key=True)
    customer_email = models.EmailField(blank=True)
    shipping_address = models.CharField(max_length=255)
    city = models.ForeignKey("locations.City", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    area = models.CharField(max_length=120, blank=True)
    channel = models.CharField(max_length=10, choices=Channel.choices, default=Channel.WEB)
    delivery_fee = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"), validators=POSITIVE)
    fulfillment_warehouse = models.ForeignKey("locations.Warehouse", null=True, blank=True, on_delete=models.PROTECT,
                                              related_name="+")
    shipped_at = models.DateTimeField(null=True, blank=True)
    # Chosen at checkout (customer app / online store); empty for orders entered by staff.
    delivery_address = models.ForeignKey("parties.Address", null=True, blank=True, on_delete=models.SET_NULL,
                                         related_name="+", help_text="Saved address the customer chose")
    shipping_method = models.ForeignKey("shipping_engine.ShippingMethod", null=True, blank=True,
                                        on_delete=models.SET_NULL, related_name="+")
    estimated_delivery = models.CharField(max_length=60, blank=True, help_text='Quoted at checkout, e.g. "1–2 days"')
    payment_preference = models.CharField(max_length=16, choices=PaymentPreference.choices, blank=True)
    # Imported items (shipped from abroad to AGIZA's hub, then delivered with `shipping_method`).
    import_shipping_method = models.ForeignKey("shipping_engine.ShippingMethod", null=True, blank=True,
                                               on_delete=models.SET_NULL, related_name="+",
                                               help_text="How the imported items travel to Tanzania")
    import_fee = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"), validators=POSITIVE,
                                     help_text="Part of delivery_fee for shipping imported items to Tanzania")
    prepayment_required = models.BooleanField(
        default=False, help_text="Imported items: AGIZA buys them only once the order is fully paid")
    payment_due_at = models.DateTimeField(
        null=True, blank=True, help_text="Prepaid orders are cancelled if not fully paid by then")
    # Customs / import charges (Shipping Engine import-charge rules). customs_fee is part of the total;
    # estimates and "not included" are only information for the customer.
    customs_fee = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"), validators=POSITIVE)
    customs_status = models.CharField(max_length=14, blank=True,
                                      help_text="included / estimated / not_included (empty: nothing imported)")
    customs_charges = models.JSONField(default=dict, blank=True, help_text="Breakdown quoted at checkout")
    # The Shipping Engine asked for a manual quote for this address: the customer ordered without a delivery
    # cost and can't pay until staff set it (orders.shop.set_delivery_fee). delivery_fee then holds only import_fee.
    delivery_fee_pending = models.BooleanField(
        default=False, help_text="Waiting for staff to set the delivery cost; the order can't be paid until then")
    # Why: what the Shipping Engine is missing for this address (route, rule, manual-quote profile), so staff
    # can set the cost now and fix the setup for the next customers.
    delivery_issue = models.TextField(blank=True)

    def __str__(self) -> str:
        return f"{self._meta.verbose_name} #{self.pk}"


class OrderItem(models.Model):
    """A line of a shop order. Name, SKU, price and cost are captured when ordered."""

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    variant = models.ForeignKey("catalog.ProductVariant", on_delete=models.PROTECT, related_name="order_items")
    product_name = models.CharField(max_length=200)
    variant_name = models.CharField(max_length=120, blank=True)
    sku = models.CharField(max_length=64)
    quantity = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    unit_price = models.DecimalField(max_digits=14, decimal_places=2, validators=POSITIVE)
    unit_cost = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True, validators=POSITIVE)
    line_total = models.DecimalField(max_digits=14, decimal_places=2, validators=POSITIVE)
    warehouse = models.ForeignKey("locations.Warehouse", null=True, blank=True, on_delete=models.PROTECT,
                                  related_name="+", help_text="Where the stock is reserved")
    sourced_abroad = models.BooleanField(default=False,
                                         help_text="Imported item bought for this order (no stock was reserved)")
    # Marketplace: who sold the line and AGIZA's commission on it, captured when ordered.
    vendor = models.ForeignKey("catalog.Vendor", null=True, blank=True, on_delete=models.PROTECT, related_name="+",
                               help_text="Empty = sold by AGIZA")
    fulfillment = models.ForeignKey("marketplace.VendorFulfillment", null=True, blank=True, on_delete=models.SET_NULL,
                                    related_name="items")
    commission_amount = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True,
                                            validators=POSITIVE)

    class Meta:
        ordering = ["id"]
        constraints = [models.CheckConstraint(name="order_item_quantity_positive", condition=Q(quantity__gte=1))]

    def __str__(self) -> str:
        return f"{self.quantity}× {self.product_name}"


class OrderAdjustment(models.Model):
    """
    An explicit change to what an order costs after it was placed (a seller couldn't supply its
    items, or returned items were refunded). The order total is updated, and this row keeps the before/after and why — nothing is
    rewritten silently. Rows are never edited.
    """

    order = models.ForeignKey(Order, on_delete=models.PROTECT, related_name="adjustments")
    amount = models.DecimalField(max_digits=14, decimal_places=2, help_text="Change to the total (negative = lower)")
    total_before = models.DecimalField(max_digits=14, decimal_places=2)
    total_after = models.DecimalField(max_digits=14, decimal_places=2)
    reason = models.CharField(max_length=255)
    fulfillment = models.ForeignKey("marketplace.VendorFulfillment", null=True, blank=True, on_delete=models.PROTECT,
                                    related_name="order_adjustments")
    return_request = models.ForeignKey("returns.ReturnRequest", null=True, blank=True, on_delete=models.PROTECT,
                                       related_name="order_adjustments", help_text="The refunded return, if any")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self) -> str:
        return f"{self.order_id}: {self.amount}"
