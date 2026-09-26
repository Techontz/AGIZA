import django_filters
from django.db.models import Count, Prefetch
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.constants import Module
from apps.accounts.permissions import HasModulePermission
from apps.core.audit import AuditedViewSetMixin

from .models import Address, Customer, ServiceProvider
from .serializers import AddressSerializer, CustomerSerializer, ServiceProviderSerializer

CUSTOMER_READ_MODULES = (
    Module.ORDERS,
    Module.INTAKE_QUOTES,
    Module.CHAT,
    Module.FINANCE,
    Module.DELIVERIES,
    Module.RETURNS,
)


class CustomerFilter(django_filters.FilterSet):
    created_from = django_filters.DateFilter(field_name="created_at", lookup_expr="date__gte")
    created_to = django_filters.DateFilter(field_name="created_at", lookup_expr="date__lte")
    tag = django_filters.CharFilter(method="filter_tag")
    interest = django_filters.CharFilter(method="filter_interest")

    class Meta:
        model = Customer
        fields = ["status", "preferred_channel", "created_from", "created_to", "tag", "interest"]

    def filter_tag(self, qs, name, value):
        return qs.filter(tag_links__tag__name=value.lower()).distinct()

    def filter_interest(self, qs, name, value):
        return qs.filter(interests__label__iexact=value).distinct()


@extend_schema(tags=["customers"])
class CustomerViewSet(
    AuditedViewSetMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    module = Module.PEOPLE
    read_modules = CUSTOMER_READ_MODULES
    # Staff taking orders/quotations can register walk-in customers.
    edit_modules = (Module.ORDERS, Module.INTAKE_QUOTES, Module.FINANCE, Module.CHAT)
    permission_classes = [HasModulePermission]
    serializer_class = CustomerSerializer
    filterset_class = CustomerFilter
    search_fields = ["reference", "full_name", "email", "phone", "company_name"]
    ordering_fields = ["created_at", "full_name", "reference"]

    def get_queryset(self):
        from apps.crm.models import CustomerTag
        from apps.crm.services import with_metrics

        qs = Customer.objects.prefetch_related(
            Prefetch("addresses", queryset=Address.objects.select_related("city", "region", "country")),
            Prefetch("tag_links", queryset=CustomerTag.objects.select_related("tag"), to_attr="prefetched_tags"),
        )
        return with_metrics(qs).order_by("-created_at", "-id")

    def get_create_kwargs(self):
        return {"created_by": self.request.user}

    @extend_schema(responses=OpenApiTypes.OBJECT)
    @action(detail=True)
    def profile(self, request, pk=None):
        """Customer detail: KPIs, orders, returns, quotations, tags, interests, spend by category, activity."""
        from .profile import customer_profile

        return Response(customer_profile(self.get_object()))


@extend_schema(tags=["customers"])
class CustomerAddressViewSet(AuditedViewSetMixin, viewsets.ModelViewSet):
    module = Module.PEOPLE
    read_modules = CUSTOMER_READ_MODULES
    permission_classes = [HasModulePermission]
    serializer_class = AddressSerializer
    pagination_class = None
    required_access = {"destroy": "edit"}

    def get_customer(self):
        return get_object_or_404(Customer, pk=self.kwargs["customer_pk"])

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Address.objects.none()
        return Address.objects.filter(customer_id=self.kwargs["customer_pk"]).select_related(
            "city", "region", "country"
        )

    def get_create_kwargs(self):
        return {"customer": self.get_customer()}


@extend_schema(tags=["people"])
class ServiceProviderViewSet(AuditedViewSetMixin, viewsets.ModelViewSet):
    """External service providers (installers, plumbers, cleaners...)."""

    module = Module.PEOPLE
    read_modules = (Module.ORDERS,)
    permission_classes = [HasModulePermission]
    serializer_class = ServiceProviderSerializer
    filterset_fields = ["status", "city"]
    search_fields = ["name", "email", "phone", "services", "reference"]
    ordering_fields = ["name", "created_at", "rating"]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        return (ServiceProvider.objects.select_related("city").annotate(total_orders=Count("jobs"))
                .order_by("name", "id"))


class PeopleStatsView(APIView):
    """Counts for the six People tabs."""

    module = Module.PEOPLE
    permission_classes = [HasModulePermission]

    @extend_schema(tags=["people"], responses=OpenApiTypes.OBJECT)
    def get(self, request):
        from apps.accounts.constants import StaffLevel
        from apps.accounts.models import User
        from apps.catalog.models import Vendor
        from apps.shipping_engine.models import Carrier

        users = User.objects.all()
        return Response({
            "customer": Customer.objects.count(),
            "staff": users.exclude(staff_level=StaffLevel.DRIVER).count(),
            "shipper": Carrier.objects.count(),
            "shop_vendor": Vendor.objects.count(),
            "service_provider": ServiceProvider.objects.count(),
            "driver": users.filter(staff_level=StaffLevel.DRIVER).count(),
        })
