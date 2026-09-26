from django.conf import settings
from django.db import models
from django.db.models import Q

from apps.core.models import TimeStampedModel
from apps.core.references import next_reference


class Customer(TimeStampedModel):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        INACTIVE = "inactive", "Inactive"

    class Channel(models.TextChoices):
        WHATSAPP = "whatsapp", "WhatsApp"
        FACEBOOK = "facebook", "Facebook"
        TIKTOK = "tiktok", "TikTok"
        WEB = "web", "Web"
        PHONE = "phone", "Phone"
        WALK_IN = "walk_in", "Walk-in"

    reference = models.CharField(max_length=20, unique=True, editable=False)
    full_name = models.CharField(max_length=150)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=32, blank=True, db_index=True)
    company_name = models.CharField(max_length=150, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    preferred_channel = models.CharField(max_length=10, choices=Channel.choices, blank=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["status"]), models.Index(fields=["full_name"])]
        constraints = [
            models.UniqueConstraint(
                fields=["email"], condition=~Q(email=""), name="uniq_customer_email_when_set"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.reference} · {self.full_name}"

    def save(self, *args, **kwargs):
        if not self.reference:
            self.reference = next_reference("CUST")
        self.email = (self.email or "").strip().lower()
        super().save(*args, **kwargs)


class Address(TimeStampedModel):
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name="addresses")
    label = models.CharField(max_length=60, blank=True, help_text='e.g. "Home", "Office"')
    line1 = models.CharField(max_length=255, help_text="Street, building or landmark")
    area = models.CharField(max_length=120, blank=True, help_text="Neighbourhood / ward, e.g. Mwenge")
    city = models.ForeignKey("locations.City", on_delete=models.PROTECT, related_name="addresses")
    region = models.ForeignKey("locations.Region", on_delete=models.PROTECT, related_name="addresses")
    country = models.ForeignKey("locations.Country", on_delete=models.PROTECT, related_name="addresses")
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    is_default = models.BooleanField(default=False)

    class Meta:
        ordering = ["-is_default", "id"]
        verbose_name_plural = "addresses"
        constraints = [
            models.UniqueConstraint(
                fields=["customer"], condition=Q(is_default=True), name="one_default_address_per_customer"
            ),
        ]

    def __str__(self) -> str:
        return self.one_line

    @property
    def one_line(self) -> str:
        parts = [self.line1, self.area, self.city.name if self.city_id else ""]
        return ", ".join(p for p in parts if p)

    def save(self, *args, **kwargs):
        self.region_id = self.city.region_id
        self.country_id = self.city.country_id
        super().save(*args, **kwargs)


class ServiceProvider(TimeStampedModel):
    """An independent provider Agiza sends equipment / home service jobs to (plumbers, installers...)."""

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        INACTIVE = "inactive", "Inactive"

    reference = models.CharField(max_length=20, unique=True, editable=False)
    name = models.CharField(max_length=150)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=32, blank=True)
    services = models.CharField(max_length=255, blank=True, help_text="e.g. Plumbing, Installation, Cleaning")
    city = models.ForeignKey("locations.City", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    address = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    rating = models.DecimalField(max_digits=2, decimal_places=1, null=True, blank=True,
                                 help_text="Staff assessment, 0.0–5.0")
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.CheckConstraint(name="provider_rating_range",
                                   condition=Q(rating__isnull=True) | (Q(rating__gte=0) & Q(rating__lte=5))),
        ]

    def __str__(self) -> str:
        return self.name

    def save(self, *args, **kwargs):
        if not self.reference:
            self.reference = next_reference("SERV", width=3)
        super().save(*args, **kwargs)
