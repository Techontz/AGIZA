import django_filters
from django.db.models import Count, Q
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.constants import Module, StaffLevel
from apps.accounts.models import User
from apps.accounts.permissions import HasModulePermission
from apps.core.audit import diff, record_audit, snapshot
from apps.core.exceptions import ConflictError
from apps.core.uploads import IMAGE_TYPES, file_response, validate_upload
from apps.core.workflow import run

from . import services
from .models import CLOSED, Delivery, DeliveryPhoto, DeliveryProof, DeliveryStatus
from .serializers import (
    AssignDriverSerializer,
    CompleteSerializer,
    DeliveryCreateSerializer,
    DeliverySerializer,
    DeliveryTransitionSerializer,
    DeliveryUpdateSerializer,
    DeliveryEventSerializer,
)

D = DeliveryStatus
SOURCE_TYPES = {"international": ["international"], "shop": ["shop"], "local_delivery": ["express", "equipment"]}
COMPLETED_TAB = [D.DELIVERED, D.FAILED, D.RETURNED, D.CANCELLED]


def is_driver(user) -> bool:
    return getattr(user, "staff_level", None) == StaffLevel.DRIVER and not user.is_top_admin


def no_drivers(user, what: str):
    if is_driver(user):
        raise PermissionDenied(f"Drivers can't {what}.")


def scoped(qs, user):
    """Drivers only ever see the deliveries assigned to them."""
    if is_driver(user):
        return qs.filter(driver=user)
    return qs


class DeliveryFilter(django_filters.FilterSet):
    tab = django_filters.ChoiceFilter(choices=[("pending", "Pending"), ("completed", "Completed/Failed")],
                                      method="filter_tab")
    status = django_filters.BaseInFilter(field_name="status")
    driver = django_filters.NumberFilter(field_name="driver_id")
    source = django_filters.ChoiceFilter(choices=[(k, k) for k in SOURCE_TYPES], method="filter_source")
    order = django_filters.NumberFilter(field_name="order_id")
    exception = django_filters.CharFilter(method="filter_exception")

    class Meta:
        model = Delivery
        fields = ["tab", "status", "driver", "source", "order", "delivery_type", "exception"]

    def filter_tab(self, qs, name, value):
        return qs.filter(status__in=COMPLETED_TAB) if value == "completed" else qs.exclude(status__in=COMPLETED_TAB)

    def filter_source(self, qs, name, value):
        return qs.filter(order__order_type__in=SOURCE_TYPES[value])

    def filter_exception(self, qs, name, value):
        return qs.exclude(exception_flag="") if value == "any" else qs.filter(exception_flag=value)


@extend_schema(tags=["deliveries"])
class DeliveryViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
                      mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """Last-mile deliveries. Drivers see (and act on) only their own deliveries."""

    module = Module.DELIVERIES
    permission_classes = [HasModulePermission]
    serializer_class = DeliverySerializer
    filterset_class = DeliveryFilter
    search_fields = ["reference", "order__reference", "order__customer__full_name", "delivery_address",
                     "destination_area"]
    ordering_fields = ["created_at", "updated_at", "scheduled_at"]
    http_method_names = ["get", "post", "patch", "head", "options"]
    required_access = {"events": "view"}

    def get_queryset(self):
        qs = (
            Delivery.objects.select_related("order", "order__customer", "driver", "destination_city",
                                            "pickup_warehouse", "proof", "proof__recorded_by")
            .prefetch_related("photos")
            .order_by("-updated_at", "-id")
        )
        return scoped(qs, self.request.user)

    def _respond(self, delivery, code=status.HTTP_200_OK):
        return Response(DeliverySerializer(self.get_queryset().get(pk=delivery.pk)).data, status=code)

    @extend_schema(request=DeliveryCreateSerializer, responses={201: DeliverySerializer})
    def create(self, request, *args, **kwargs):
        no_drivers(request.user, "create deliveries")
        s = DeliveryCreateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        data = dict(s.validated_data)
        driver = data.pop("driver", None)
        order = data.pop("order")
        if order.order_type == "express":
            raise ConflictError("Express deliveries are created by assigning a driver in Express Delivery.")
        delivery = run(services.create_delivery, order, user=request.user, request=request, **data)
        if driver:
            delivery = run(services.assign_driver, delivery, driver, user=request.user, request=request)
        return self._respond(delivery, status.HTTP_201_CREATED)

    @extend_schema(request=DeliveryUpdateSerializer)
    def partial_update(self, request, *args, **kwargs):
        delivery = self.get_object()
        s = DeliveryUpdateSerializer(data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        data = s.validated_data
        if delivery.status in CLOSED and set(data) - {"notes", "exception_flag"}:
            raise ConflictError("Only notes can change on a closed delivery.")
        before = snapshot(delivery)
        for key, value in data.items():
            setattr(delivery, key, value)
        delivery.save()
        changes = diff(before, snapshot(delivery))
        if changes:
            record_audit(action="update", request=request, instance=delivery, changes=changes)
        return self._respond(delivery)

    def update(self, request, *args, **kwargs):
        return self.partial_update(request, *args, **kwargs)

    @extend_schema(request=AssignDriverSerializer)
    @action(detail=True, methods=["post"], url_path="assign-driver")
    def assign_driver(self, request, pk=None):
        no_drivers(request.user, "assign drivers")
        s = AssignDriverSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        data = s.validated_data
        delivery = run(services.assign_driver, self.get_object(), data["driver"], user=request.user,
                       scheduled_at=data.get("scheduled_at"), note=data["note"], request=request)
        return self._respond(delivery)

    @extend_schema(request=DeliveryTransitionSerializer)
    @action(detail=True, methods=["post"])
    def transition(self, request, pk=None):
        s = DeliveryTransitionSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        data = s.validated_data
        delivery = run(services.transition, self.get_object(), data["status"], user=request.user, note=data["note"],
                       exception_flag=data.get("exception_flag"), scheduled_at=data.get("scheduled_at"),
                       request=request)
        return self._respond(delivery)

    def _files(self, request):
        signature = request.FILES.get("signature_image")
        sig_type = validate_upload(signature, field="signature_image", allowed=IMAGE_TYPES) if signature else ""
        photos = request.FILES.getlist("photos")
        if len(photos) > 6:
            raise ValidationError({"photos": ["Attach at most 6 photos."]})
        return signature, sig_type, [(p, validate_upload(p, field="photos", allowed=IMAGE_TYPES)) for p in photos]

    @extend_schema(request={"multipart/form-data": CompleteSerializer})
    @action(detail=True, methods=["post"], parser_classes=[MultiPartParser, FormParser, JSONParser])
    def complete(self, request, pk=None):
        """Mark delivered with proof of delivery (recipient name, optional signature image and photos)."""
        delivery = self.get_object()
        s = CompleteSerializer(data={k: v for k, v in request.data.items() if k not in ("photos", "signature_image")})
        s.is_valid(raise_exception=True)
        signature, sig_type, photos = self._files(request)
        delivery = run(services.complete, delivery, user=request.user, request=request,
                       signature_name=s.validated_data["signature_name"], notes=s.validated_data["notes"],
                       completed_at=s.validated_data.get("completed_at"), signature_image=signature,
                       signature_content_type=sig_type, photos=photos)
        return self._respond(delivery)

    @action(detail=True, methods=["post"], parser_classes=[MultiPartParser, FormParser, JSONParser])
    def proof(self, request, pk=None):
        """Add photos (and the recipient, if missing) to a delivery marked delivered elsewhere."""
        delivery = self.get_object()
        _, _, photos = self._files(request)
        run(services.add_proof, delivery, user=request.user, photos=photos,
            signature_name=request.data.get("signature_name", ""), notes=request.data.get("notes", ""),
            request=request)
        return self._respond(delivery)

    @extend_schema(responses=DeliveryEventSerializer(many=True))
    @action(detail=True)
    def events(self, request, pk=None):
        rows = self.get_object().events.select_related("changed_by")
        return Response(DeliveryEventSerializer(rows, many=True).data)

    @action(detail=False)
    def stats(self, request):
        qs = scoped(Delivery.objects.all(), request.user)
        today = timezone.localdate()
        return Response(qs.aggregate(
            pending=Count("id", filter=~Q(status__in=COMPLETED_TAB)),
            completed=Count("id", filter=Q(status__in=COMPLETED_TAB)),
            out_for_delivery=Count("id", filter=Q(status=D.OUT_FOR_DELIVERY)),
            delivered_today=Count("id", filter=Q(status=D.DELIVERED, delivered_at__date=today)),
            failed_issues=Count("id", filter=Q(status=D.FAILED) | (~Q(exception_flag="") & ~Q(status__in=[
                D.DELIVERED, D.RETURNED, D.CANCELLED]))),
        ))

    @action(detail=False)
    def drivers(self, request):
        qs = User.objects.filter(is_active=True, staff_level=StaffLevel.DRIVER).order_by("full_name")
        return Response([{"id": u.id, "full_name": u.full_name, "staff_level": u.staff_level} for u in qs])


class _ProofFileView(APIView):
    module = Module.DELIVERIES
    permission_classes = [HasModulePermission]

    def _delivery(self, request, pk):
        delivery = get_object_or_404(scoped(Delivery.objects.all(), request.user), pk=pk)
        return delivery


class SignatureFileView(_ProofFileView):
    @extend_schema(tags=["deliveries"], responses={200: bytes})
    def get(self, request, pk):
        proof = get_object_or_404(DeliveryProof, delivery=self._delivery(request, pk))
        if not proof.signature_image:
            raise Http404
        return file_response(proof.signature_image, proof.signature_content_type)


class PhotoFileView(_ProofFileView):
    @extend_schema(tags=["deliveries"], responses={200: bytes})
    def get(self, request, pk):
        photo = get_object_or_404(DeliveryPhoto, pk=pk)
        self._delivery(request, photo.delivery_id)
        return file_response(photo.file, photo.content_type)
