"""
Last-mile deliveries of any order (international, express, shop).

Pending → Assigned Driver → Out for Delivery → Delivered, with Failed,
Rescheduled and Returned for exceptions. Status only changes through
`apps.deliveries.services`; every change is a DeliveryEvent. Proof of
delivery (signature and photos) is stored with the delivery.
"""
from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel
from apps.core.references import next_reference


class DeliveryStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    ASSIGNED_DRIVER = "assigned_driver", "Assigned Driver"
    OUT_FOR_DELIVERY = "out_for_delivery", "Out for Delivery"
    DELIVERED = "delivered", "Delivered"
    FAILED = "failed", "Failed"
    RESCHEDULED = "rescheduled", "Rescheduled"
    RETURNED = "returned", "Returned"
    CANCELLED = "cancelled", "Cancelled"


D = DeliveryStatus
DELIVERY_TRANSITIONS = {
    D.PENDING: {D.ASSIGNED_DRIVER, D.CANCELLED},
    D.ASSIGNED_DRIVER: {D.OUT_FOR_DELIVERY, D.RESCHEDULED, D.CANCELLED},
    D.OUT_FOR_DELIVERY: {D.DELIVERED, D.FAILED, D.RESCHEDULED},
    D.FAILED: {D.RESCHEDULED, D.RETURNED},
    D.RESCHEDULED: {D.ASSIGNED_DRIVER, D.OUT_FOR_DELIVERY, D.RETURNED, D.CANCELLED},
    D.DELIVERED: set(),
    D.RETURNED: set(),
    D.CANCELLED: set(),
}
# Statuses reached only through actions that carry extra data.
DELIVERY_ACTION_ONLY = {D.ASSIGNED_DRIVER: "assign-driver", D.DELIVERED: "complete"}
CLOSED = {D.DELIVERED, D.RETURNED, D.CANCELLED, D.FAILED}
FINISHED = {D.DELIVERED, D.RETURNED, D.CANCELLED}


class DeliveryType(models.TextChoices):
    STANDARD = "standard", "Standard"
    EXPRESS = "express", "Express"
    SAME_DAY = "same_day", "Same Day"
    INTER_CITY = "inter_city", "Inter-City"


class ExceptionFlag(models.TextChoices):
    CUSTOMER_UNAVAILABLE = "customer_unavailable", "Customer Unavailable"
    PAYMENT_ISSUE = "payment_issue", "Payment Issue"
    ADDRESS_UNCLEAR = "address_unclear", "Address Unclear"


class Delivery(TimeStampedModel):
    reference = models.CharField(max_length=20, unique=True, editable=False)
    order = models.ForeignKey("orders.Order", on_delete=models.PROTECT, related_name="deliveries")
    delivery_type = models.CharField(max_length=12, choices=DeliveryType.choices, default=DeliveryType.STANDARD)
    status = models.CharField(max_length=20, choices=DeliveryStatus.choices, default=DeliveryStatus.PENDING,
                              db_index=True)
    driver = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                               related_name="deliveries")
    scheduled_at = models.DateTimeField(null=True, blank=True)
    pickup_point = models.CharField(max_length=255, blank=True)
    pickup_warehouse = models.ForeignKey("locations.Warehouse", null=True, blank=True, on_delete=models.PROTECT,
                                         related_name="+")
    delivery_address = models.CharField(max_length=255)
    destination_city = models.ForeignKey("locations.City", null=True, blank=True, on_delete=models.PROTECT,
                                         related_name="+")
    destination_area = models.CharField(max_length=120, blank=True)
    recipient_name = models.CharField(max_length=150, blank=True)
    recipient_phone = models.CharField(max_length=32, blank=True)
    exception_flag = models.CharField(max_length=24, choices=ExceptionFlag.choices, blank=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    notes = models.TextField(blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="+")

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["driver", "status"]), models.Index(fields=["scheduled_at"])]
        verbose_name_plural = "deliveries"

    def __str__(self) -> str:
        return f"{self.reference} · {self.order.reference}"

    def save(self, *args, **kwargs):
        if not self.reference:
            self.reference = next_reference("DEL")
        super().save(*args, **kwargs)


class DeliveryEvent(models.Model):
    delivery = models.ForeignKey(Delivery, on_delete=models.CASCADE, related_name="events")
    from_status = models.CharField(max_length=20, blank=True)
    to_status = models.CharField(max_length=20)
    note = models.TextField(blank=True)
    changed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]


def proof_path(instance, filename):
    delivery_id = getattr(instance, "delivery_id", None)
    return f"deliveries/{delivery_id}/{filename}"


class DeliveryProof(models.Model):
    delivery = models.OneToOneField(Delivery, on_delete=models.CASCADE, related_name="proof", primary_key=True)
    signature_name = models.CharField(max_length=150)
    signature_image = models.FileField(upload_to=proof_path, blank=True)
    signature_content_type = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)
    completed_at = models.DateTimeField()
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                    related_name="+")


class DeliveryPhoto(models.Model):
    delivery = models.ForeignKey(Delivery, on_delete=models.CASCADE, related_name="photos")
    file = models.FileField(upload_to=proof_path)
    content_type = models.CharField(max_length=100, blank=True)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                    related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]
