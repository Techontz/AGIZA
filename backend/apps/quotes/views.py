import django_filters
from django.db import transaction
from django.db.models import Count
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from apps.accounts.constants import Access, Module
from apps.accounts.permissions import HasModulePermission, has_access
from apps.core.audit import AuditedViewSetMixin, record_audit
from apps.core.uploads import IMAGE_TYPES, file_response, validate_upload
from apps.core.workflow import run
from apps.tasks import services as tasks

from . import services
from .models import QuoteAttachment, QuoteRequest, QuoteStatusHistory
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


MAX_AGIZA_PHOTOS = 5


@extend_schema(tags=["quotes"])
class QuoteViewSet(AuditedViewSetMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
                   mixins.UpdateModelMixin, viewsets.GenericViewSet):
    module = Module.INTAKE_QUOTES
    # Finance invoices quotations; Chat links them to conversations.
    read_modules = (Module.FINANCE, Module.CHAT)
    permission_classes = [HasModulePermission]
    serializer_class = QuoteSerializer
    filterset_class = QuoteFilter
    search_fields = ["reference", "description", "customer__full_name", "customer__phone", "origin", "destination"]
    ordering_fields = ["requested_at", "quoted_amount", "reference"]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    required_access = {"approve": "edit", "cancel": "manage", "add_photo": "edit", "remove_photo": "edit"}

    def get_queryset(self):
        return (
            QuoteRequest.objects.select_related("customer", "responded_by", "created_order")
            .prefetch_related("attachments")
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
        # Customer-app requests start with "[Buy for me] <item>" or "[Deliver for me] <item>".
        first_line = quote.description.split("\n", 1)[0]
        app_service = {"[Buy for me]": "full_service", "[Deliver for me]": "deliver_for_me", "[Local delivery]": None}
        marker = next((m for m in app_service if first_line.startswith(m)), None)
        # Local delivery requests carry "Pick up: …" and "Deliver to: …" lines with the full addresses.
        lines = {k.strip(): v.strip() for k, _, v in (ln.partition(":") for ln in quote.description.split("\n")[1:])}
        return Response({
            "item_details": (first_line[len(marker):].strip() if marker else quote.description)[:255],
            "pickup_address": lines.get("Pick up") or quote.origin,
            "delivery_address": lines.get("Deliver to") or quote.destination,
            "source_country": country.id if country else None,
            "service_type": app_service.get(marker) if marker and quote.service_type == "international" else None,
            # The size the customer picked in the app ("Package size: Medium"), for the Express order.
            "package_size": s if (s := lines.get("Package size", "").lower()) in ("small", "medium", "large") else "",
        })

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        quote = run(services.cancel, self.get_object(), user=request.user, note=request.data.get("note", ""), request=request)
        return self._respond_with(quote)

    @extend_schema(responses={200: bytes})
    @action(detail=True, url_path=r"photos/(?P<photo_id>\d+)/file")
    def photo(self, request, pk=None, photo_id=None):
        """A photo the customer added to their app request (authenticated; never a public media URL)."""
        photo = get_object_or_404(QuoteAttachment, pk=photo_id, quote=self.get_object())
        return file_response(photo.file, photo.content_type)

    @action(detail=True, methods=["post"], url_path="photos", parser_classes=[MultiPartParser, FormParser])
    def add_photo(self, request, pk=None):
        """Attach a photo (multipart `file`) to AGIZA's answer; the customer sees it with the quotation."""
        quote = self.get_object()
        if quote.status in ("approved", "cancelled") or quote.attachments.filter(from_agiza=True).count() >= MAX_AGIZA_PHOTOS:
            return Response({"error": {"code": "conflict", "message": "You can't add more photos to this quotation.",
                                       "details": None}}, status=status.HTTP_409_CONFLICT)
        upload = request.FILES.get("file")
        content_type = validate_upload(upload, allowed=IMAGE_TYPES)
        photo = QuoteAttachment.objects.create(quote=quote, file=upload, content_type=content_type, from_agiza=True)
        record_audit(action="update", request=request, instance=quote, changes={"photo": [None, photo.pk]})
        return self._respond_with(quote)

    @action(detail=True, methods=["delete"], url_path=r"photos/(?P<photo_id>\d+)")
    def remove_photo(self, request, pk=None, photo_id=None):
        """Remove a photo staff attached (the customer's own photos stay)."""
        quote = self.get_object()
        if quote.status in ("approved", "cancelled"):
            return Response({"error": {"code": "conflict", "message": "This quotation can no longer be changed.",
                                       "details": None}}, status=status.HTTP_409_CONFLICT)
        photo = get_object_or_404(QuoteAttachment, pk=photo_id, quote=quote, from_agiza=True)
        photo.file.delete(save=False)
        photo.delete()
        record_audit(action="update", request=request, instance=quote, changes={"photo": [int(photo_id), None]})
        return self._respond_with(quote)

    @action(detail=True)
    def history(self, request, pk=None):
        rows = QuoteStatusHistory.objects.filter(quote=self.get_object()).select_related("changed_by")
        return Response(QuoteHistorySerializer(rows, many=True).data)

    def perform_update(self, serializer):
        super().perform_update(serializer)

    @transaction.atomic
    def perform_create(self, serializer):
        quote = serializer.save(created_by=self.request.user)
        QuoteStatusHistory.objects.create(quote=quote, to_status=quote.status, changed_by=self.request.user,
                                          note="Quotation request received")
        record_audit(action="create", request=self.request, instance=quote,
                     changes={"customer": [None, quote.customer_id], "service_type": [None, quote.service_type]})
        tasks.open_quote_task(quote, self.request.user)
