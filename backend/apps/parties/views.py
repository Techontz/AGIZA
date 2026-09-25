import django_filters
from django.db.models import Prefetch
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, viewsets
from rest_framework.generics import get_object_or_404

from apps.accounts.constants import Module
from apps.accounts.permissions import HasModulePermission
from apps.core.audit import AuditedViewSetMixin

from .models import Address, Customer
from .serializers import AddressSerializer, CustomerSerializer

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

    class Meta:
        model = Customer
        fields = ["status", "preferred_channel", "created_from", "created_to"]


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
    permission_classes = [HasModulePermission]
    serializer_class = CustomerSerializer
    filterset_class = CustomerFilter
    search_fields = ["reference", "full_name", "email", "phone", "company_name"]
    ordering_fields = ["created_at", "full_name", "reference"]

    def get_queryset(self):
        return Customer.objects.prefetch_related(
            Prefetch("addresses", queryset=Address.objects.select_related("city", "region", "country"))
        )

    def get_create_kwargs(self):
        return {"created_by": self.request.user}


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
