import django_filters
from django.db.models import Count, Q, Sum
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.constants import Module, StaffLevel
from apps.accounts.models import User
from apps.accounts.permissions import HasModulePermission
from apps.core.audit import AuditedViewSetMixin, diff, record_audit, snapshot
from apps.core.exceptions import ConflictError
from apps.core.workflow import run

from . import services
from .models import ProcurementOrder, ProcurementStatus, Supplier
from .serializers import (
    CancelSupplierSerializer,
    MarkPaidSerializer,
    ProcurementHistorySerializer,
    ProcurementSerializer,
    ProcurementUpdateSerializer,
    SelectSupplierSerializer,
    SupplierSerializer,
)


class SupplierFilter(django_filters.FilterSet):
    country = django_filters.CharFilter(field_name="country__iso2", lookup_expr="iexact")

    class Meta:
        model = Supplier
        fields = ["country", "is_active"]


@extend_schema(tags=["procurement"])
class SupplierViewSet(AuditedViewSetMixin, viewsets.ModelViewSet):
    """Suppliers Agiza buys from. Deleting a supplier with orders is refused — deactivate it instead."""

    module = Module.PROCUREMENT
    permission_classes = [HasModulePermission]
    serializer_class = SupplierSerializer
    filterset_class = SupplierFilter
    search_fields = ["name", "reference", "contact_person", "email", "phone"]
    ordering_fields = ["name", "created_at"]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        return Supplier.objects.select_related("country").annotate(orders_count=Count("orders")).order_by("name", "id")


class ProcurementFilter(django_filters.FilterSet):
    status = django_filters.BaseInFilter(field_name="status")
    origin = django_filters.CharFilter(field_name="order__international__source_country__iso2", lookup_expr="iexact")
    operator = django_filters.NumberFilter(field_name="operator_id")
    supplier = django_filters.NumberFilter(field_name="supplier_id")
    exception = django_filters.CharFilter(method="filter_exception")

    class Meta:
        model = ProcurementOrder
        fields = ["status", "origin", "operator", "supplier", "exception"]

    def filter_exception(self, qs, name, value):
        if value == "any":
            return qs.exclude(exception_flag="")
        if value == "none":
            return qs.filter(exception_flag="")
        return qs.filter(exception_flag=value)


@extend_schema(tags=["procurement"])
class ProcurementViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin,
                         viewsets.GenericViewSet):
    """Procurement of international orders: supplier selection, supplier payment, goods to cargo."""

    module = Module.PROCUREMENT
    permission_classes = [HasModulePermission]
    serializer_class = ProcurementSerializer
    filterset_class = ProcurementFilter
    search_fields = ["order__reference", "order__item_details", "supplier__name", "supplier_tracking_number",
                     "order__customer__full_name"]
    ordering_fields = ["created_at", "updated_at", "item_cost", "expected_at_cargo"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        return ProcurementOrder.objects.select_related(
            "order", "order__customer", "order__international", "order__international__source_country",
            "supplier", "operator",
        )

    def _respond(self, proc):
        return Response(ProcurementSerializer(self.get_queryset().get(pk=proc.pk)).data)

    @extend_schema(request=ProcurementUpdateSerializer)
    def partial_update(self, request, *args, **kwargs):
        proc = self.get_object()
        s = ProcurementUpdateSerializer(data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        data = s.validated_data
        locked = {"unit_cost", "item_cost", "quantity"} & set(data)
        if locked and proc.status in (ProcurementStatus.PAID, ProcurementStatus.RECEIVED_AT_CARGO):
            raise ConflictError("Costs and quantity can't change after the supplier has been paid.")
        if proc.status == ProcurementStatus.CANCELLED:
            raise ConflictError("This procurement was cancelled with its order.")
        before = snapshot(proc)
        for key, value in data.items():
            setattr(proc, key, value)
        proc.save()
        changes = diff(before, snapshot(proc))
        if changes:
            record_audit(action="update", request=request, instance=proc, changes=changes)
            if {"item_cost", "supplier_tracking_number"} & set(changes):
                services._sync_order_details(proc)
        return self._respond(proc)

    def update(self, request, *args, **kwargs):
        return self.partial_update(request, *args, **kwargs)

    @extend_schema(request=SelectSupplierSerializer)
    @action(detail=True, methods=["post"], url_path="select-supplier")
    def select_supplier(self, request, pk=None):
        s = SelectSupplierSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        proc = run(services.select_supplier, self.get_object(), user=request.user, request=request,
                   **s.validated_data)
        return self._respond(proc)

    @extend_schema(request=MarkPaidSerializer)
    @action(detail=True, methods=["post"], url_path="mark-paid")
    def mark_paid(self, request, pk=None):
        s = MarkPaidSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        proc = run(services.mark_paid, self.get_object(), user=request.user, request=request, **s.validated_data)
        return self._respond(proc)

    @extend_schema(request=CancelSupplierSerializer)
    @action(detail=True, methods=["post"], url_path="cancel-supplier")
    def cancel_supplier(self, request, pk=None):
        s = CancelSupplierSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        proc = run(services.cancel_supplier, self.get_object(), user=request.user, request=request,
                   reason=s.validated_data["reason"])
        return self._respond(proc)

    @extend_schema(responses=ProcurementHistorySerializer(many=True))
    @action(detail=True)
    def history(self, request, pk=None):
        rows = self.get_object().history.select_related("changed_by")
        return Response(ProcurementHistorySerializer(rows, many=True).data)

    @action(detail=False)
    def stats(self, request):
        qs = ProcurementOrder.objects.all()
        counts = qs.aggregate(
            total=Count("id", filter=~Q(status=ProcurementStatus.CANCELLED)),
            pending_sourcing=Count("id", filter=Q(status=ProcurementStatus.PENDING_SOURCING)),
            paid=Count("id", filter=Q(status=ProcurementStatus.PAID)),
            received_at_cargo=Count("id", filter=Q(status=ProcurementStatus.RECEIVED_AT_CARGO)),
            with_exceptions=Count("id", filter=~Q(exception_flag="") & ~Q(status=ProcurementStatus.CANCELLED)),
            total_value=Sum("item_cost", filter=~Q(status=ProcurementStatus.CANCELLED)),
        )
        counts["total_value"] = f"{counts['total_value'] or 0:.2f}"
        return Response(counts)

    @action(detail=False)
    def operators(self, request):
        """Staff who can own procurement orders."""
        qs = User.objects.filter(is_active=True).exclude(staff_level=StaffLevel.DRIVER).order_by("full_name")
        return Response([{"id": u.id, "full_name": u.full_name, "staff_level": u.staff_level} for u in qs])
