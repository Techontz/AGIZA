import django_filters
from django.db.models import Count, F, Q, Sum
from django.db.models.functions import Coalesce
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from apps.accounts.constants import Access, Module
from apps.accounts.models import User
from apps.accounts.permissions import HasModulePermission, has_access
from apps.core.audit import diff, record_audit, snapshot
from apps.core.exceptions import ConflictError
from apps.core.workflow import run

from . import services
from .models import ACTIVE, FinancialImpact, ReturnRequest, ReturnStatus
from .serializers import (
    CloseSerializer,
    DecideSerializer,
    InspectSerializer,
    ReassignSerializer,
    ReturnCreateSerializer,
    ReturnHistorySerializer,
    ReturnSerializer,
    ReturnTransitionSerializer,
    ReturnUpdateSerializer,
)

R = ReturnStatus


class ReturnFilter(django_filters.FilterSet):
    tab = django_filters.ChoiceFilter(choices=[("active", "Active"), ("completed", "Completed/Closed")],
                                      method="filter_tab")
    status = django_filters.BaseInFilter(field_name="status")
    handler = django_filters.NumberFilter(field_name="handler_id")
    order = django_filters.NumberFilter(field_name="order_id")
    exception = django_filters.CharFilter(method="filter_exception")

    class Meta:
        model = ReturnRequest
        fields = ["tab", "status", "owner", "handler", "order", "return_type", "financial_impact", "exception"]

    def filter_tab(self, qs, name, value):
        return qs.filter(status__in=ACTIVE) if value == "active" else qs.exclude(status__in=ACTIVE)

    def filter_exception(self, qs, name, value):
        return qs.exclude(exception_flag="") if value == "any" else qs.filter(exception_flag=value)


@extend_schema(tags=["returns"])
class ReturnViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
                    mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """Product returns: inspection, approval/rejection and refund/replacement outcome."""

    module = Module.RETURNS
    permission_classes = [HasModulePermission]
    serializer_class = ReturnSerializer
    filterset_class = ReturnFilter
    search_fields = ["reference", "order__reference", "order__customer__full_name", "item_details"]
    ordering_fields = ["created_at", "updated_at", "return_value"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        return (
            ReturnRequest.objects.select_related("order", "order__customer", "delivery", "handler")
            .prefetch_related("history")
            .order_by("-updated_at", "-id")
        )

    def _respond(self, ret, code=status.HTTP_200_OK):
        return Response(ReturnSerializer(self.get_queryset().get(pk=ret.pk)).data, status=code)

    @extend_schema(request=ReturnCreateSerializer, responses={201: ReturnSerializer})
    def create(self, request, *args, **kwargs):
        s = ReturnCreateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        data = dict(s.validated_data)
        ret = run(services.create_return, data.pop("order"), user=request.user, request=request, **data)
        return self._respond(ret, status.HTTP_201_CREATED)

    @extend_schema(request=ReturnUpdateSerializer)
    def partial_update(self, request, *args, **kwargs):
        ret = self.get_object()
        s = ReturnUpdateSerializer(data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        data = s.validated_data
        if ret.status == R.CLOSED and set(data) - {"notes"}:
            raise ConflictError("Only notes can change on a closed return.")
        if ret.status in (R.APPROVED, R.REJECTED) and {"financial_impact", "return_value"} & set(data):
            raise ConflictError("The outcome is fixed once the return has been decided.")
        before = snapshot(ret)
        for key, value in data.items():
            setattr(ret, key, value)
        ret.save()
        changes = diff(before, snapshot(ret))
        if changes:
            record_audit(action="update", request=request, instance=ret, changes=changes)
        return self._respond(ret)

    def update(self, request, *args, **kwargs):
        return self.partial_update(request, *args, **kwargs)

    @extend_schema(request=ReturnTransitionSerializer)
    @action(detail=True, methods=["post"])
    def transition(self, request, pk=None):
        s = ReturnTransitionSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        ret = run(services.transition, self.get_object(), s.validated_data["status"], user=request.user,
                  note=s.validated_data["note"], request=request)
        return self._respond(ret)

    @extend_schema(request=InspectSerializer)
    @action(detail=True, methods=["post"])
    def inspect(self, request, pk=None):
        s = InspectSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        ret = run(services.inspect, self.get_object(), user=request.user, request=request, **s.validated_data)
        return self._respond(ret)

    @extend_schema(request=DecideSerializer)
    @action(detail=True, methods=["post"])
    def decide(self, request, pk=None):
        s = DecideSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        ret = run(services.decide, self.get_object(), user=request.user, request=request, **s.validated_data)
        return self._respond(ret)

    @extend_schema(request=CloseSerializer)
    @action(detail=True, methods=["post"])
    def close(self, request, pk=None):
        ret = self.get_object()
        refund = ret.status == R.APPROVED and ret.financial_impact == FinancialImpact.REFUND_REQUIRED
        if refund and not (has_access(request.user, Module.FINANCE, Access.EDIT)
                           or has_access(request.user, Module.RETURNS, Access.MANAGE)):
            raise PermissionDenied("Paying out a refund requires Finance edit or Returns manage access.")
        s = CloseSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        ret = run(services.close, ret, user=request.user, request=request, **s.validated_data)
        return self._respond(ret)

    @extend_schema(request=ReassignSerializer)
    @action(detail=True, methods=["post"])
    def reassign(self, request, pk=None):
        s = ReassignSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        ret = run(services.reassign, self.get_object(), s.validated_data["handler"], user=request.user,
                  note=s.validated_data["note"], request=request)
        return self._respond(ret)

    @extend_schema(responses=ReturnHistorySerializer(many=True))
    @action(detail=True)
    def history(self, request, pk=None):
        rows = self.get_object().history.select_related("changed_by")
        return Response(ReturnHistorySerializer(rows, many=True).data)

    @action(detail=False)
    def stats(self, request):
        refund_value = Coalesce(F("refund_amount"), F("return_value"))
        data = ReturnRequest.objects.aggregate(
            active=Count("id", filter=Q(status__in=ACTIVE)),
            completed=Count("id", filter=~Q(status__in=ACTIVE)),
            with_exceptions=Count("id", filter=~Q(exception_flag="") & Q(status__in=ACTIVE)),
            pending_refunds=Sum(refund_value, filter=Q(status__in=ACTIVE,
                                                       financial_impact=FinancialImpact.REFUND_REQUIRED)),
        )
        data["pending_refunds"] = f"{data['pending_refunds'] or 0:.2f}"
        return Response(data)

    @action(detail=False)
    def handlers(self, request):
        qs = User.objects.filter(is_active=True).order_by("full_name")
        return Response([{"id": u.id, "full_name": u.full_name, "staff_level": u.staff_level,
                          "role": u.get_staff_level_display()} for u in qs])
