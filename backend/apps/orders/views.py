from decimal import Decimal

import django_filters
from django.db.models import Count, F, Prefetch, Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.constants import Access, Module, StaffLevel
from apps.accounts.models import User
from apps.accounts.permissions import HasModulePermission, has_access
from apps.core.audit import diff, record_audit, snapshot
from apps.core.exceptions import ConflictError
from apps.core.uploads import file_response, validate_upload
from apps.core.workflow import run
from apps.shipping_engine.calculator import RateCalculationError, RateCalculator, Shipment
from apps.shipping_engine.models import ShippingMethod

from . import services, shop
from .models import Order, OrderAttachment, OrderItem, OrderStatusHistory, PackageSize, ShopDetails
from .serializers import (
    AssignSerializer,
    AttachmentSerializer,
    CancelSerializer,
    DeliveryFeeSerializer,
    EquipmentCreateSerializer,
    EquipmentOrderSerializer,
    EquipmentUpdateSerializer,
    ExpectedDateSerializer,
    ExpressCreateSerializer,
    ExpressOrderSerializer,
    ExpressQuoteSerializer,
    ExpressUpdateSerializer,
    HistorySerializer,
    InternationalCreateSerializer,
    InternationalOrderSerializer,
    InternationalUpdateSerializer,
    PackageSizeSerializer,
    PaymentSerializer,
    QuoteStatusSerializer,
    RecordPaymentSerializer,
    ShipSerializer,
    ShopCreateSerializer,
    ShopNotesSerializer,
    ShopOrderSerializer,
    SuggestPriceSerializer,
    TransitionSerializer,
)
from .workflows import EXPRESS_STAGE, OrderType

# Typical weight used for a price suggestion when only the package size is known.
SIZE_WEIGHT_KG = {PackageSize.SMALL: Decimal("5"), PackageSize.MEDIUM: Decimal("15"), PackageSize.LARGE: Decimal("30")}


class OrderFilter(django_filters.FilterSet):
    status = django_filters.BaseInFilter(field_name="status")
    customer = django_filters.NumberFilter(field_name="customer_id")
    handler = django_filters.NumberFilter(field_name="handler_id")
    created_from = django_filters.DateFilter(field_name="created_at", lookup_expr="date__gte")
    created_to = django_filters.DateFilter(field_name="created_at", lookup_expr="date__lte")

    class Meta:
        model = Order
        fields = ["status", "department", "customer", "handler", "created_from", "created_to"]


class BaseOrderViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
                       mixins.UpdateModelMixin, viewsets.GenericViewSet):
    module = Module.ORDERS
    permission_classes = [HasModulePermission]
    # Deliveries, Returns, Tasks, Finance and Chat staff look orders up (pickers, linked items).
    read_modules = (Module.DELIVERIES, Module.RETURNS, Module.TASKS, Module.FINANCE, Module.CHAT)
    order_type: OrderType
    detail_relation: str
    create_serializer = None
    update_serializer = None
    filterset_class = OrderFilter
    search_fields = ["reference", "item_details", "customer__full_name", "customer__phone", "customer__reference"]
    ordering_fields = ["created_at", "updated_at", "total_amount", "reference"]
    http_method_names = ["get", "post", "patch", "head", "options"]
    # Reads are "view" by default; uploads (attachments POST) need "edit". Payments POST
    # is checked inside the action (Finance edit or Orders manage).
    required_access = {"payments": "view", "suggest_price": "view"}

    def get_queryset(self):
        qs = (
            Order.objects.filter(order_type=self.order_type)
            .select_related("customer", "handler", "source_quote", *self.detail_select)
            .annotate(attachments_count=Count("attachments", distinct=True))
            .order_by("-created_at", "-id")
        )
        return services.with_paid_total(qs)

    detail_select: tuple[str, ...] = ()

    def get_serializer_class(self):
        if self.action == "create":
            return self.create_serializer
        if self.action in ("update", "partial_update"):
            return self.update_serializer
        return self.serializer_class

    # ---- create / update ------------------------------------------------- #
    def create(self, request, *args, **kwargs):
        s = self.get_serializer(data=request.data)
        s.is_valid(raise_exception=True)
        data = dict(s.validated_data)
        details = {k: data.pop(k) for k in s.DETAIL_FIELDS if k in data}
        if "package_size" in data:
            size = data.pop("package_size")
            details.update(package_size=size, customer_package_size=size)
        order = run(services.create_order, self.order_type, user=request.user, request=request,
                    customer=data.pop("customer"), item_details=data.pop("item_details"), details=details, **data)
        return Response(self.serializer_class(self.get_queryset().get(pk=order.pk)).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        order = self.get_object()
        s = self.get_serializer(data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        data = dict(s.validated_data)
        if order.status in ("delivered", "completed", "cancelled") and set(data) - {"notes"}:
            raise ConflictError("Closed orders can only have their notes changed.")
        details_obj = getattr(order, self.detail_relation)
        before = {**snapshot(order), **{f"details.{k}": v for k, v in snapshot(details_obj).items()}}
        for key, value in data.items():
            target = order if hasattr(Order, key) and key not in self.detail_only_fields else details_obj
            setattr(target, key, value)
        order.save()
        details_obj.save()
        after = {**snapshot(order), **{f"details.{k}": v for k, v in snapshot(details_obj).items()}}
        changes = diff(before, after)
        if changes:
            record_audit(action="update", request=request, instance=order, changes=changes)
        return Response(self.serializer_class(self.get_queryset().get(pk=order.pk)).data)

    detail_only_fields: set[str] = set()

    def update(self, request, *args, **kwargs):
        return self.partial_update(request, *args, **kwargs)

    # ---- shared actions -------------------------------------------------- #
    def _respond(self, order):
        return Response(self.serializer_class(self.get_queryset().get(pk=order.pk)).data)

    @extend_schema(request=TransitionSerializer)
    @action(detail=True, methods=["post"])
    def transition(self, request, pk=None):
        s = TransitionSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        target = s.validated_data["status"]
        if target == "cancelled" and not has_access(request.user, Module.ORDERS, Access.MANAGE):
            raise PermissionDenied("Cancelling an order requires Orders manage access.")
        order = run(services.transition, self.get_object(), target, request.user, s.validated_data["note"], request)
        return self._respond(order)

    @action(detail=True)
    def history(self, request, pk=None):
        order = self.get_object()
        rows = OrderStatusHistory.objects.filter(order=order).select_related("changed_by", "order")
        return Response(HistorySerializer(rows, many=True).data)

    @extend_schema(request=RecordPaymentSerializer, responses=PaymentSerializer(many=True))
    @action(detail=True, methods=["get", "post"])
    def payments(self, request, pk=None):
        order = self.get_object()
        if request.method == "POST":
            allowed = has_access(request.user, Module.FINANCE, Access.EDIT) or has_access(
                request.user, Module.ORDERS, Access.MANAGE
            )
            if not allowed:
                raise PermissionDenied("Recording payments requires Finance edit or Orders manage access.")
            s = RecordPaymentSerializer(data=request.data)
            s.is_valid(raise_exception=True)
            run(services.record_payment, order, user=request.user, request=request, **s.validated_data)
        rows = order.payments.select_related("recorded_by")
        return Response(PaymentSerializer(rows, many=True).data, status=201 if request.method == "POST" else 200)

    @action(detail=True, methods=["get", "post"], parser_classes=[MultiPartParser, FormParser, JSONParser])
    def attachments(self, request, pk=None):
        order = self.get_object()
        if request.method == "POST":
            upload = request.FILES.get("file")
            ctype = validate_upload(upload)
            att = OrderAttachment.objects.create(order=order, file=upload, content_type=ctype,
                                                 caption=request.data.get("caption", "")[:160], uploaded_by=request.user)
            record_audit(action="create", request=request, instance=att, changes={"order": [None, order.reference]})
        return Response(AttachmentSerializer(order.attachments.all(), many=True).data,
                        status=201 if request.method == "POST" else 200)

    @action(detail=False)
    def stats(self, request):
        return Response(self.compute_stats(Order.objects.filter(order_type=self.order_type)))

    def compute_stats(self, qs):  # pragma: no cover - overridden
        return {}

    @action(detail=False)
    def assignees(self, request):
        """People who can be assigned (drivers, technicians or handlers)."""
        qs = User.objects.filter(is_active=True).order_by("full_name")
        role = request.query_params.get("role", "handler")
        if role == "driver":
            qs = qs.filter(staff_level=StaffLevel.DRIVER)
        else:
            qs = qs.exclude(staff_level=StaffLevel.DRIVER)
        return Response([{"id": u.id, "full_name": u.full_name, "staff_level": u.staff_level} for u in qs])


# --------------------------------------------------------------------------- #
# Express
# --------------------------------------------------------------------------- #
class ExpressFilter(OrderFilter):
    stage = django_filters.ChoiceFilter(
        method="filter_stage",
        choices=[("waiting_quote", "Waiting Quote"), ("quoted", "Quoted"), ("in_progress", "In Progress")],
    )
    priority = django_filters.CharFilter(field_name="express__priority")
    driver = django_filters.NumberFilter(field_name="express__driver_id")

    def filter_stage(self, qs, name, value):
        return qs.filter(status__in=[s for s, stage in EXPRESS_STAGE.items() if stage == value])

    class Meta(OrderFilter.Meta):
        fields = [*OrderFilter.Meta.fields, "stage", "priority", "driver"]


@extend_schema(tags=["orders"])
class ExpressOrderViewSet(BaseOrderViewSet):
    order_type = OrderType.EXPRESS
    detail_relation = "express"
    detail_select = ("express__pickup_city", "express__delivery_city", "express__driver", "express__quoted_by")
    serializer_class = ExpressOrderSerializer
    create_serializer = ExpressCreateSerializer
    update_serializer = ExpressUpdateSerializer
    filterset_class = ExpressFilter
    detail_only_fields = {"pickup_address", "pickup_city", "delivery_address", "delivery_city", "priority", "weight_kg"}

    def compute_stats(self, qs):
        stages = {"waiting_quote": 0, "quoted": 0, "in_progress": 0, "delivered": 0}
        for row in qs.values("status").annotate(n=Count("id")):
            if row["status"] == "delivered":
                stages["delivered"] += row["n"]
                continue
            stage = EXPRESS_STAGE.get(row["status"])
            if stage in stages:
                stages[stage] += row["n"]
        return stages

    @extend_schema(request=ExpressQuoteSerializer)
    @action(detail=True, methods=["post"])
    def quote(self, request, pk=None):
        s = ExpressQuoteSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        order = run(services.quote_express, self.get_object(), amount=d["amount"],
                    estimated_delivery_at=d["estimated_delivery_at"], advance_required=d["advance_required"],
                    advance_amount=d.get("advance_amount"), note=d["note"], user=request.user, request=request)
        return self._respond(order)

    @extend_schema(request=QuoteStatusSerializer)
    @action(detail=True, methods=["post"], url_path="quote-status")
    def quote_status(self, request, pk=None):
        s = QuoteStatusSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        order = run(services.transition, self.get_object(), s.validated_data["status"], request.user,
                    s.validated_data["note"] or f"Customer {s.validated_data['status']} the quote", request)
        return self._respond(order)

    @extend_schema(request=AssignSerializer)
    @action(detail=True, methods=["post"], url_path="assign-driver")
    def assign_driver(self, request, pk=None):
        s = AssignSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        order = run(services.assign_driver, self.get_object(), s.validated_data["user"], request.user,
                    s.validated_data["note"], request)
        return self._respond(order)

    @extend_schema(request=PackageSizeSerializer)
    @action(detail=True, methods=["post"], url_path="package-size")
    def package_size(self, request, pk=None):
        s = PackageSizeSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        order = run(services.set_package_size, self.get_object(), s.validated_data["package_size"], request.user, request)
        return self._respond(order)

    @extend_schema(request=SuggestPriceSerializer)
    @action(detail=True, methods=["post"], url_path="suggest-price")
    def suggest_price(self, request, pk=None):
        """Ask the Shipping Engine what this delivery should cost (staff still decide the quote)."""
        order = self.get_object()
        s = SuggestPriceSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = order.express
        if not d.pickup_city_id or not d.delivery_city_id:
            raise ValidationError({"non_field_errors": ["Set the pickup and delivery cities to get a suggested price."]})
        weight = d.weight_kg or SIZE_WEIGHT_KG.get(d.package_size or d.customer_package_size)
        if not weight:
            raise ValidationError({"non_field_errors": ["Set the package weight or size to get a suggested price."]})
        method = get_object_or_404(ShippingMethod, pk=s.validated_data["method"])
        try:
            result = RateCalculator().calculate(Shipment(
                origin_country=d.pickup_city.country, origin_city=d.pickup_city,
                destination_city=d.delivery_city, method=method, weight_kg=weight,
            ))
        except RateCalculationError as exc:
            raise ValidationError({exc.field or "non_field_errors": [exc.message]}) from exc
        from apps.shipping_engine.views import jsonable

        pricing = result["pricing"] or {}
        return Response(jsonable({
            "status": result["status"],
            "message": result["message"],
            "weight_kg": weight,
            "weight_source": "declared" if d.weight_kg else "package size",
            "rule": result["rule"]["code"] if result["rule"] else None,
            "route": result["route"]["label"] if result["route"] else None,
            "total": pricing.get("total"),
            "total_display": pricing.get("total_display"),
            "estimated_delivery": result["estimated_delivery"],
        }))


# --------------------------------------------------------------------------- #
# International
# --------------------------------------------------------------------------- #
class InternationalFilter(OrderFilter):
    tab = django_filters.ChoiceFilter(method="filter_tab", choices=[("active", "Active"), ("attention", "Needs attention"),
                                                                     ("completed", "Completed")])
    origin = django_filters.CharFilter(field_name="international__source_country__iso2", lookup_expr="iexact")
    service_type = django_filters.CharFilter(field_name="international__service_type")

    ATTENTION = Q(status="issue_pending_payment") | Q(installment_plan=True, installment_allowed=False)

    def filter_tab(self, qs, name, value):
        if value == "attention":
            return qs.filter(self.ATTENTION).exclude(status__in=["completed", "cancelled"])
        if value == "completed":
            return qs.filter(status="completed")
        return qs.exclude(self.ATTENTION).exclude(status__in=["completed", "cancelled"])

    class Meta(OrderFilter.Meta):
        fields = [*OrderFilter.Meta.fields, "tab", "origin", "service_type"]


@extend_schema(tags=["orders"])
class InternationalOrderViewSet(BaseOrderViewSet):
    order_type = OrderType.INTERNATIONAL
    detail_relation = "international"
    detail_select = ("international__source_country",)
    serializer_class = InternationalOrderSerializer
    create_serializer = InternationalCreateSerializer
    update_serializer = InternationalUpdateSerializer
    filterset_class = InternationalFilter
    detail_only_fields = {"order_class", "service_type", "supplier_name", "tracking_number", "item_cost",
                          "shipping_cost", "estimated_delivery"}
    required_access = {**BaseOrderViewSet.required_access, "installment_approval": "manage"}

    def get_queryset(self):
        return super().get_queryset().prefetch_related(
            Prefetch("status_history", queryset=OrderStatusHistory.objects.select_related("changed_by"))
        )

    def compute_stats(self, qs):
        attention = InternationalFilter.ATTENTION
        open_qs = qs.exclude(status__in=["completed", "cancelled"])
        return {
            "active": open_qs.exclude(attention).count(),
            "needs_attention": open_qs.filter(attention).count(),
            "in_production": qs.filter(status="in_production").count(),
            "completed": qs.filter(status="completed").count(),
        }

    @action(detail=True, methods=["post"], url_path="installment-approval")
    def installment_approval(self, request, pk=None):
        order = self.get_object()
        allowed = bool(request.data.get("allowed"))
        if not order.installment_plan:
            raise ConflictError("This order is not on an installment plan.")
        before = order.installment_allowed
        order.installment_allowed = allowed
        order.save(update_fields=["installment_allowed", "updated_at"])
        if allowed:  # a schedule waiting for Finance is approved with the order
            from apps.finance.models import InstallmentPlan, PlanStatus

            InstallmentPlan.objects.filter(order=order, status=PlanStatus.PENDING_APPROVAL).update(
                status=PlanStatus.ACTIVE, approved_by=request.user, approved_at=timezone.now())
        services._history(order, order.status, order.status, request.user,
                          "Installments approved" if allowed else "Installment approval withdrawn")
        record_audit(action="update", request=request, instance=order, changes={"installment_allowed": [before, allowed]})
        return self._respond(order)


# --------------------------------------------------------------------------- #
# Equipment support
# --------------------------------------------------------------------------- #
class EquipmentFilter(OrderFilter):
    tab = django_filters.ChoiceFilter(method="filter_tab", choices=[("attention", "Needs attention"),
                                                                     ("progress", "In progress"), ("completed", "Completed")])
    service_type = django_filters.CharFilter(field_name="equipment__service_type")
    technician = django_filters.NumberFilter(field_name="equipment__technician_id")

    ATTENTION = Q(equipment__needs_attention=True) | Q(status="maintenance_required")

    def filter_tab(self, qs, name, value):
        if value == "attention":
            return qs.filter(self.ATTENTION).exclude(status__in=["completed", "cancelled"])
        if value == "progress":
            return qs.filter(status__in=["on_site", "in_progress", "testing"])
        return qs.filter(status="completed")

    class Meta(OrderFilter.Meta):
        fields = [*OrderFilter.Meta.fields, "tab", "service_type", "technician"]


@extend_schema(tags=["orders"])
class EquipmentOrderViewSet(BaseOrderViewSet):
    order_type = OrderType.EQUIPMENT
    detail_relation = "equipment"
    detail_select = ("equipment__city", "equipment__technician")
    serializer_class = EquipmentOrderSerializer
    create_serializer = EquipmentCreateSerializer
    update_serializer = EquipmentUpdateSerializer
    filterset_class = EquipmentFilter
    search_fields = [*BaseOrderViewSet.search_fields, "equipment__equipment"]
    detail_only_fields = {"equipment", "classification", "city", "site_address", "priority", "needs_attention"}

    def get_queryset(self):
        return super().get_queryset().prefetch_related("status_history")

    def compute_stats(self, qs):
        open_qs = qs.exclude(status__in=["completed", "cancelled"])
        return {
            "active": open_qs.count(),
            "pending_approval": qs.filter(status="pending").count(),
            "in_progress": qs.filter(status__in=["on_site", "in_progress", "testing"]).count(),
            "maintenance_alerts": open_qs.filter(EquipmentFilter.ATTENTION).count(),
        }

    @extend_schema(request=AssignSerializer)
    @action(detail=True, methods=["post"], url_path="assign-technician")
    def assign_technician(self, request, pk=None):
        s = AssignSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        order = run(services.assign_technician, self.get_object(), s.validated_data["user"], request.user,
                    s.validated_data["note"], request)
        return self._respond(order)

    @extend_schema(request=ExpectedDateSerializer)
    @action(detail=True, methods=["post"], url_path="expected-date")
    def expected_date(self, request, pk=None):
        s = ExpectedDateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        order = run(services.set_expected_date, self.get_object(), s.validated_data["expected_date"], request.user, request)
        return self._respond(order)


# --------------------------------------------------------------------------- #
# Attachment download (authenticated; never a public media URL)
# --------------------------------------------------------------------------- #
class AttachmentFileView(APIView):
    module = Module.ORDERS
    permission_classes = [HasModulePermission]

    @extend_schema(tags=["orders"], responses={200: bytes})
    def get(self, request, pk):
        att = get_object_or_404(OrderAttachment, pk=pk)
        return file_response(att.file, att.content_type)



# --------------------------------------------------------------------------- #
# E-commerce shop orders
# --------------------------------------------------------------------------- #
class ShopFilter(OrderFilter):
    payment = django_filters.ChoiceFilter(choices=[("paid", "Paid"), ("pending", "Pending")], method="filter_payment")
    channel = django_filters.ChoiceFilter(field_name="shop__channel", choices=ShopDetails.Channel.choices)
    delivery_fee_pending = django_filters.BooleanFilter(field_name="shop__delivery_fee_pending")

    def filter_payment(self, qs, name, value):
        paid = Q(paid_total__gte=F("total_amount")) & Q(total_amount__gt=0)
        return qs.filter(paid) if value == "paid" else qs.exclude(paid)

    class Meta(OrderFilter.Meta):
        fields = [*OrderFilter.Meta.fields, "payment", "channel", "delivery_fee_pending"]


@extend_schema(tags=["orders"])
class ShopOrderViewSet(BaseOrderViewSet):
    """E-commerce shop orders: lines from the catalogue, stock reserved, shipped with a delivery."""

    order_type = OrderType.SHOP
    detail_relation = "shop"
    detail_select = ("shop__city", "shop__fulfillment_warehouse", "shop__shipping_method", "shop__import_shipping_method",
                     "shop__delivery_address")
    serializer_class = ShopOrderSerializer
    create_serializer = ShopCreateSerializer
    update_serializer = ShopNotesSerializer
    filterset_class = ShopFilter
    search_fields = [*BaseOrderViewSet.search_fields, "shop__customer_email", "items__sku", "items__product_name"]
    required_access = {**BaseOrderViewSet.required_access, "cancel": "manage", "delivery_fee": "edit"}

    def get_queryset(self):
        return super().get_queryset().prefetch_related(
            Prefetch("items", queryset=OrderItem.objects.select_related("warehouse", "variant")), "deliveries",
        ).distinct()

    @extend_schema(request=ShopCreateSerializer, responses={201: ShopOrderSerializer})
    def create(self, request, *args, **kwargs):
        s = ShopCreateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        order = run(shop.create_shop_order, user=request.user, request=request, **s.validated_data)
        return Response(ShopOrderSerializer(self.get_queryset().get(pk=order.pk)).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=ShopNotesSerializer, responses=ShopOrderSerializer)
    def partial_update(self, request, *args, **kwargs):
        order = self.get_object()
        if set(request.data) - {"notes"}:
            raise ValidationError({"notes": ["Only notes can be edited on a shop order."]})
        s = ShopNotesSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        notes = s.validated_data["notes"]
        before = order.notes
        order.notes = notes
        order.save(update_fields=["notes", "updated_at"])
        record_audit(action="update", request=request, instance=order, changes={"notes": [before, notes]})
        return self._respond(order)

    def compute_stats(self, qs):
        live = qs.exclude(status="cancelled")
        return {
            "pending": qs.filter(status="pending").count(),
            "processing": qs.filter(status="processing").count(),
            "shipped": qs.filter(status="shipped").count(),
            "delivered": qs.filter(status="delivered").count(),
            "delivery_fee_pending": live.filter(shop__delivery_fee_pending=True).count(),
            "revenue": f"{live.aggregate(s=Sum('total_amount'))['s'] or 0:.2f}",
        }

    @extend_schema(request=ShipSerializer)
    @action(detail=True, methods=["post"])
    def ship(self, request, pk=None):
        s = ShipSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        order = run(shop.ship, self.get_object(), user=request.user, request=request, **s.validated_data)
        return self._respond(order)

    @extend_schema(request=CancelSerializer)
    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        s = CancelSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        order = run(shop.cancel, self.get_object(), user=request.user, reason=s.validated_data["reason"],
                    request=request)
        return self._respond(order)

    @extend_schema(request=DeliveryFeeSerializer, responses=ShopOrderSerializer)
    @action(detail=True, methods=["post"], url_path="delivery-fee")
    def delivery_fee(self, request, pk=None):
        """Set the delivery cost of an order placed while it needed a manual quote; the customer can then pay."""
        s = DeliveryFeeSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        data = s.validated_data
        order = run(shop.set_delivery_fee, self.get_object(), user=request.user, request=request,
                    fee=data["delivery_fee"], shipping_method=data["shipping_method"],
                    estimated_delivery=data["estimated_delivery"], note=data["note"])
        return self._respond(order)
