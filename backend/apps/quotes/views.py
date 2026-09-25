import django_filters
from django.db.models import Count
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from apps.accounts.constants import Access, Module
from apps.accounts.permissions import HasModulePermission, has_access
from apps.core.audit import AuditedViewSetMixin, record_audit
from apps.orders.views import run

from . import services
from .models import QuoteRequest, QuoteStatusHistory
from .serializers import (
    APPROVE_SERIALIZER,
    QuoteHistorySerializer,
    QuoteSerializer,
    ReplySerializer,
    RespondSerializer,
    guess_country,
)


class QuoteFilter(django_filters.FilterSet):
    status = django_filters.BaseInFilter(field_name="status")
    requested_from = django_filters.DateFilter(field_name="requested_at", lookup_expr="date__gte")
    requested_to = django_filters.DateFilter(field_name="requested_at", lookup_expr="date__lte")

    class Meta:
        model = QuoteRequest
        fields = ["status", "service_type", "customer", "requested_from", "requested_to"]


@extend_schema(tags=["quotes"])
class QuoteViewSet(AuditedViewSetMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
                   mixins.UpdateModelMixin, viewsets.GenericViewSet):
    module = Module.INTAKE_QUOTES
    permission_classes = [HasModulePermission]
    serializer_class = QuoteSerializer
    filterset_class = QuoteFilter
    search_fields = ["reference", "description", "customer__full_name", "customer__phone", "origin", "destination"]
    ordering_fields = ["requested_at", "quoted_amount", "reference"]
    http_method_names = ["get", "post", "patch", "head", "options"]
    required_access = {"approve": "edit", "cancel": "manage"}

    def get_queryset(self):
        return (
            QuoteRequest.objects.select_related("customer", "responded_by", "created_order")
            .order_by("-requested_at", "-id")
        )

    def get_create_kwargs(self):
        return {"created_by": self.request.user}

    def _respond_with(self, quote):
        return Response(self.get_serializer(self.get_queryset().get(pk=quote.pk)).data)

    @action(detail=False)
    def stats(self, request):
        counts = dict(QuoteRequest.objects.values_list("status").annotate(n=Count("id")))
        return Response({s: counts.get(s, 0) for s in ("new", "answered", "waiting_reply", "declined", "approved")})

    @extend_schema(request=RespondSerializer)
    @action(detail=True, methods=["post"])
    def respond(self, request, pk=None):
        s = RespondSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        quote = run(services.respond, self.get_object(), amount=d["quoted_amount"],
                    estimated_delivery=d.get("estimated_delivery"), notes=d["response_notes"], user=request.user,
                    request=request)
        return self._respond_with(quote)

    @extend_schema(request=ReplySerializer)
    @action(detail=True, methods=["post"])
    def reply(self, request, pk=None):
        s = ReplySerializer(data=request.data)
        s.is_valid(raise_exception=True)
        quote = run(services.record_reply, self.get_object(), accepted=s.validated_data["accepted"],
                    note=s.validated_data["note"], user=request.user, request=request)
        return self._respond_with(quote)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        """Approve an answered quotation and create its order (one transaction)."""
        if not has_access(request.user, Module.ORDERS, Access.EDIT):
            raise PermissionDenied("Creating the order requires Orders edit access.")
        quote = self.get_object()
        s = APPROVE_SERIALIZER[quote.service_type](data=request.data)
        s.is_valid(raise_exception=True)
        order = run(services.approve, quote, user=request.user, order_details=dict(s.validated_data), request=request)
        body = self.get_serializer(self.get_queryset().get(pk=quote.pk)).data
        body["created_order"] = {"id": order.id, "reference": order.reference, "order_type": order.order_type}
        return Response(body, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], url_path="approval-defaults")
    def approval_defaults(self, request, pk=None):
        """Sensible pre-fill for the approval form (from the quotation's text)."""
        quote = self.get_object()
        country = guess_country(quote.origin)
        return Response({
            "item_details": quote.description[:255],
            "pickup_address": quote.origin,
            "delivery_address": quote.destination,
            "source_country": country.id if country else None,
        })

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        quote = run(services.cancel, self.get_object(), user=request.user, note=request.data.get("note", ""), request=request)
        return self._respond_with(quote)

    @action(detail=True)
    def history(self, request, pk=None):
        rows = QuoteStatusHistory.objects.filter(quote=self.get_object()).select_related("changed_by")
        return Response(QuoteHistorySerializer(rows, many=True).data)

    def perform_update(self, serializer):
        super().perform_update(serializer)

    def perform_create(self, serializer):
        quote = serializer.save(created_by=self.request.user)
        QuoteStatusHistory.objects.create(quote=quote, to_status=quote.status, changed_by=self.request.user,
                                          note="Quotation request received")
        record_audit(action="create", request=self.request, instance=quote,
                     changes={"customer": [None, quote.customer_id], "service_type": [None, quote.service_type]})
