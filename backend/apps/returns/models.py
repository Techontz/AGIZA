"""
Returns: Initiated → In Transit (Return) → Received → Inspected →
Approved / Rejected → Closed. The owning department follows the status.
Status only changes through `apps.returns.services`; closing an approved
refund records the refund against the order's payments.
"""
from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models

from apps.core.models import TimeStampedModel
from apps.core.references import next_reference
from apps.core.uploads import safe_filename

POSITIVE = [MinValueValidator(Decimal("0"))]


class ReturnStatus(models.TextChoices):
    INITIATED = "initiated", "Initiated"
    IN_TRANSIT = "in_transit", "In Transit (Return)"
    RECEIVED = "received", "Received"
    INSPECTED = "inspected", "Inspected"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"
    CLOSED = "closed", "Closed"


R = ReturnStatus
RETURN_TRANSITIONS = {
    R.INITIATED: {R.IN_TRANSIT, R.RECEIVED, R.REJECTED},
    R.IN_TRANSIT: {R.RECEIVED},
    R.RECEIVED: {R.INSPECTED},
    R.INSPECTED: {R.APPROVED, R.REJECTED},
    R.APPROVED: {R.CLOSED},
    R.REJECTED: {R.CLOSED},
    R.CLOSED: set(),
}
RETURN_ACTION_ONLY = {R.INSPECTED: "inspect", R.APPROVED: "decide", R.REJECTED: "decide", R.CLOSED: "close"}
ACTIVE = {R.INITIATED, R.IN_TRANSIT, R.RECEIVED, R.INSPECTED, R.APPROVED}


class Owner(models.TextChoices):
    DELIVERY = "delivery", "Delivery"
    WAREHOUSE = "warehouse", "Warehouse"
    SUPPORT = "support", "Support"
    FINANCE = "finance", "Finance"


class ReturnType(models.TextChoices):
    DELIVERY_FAILED = "delivery_failed", "Delivery Failed"
    CUSTOMER_REJECTED = "customer_rejected", "Customer Rejected"
    DAMAGED_ITEM = "damaged_item", "Damaged Item"
    WRONG_ITEM = "wrong_item", "Wrong Item"
    CANCELLATION_AFTER_DISPATCH = "cancellation_after_dispatch", "Cancellation After Dispatch"
    CUSTOMER_REQUEST = "customer_request", "Customer Return Request"
    SELLER_CANNOT_FULFILL = "seller_cannot_fulfill", "Seller Couldn't Fulfil"


class ReasonCode(models.TextChoices):
    CUSTOMER_UNAVAILABLE = "customer_unavailable", "Customer Unavailable"
    ADDRESS_INCORRECT = "address_incorrect", "Address Incorrect"
    DAMAGED_IN_TRANSIT = "damaged_in_transit", "Damaged in Transit"
    CUSTOMER_CHANGED_MIND = "customer_changed_mind", "Customer Changed Mind"
    ITEM_MISMATCH = "item_mismatch", "Item Mismatch"
    DEFECTIVE = "defective", "Defective / doesn't work"
    NOT_AS_DESCRIBED = "not_as_described", "Not as described"
    SELLER_UNAVAILABLE = "seller_unavailable", "Seller couldn't supply the item"


class FinancialImpact(models.TextChoices):
    REFUND_REQUIRED = "refund_required", "Refund Required"
    REPLACEMENT_REQUIRED = "replacement_required", "Replacement Required"
    NO_REFUND = "no_refund", "No Refund"


class ExceptionFlag(models.TextChoices):
    DISPUTE = "dispute", "Dispute"
    HIGH_VALUE_ITEM = "high_value_item", "High-Value Item"
    CUSTOMER_COMPLAINT = "customer_complaint", "Customer Complaint"


class ItemCondition(models.TextChoices):
    AS_DESCRIBED = "as_described", "As described / resellable"
    DAMAGED = "damaged", "Damaged"
    MISSING_PARTS = "missing_parts", "Missing parts"
    USED = "used", "Used / opened"


class ReturnRequest(TimeStampedModel):
    reference = models.CharField(max_length=20, unique=True, editable=False)
    order = models.ForeignKey("orders.Order", on_delete=models.PROTECT, related_name="returns")
    delivery = models.ForeignKey("deliveries.Delivery", null=True, blank=True, on_delete=models.SET_NULL,
                                 related_name="returns")
    return_type = models.CharField(max_length=30, choices=ReturnType.choices)
    reason_code = models.CharField(max_length=24, choices=ReasonCode.choices)
    status = models.CharField(max_length=12, choices=ReturnStatus.choices, default=ReturnStatus.INITIATED,
                              db_index=True)
    owner = models.CharField(max_length=10, choices=Owner.choices, default=Owner.SUPPORT)
    handler = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                related_name="handled_returns")
    item_details = models.CharField(max_length=255)
    return_value = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True, validators=POSITIVE)
    financial_impact = models.CharField(max_length=24, choices=FinancialImpact.choices,
                                        default=FinancialImpact.REFUND_REQUIRED)
    exception_flag = models.CharField(max_length=20, choices=ExceptionFlag.choices, blank=True)
    # Inspection
    item_condition = models.CharField(max_length=16, choices=ItemCondition.choices, blank=True)
    inspection_notes = models.TextField(blank=True)
    inspected_at = models.DateTimeField(null=True, blank=True)
    inspected_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                     related_name="+")
    # Decision / outcome
    decision_notes = models.TextField(blank=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    decided_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="+")
    refund_amount = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True, validators=POSITIVE)
    refund_payment = models.OneToOneField("orders.Payment", null=True, blank=True, on_delete=models.PROTECT,
                                          related_name="refunded_return")
    resolution_notes = models.TextField(blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="+")
    # Requested by the customer (app / website)
    requested_by_customer = models.BooleanField(default=False)
    customer_note = models.TextField(blank=True, help_text="The customer's explanation")
    customer_message = models.TextField(blank=True, help_text="What AGIZA tells the customer (shown to them)")
    restocked = models.BooleanField(default=False, help_text="Returned items were put back into sellable stock")
    reconciled_at = models.DateTimeField(null=True, blank=True, help_text="Vendor earnings adjusted for the refund")

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["owner"]), models.Index(fields=["handler"])]

    def __str__(self) -> str:
        return f"{self.reference} · {self.order.reference}"

    def save(self, *args, **kwargs):
        if not self.reference:
            self.reference = next_reference("RET", width=3)
        super().save(*args, **kwargs)


class ReturnStatusHistory(models.Model):
    return_request = models.ForeignKey(ReturnRequest, on_delete=models.CASCADE, related_name="history")
    from_status = models.CharField(max_length=12, blank=True)
    to_status = models.CharField(max_length=12)
    owner = models.CharField(max_length=10, choices=Owner.choices)
    changed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="+")
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]
        verbose_name_plural = "return status history"

    def __str__(self) -> str:
        return f"{self._meta.verbose_name} #{self.pk}"



class ReturnLine(models.Model):
    """Which order lines (and how many units) the return covers — this decides which seller is affected."""

    return_request = models.ForeignKey(ReturnRequest, on_delete=models.CASCADE, related_name="lines")
    order_item = models.ForeignKey("orders.OrderItem", on_delete=models.PROTECT, related_name="return_lines")
    quantity = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    amount = models.DecimalField(max_digits=14, decimal_places=2, validators=POSITIVE,
                                 help_text="Value of these units as sold")

    class Meta:
        ordering = ["id"]

    def __str__(self) -> str:
        return f"{self.quantity}× {self.order_item_id}"


def return_attachment_path(instance, filename):
    return f"private/returns/{instance.return_request_id}/{safe_filename(filename)}"


class ReturnAttachment(models.Model):
    """Evidence (photos) for a return. Private: the customer who sent it, the sellers involved and staff."""

    return_request = models.ForeignKey(ReturnRequest, on_delete=models.CASCADE, related_name="attachments")
    file = models.FileField(upload_to=return_attachment_path)
    content_type = models.CharField(max_length=100)
    uploaded_by_customer = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]

    def __str__(self) -> str:
        return f"{self._meta.verbose_name} #{self.pk}"


class ReturnVendorResponse(models.Model):
    """A seller's comment on a return affecting its items. Sellers can't approve or change refunds."""

    return_request = models.ForeignKey(ReturnRequest, on_delete=models.CASCADE, related_name="vendor_responses")
    vendor = models.ForeignKey("catalog.Vendor", on_delete=models.CASCADE, related_name="+")
    message = models.TextField(max_length=2000)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self) -> str:
        return f"{self.return_request_id} · {self.vendor_id}"
