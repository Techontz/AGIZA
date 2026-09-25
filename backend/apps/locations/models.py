from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.core.models import TimeStampedModel
from apps.core.references import next_reference


class Country(TimeStampedModel):
    iso2 = models.CharField(max_length=2, unique=True)
    name = models.CharField(max_length=100)
    display_name = models.CharField(max_length=100, help_text='Label shown in the UI, e.g. "Dubai, UAE".')
    currency = models.CharField(max_length=3)
    is_sourcing_origin = models.BooleanField(default=False, help_text="Goods are sourced / shipped from here.")
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "countries"

    def __str__(self) -> str:
        return self.display_name or self.name


class Region(TimeStampedModel):
    country = models.ForeignKey(Country, on_delete=models.PROTECT, related_name="regions")
    name = models.CharField(max_length=100)

    class Meta:
        ordering = ["name"]
        constraints = [models.UniqueConstraint(fields=["country", "name"], name="uniq_region_per_country")]

    def __str__(self) -> str:
        return self.name


class City(TimeStampedModel):
    country = models.ForeignKey(Country, on_delete=models.PROTECT, related_name="cities")
    region = models.ForeignKey(Region, on_delete=models.PROTECT, related_name="cities")
    name = models.CharField(max_length=100)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "cities"
        constraints = [models.UniqueConstraint(fields=["region", "name"], name="uniq_city_per_region")]

    def __str__(self) -> str:
        return self.name

    def save(self, *args, **kwargs):
        self.country_id = self.region.country_id
        super().save(*args, **kwargs)


class Warehouse(TimeStampedModel):
    class Type(models.TextChoices):
        CONSOLIDATION = "consolidation", "Consolidation"
        FULFILLMENT = "fulfillment", "Fulfillment"
        PICKUP_POINT = "pickup_point", "Pickup Point"
        SHOP = "shop", "Shop"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        INACTIVE = "inactive", "Inactive"
        FULL = "full", "Full"

    code = models.CharField(max_length=20, unique=True, editable=False)
    name = models.CharField(max_length=150)
    type = models.CharField(max_length=20, choices=Type.choices)
    country = models.ForeignKey(Country, on_delete=models.PROTECT, related_name="warehouses")
    city = models.ForeignKey(City, on_delete=models.PROTECT, related_name="warehouses")
    address = models.TextField(blank=True)
    contact_person = models.CharField(max_length=150, blank=True)
    phone = models.CharField(max_length=32, blank=True)
    email = models.EmailField(blank=True)
    capacity_percent = models.PositiveSmallIntegerField(
        default=0, validators=[MinValueValidator(0), MaxValueValidator(100)]
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    last_audit_at = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ["code"]
        indexes = [models.Index(fields=["type", "status"])]

    def __str__(self) -> str:
        return f"{self.code} · {self.name}"

    def save(self, *args, **kwargs):
        if not self.code:
            if self.type == self.Type.SHOP:
                prefix = "WH-SHOP"
            elif self.country.iso2 == "TZ":
                prefix = "WH-TZ"
            else:
                prefix = "WH-INT"
            self.code = next_reference(prefix, width=3)
        super().save(*args, **kwargs)
