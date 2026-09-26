import django_filters
from django.db import transaction
from django.db.models import Count, Prefetch, Q
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.constants import Module
from apps.accounts.permissions import HasModulePermission
from apps.core.audit import record_audit
from apps.core.uploads import file_response, validate_upload
from apps.core.workflow import run
from apps.orders.models import OrderAttachment

from . import services
from .models import CargoParcel, ParcelStage, Shipment, ShipmentDocument, ShipmentEvent, ShipmentStatus
from .serializers import (
    DocumentSerializer,
    ShipmentEventSerializer,
    ParcelSerializer,
    ParcelsSerializer,
    ParcelUpdateSerializer,
    ReceiveSerializer,
    RemoveParcelSerializer,
    ShipmentCreateSerializer,
    ShipmentSerializer,
    ShipmentTransitionSerializer,
    ShipmentUpdateSerializer,
    TrackingUpdateSerializer,
)

METHOD_CATEGORIES = {"air-cargo": ["air"], "sea": ["sea"], "road": ["land", "local"]}


class ParcelFilter(django_filters.FilterSet):
    stage = django_filters.BaseInFilter(field_name="stage")
    origin = django_filters.CharFilter(field_name="order__international__source_country__iso2", lookup_expr="iexact")
    shipper = django_filters.NumberFilter(field_name="shipper_id")
    method = django_filters.CharFilter(method="filter_method")
    source = django_filters.CharFilter(field_name="source")

    class Meta:
        model = CargoParcel
        fields = ["stage", "origin", "shipper", "method", "source"]

    def filter_method(self, qs, name, value):
        return qs.filter(shipping_method__category__in=METHOD_CATEGORIES.get(value, [value]))


@extend_schema(tags=["shipping"])
class ParcelViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin,
                    viewsets.GenericViewSet):
    """Goods of international orders at the consolidation warehouse (Waiting to Receive / Ready for Shipment)."""

    module = Module.SHIPPING
    permission_classes = [HasModulePermission]
    serializer_class = ParcelSerializer
    filterset_class = ParcelFilter
    search_fields = ["order__reference", "supplier_tracking_number", "item_name", "order__customer__full_name"]
    ordering_fields = ["created_at", "received_at", "estimated_arrival", "weight_kg"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        return (
            CargoParcel.objects.exclude(stage=ParcelStage.CANCELLED)
            .select_related("order", "order__customer", "order__international",
                            "order__international__source_country", "shipper", "shipping_method", "warehouse",
                            "destination_city", "destination_city__country", "shipment")
            .prefetch_related(Prefetch("order__attachments", queryset=OrderAttachment.objects.order_by("id")),
                              "order__payments")
            .order_by("-updated_at", "-id")
        )

    def _respond(self, parcel):
        return Response(ParcelSerializer(self.get_queryset().get(pk=parcel.pk)).data)

    @extend_schema(request=ParcelUpdateSerializer)
    def partial_update(self, request, *args, **kwargs):
        s = ParcelUpdateSerializer(data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        parcel = run(services.update_parcel, self.get_object(), user=request.user, request=request,
                     **s.validated_data)
        return self._respond(parcel)

    def update(self, request, *args, **kwargs):
        return self.partial_update(request, *args, **kwargs)

    @extend_schema(request=ReceiveSerializer)
    @action(detail=True, methods=["post"])
    def receive(self, request, pk=None):
        s = ReceiveSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        parcel = run(services.receive_parcel, self.get_object(), user=request.user, request=request,
                     **s.validated_data)
        return self._respond(parcel)


class ShipmentFilter(django_filters.FilterSet):
    status = django_filters.BaseInFilter(field_name="status")
    shipper = django_filters.NumberFilter(field_name="shipper_id")
    origin = django_filters.CharFilter(field_name="origin_country__iso2", lookup_expr="iexact")
    method = django_filters.CharFilter(method="filter_method")
    alert = django_filters.CharFilter(method="filter_alert")

    class Meta:
        model = Shipment
        fields = ["status", "shipper", "origin", "method", "alert"]

    def filter_method(self, qs, name, value):
        return qs.filter(shipping_method__category__in=METHOD_CATEGORIES.get(value, [value]))

    def filter_alert(self, qs, name, value):
        if value == "any":
            return qs.exclude(alert="")
        if value == "none":
            return qs.filter(alert="")
        return qs.filter(alert=value)


@extend_schema(tags=["shipping"])
class ShipmentViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
                      mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """Consolidated shipments with milestones, tracking events and documents."""

    module = Module.SHIPPING
    permission_classes = [HasModulePermission]
    serializer_class = ShipmentSerializer
    filterset_class = ShipmentFilter
    search_fields = ["cargo_id", "shipment_number", "master_tracking_number", "parcels__order__reference",
                     "shipper__name"]
    ordering_fields = ["created_at", "updated_at", "eta"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        parcels = CargoParcel.objects.select_related("order", "order__customer").order_by("id")
        return (
            Shipment.objects.select_related("shipper", "shipping_method", "origin_country", "origin_warehouse",
                                            "destination_city", "destination_city__country")
            .prefetch_related(Prefetch("parcels", queryset=parcels), "documents",
                              Prefetch("events", queryset=ShipmentEvent.objects.order_by("occurred_at", "id")))
            .distinct()
            .order_by("-created_at", "-id")
        )

    def _respond(self, shipment, code=status.HTTP_200_OK):
        return Response(ShipmentSerializer(self.get_queryset().get(pk=shipment.pk)).data, status=code)

    @extend_schema(request=ShipmentCreateSerializer, responses={201: ShipmentSerializer})
    def create(self, request, *args, **kwargs):
        s = ShipmentCreateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        shipment = run(services.create_shipment, user=request.user, request=request, **s.validated_data)
        return self._respond(shipment, status.HTTP_201_CREATED)

    @extend_schema(request=ShipmentUpdateSerializer)
    @transaction.atomic
    def partial_update(self, request, *args, **kwargs):
        shipment = self.get_object()
        s = ShipmentUpdateSerializer(data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        data = dict(s.validated_data)
        alert_note = data.pop("alert_note", "")
        if "alert" in data:
            run(services.set_alert, shipment, data.pop("alert"), user=request.user, note=alert_note, request=request)
            shipment.refresh_from_db()
        changes = {}
        for key, value in data.items():
            before = getattr(shipment, key)
            if before != value:
                changes[key] = [str(before) if before is not None else None, str(value) if value is not None else None]
                setattr(shipment, key, value)
        if changes:
            shipment.save()
            if "eta" in changes:
                ShipmentEvent.objects.create(shipment=shipment, kind=ShipmentEvent.Kind.UPDATE,
                                             description=f"ETA changed to {data['eta'] or '—'}",
                                             occurred_at=shipment.updated_at, created_by=request.user)
            record_audit(action="update", request=request, instance=shipment, changes=changes)
        return self._respond(shipment)

    def update(self, request, *args, **kwargs):
        return self.partial_update(request, *args, **kwargs)

    @extend_schema(request=ParcelsSerializer)
    @action(detail=True, methods=["post"], url_path="add-parcels")
    def add_parcels(self, request, pk=None):
        s = ParcelsSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        shipment = run(services.add_parcels, self.get_object(), s.validated_data["parcels"], user=request.user,
                       request=request)
        return self._respond(shipment)

    @extend_schema(request=RemoveParcelSerializer)
    @action(detail=True, methods=["post"], url_path="remove-parcel")
    def remove_parcel(self, request, pk=None):
        s = RemoveParcelSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        shipment = run(services.remove_parcel, self.get_object(), s.validated_data["parcel"], user=request.user,
                       request=request)
        return self._respond(shipment)

    @extend_schema(request=ShipmentTransitionSerializer)
    @action(detail=True, methods=["post"])
    def transition(self, request, pk=None):
        s = ShipmentTransitionSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        data = s.validated_data
        shipment = run(services.transition, self.get_object(), data["status"], user=request.user, note=data["note"],
                       location=data["location"], occurred_at=data.get("occurred_at"), request=request)
        return self._respond(shipment)

    @extend_schema(request=TrackingUpdateSerializer, responses=ShipmentEventSerializer(many=True))
    @action(detail=True, methods=["get", "post"])
    def events(self, request, pk=None):
        shipment = self.get_object()
        if request.method == "POST":
            s = TrackingUpdateSerializer(data=request.data)
            s.is_valid(raise_exception=True)
            run(services.add_tracking_update, shipment, user=request.user, request=request, **s.validated_data)
        rows = shipment.events.select_related("created_by").order_by("occurred_at", "id")
        return Response(ShipmentEventSerializer(rows, many=True).data, status=201 if request.method == "POST" else 200)

    @extend_schema(responses=DocumentSerializer(many=True))
    @action(detail=True, methods=["get", "post"], parser_classes=[MultiPartParser, FormParser, JSONParser])
    def documents(self, request, pk=None):
        shipment = self.get_object()
        if request.method == "POST":
            upload = request.FILES.get("file")
            ctype = validate_upload(upload)
            name = (request.data.get("name") or upload.name)[:160]
            doc = ShipmentDocument.objects.create(shipment=shipment, file=upload, name=name, content_type=ctype,
                                                  notes=(request.data.get("notes") or "")[:255],
                                                  uploaded_by=request.user)
            ShipmentEvent.objects.create(shipment=shipment, kind=ShipmentEvent.Kind.UPDATE,
                                         description=f"Document added: {name}", occurred_at=doc.created_at,
                                         created_by=request.user)
            record_audit(action="create", request=request, instance=doc, changes={"shipment": [None, shipment.cargo_id]})
        return Response(DocumentSerializer(ShipmentDocument.objects.filter(shipment=shipment), many=True).data,
                        status=201 if request.method == "POST" else 200)

    @action(detail=False)
    def stats(self, request):
        shipments = Shipment.objects.aggregate(
            total=Count("id", filter=~Q(status=ShipmentStatus.CANCELLED)),
            active=Count("id", filter=~Q(status__in=[ShipmentStatus.COMPLETED, ShipmentStatus.CANCELLED])),
            in_transit=Count("id", filter=Q(status=ShipmentStatus.SHIPPING_TO_DESTINATION)),
            alerts=Count("id", filter=~Q(alert="") & ~Q(status__in=[ShipmentStatus.COMPLETED,
                                                                     ShipmentStatus.CANCELLED])),
        )
        parcels = CargoParcel.objects.aggregate(
            ready=Count("id", filter=Q(stage=ParcelStage.READY)),
            waiting=Count("id", filter=Q(stage=ParcelStage.WAITING)),
        )
        return Response({**shipments, **parcels})


class DocumentFileView(APIView):
    module = Module.SHIPPING
    permission_classes = [HasModulePermission]

    @extend_schema(tags=["shipping"], responses={200: bytes})
    def get(self, request, pk):
        doc = get_object_or_404(ShipmentDocument, pk=pk)
        return file_response(doc.file, doc.content_type)
