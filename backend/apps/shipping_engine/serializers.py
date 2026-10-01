from decimal import Decimal

from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers

from apps.locations.models import City, Country, Region, Warehouse

from .calculator import money, rate_display
from .constants import AppliesTo, ChargeBasis, Handling, PricingModel, Scope, Status
from .models import (
    Carrier,
    EngineSettings,
    ExchangeRate,
    ImportCharge,
    Route,
    RuleOverride,
    ShippingMethod,
    ShippingProfile,
    ShippingRule,
    Zone,
    ZoneDestination,
    eta_label,
)


def _display(field: str):
    return serializers.CharField(source=f"get_{field}_display", read_only=True)


# --------------------------------------------------------------------------- #
# Carriers
# --------------------------------------------------------------------------- #
class CarrierSerializer(serializers.ModelSerializer):
    type_display = _display("type")
    status_display = _display("status")
    origin_names = serializers.SerializerMethodField()
    destination_names = serializers.SerializerMethodField()
    routes_count = serializers.IntegerField(read_only=True, default=0)
    origins = serializers.PrimaryKeyRelatedField(many=True, queryset=Country.objects.all(), required=False)
    destinations = serializers.PrimaryKeyRelatedField(many=True, queryset=Country.objects.all(), required=False)
    specializations = serializers.ListField(
        child=serializers.CharField(max_length=60, allow_blank=True), required=False, allow_empty=True
    )
    services = serializers.ListField(
        child=serializers.ChoiceField(choices=["air_cargo", "sea_cargo", "local_land_cargo"]), required=False,
        allow_empty=True)
    warehouses = serializers.PrimaryKeyRelatedField(many=True, queryset=Warehouse.objects.all(), required=False)
    warehouse_names = serializers.SerializerMethodField()
    rating = serializers.DecimalField(max_digits=2, decimal_places=1, min_value=0, max_value=5, required=False,
                                      allow_null=True)
    total_orders = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Carrier
        fields = [
            "id", "name", "type", "type_display", "contact_email", "contact_phone", "origins", "origin_names",
            "destinations", "destination_names", "specializations", "services", "warehouses", "warehouse_names",
            "rating", "total_orders", "notes", "status", "status_display", "routes_count", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_origin_names(self, obj) -> list[str]:
        return [c.name for c in obj.origins.all()]

    def get_warehouse_names(self, obj) -> list[dict]:
        return [{"id": w.id, "code": w.code, "name": w.name} for w in obj.warehouses.all()]

    def get_destination_names(self, obj) -> list[str]:
        return [c.name for c in obj.destinations.all()]

    def validate_specializations(self, value):
        return [v.strip() for v in value if v.strip()]


# --------------------------------------------------------------------------- #
# Shipping methods
# --------------------------------------------------------------------------- #
class ShippingMethodSerializer(serializers.ModelSerializer):
    category_display = _display("category")
    status_display = _display("status")
    carriers = serializers.PrimaryKeyRelatedField(many=True, queryset=Carrier.objects.all(), required=False)
    carrier_names = serializers.SerializerMethodField()
    routes_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = ShippingMethod
        fields = [
            "id", "name", "code", "category", "category_display", "carriers", "carrier_names",
            "estimated_delivery", "description", "max_weight_kg", "requires_special_handling", "status",
            "status_display", "routes_count", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_carrier_names(self, obj) -> list[str]:
        return [c.name for c in obj.carriers.all()]

    def validate_code(self, value):
        value = value.strip().upper()
        qs = ShippingMethod.objects.filter(code=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A shipping method with this code already exists.")
        return value


# --------------------------------------------------------------------------- #
# Shipping profiles
# --------------------------------------------------------------------------- #
class ShippingProfileSerializer(serializers.ModelSerializer):
    type_display = _display("type")
    status_display = _display("status")
    handling = serializers.ListField(child=serializers.ChoiceField(choices=Handling.choices), required=False)
    handling_display = serializers.ListField(source="handling_labels", read_only=True)
    rules_count = serializers.IntegerField(read_only=True, default=0)
    products_count = serializers.SerializerMethodField()

    class Meta:
        model = ShippingProfile
        fields = [
            "id", "name", "description", "type", "type_display", "handling", "handling_display", "notes",
            "status", "status_display", "rules_count", "products_count", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_products_count(self, obj) -> int:
        # Products are assigned to profiles by the E-commerce catalogue (Phase 5).
        return getattr(obj, "products_count", 0)

    def validate_handling(self, value):
        return list(dict.fromkeys(value))  # de-duplicate, keep order


# --------------------------------------------------------------------------- #
# Zones
# --------------------------------------------------------------------------- #
class ZoneDestinationSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    kind = serializers.ChoiceField(choices=["city", "region", "country"])
    ref_id = serializers.IntegerField()
    name = serializers.CharField(read_only=True)

    def to_representation(self, obj: ZoneDestination):
        target = obj.city or obj.region or obj.country
        return {"id": obj.id, "kind": obj.kind, "ref_id": target.id, "name": target.name}


class ZoneSerializer(serializers.ModelSerializer):
    type_display = _display("type")
    status_display = _display("status")
    destinations = ZoneDestinationSerializer(many=True)
    routes_count = serializers.IntegerField(read_only=True, default=0)
    rules_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Zone
        fields = [
            "id", "name", "type", "type_display", "description", "destinations", "status", "status_display",
            "routes_count", "rules_count", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    MODELS = {"city": City, "region": Region, "country": Country}

    def validate(self, attrs):
        zone_type = attrs.get("type", getattr(self.instance, "type", Scope.LOCAL))
        items = attrs.get("destinations")
        if items is None:
            return attrs
        if not items:
            raise serializers.ValidationError({"destinations": "Add at least one destination."})
        resolved = []
        seen = set()
        for item in items:
            kind, ref_id = item["kind"], item["ref_id"]
            if (kind, ref_id) in seen:
                continue
            seen.add((kind, ref_id))
            obj = self.MODELS[kind].objects.filter(pk=ref_id).first()
            if obj is None:
                raise serializers.ValidationError({"destinations": f"Unknown {kind} #{ref_id}."})
            if zone_type == Scope.LOCAL and kind == "country":
                raise serializers.ValidationError({"destinations": "Local zones contain cities or regions, not countries."})
            if zone_type == Scope.INTERNATIONAL and kind != "country":
                raise serializers.ValidationError({"destinations": "International zones contain countries."})
            clash = ZoneDestination.objects.filter(**{kind: obj}).select_related("zone")
            if self.instance:
                clash = clash.exclude(zone=self.instance)
            existing = clash.first()
            if existing:
                raise serializers.ValidationError(
                    {"destinations": f"{obj.name} already belongs to {existing.zone.name}."}
                )
            resolved.append((kind, obj))
        attrs["destinations"] = resolved
        return attrs

    def _write_destinations(self, zone, resolved):
        zone.destinations.all().delete()
        ZoneDestination.objects.bulk_create([ZoneDestination(zone=zone, **{kind: obj}) for kind, obj in resolved])

    def create(self, validated_data):
        resolved = validated_data.pop("destinations")
        zone = Zone.objects.create(**validated_data)
        self._write_destinations(zone, resolved)
        return zone

    def update(self, instance, validated_data):
        resolved = validated_data.pop("destinations", None)
        instance = super().update(instance, validated_data)
        if resolved is not None:
            self._write_destinations(instance, resolved)
        return instance


# --------------------------------------------------------------------------- #
# Routes
# --------------------------------------------------------------------------- #
class RouteSerializer(serializers.ModelSerializer):
    type_display = _display("type")
    status_display = _display("status")
    origin_label = serializers.CharField(read_only=True)
    destination_label = serializers.CharField(read_only=True)
    label = serializers.CharField(read_only=True)
    destination_kind = serializers.SerializerMethodField()
    methods = serializers.PrimaryKeyRelatedField(many=True, queryset=ShippingMethod.objects.all())
    method_names = serializers.SerializerMethodField()
    rules_count = serializers.IntegerField(read_only=True, default=0)
    estimated_delivery = serializers.SerializerMethodField()

    class Meta:
        model = Route
        fields = [
            "id", "type", "type_display", "origin_country", "origin_city", "destination_country",
            "destination_city", "destination_zone", "destination_kind", "origin_label", "destination_label",
            "label", "methods", "method_names", "notes", "status", "status_display", "rules_count",
            "estimated_delivery", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "type", "created_at", "updated_at"]
        # Uniqueness is checked in validate() with a readable message.
        validators = []

    def get_method_names(self, obj) -> list[str]:
        return [m.name for m in obj.methods.all()]

    def get_destination_kind(self, obj) -> str:
        return "zone" if obj.destination_zone_id else "city" if obj.destination_city_id else "country"

    def get_estimated_delivery(self, obj) -> str:
        return eta_label(getattr(obj, "eta_min", None), getattr(obj, "eta_max", None))

    def validate(self, attrs):
        get = lambda k: attrs[k] if k in attrs else getattr(self.instance, k, None)  # noqa: E731
        origin_country, origin_city = get("origin_country"), get("origin_city")
        dest_country, dest_city, dest_zone = get("destination_country"), get("destination_city"), get("destination_zone")

        if origin_city and origin_city.country_id != origin_country.id:
            raise serializers.ValidationError({"origin_city": "City is not in the origin country."})
        if dest_zone and dest_city:
            raise serializers.ValidationError({"destination_zone": "Choose either a zone or a specific city."})
        if dest_city:
            dest_country = dest_city.country
        if dest_zone:
            dest_country = None
        elif not dest_country:
            raise serializers.ValidationError({"destination_country": "Choose a destination."})

        route_type = dest_zone.type if dest_zone else (
            Scope.LOCAL if dest_country.id == origin_country.id else Scope.INTERNATIONAL
        )
        if route_type == Scope.LOCAL and not origin_city:
            raise serializers.ValidationError({"origin_city": "Local routes start from a specific city."})
        if dest_zone and dest_zone.type == Scope.LOCAL and origin_country.iso2 != "TZ":
            raise serializers.ValidationError({"destination_zone": "Local zones can only be reached from Tanzania."})
        if origin_city and dest_city and origin_city.id == dest_city.id:
            raise serializers.ValidationError({"destination_city": "Origin and destination are the same city."})

        attrs.update(destination_country=dest_country, destination_city=dest_city, destination_zone=dest_zone)
        attrs["type"] = route_type

        clash = Route.objects.filter(
            origin_country=origin_country,
            origin_city=origin_city,
            destination_country=dest_country,
            destination_city=dest_city,
            destination_zone=dest_zone,
        )
        if self.instance:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError("This route already exists. Routes are directional; edit the existing one.")
        if "methods" in attrs and not attrs["methods"]:
            raise serializers.ValidationError({"methods": "Select at least one shipping method."})
        return attrs


# --------------------------------------------------------------------------- #
# Rules
# --------------------------------------------------------------------------- #
class ShippingRuleSerializer(serializers.ModelSerializer):
    applies_to_display = _display("applies_to")
    pricing_model_display = _display("pricing_model")
    status_display = _display("status")
    route_label = serializers.CharField(source="route.label", read_only=True)
    origin_label = serializers.CharField(source="route.origin_label", read_only=True)
    destination_label = serializers.CharField(source="route.destination_label", read_only=True)
    route_type = serializers.CharField(source="route.type", read_only=True)
    method_name = serializers.CharField(source="method.name", read_only=True)
    profile_name = serializers.CharField(source="profile.name", read_only=True, default=None)
    carrier_name = serializers.CharField(source="carrier.name", read_only=True, default=None)
    target_label = serializers.CharField(read_only=True)
    display_name = serializers.CharField(read_only=True)
    priority = serializers.IntegerField(source="tier", read_only=True)
    rate_display = serializers.SerializerMethodField()
    minimum_charge_display = serializers.SerializerMethodField()
    estimated_delivery = serializers.CharField(source="eta_label", read_only=True)
    currency = serializers.CharField(required=False)

    class Meta:
        model = ShippingRule
        fields = [
            "id", "code", "name", "display_name", "route", "route_label", "origin_label", "destination_label",
            "route_type", "method", "method_name", "applies_to", "applies_to_display", "profile", "profile_name",
            "product_sku", "target_label", "priority", "pricing_model", "pricing_model_display", "rate", "currency",
            "rate_display", "volumetric_divisor", "min_weight_kg", "max_weight_kg", "min_cbm", "max_cbm",
            "min_volumetric_kg", "max_volumetric_kg", "minimum_charge", "minimum_charge_display", "eta_min_days",
            "eta_max_days", "estimated_delivery", "carrier", "carrier_name", "status", "status_display",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "code", "created_at", "updated_at"]

    def get_rate_display(self, obj) -> str:
        return rate_display(obj.pricing_model, obj.rate, obj.currency)

    def get_minimum_charge_display(self, obj) -> str | None:
        return money(obj.minimum_charge, obj.currency) if obj.minimum_charge is not None else None

    def validate_currency(self, value):
        from .constants import Currency

        value = value.upper()
        if value not in Currency.values:
            raise serializers.ValidationError(f"Unsupported currency {value}.")
        return value

    def validate(self, attrs):
        get = lambda k: attrs[k] if k in attrs else getattr(self.instance, k, None)  # noqa: E731
        errors = {}
        route, method = get("route"), get("method")
        if route and method and not route.methods.filter(pk=method.pk).exists():
            errors["method"] = f"{method.name} is not offered on {route.label}. Add it to the route first."

        applies_to = get("applies_to") or AppliesTo.GENERAL
        if applies_to == AppliesTo.PROFILE:
            if not get("profile"):
                errors["profile"] = "Select the shipping profile this rule applies to."
            attrs["product_sku"] = ""
        elif applies_to == AppliesTo.PRODUCT:
            sku = (get("product_sku") or "").strip().upper()
            if not sku:
                errors["product_sku"] = "Enter the product SKU this rule applies to."
            attrs["product_sku"] = sku
            attrs["profile"] = None
        else:
            attrs["profile"] = None
            attrs["product_sku"] = ""

        model = get("pricing_model")
        if model == PricingModel.MANUAL:
            attrs.update(rate=None, volumetric_divisor=None, minimum_charge=None)
        else:
            if get("rate") is None:
                errors["rate"] = "Enter the rate."
            elif get("rate") <= 0:
                errors["rate"] = "Rate must be greater than zero."
            if model != PricingModel.PER_VOL_WEIGHT:
                attrs["volumetric_divisor"] = None

        for lo, hi, label in (
            ("min_weight_kg", "max_weight_kg", "weight"),
            ("min_cbm", "max_cbm", "CBM"),
            ("min_volumetric_kg", "max_volumetric_kg", "volumetric weight"),
            ("eta_min_days", "eta_max_days", "delivery estimate"),
        ):
            if get(lo) is not None and get(hi) is not None and get(lo) > get(hi):
                errors[hi] = f"Maximum {label} must be greater than or equal to the minimum."

        if errors:
            raise serializers.ValidationError(errors)

        if not get("currency") and route:
            s = EngineSettings.load()
            attrs["currency"] = s.local_currency if route.type == Scope.LOCAL else s.international_currency

        # Two active rules with the same scope and conditions would be ambiguous.
        if (get("status") or Status.ACTIVE) == Status.ACTIVE and route and method:
            dup = ShippingRule.objects.filter(
                route=route,
                method=method,
                applies_to=applies_to,
                profile=attrs.get("profile", get("profile")),
                product_sku=attrs.get("product_sku", get("product_sku") or ""),
                status=Status.ACTIVE,
                **{f: get(f) for f in ("min_weight_kg", "max_weight_kg", "min_cbm", "max_cbm", "min_volumetric_kg", "max_volumetric_kg")},
            )
            if self.instance:
                dup = dup.exclude(pk=self.instance.pk)
            existing = dup.first()
            if existing:
                raise serializers.ValidationError(
                    f"An active rule with the same route, method, target and conditions already exists ({existing.code})."
                )
        return attrs


# --------------------------------------------------------------------------- #
# Overrides
# --------------------------------------------------------------------------- #
def _best_rule_for(route: Route, profile: ShippingProfile | None) -> ShippingRule | None:
    """The rule an override most likely replaces (uses the prefetched route.rules)."""
    rules = [r for r in route.rules.all() if r.status == Status.ACTIVE]
    rules = [r for r in rules if r.applies_to == AppliesTo.GENERAL or (profile and r.profile_id == profile.id)]
    rules.sort(key=lambda r: (r.tier, r.id))
    return rules[0] if rules else None


class RuleOverrideSerializer(serializers.ModelSerializer):
    status_display = _display("status")
    pricing_model_display = _display("pricing_model")
    route_label = serializers.CharField(source="route.label", read_only=True)
    destination_label = serializers.CharField(read_only=True)
    profile_name = serializers.CharField(source="profile.name", read_only=True, default=None)
    override_rate_display = serializers.SerializerMethodField()
    original_rule = serializers.SerializerMethodField()
    is_current = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True, default=None)
    currency = serializers.CharField(required=False)

    class Meta:
        model = RuleOverride
        fields = [
            "id", "code", "route", "route_label", "destination_city", "destination_region", "destination_label",
            "profile", "profile_name", "pricing_model", "pricing_model_display", "rate", "currency",
            "override_rate_display", "original_rule", "reason", "start_date", "end_date", "status",
            "status_display", "is_current", "created_by_name", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "code", "created_at", "updated_at"]

    def get_override_rate_display(self, obj) -> str:
        return rate_display(obj.pricing_model, obj.rate, obj.currency)

    def get_original_rule(self, obj) -> dict | None:
        rule = _best_rule_for(obj.route, obj.profile)
        if not rule:
            return None
        return {"id": rule.id, "code": rule.code, "rate_display": rate_display(rule.pricing_model, rule.rate, rule.currency)}

    def get_is_current(self, obj) -> bool:
        today = timezone.localdate()
        return obj.status == Status.ACTIVE and obj.start_date <= today <= obj.end_date

    def validate(self, attrs):
        get = lambda k: attrs[k] if k in attrs else getattr(self.instance, k, None)  # noqa: E731
        route, city, region = get("route"), get("destination_city"), get("destination_region")
        if city and region:
            raise serializers.ValidationError({"destination_city": "Choose either a city or a region."})
        if route and (city or region):
            if route.destination_city_id:
                raise serializers.ValidationError(
                    {"destination_city": "This route already targets a single city; leave the destination empty."}
                )
            if route.destination_zone_id:
                members = ZoneDestination.objects.filter(zone_id=route.destination_zone_id)
                ok = (
                    members.filter(Q(city=city) | Q(region_id=city.region_id)).exists()
                    if city
                    else members.filter(Q(region=region) | Q(city__region=region)).exists()
                )
                if not ok:
                    raise serializers.ValidationError(
                        {"destination_city": f"{(city or region).name} is not in {route.destination_zone.name}."}
                    )
            elif route.destination_country_id and (city or region).country_id != route.destination_country_id:
                raise serializers.ValidationError(
                    {"destination_city": f"{(city or region).name} is not in {route.destination_country.name}."}
                )
        start, end = get("start_date"), get("end_date")
        if start and end and start > end:
            raise serializers.ValidationError({"end_date": "End date must be on or after the start date."})
        if get("rate") is not None and get("rate") <= 0:
            raise serializers.ValidationError({"rate": "Override price must be greater than zero."})
        if not get("currency") and route:
            s = EngineSettings.load()
            attrs["currency"] = s.local_currency if route.type == Scope.LOCAL else s.international_currency
        return attrs


# --------------------------------------------------------------------------- #
# Settings & exchange rates
# --------------------------------------------------------------------------- #
class ExchangeRateSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True, default=None)
    effective_date = serializers.DateField(required=False)

    class Meta:
        model = ExchangeRate
        fields = ["id", "base_currency", "quote_currency", "rate", "effective_date", "source", "created_by_name", "created_at"]
        read_only_fields = ["id", "source", "created_by_name", "created_at"]
        validators = []

    def validate(self, attrs):
        if attrs["base_currency"] == attrs["quote_currency"]:
            raise serializers.ValidationError({"quote_currency": "Choose two different currencies."})
        if attrs["rate"] <= 0:
            raise serializers.ValidationError({"rate": "Rate must be greater than zero."})
        attrs.setdefault("effective_date", timezone.localdate())
        return attrs

    def create(self, validated_data):
        # Setting a rate twice on the same day replaces that day's rate.
        obj, _ = ExchangeRate.objects.update_or_create(
            base_currency=validated_data["base_currency"],
            quote_currency=validated_data["quote_currency"],
            effective_date=validated_data["effective_date"],
            defaults={"rate": validated_data["rate"], "created_by": validated_data.get("created_by")},
        )
        return obj


# --------------------------------------------------------------------------- #
# Import charges (customs)
# --------------------------------------------------------------------------- #
class ImportChargeSerializer(serializers.ModelSerializer):
    kind_display = _display("kind")
    basis_display = _display("basis")
    percent_base_display = _display("percent_base")
    treatment_display = _display("treatment")
    status_display = _display("status")
    origin_country_name = serializers.CharField(source="origin_country.name", read_only=True, default=None)
    category_name = serializers.CharField(source="category.name", read_only=True, default=None)
    profile_name = serializers.CharField(source="profile.name", read_only=True, default=None)
    applies_to_label = serializers.SerializerMethodField()
    rate_display = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True, default=None)

    class Meta:
        model = ImportCharge
        fields = [
            "id", "code", "name", "kind", "kind_display", "origin_country", "origin_country_name", "category",
            "category_name", "profile", "profile_name", "product_sku", "applies_to_label", "basis", "basis_display",
            "rate", "currency", "percent_base", "percent_base_display", "rate_display", "treatment",
            "treatment_display", "status", "status_display", "notes", "created_by_name", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "code", "created_by_name", "created_at", "updated_at"]

    def get_applies_to_label(self, obj) -> str:
        parts = [f"from {obj.origin_country.name}" if obj.origin_country_id else "",
                 obj.category.name if obj.category_id else "", obj.profile.name if obj.profile_id else "",
                 f"SKU {obj.product_sku}" if obj.product_sku else ""]
        parts = [p for p in parts if p]
        return " · ".join(parts) if parts else "All imported items"

    def get_rate_display(self, obj) -> str:
        if obj.basis == ChargeBasis.PERCENT:
            return f"{obj.rate.normalize():f}% of {obj.get_percent_base_display().lower()}"
        unit = "per item" if obj.basis == ChargeBasis.FIXED_ITEM else "per order"
        return f"{obj.currency} {obj.rate:,.2f} {unit}"

    def validate(self, attrs):
        basis = attrs.get("basis", getattr(self.instance, "basis", ChargeBasis.PERCENT))
        currency = attrs.get("currency", getattr(self.instance, "currency", ""))
        if basis != ChargeBasis.PERCENT and not currency:
            raise serializers.ValidationError({"currency": "Choose the currency of the fixed amount."})
        if basis == ChargeBasis.PERCENT:
            attrs["currency"] = ""
        if attrs.get("rate") is not None and attrs["rate"] < 0:
            raise serializers.ValidationError({"rate": "Enter zero or more."})
        return attrs


class EngineSettingsSerializer(serializers.ModelSerializer):
    updated_by_name = serializers.CharField(source="updated_by.full_name", read_only=True, default=None)
    current_rates = serializers.SerializerMethodField()

    class Meta:
        model = EngineSettings
        fields = [
            "local_currency", "international_currency", "display_currency", "exchange_rate_source",
            "default_volumetric_divisor", "no_rule_fallback", "cbm_method", "weight_rounding",
            "apply_minimum_charge", "show_details_to_customers", "import_payment_window_hours", "current_rates",
            "updated_at", "updated_by_name",
        ]
        read_only_fields = ["updated_at", "updated_by_name", "current_rates"]

    def get_current_rates(self, obj) -> list[dict]:
        today = timezone.localdate()
        out = []
        for base in ("USD", "AED", "CNY"):
            if base == obj.display_currency:
                continue
            rate = (
                ExchangeRate.objects.filter(base_currency=base, quote_currency=obj.display_currency, effective_date__lte=today)
                .order_by("-effective_date")
                .first()
            )
            out.append(
                {
                    "base_currency": base,
                    "quote_currency": obj.display_currency,
                    "rate": str(rate.rate) if rate else None,
                    "effective_date": rate.effective_date if rate else None,
                }
            )
        return out

    def validate_exchange_rate_source(self, value):
        if value != "manual":
            raise serializers.ValidationError("Live exchange-rate feeds are not configured yet; use Manual.")
        return value


# --------------------------------------------------------------------------- #
# Calculator input
# --------------------------------------------------------------------------- #
class CalculateSerializer(serializers.Serializer):
    origin_country = serializers.PrimaryKeyRelatedField(queryset=Country.objects.all())
    origin_city = serializers.PrimaryKeyRelatedField(queryset=City.objects.all(), required=False, allow_null=True)
    destination_country = serializers.PrimaryKeyRelatedField(
        queryset=Country.objects.all(), required=False, allow_null=True
    )
    destination_city = serializers.PrimaryKeyRelatedField(queryset=City.objects.all(), required=False, allow_null=True)
    destination_zone = serializers.PrimaryKeyRelatedField(queryset=Zone.objects.all(), required=False, allow_null=True)
    method = serializers.PrimaryKeyRelatedField(queryset=ShippingMethod.objects.all())
    profile = serializers.PrimaryKeyRelatedField(
        queryset=ShippingProfile.objects.all(), required=False, allow_null=True
    )
    product_sku = serializers.CharField(required=False, allow_blank=True, max_length=64, default="")
    weight_kg = serializers.DecimalField(max_digits=12, decimal_places=3, min_value=Decimal("0.001"))
    quantity = serializers.IntegerField(min_value=1, max_value=100_000, default=1)
    length_cm = serializers.DecimalField(
        max_digits=10, decimal_places=2, min_value=Decimal("0.01"), required=False, allow_null=True
    )
    width_cm = serializers.DecimalField(
        max_digits=10, decimal_places=2, min_value=Decimal("0.01"), required=False, allow_null=True
    )
    height_cm = serializers.DecimalField(
        max_digits=10, decimal_places=2, min_value=Decimal("0.01"), required=False, allow_null=True
    )
    cbm = serializers.DecimalField(
        max_digits=12, decimal_places=6, min_value=Decimal("0.000001"), required=False, allow_null=True
    )
    on_date = serializers.DateField(required=False, allow_null=True)

    def validate(self, attrs):
        if not (attrs.get("destination_country") or attrs.get("destination_city") or attrs.get("destination_zone")):
            raise serializers.ValidationError({"destination": "Choose a destination."})
        dims = [attrs.get(k) for k in ("length_cm", "width_cm", "height_cm")]
        if any(d is not None for d in dims) and not all(d is not None for d in dims):
            raise serializers.ValidationError({"dimensions": "Provide length, width and height together."})
        attrs["product_sku"] = (attrs.get("product_sku") or "").strip().upper()
        return attrs
