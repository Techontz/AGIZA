"""
Shipping Engine data model.

Routes are directional (origin -> destination). A destination is a specific
city, a zone (group of cities / regions / countries) or a whole country.
Rules price a route + shipping method, optionally for one shipping profile or
one product (by SKU). Overrides temporarily replace a rule's price for a route,
optionally narrowed to a destination and/or profile.
"""
from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q, Value
from django.db.models.functions import Coalesce

from apps.core.fields import StringListField
from apps.core.models import TimeStampedModel
from apps.core.references import next_reference

from .constants import (
    AppliesTo,
    CarrierType,
    CbmMethod,
    Currency,
    ExchangeRateSource,
    Handling,
    MethodCategory,
    NoRuleFallback,
    PricingModel,
    ProfileType,
    Scope,
    Status,
    VolumetricDivisor,
    WeightRounding,
    ZoneStatus,
)

POSITIVE = [MinValueValidator(Decimal("0"))]


CARRIER_SERVICES = [("air_cargo", "Air cargo"), ("sea_cargo", "Sea cargo"), ("local_land_cargo", "Local land cargo")]


class Carrier(TimeStampedModel):
    name = models.CharField(max_length=120, unique=True)
    type = models.CharField(max_length=24, choices=CarrierType.choices)
    contact_email = models.EmailField(blank=True)
    contact_phone = models.CharField(max_length=32, blank=True)
    origins = models.ManyToManyField("locations.Country", blank=True, related_name="carriers_shipping_from")
    destinations = models.ManyToManyField("locations.Country", blank=True, related_name="carriers_shipping_to")
    specializations = StringListField(item_max_length=60, default=list, blank=True)
    # People → Shippers: services offered, linked consolidation warehouses, staff rating.
    services = StringListField(item_max_length=20, item_choices=CARRIER_SERVICES, default=list, blank=True)
    warehouses = models.ManyToManyField("locations.Warehouse", blank=True, related_name="shippers")
    rating = models.DecimalField(max_digits=2, decimal_places=1, null=True, blank=True)
    notes = models.TextField(blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)

    class Meta:
        ordering = ["name"]
        indexes = [models.Index(fields=["status"])]

    def __str__(self) -> str:
        return self.name


class ShippingMethod(TimeStampedModel):
    name = models.CharField(max_length=80, unique=True)
    code = models.CharField(max_length=20, unique=True)
    category = models.CharField(max_length=10, choices=MethodCategory.choices)
    carriers = models.ManyToManyField(Carrier, blank=True, related_name="methods")
    estimated_delivery = models.CharField(max_length=60, blank=True, help_text='e.g. "5–10 days"')
    description = models.TextField(blank=True)
    max_weight_kg = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True, validators=POSITIVE)
    requires_special_handling = models.BooleanField(default=False)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)

    class Meta:
        ordering = ["name"]
        indexes = [models.Index(fields=["category", "status"])]

    def __str__(self) -> str:
        return self.name

    def save(self, *args, **kwargs):
        self.code = (self.code or "").strip().upper()
        super().save(*args, **kwargs)


class ShippingProfile(TimeStampedModel):
    name = models.CharField(max_length=120, unique=True)
    description = models.TextField(blank=True)
    type = models.CharField(max_length=12, choices=ProfileType.choices, default=ProfileType.STANDARD)
    handling = StringListField(item_max_length=32, item_choices=Handling.choices, default=list, blank=True)
    notes = models.TextField(blank=True, help_text="Restrictions / notes")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name

    @property
    def handling_labels(self) -> list[str]:
        labels = dict(Handling.choices)
        return [labels.get(h, h) for h in self.handling]


class Zone(TimeStampedModel):
    name = models.CharField(max_length=120, unique=True)
    type = models.CharField(max_length=14, choices=Scope.choices, default=Scope.LOCAL)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=10, choices=ZoneStatus.choices, default=ZoneStatus.ACTIVE)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class ZoneDestination(models.Model):
    """One member of a zone: a city, a region or a country (exactly one)."""

    zone = models.ForeignKey(Zone, on_delete=models.CASCADE, related_name="destinations")
    city = models.ForeignKey("locations.City", null=True, blank=True, on_delete=models.CASCADE, related_name="+")
    region = models.ForeignKey("locations.Region", null=True, blank=True, on_delete=models.CASCADE, related_name="+")
    country = models.ForeignKey("locations.Country", null=True, blank=True, on_delete=models.CASCADE, related_name="+")

    class Meta:
        constraints = [
            models.CheckConstraint(
                name="zone_destination_exactly_one",
                condition=(
                    Q(city__isnull=False, region__isnull=True, country__isnull=True)
                    | Q(city__isnull=True, region__isnull=False, country__isnull=True)
                    | Q(city__isnull=True, region__isnull=True, country__isnull=False)
                ),
            ),
            # A place belongs to at most one zone, so zone resolution is unambiguous. Empty (NULL)
            # columns never clash in a unique index, so no condition is needed (works on MySQL too).
            models.UniqueConstraint(fields=["city"], name="uniq_zone_city"),
            models.UniqueConstraint(fields=["region"], name="uniq_zone_region"),
            models.UniqueConstraint(fields=["country"], name="uniq_zone_country"),
        ]

    def __str__(self) -> str:
        return str(self.city or self.region or self.country)

    @property
    def kind(self) -> str:
        return "city" if self.city_id else "region" if self.region_id else "country"


class Route(TimeStampedModel):
    """Directional route. Destination = specific city, a zone, or a whole country."""

    type = models.CharField(max_length=14, choices=Scope.choices)
    origin_country = models.ForeignKey("locations.Country", on_delete=models.PROTECT, related_name="routes_from")
    origin_city = models.ForeignKey(
        "locations.City", null=True, blank=True, on_delete=models.PROTECT, related_name="routes_from"
    )
    destination_country = models.ForeignKey(
        "locations.Country", null=True, blank=True, on_delete=models.PROTECT, related_name="routes_to"
    )
    destination_city = models.ForeignKey(
        "locations.City", null=True, blank=True, on_delete=models.PROTECT, related_name="routes_to"
    )
    destination_zone = models.ForeignKey(Zone, null=True, blank=True, on_delete=models.PROTECT, related_name="routes")
    methods = models.ManyToManyField(ShippingMethod, related_name="routes")
    notes = models.TextField(blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)

    class Meta:
        ordering = ["type", "origin_country__name", "id"]
        indexes = [models.Index(fields=["type", "status"])]
        constraints = [
            models.CheckConstraint(
                name="route_destination_zone_xor_country",
                condition=(
                    Q(destination_zone__isnull=False, destination_country__isnull=True, destination_city__isnull=True)
                    | Q(destination_zone__isnull=True, destination_country__isnull=False)
                ),
            ),
            # One route per origin/destination, treating empty parts as equal (the portable form of
            # NULLS NOT DISTINCT, which MySQL lacks).
            models.UniqueConstraint(
                "origin_country",
                Coalesce("origin_city", Value(0)),
                Coalesce("destination_country", Value(0)),
                Coalesce("destination_city", Value(0)),
                Coalesce("destination_zone", Value(0)),
                name="uniq_route",
            ),
        ]

    def __str__(self) -> str:
        return self.label

    @property
    def origin_label(self) -> str:
        return self.origin_city.name if self.origin_city_id else self.origin_country.display_name

    @property
    def destination_label(self) -> str:
        if self.destination_zone_id:
            return self.destination_zone.name
        if self.destination_city_id:
            return self.destination_city.name
        return self.destination_country.display_name

    @property
    def label(self) -> str:
        return f"{self.origin_label} → {self.destination_label}"

    @property
    def specificity(self) -> int:
        """Higher = more specific (used to prefer city routes over zone/country routes)."""
        dest = 3 if self.destination_city_id else 2 if self.destination_zone_id else 1
        return dest * 2 + (1 if self.origin_city_id else 0)


class ShippingRule(TimeStampedModel):
    code = models.CharField(max_length=20, unique=True, editable=False)
    name = models.CharField(max_length=160, blank=True)
    route = models.ForeignKey(Route, on_delete=models.PROTECT, related_name="rules")
    method = models.ForeignKey(ShippingMethod, on_delete=models.PROTECT, related_name="rules")
    applies_to = models.CharField(max_length=10, choices=AppliesTo.choices, default=AppliesTo.GENERAL)
    profile = models.ForeignKey(
        ShippingProfile, null=True, blank=True, on_delete=models.PROTECT, related_name="rules"
    )
    product_sku = models.CharField(max_length=64, blank=True, db_index=True)
    pricing_model = models.CharField(max_length=16, choices=PricingModel.choices)
    rate = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True, validators=POSITIVE)
    currency = models.CharField(max_length=3, choices=Currency.choices)
    volumetric_divisor = models.PositiveIntegerField(choices=VolumetricDivisor.choices, null=True, blank=True)
    min_weight_kg = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True, validators=POSITIVE)
    max_weight_kg = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True, validators=POSITIVE)
    min_cbm = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True, validators=POSITIVE)
    max_cbm = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True, validators=POSITIVE)
    min_volumetric_kg = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True, validators=POSITIVE)
    max_volumetric_kg = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True, validators=POSITIVE)
    minimum_charge = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True, validators=POSITIVE)
    eta_min_days = models.PositiveSmallIntegerField(null=True, blank=True)
    eta_max_days = models.PositiveSmallIntegerField(null=True, blank=True)
    carrier = models.ForeignKey(Carrier, null=True, blank=True, on_delete=models.PROTECT, related_name="rules")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        ordering = ["-updated_at"]
        indexes = [
            models.Index(fields=["route", "method", "status"]),
            models.Index(fields=["applies_to"]),
        ]
        constraints = [
            models.CheckConstraint(
                name="rule_rate_required_unless_manual",
                condition=Q(pricing_model=PricingModel.MANUAL) | Q(rate__isnull=False),
            ),
            models.CheckConstraint(
                name="rule_applies_to_target",
                condition=(
                    Q(applies_to=AppliesTo.GENERAL, profile__isnull=True, product_sku="")
                    | Q(applies_to=AppliesTo.PROFILE, profile__isnull=False, product_sku="")
                    | (Q(applies_to=AppliesTo.PRODUCT, profile__isnull=True) & ~Q(product_sku=""))
                ),
            ),
            models.CheckConstraint(
                name="rule_divisor_only_for_vol_weight",
                condition=Q(volumetric_divisor__isnull=True) | Q(pricing_model=PricingModel.PER_VOL_WEIGHT),
            ),
            models.CheckConstraint(
                name="rule_weight_range",
                condition=Q(min_weight_kg__isnull=True)
                | Q(max_weight_kg__isnull=True)
                | Q(min_weight_kg__lte=models.F("max_weight_kg")),
            ),
            models.CheckConstraint(
                name="rule_cbm_range",
                condition=Q(min_cbm__isnull=True) | Q(max_cbm__isnull=True) | Q(min_cbm__lte=models.F("max_cbm")),
            ),
            models.CheckConstraint(
                name="rule_vol_range",
                condition=Q(min_volumetric_kg__isnull=True)
                | Q(max_volumetric_kg__isnull=True)
                | Q(min_volumetric_kg__lte=models.F("max_volumetric_kg")),
            ),
            models.CheckConstraint(
                name="rule_eta_range",
                condition=Q(eta_min_days__isnull=True)
                | Q(eta_max_days__isnull=True)
                | Q(eta_min_days__lte=models.F("eta_max_days")),
            ),
        ]

    def __str__(self) -> str:
        return f"{self.code} · {self.display_name}"

    def save(self, *args, **kwargs):
        if not self.code:
            self.code = next_reference("SR", width=4)
        self.product_sku = (self.product_sku or "").strip().upper()
        super().save(*args, **kwargs)

    @property
    def tier(self) -> int:
        from .constants import RULE_TIER

        return RULE_TIER[AppliesTo(self.applies_to)]

    @property
    def target_label(self) -> str:
        if self.applies_to == AppliesTo.PROFILE and self.profile_id:
            return self.profile.name
        if self.applies_to == AppliesTo.PRODUCT:
            return f"SKU {self.product_sku}"
        return "All Products"

    @property
    def display_name(self) -> str:
        if self.name:
            return self.name
        return f"{self.route.label} {self.method.name} ({self.target_label})"

    @property
    def eta_label(self) -> str:
        return eta_label(self.eta_min_days, self.eta_max_days)

    @property
    def condition_count(self) -> int:
        bounds = [
            self.min_weight_kg,
            self.max_weight_kg,
            self.min_cbm,
            self.max_cbm,
            self.min_volumetric_kg,
            self.max_volumetric_kg,
        ]
        return sum(1 for b in bounds if b is not None)


class RuleOverride(TimeStampedModel):
    """Temporary price exception for a route, optionally for one destination and/or profile."""

    code = models.CharField(max_length=20, unique=True, editable=False)
    route = models.ForeignKey(Route, on_delete=models.PROTECT, related_name="overrides")
    destination_city = models.ForeignKey(
        "locations.City", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    destination_region = models.ForeignKey(
        "locations.Region", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    profile = models.ForeignKey(
        ShippingProfile, null=True, blank=True, on_delete=models.PROTECT, related_name="overrides"
    )
    pricing_model = models.CharField(
        max_length=16, choices=[c for c in PricingModel.choices if c[0] != PricingModel.MANUAL]
    )
    rate = models.DecimalField(max_digits=14, decimal_places=2, validators=POSITIVE)
    currency = models.CharField(max_length=3, choices=Currency.choices)
    reason = models.TextField()
    start_date = models.DateField()
    end_date = models.DateField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        ordering = ["-start_date", "-id"]
        indexes = [models.Index(fields=["route", "status", "start_date", "end_date"])]
        constraints = [
            models.CheckConstraint(name="override_dates", condition=Q(start_date__lte=models.F("end_date"))),
            models.CheckConstraint(
                name="override_single_destination",
                condition=Q(destination_city__isnull=True) | Q(destination_region__isnull=True),
            ),
        ]

    def __str__(self) -> str:
        return f"{self.code} · {self.route}"

    def save(self, *args, **kwargs):
        if not self.code:
            self.code = next_reference("OV", width=4)
        super().save(*args, **kwargs)

    @property
    def destination_label(self) -> str:
        if self.destination_city_id:
            return self.destination_city.name
        if self.destination_region_id:
            return self.destination_region.name
        return self.route.destination_label

    @property
    def specificity(self) -> int:
        dest = 2 if self.destination_city_id else 1 if self.destination_region_id else 0
        return dest * 2 + (1 if self.profile_id else 0)


class EngineSettings(models.Model):
    """Singleton (pk=1) holding global Shipping Engine behaviour."""

    # A plain (not auto-increment) key: MySQL refuses CHECK constraints on auto-increment
    # columns, and the row is always id 1 anyway (see save() and the singleton constraint).
    id = models.BigIntegerField(primary_key=True, default=1, editable=False)
    local_currency = models.CharField(max_length=3, choices=Currency.choices, default=Currency.TZS)
    international_currency = models.CharField(max_length=3, choices=Currency.choices, default=Currency.USD)
    display_currency = models.CharField(max_length=3, choices=Currency.choices, default=Currency.TZS)
    exchange_rate_source = models.CharField(
        max_length=10, choices=ExchangeRateSource.choices, default=ExchangeRateSource.MANUAL
    )
    default_volumetric_divisor = models.PositiveIntegerField(
        choices=VolumetricDivisor.choices, default=VolumetricDivisor.STANDARD_AIR
    )
    no_rule_fallback = models.CharField(
        max_length=14, choices=NoRuleFallback.choices, default=NoRuleFallback.MANUAL_QUOTE
    )
    cbm_method = models.CharField(max_length=12, choices=CbmMethod.choices, default=CbmMethod.DIMENSIONS)
    weight_rounding = models.CharField(max_length=10, choices=WeightRounding.choices, default=WeightRounding.HALF_KG)
    apply_minimum_charge = models.BooleanField(default=True)
    show_details_to_customers = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        verbose_name = "engine settings"
        verbose_name_plural = "engine settings"
        constraints = [models.CheckConstraint(name="engine_settings_singleton", condition=Q(pk=1))]

    def __str__(self) -> str:
        return "Shipping Engine Settings"

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls) -> "EngineSettings":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class ExchangeRate(TimeStampedModel):
    """1 unit of `base_currency` = `rate` units of `quote_currency`, from `effective_date`."""

    base_currency = models.CharField(max_length=3, choices=Currency.choices)
    quote_currency = models.CharField(max_length=3, choices=Currency.choices)
    rate = models.DecimalField(max_digits=18, decimal_places=6, validators=[MinValueValidator(Decimal("0.000001"))])
    effective_date = models.DateField()
    source = models.CharField(max_length=10, choices=ExchangeRateSource.choices, default=ExchangeRateSource.MANUAL)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        ordering = ["base_currency", "quote_currency", "-effective_date"]
        indexes = [models.Index(fields=["base_currency", "quote_currency", "-effective_date"])]
        constraints = [
            models.UniqueConstraint(
                fields=["base_currency", "quote_currency", "effective_date"], name="uniq_exchange_rate_per_day"
            ),
            models.CheckConstraint(name="exchange_rate_distinct_currencies", condition=~Q(base_currency=models.F("quote_currency"))),
            models.CheckConstraint(name="exchange_rate_positive", condition=Q(rate__gt=0)),
        ]

    def __str__(self) -> str:
        return f"1 {self.base_currency} = {self.rate} {self.quote_currency} ({self.effective_date})"


def eta_label(min_days: int | None, max_days: int | None) -> str:
    if min_days is None and max_days is None:
        return "—"
    if min_days == 0 and max_days in (0, None):
        return "Same day"
    if max_days is None or min_days == max_days:
        days = min_days if max_days is None else max_days
        return f"{days} day" if days == 1 else f"{days} days"
    if min_days is None:
        return f"Up to {max_days} days"
    return f"{min_days}–{max_days} days"
