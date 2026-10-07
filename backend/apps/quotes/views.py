import django_filters
from django.db import transaction
from django.db.models import Count, Q
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
from .models import QuoteAttachment, QuoteItem, QuoteRequest, QuoteStatusHistory
from .serializers import (
    APPROVE_SERIALIZER,
    QuoteHistorySerializer,
    QuoteSerializer,
    ReplySerializer,
    RespondSerializer,
    guess_country,
    order_ref,
)


class QuoteFilter(django_filters.FilterSet):
    status = django_filters.BaseInFilter(field_name="status")
    requested_from = django_filters.DateFilter(field_name="requested_at", lookup_expr="date__gte")
    requested_to = django_filters.DateFilter(field_name="requested_at", lookup_expr="date__lte")

    class Meta:
        model = QuoteRequest
        fields = ["status", "service_type", "customer", "requested_from", "requested_to"]


MAX_AGIZA_PHOTOS = 5
MAX_CUSTOMER_PHOTOS = 5  # per item (or per quotation without items) when staff add them for the customer


def _truthy(value) -> bool:
    return str(value).lower() in ("1", "true", "yes", "on")


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
            .prefetch_related("attachments", "items__attachments", "items__created_order", "items__origin_country")
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
        quote = run(services.respond, self.get_object(), amount=d.get("quoted_amount"),
                    estimated_delivery=d.get("estimated_delivery"), notes=d["response_notes"], user=request.user,
                    request=request, item_prices=d.get("items"))
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
        """Approve an answered quotation and create its order — one per item for a multi-item quotation
        (one transaction)."""
        if not has_access(request.user, Module.ORDERS, Access.EDIT):
            raise PermissionDenied("Creating the order requires Orders edit access.")
        quote = self.get_object()
        data = request.data.copy() if hasattr(request.data, "copy") else dict(request.data)
        items = list(quote.items.all())
        if items:
            # Item lines carry their own origin / equipment; the shared form only fills the gaps.
            origins = [it.origin_country_id for it in items if it.origin_country_id]
            if quote.service_type == "international" and not data.get("source_country") and len(origins) == len(items):
                data["source_country"] = origins[0]
            if quote.service_type == "equipment" and not data.get("equipment"):
                data["equipment"] = items[0].name[:160]
        s = APPROVE_SERIALIZER[quote.service_type](data=data)
        s.is_valid(raise_exception=True)
        orders = run(services.approve_orders, quote, user=request.user, order_details=dict(s.validated_data),
                     request=request)
        body = self.get_serializer(self.get_queryset().get(pk=quote.pk)).data
        body["created_order"] = order_ref(orders[0])
        body["created_orders"] = [order_ref(o) for o in orders]
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
            "item_count": quote.items.count(),
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
        """Attach a photo (multipart `file`). By default it's part of AGIZA's answer (the customer sees it with the
        quotation). With `customer_photo=true` it's a photo of the customer's item that staff add on the
        customer's behalf at intake (optionally for one `item` of a multi-item quotation)."""
        quote = self.get_object()
        customer_photo = _truthy(request.data.get("customer_photo", ""))
        item = None
        if item_id := str(request.data.get("item") or ""):
            item = get_object_or_404(QuoteItem, pk=int(item_id) if item_id.isdigit() else 0, quote=quote)
            customer_photo = True
        if customer_photo:
            existing = quote.attachments.filter(from_agiza=False, item=item)
            full = existing.count() >= MAX_CUSTOMER_PHOTOS
        else:
            full = quote.attachments.filter(from_agiza=True).count() >= MAX_AGIZA_PHOTOS
        if quote.status in ("approved", "cancelled") or full:
            return Response({"error": {"code": "conflict", "message": "You can't add more photos to this quotation.",
                                       "details": None}}, status=status.HTTP_409_CONFLICT)
        upload = request.FILES.get("file")
        content_type = validate_upload(upload, allowed=IMAGE_TYPES)
        photo = QuoteAttachment.objects.create(quote=quote, file=upload, content_type=content_type,
                                               from_agiza=not customer_photo, item=item,
                                               uploaded_by=request.user if customer_photo else None)
        record_audit(action="update", request=request, instance=quote, changes={"photo": [None, photo.pk]})
        return self._respond_with(quote)

    @action(detail=True, methods=["delete"], url_path=r"photos/(?P<photo_id>\d+)")
    def remove_photo(self, request, pk=None, photo_id=None):
        """Remove a photo staff attached (the customer's own photos from the app stay)."""
        quote = self.get_object()
        if quote.status in ("approved", "cancelled"):
            return Response({"error": {"code": "conflict", "message": "This quotation can no longer be changed.",
                                       "details": None}}, status=status.HTTP_409_CONFLICT)
        photo = get_object_or_404(QuoteAttachment.objects.filter(Q(from_agiza=True) | Q(uploaded_by__isnull=False)),
                                  pk=photo_id, quote=quote)
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
