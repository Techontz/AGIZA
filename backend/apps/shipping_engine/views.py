import datetime
import decimal

import django_filters
from django.db.models import Count, Max, Min, Prefetch, Q
from django.utils import timezone
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.generics import GenericAPIView
from rest_framework.response import Response

from apps.accounts.constants import Module
from apps.accounts.permissions import HasModulePermission
from apps.core.audit import AuditedViewSetMixin, diff, record_audit, snapshot

from .calculator import RateCalculationError, RateCalculator, Shipment, rate_display
from .constants import PricingModel, Scope, Status, ZoneStatus
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
)
from .serializers import (
    CalculateSerializer,
    CarrierSerializer,
    EngineSettingsSerializer,
    ExchangeRateSerializer,
    ImportChargeSerializer,
    RouteSerializer,
    RuleOverrideSerializer,
    ShippingMethodSerializer,
    ShippingProfileSerializer,
    ShippingRuleSerializer,
    ZoneSerializer,
)

TAG = ["shipping-engine"]


class EngineViewSet(AuditedViewSetMixin, viewsets.ModelViewSet):
    """Base: module permission, audit trail, protected deletes (409)."""

    module = Module.SHIPPING_ENGINE
    permission_classes = [HasModulePermission]
    # Many-to-many links would otherwise be silently removed on delete.
    protected_relations: tuple[str, ...] = ()

    def perform_destroy(self, instance):
        from apps.core.exceptions import ConflictError

        for relation in self.protected_relations:
            count = getattr(instance, relation).count()
            if count:
                raise ConflictError(
                    f"This {instance._meta.verbose_name} is used by {count} "
                    f"{relation.replace('_', ' ')}. Deactivate it instead of deleting it."
                )
        super().perform_destroy(instance)


# --------------------------------------------------------------------------- #
# Carriers
# --------------------------------------------------------------------------- #
class CarrierFilter(django_filters.FilterSet):
    class Meta:
        model = Carrier
        fields = ["type", "status"]


@extend_schema(tags=TAG)
class CarrierViewSet(EngineViewSet):
    # Read by Shipping & Tracking (shippers, methods) and the product editor; managed in People → Shippers.
    read_modules = (Module.SHIPPING, Module.ECOMMERCE, Module.ORDERS, Module.PEOPLE)
    edit_modules = (Module.PEOPLE,)
    serializer_class = CarrierSerializer
    protected_relations = ("methods",)
    filterset_class = CarrierFilter
    search_fields = ["name", "contact_email", "specializations"]
    ordering_fields = ["name", "created_at", "routes_count"]

    def get_queryset(self):
        return Carrier.objects.prefetch_related("origins", "destinations", "warehouses").annotate(
            routes_count=Count("rules__route", distinct=True), total_orders=Count("parcels", distinct=True),
        ).order_by("name")


# --------------------------------------------------------------------------- #
# Methods
# --------------------------------------------------------------------------- #
class MethodFilter(django_filters.FilterSet):
    class Meta:
        model = ShippingMethod
        fields = ["category", "status"]


@extend_schema(tags=TAG)
class ShippingMethodViewSet(EngineViewSet):
    # Read by Shipping & Tracking (shippers, methods) and the product editor.
    read_modules = (Module.SHIPPING, Module.ECOMMERCE, Module.ORDERS)
    serializer_class = ShippingMethodSerializer
    protected_relations = ("routes",)
    filterset_class = MethodFilter
    search_fields = ["name", "code", "description"]
    ordering_fields = ["name", "code", "category", "created_at"]

    def get_queryset(self):
        return ShippingMethod.objects.prefetch_related("carriers").annotate(
            routes_count=Count("routes", distinct=True)
        ).order_by("name")

    @action(detail=False, pagination_class=None, filterset_class=None)
    def stats(self, request):
        """Active methods per category (the four cards on the Shipping Methods page)."""
        rows = ShippingMethod.objects.filter(status=Status.ACTIVE).values("category").annotate(n=Count("id"))
        counts = {r["category"]: r["n"] for r in rows}
        return Response({c: counts.get(c, 0) for c in ("air", "sea", "land", "local")})


# --------------------------------------------------------------------------- #
# Profiles
# --------------------------------------------------------------------------- #
class ProfileFilter(django_filters.FilterSet):
    class Meta:
        model = ShippingProfile
        fields = ["type", "status"]


@extend_schema(tags=TAG)
class ShippingProfileViewSet(EngineViewSet):
    # Read by Shipping & Tracking (shippers, methods) and the product editor.
    read_modules = (Module.SHIPPING, Module.ECOMMERCE, Module.ORDERS)
    serializer_class = ShippingProfileSerializer
    filterset_class = ProfileFilter
    search_fields = ["name", "description"]
    ordering_fields = ["name", "type", "created_at"]

    def get_queryset(self):
        return ShippingProfile.objects.annotate(rules_count=Count("rules", distinct=True)).order_by("name")

    @extend_schema(request=None, responses={201: ShippingProfileSerializer})
    @action(detail=True, methods=["post"])
    def duplicate(self, request, pk=None):
        """Copy a profile (the design's Copy button)."""
        source = self.get_object()
        base = f"{source.name} (copy)"
        name, n = base, 2
        while ShippingProfile.objects.filter(name=name).exists():
            name, n = f"{base} {n}", n + 1
        copy = ShippingProfile.objects.create(
            name=name,
            description=source.description,
            type=source.type,
            handling=list(source.handling),
            notes=source.notes,
            status=Status.INACTIVE,
        )
        record_audit(action="create", request=request, instance=copy, changes={"copied_from": [None, source.id]})
        return Response(self.get_serializer(copy).data, status=status.HTTP_201_CREATED)


# --------------------------------------------------------------------------- #
# Zones
# --------------------------------------------------------------------------- #
class ZoneFilter(django_filters.FilterSet):
    class Meta:
        model = Zone
        fields = ["type", "status"]


@extend_schema(tags=TAG)
class ZoneViewSet(EngineViewSet):
    serializer_class = ZoneSerializer
    filterset_class = ZoneFilter
    search_fields = ["name", "description", "destinations__city__name", "destinations__region__name",
                     "destinations__country__name"]
    ordering_fields = ["name", "type", "created_at"]

    def get_queryset(self):
        return (
            Zone.objects.prefetch_related(
                Prefetch("destinations", queryset=ZoneDestination.objects.select_related("city", "region", "country"))
            )
            .annotate(
                routes_count=Count("routes", distinct=True),
                rules_count=Count("routes__rules", distinct=True),
            )
            .order_by("name")
        )


# --------------------------------------------------------------------------- #
# Routes
# --------------------------------------------------------------------------- #
class RouteFilter(django_filters.FilterSet):
    method = django_filters.NumberFilter(field_name="methods")

    class Meta:
        model = Route
        fields = ["type", "status", "origin_country", "origin_city", "destination_zone", "destination_country", "method"]


@extend_schema(tags=TAG)
class RouteViewSet(EngineViewSet):
    serializer_class = RouteSerializer
    filterset_class = RouteFilter
    search_fields = ["origin_country__name", "origin_city__name", "destination_country__name",
                     "destination_city__name", "destination_zone__name"]
    ordering_fields = ["created_at", "rules_count"]

    def get_queryset(self):
        active = Q(rules__status=Status.ACTIVE)
        return (
            Route.objects.select_related(
                "origin_country", "origin_city", "destination_country", "destination_city", "destination_zone"
            )
            .prefetch_related("methods")
            .annotate(
                rules_count=Count("rules", distinct=True),
                eta_min=Min("rules__eta_min_days", filter=active),
                eta_max=Max("rules__eta_max_days", filter=active),
            )
            .order_by("type", "origin_country__name", "origin_city__name", "id")
        )


# --------------------------------------------------------------------------- #
# Rules
# --------------------------------------------------------------------------- #
class RuleFilter(django_filters.FilterSet):
    type = django_filters.ChoiceFilter(field_name="route__type", choices=Scope.choices)

    class Meta:
        model = ShippingRule
        fields = ["type", "status", "route", "method", "profile", "applies_to", "pricing_model", "carrier", "currency"]


@extend_schema(tags=TAG)
class ShippingRuleViewSet(EngineViewSet):
    serializer_class = ShippingRuleSerializer
    filterset_class = RuleFilter
    search_fields = ["code", "name", "product_sku", "profile__name", "method__name", "route__origin_country__name",
                     "route__origin_city__name", "route__destination_city__name", "route__destination_zone__name",
                     "route__destination_country__name"]
    ordering_fields = ["code", "updated_at", "created_at", "rate"]

    def get_queryset(self):
        return ShippingRule.objects.select_related(
            "route__origin_country", "route__origin_city", "route__destination_country", "route__destination_city",
            "route__destination_zone", "method", "profile", "carrier",
        )

    def get_create_kwargs(self):
        return {"created_by": self.request.user}


# --------------------------------------------------------------------------- #
# Overrides
# --------------------------------------------------------------------------- #
class OverrideFilter(django_filters.FilterSet):
    current = django_filters.BooleanFilter(method="filter_current")
    type = django_filters.ChoiceFilter(field_name="route__type", choices=Scope.choices)

    class Meta:
        model = RuleOverride
        fields = ["status", "route", "profile", "current", "type"]

    def filter_current(self, qs, name, value):
        today = timezone.localdate()
        current = Q(status=Status.ACTIVE, start_date__lte=today, end_date__gte=today)
        return qs.filter(current) if value else qs.exclude(current)


@extend_schema(tags=TAG)
class RuleOverrideViewSet(EngineViewSet):
    serializer_class = RuleOverrideSerializer
    filterset_class = OverrideFilter
    search_fields = ["code", "reason", "destination_city__name", "destination_region__name", "profile__name"]
    ordering_fields = ["start_date", "end_date", "created_at"]

    def get_queryset(self):
        return RuleOverride.objects.select_related(
            "route__origin_country", "route__origin_city", "route__destination_country", "route__destination_city",
            "route__destination_zone", "destination_city", "destination_region", "profile", "created_by",
        ).prefetch_related("route__rules")

    def get_create_kwargs(self):
        return {"created_by": self.request.user}


# --------------------------------------------------------------------------- #
# Import charges (customs)
# --------------------------------------------------------------------------- #
class ImportChargeFilter(django_filters.FilterSet):
    class Meta:
        model = ImportCharge
        fields = ["kind", "status", "treatment", "origin_country"]


@extend_schema(tags=TAG)
class ImportChargeViewSet(EngineViewSet):
    """Customs / import charges on imported goods. Staff set the rates; none are built in."""

    serializer_class = ImportChargeSerializer
    filterset_class = ImportChargeFilter
    search_fields = ["code", "name", "product_sku", "notes", "category__name", "origin_country__name"]
    ordering_fields = ["kind", "name", "created_at"]
    required_access = {"create": "manage", "update": "manage", "partial_update": "manage", "destroy": "manage"}

    def get_queryset(self):
        return ImportCharge.objects.select_related("origin_country", "category", "profile", "created_by")

    def get_create_kwargs(self):
        return {"created_by": self.request.user}


# --------------------------------------------------------------------------- #
# Settings & exchange rates
# --------------------------------------------------------------------------- #
@extend_schema(tags=TAG)
class EngineSettingsView(GenericAPIView):
    module = Module.SHIPPING_ENGINE
    permission_classes = [HasModulePermission]
    serializer_class = EngineSettingsSerializer
    # Changing global pricing behaviour needs "manage".
    required_access = {"PATCH": "manage", "PUT": "manage"}

    def get(self, request):
        return Response(self.get_serializer(EngineSettings.load()).data)

    def patch(self, request):
        obj = EngineSettings.load()
        before = snapshot(obj)
        serializer = self.get_serializer(obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        obj = serializer.save(updated_by=request.user)
        changes = diff(before, snapshot(obj))
        changes.pop("updated_by", None)
        if changes:
            record_audit(action="update", request=request, instance=obj, changes=changes)
        return Response(self.get_serializer(obj).data)


class ExchangeRateFilter(django_filters.FilterSet):
    class Meta:
        model = ExchangeRate
        fields = ["base_currency", "quote_currency"]


@extend_schema(tags=TAG)
class ExchangeRateViewSet(AuditedViewSetMixin, mixins.ListModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    """Rate history. Posting a rate for a date that already has one replaces it."""

    module = Module.SHIPPING_ENGINE
    permission_classes = [HasModulePermission]
    required_access = {"create": "manage"}
    serializer_class = ExchangeRateSerializer
    queryset = ExchangeRate.objects.select_related("created_by")
    filterset_class = ExchangeRateFilter
    ordering_fields = ["effective_date", "created_at"]

    def get_create_kwargs(self):
        return {"created_by": self.request.user}


# --------------------------------------------------------------------------- #
# Overview & calculator
# --------------------------------------------------------------------------- #
@extend_schema(tags=TAG)
class OverviewView(GenericAPIView):
    module = Module.SHIPPING_ENGINE
    permission_classes = [HasModulePermission]

    @extend_schema(responses={200: dict})
    def get(self, request):
        today = timezone.localdate()
        route_type = request.query_params.get("type", Scope.LOCAL)
        if route_type not in Scope.values:
            raise ValidationError({"type": "Must be local or international."})
        recent = (
            ShippingRule.objects.filter(route__type=route_type)
            .select_related("route__origin_country", "route__origin_city", "route__destination_country",
                            "route__destination_city", "route__destination_zone", "method", "profile")
            .order_by("-updated_at")[:5]
        )
        return Response(
            {
                "stats": {
                    "active_routes": Route.objects.filter(status=Status.ACTIVE).count(),
                    "zones": Zone.objects.exclude(status=ZoneStatus.INACTIVE).count(),
                    "active_rules": ShippingRule.objects.filter(status=Status.ACTIVE).count(),
                    "profiles": ShippingProfile.objects.filter(status=Status.ACTIVE).count(),
                    "carriers": Carrier.objects.filter(status=Status.ACTIVE).count(),
                    "manual_quote_rules": ShippingRule.objects.filter(
                        status=Status.ACTIVE, pricing_model=PricingModel.MANUAL
                    ).count(),
                    "active_overrides": RuleOverride.objects.filter(
                        status=Status.ACTIVE, start_date__lte=today, end_date__gte=today
                    ).count(),
                },
                "recent_rules": [
                    {
                        "id": r.id,
                        "code": r.code,
                        "name": r.display_name,
                        "origin_label": r.route.origin_label,
                        "destination_label": r.route.destination_label,
                        "method": r.method.name,
                        "profile": r.target_label,
                        "pricing_model_display": PricingModel(r.pricing_model).label,
                        "rate_display": rate_display(r.pricing_model, r.rate, r.currency),
                        "status": r.status,
                        "updated_at": r.updated_at,
                    }
                    for r in recent
                ],
            }
        )


def jsonable(value):
    """Decimals as strings (never floats) so money stays exact in JSON."""
    if isinstance(value, decimal.Decimal):
        return format(value.normalize(), "f")
    if isinstance(value, dict):
        return {k: jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [jsonable(v) for v in value]
    if isinstance(value, (datetime.date, datetime.datetime)):
        return value.isoformat()
    return value


@extend_schema(tags=TAG)
class CalculateView(GenericAPIView):
    """Price a shipment and explain which rule applied and why."""

    module = Module.SHIPPING_ENGINE
    # Quotes and orders price shipments too.
    read_modules = (Module.ORDERS, Module.INTAKE_QUOTES, Module.ECOMMERCE)
    permission_classes = [HasModulePermission]
    required_access = {"POST": "view"}  # a calculation reads data; it changes nothing
    serializer_class = CalculateSerializer

    @extend_schema(responses={200: OpenApiResponse(description="Calculation result with explanation")})
    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        shipment = Shipment(**serializer.validated_data)
        try:
            result = RateCalculator().calculate(shipment)
        except RateCalculationError as exc:
            raise ValidationError({exc.field or "non_field_errors": [exc.message]}, code=exc.code) from exc
        return Response(jsonable(result))
