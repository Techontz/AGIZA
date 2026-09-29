"""Online payments started from the customer app. A completed one becomes an `orders.Payment`."""
from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models

from apps.core.models import TimeStampedModel


class GatewayPayment(TimeStampedModel):
    class Provider(models.TextChoices):
        SELCOM = "selcom", "Selcom"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"

    order = models.ForeignKey("orders.Order", on_delete=models.PROTECT, related_name="gateway_payments")
    provider = models.CharField(max_length=10, choices=Provider.choices, default=Provider.SELCOM)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING, db_index=True)
    amount = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])
    currency = models.CharField(max_length=3, default="TZS")
    provider_order_id = models.CharField(max_length=64, unique=True, help_text="Order id sent to the gateway")
    provider_reference = models.CharField(max_length=80, blank=True, help_text="Gateway transaction id")
    phone = models.CharField(max_length=15, blank=True)
    gateway_url = models.TextField(blank=True, help_text="Hosted checkout page the customer opens")
    payment = models.OneToOneField("orders.Payment", null=True, blank=True, on_delete=models.PROTECT,
                                   related_name="gateway_payment")
    failure_reason = models.CharField(max_length=255, blank=True)
    needs_attention = models.BooleanField(default=False, help_text="Money received but not applied (refund needed)")
    request_payload = models.JSONField(default=dict, blank=True)
    response_payload = models.JSONField(default=dict, blank=True)
    status_payload = models.JSONField(default=dict, blank=True, help_text="Last order-status answer")
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["order", "status"])]

    def __str__(self) -> str:
        return f"{self.provider_order_id} · {self.get_status_display()}"
