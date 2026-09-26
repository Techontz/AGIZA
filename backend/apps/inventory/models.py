"""
Inventory: stock of each product variant (SKU) at each warehouse, pickup
point or shop. Quantities only change through `apps.inventory.services`,
which records every change as a StockMovement (the ledger).

available = quantity - reserved. Stock at a Shop-type location is the shop
floor (with a shelf position and a listed/hidden flag).
"""
from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import F, Q

from apps.core.models import TimeStampedModel


class StockItem(TimeStampedModel):
    variant = models.ForeignKey("catalog.ProductVariant", on_delete=models.PROTECT, related_name="stock")
    warehouse = models.ForeignKey("locations.Warehouse", on_delete=models.PROTECT, related_name="stock")
    bin_code = models.CharField(max_length=60, blank=True, help_text="Shelf / bin (warehouse) or shelf position (shop)")
    quantity = models.IntegerField(default=0, validators=[MinValueValidator(0)])
    reserved = models.IntegerField(default=0, validators=[MinValueValidator(0)])
    listed = models.BooleanField(default=True, help_text="Shop floor: shown to customers in the shop")
    shop_price = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True,
                                     help_text="Shop floor price; empty = product price")

    class Meta:
        ordering = ["warehouse__code", "variant__sku"]
        constraints = [
            models.UniqueConstraint(fields=["variant", "warehouse"], name="uniq_stock_per_location"),
            models.CheckConstraint(name="stock_quantity_not_negative", condition=Q(quantity__gte=0)),
            models.CheckConstraint(name="stock_reserved_within_quantity",
                                   condition=Q(reserved__gte=0) & Q(reserved__lte=F("quantity"))),
        ]

    def __str__(self) -> str:
        return f"{self.variant.sku} @ {self.warehouse.code}: {self.quantity}"

    @property
    def available(self) -> int:
        return self.quantity - self.reserved


class StockMovement(models.Model):
    class Kind(models.TextChoices):
        RECEIPT = "receipt", "Received"
        ADJUSTMENT = "adjustment", "Adjustment"
        RESERVATION = "reservation", "Reserved for order"
        RELEASE = "release", "Reservation released"
        SALE = "sale", "Shipped / sold"
        RETURN = "return", "Returned to stock"
        TRANSFER_OUT = "transfer_out", "Transferred out"
        TRANSFER_IN = "transfer_in", "Transferred in"

    stock_item = models.ForeignKey(StockItem, on_delete=models.PROTECT, related_name="movements")
    kind = models.CharField(max_length=14, choices=Kind.choices)
    quantity_change = models.IntegerField(default=0)
    reserved_change = models.IntegerField(default=0)
    quantity_after = models.IntegerField()
    reserved_after = models.IntegerField()
    order = models.ForeignKey("orders.Order", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    note = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="+")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["stock_item", "created_at"]), models.Index(fields=["order"])]
