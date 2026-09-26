from datetime import timedelta

import django_filters
from django.db.models import Count, Q
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.constants import Module
from apps.accounts.permissions import HasModulePermission
from apps.core.audit import AuditedViewSetMixin

from .models import City, Country, Region, Warehouse
from .serializers import CitySerializer, CountrySerializer, RegionSerializer, WarehouseSerializer


@extend_schema(tags=["locations"])
class CountryViewSet(viewsets.ReadOnlyModelViewSet):
    """Reference data used across the platform (read-only; managed in Django admin)."""

    permission_classes = [IsAuthenticated]
    serializer_class = CountrySerializer
    queryset = Country.objects.filter(is_active=True)
    filterset_fields = ["is_sourcing_origin", "iso2"]
    search_fields = ["name", "display_name", "iso2"]
    pagination_class = None


@extend_schema(tags=["locations"])
class RegionViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = RegionSerializer
    queryset = Region.objects.all()
    filterset_fields = ["country"]
    search_fields = ["name"]
    pagination_class = None


@extend_schema(tags=["locations"])
class CityViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = CitySerializer
    queryset = City.objects.filter(is_active=True).select_related("region", "country")
    filterset_fields = ["country", "region"]
    search_fields = ["name", "region__name"]
    pagination_class = None


class WarehouseFilter(django_filters.FilterSet):
    country = django_filters.CharFilter(field_name="country__iso2", lookup_expr="iexact")

    class Meta:
        model = Warehouse
        fields = ["type", "status", "country", "city"]


@extend_schema(tags=["warehouses"])
class WarehouseViewSet(
    AuditedViewSetMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """Consolidation hubs, fulfillment centers, pickup points and shops. A location in use can't be
    deleted (409) — set it Inactive instead."""

    module = Module.WAREHOUSE
    # Locations are picked in Shipping (consolidation hubs), Deliveries, the product editor and shop orders.
    read_modules = (Module.SHIPPING, Module.DELIVERIES, Module.ECOMMERCE, Module.ORDERS, Module.PROCUREMENT,
                    Module.PEOPLE)
    permission_classes = [HasModulePermission]
    serializer_class = WarehouseSerializer
    queryset = Warehouse.objects.select_related("country", "city")
    filterset_class = WarehouseFilter
    search_fields = ["name", "code", "city__name", "contact_person"]
    ordering_fields = ["code", "name", "capacity_percent", "last_audit_at"]

    @action(detail=False)
    def stats(self, request):
        """Counts per type, and active locations whose last audit is missing or older than 30 days."""
        stale = timezone.localdate() - timedelta(days=30)
        counts = dict(Warehouse.objects.values_list("type").annotate(n=Count("id")))
        pending = Warehouse.objects.exclude(status=Warehouse.Status.INACTIVE).filter(
            Q(last_audit_at__isnull=True) | Q(last_audit_at__lt=stale)).count()
        return Response({"total": sum(counts.values()), "pending_audits": pending,
                         **{t: counts.get(t, 0) for t in Warehouse.Type.values}})
