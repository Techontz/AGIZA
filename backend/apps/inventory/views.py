import django_filters
from django.db.models import Count, F, Q
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.constants import Module
from apps.accounts.permissions import HasModulePermission
from apps.catalog.models import ProductVariant
from apps.core.audit import diff, record_audit, snapshot
from apps.core.workflow import run
from apps.locations.models import Warehouse
from apps.orders.serializers import _dec, _person

from . import services
from .models import StockItem, StockMovement

STATUS_LABELS = {"in_stock": "In Stock", "low_stock": "Low Stock", "out_of_stock": "Out of Stock",
                 "reserved": "Reserved"}


class StockItemSerializer(serializers.ModelSerializer):
    sku = serializers.CharField(source="variant.sku", read_only=True)
    product = serializers.SerializerMethodField()
    category = serializers.SerializerMethodField()
    warehouse = serializers.SerializerMethodField()
    available = serializers.IntegerField(read_only=True)
    status = serializers.SerializerMethodField()
    status_display = serializers.SerializerMethodField()
    origin = serializers.SerializerMethodField()
    price = serializers.SerializerMethodField()

    class Meta:
        model = StockItem
        fields = ["id", "sku", "product", "category", "warehouse", "bin_code", "quantity", "reserved", "available",
                  "status", "status_display", "origin", "listed", "shop_price", "price", "updated_at"]

    def get_product(self, obj) -> dict:
        v = obj.variant
        return {"id": v.product_id, "variant_id": v.id,
                "name": v.product.name if v.is_default else f"{v.product.name} — {v.name}"}

    def get_category(self, obj) -> str:
        return obj.variant.product.category.name

    def get_warehouse(self, obj) -> dict:
        w = obj.warehouse
        return {"id": w.id, "code": w.code, "name": w.name, "type": w.type, "city": w.city.name}

    def _status(self, obj) -> str:
        return services.stock_status(obj, obj.variant.product.low_stock_threshold)

    def get_status(self, obj) -> str:
        if obj.warehouse.type == Warehouse.Type.SHOP:
            if obj.quantity <= 0:
                return "out_of_stock"
            return "listed" if obj.listed else "hidden"
        return self._status(obj)

    def get_status_display(self, obj) -> str:
        return {**STATUS_LABELS, "listed": "Listed", "hidden": "Hidden"}[self.get_status(obj)]

    def get_origin(self, obj) -> str | None:
        p = obj.variant.product
        return p.origin_country.display_name if p.origin_country_id else None

    def get_price(self, obj) -> str:
        return _dec(obj.shop_price if obj.shop_price is not None else obj.variant.effective_price)


class MovementSerializer(serializers.ModelSerializer):
    kind_display = serializers.CharField(source="get_kind_display", read_only=True)
    created_by = serializers.SerializerMethodField()
    order = serializers.CharField(source="order.reference", read_only=True, default=None)

    class Meta:
        model = StockMovement
        fields = ["id", "kind", "kind_display", "quantity_change", "reserved_change", "quantity_after",
                  "reserved_after", "order", "note", "created_by", "created_at"]

    def get_created_by(self, obj) -> dict | None:
        return _person(obj.created_by)


class StockReceiveSerializer(serializers.Serializer):
    variant = serializers.PrimaryKeyRelatedField(queryset=ProductVariant.objects.select_related("product"))
    warehouse = serializers.PrimaryKeyRelatedField(queryset=Warehouse.objects.all())
    quantity = serializers.IntegerField(min_value=1)
    bin_code = serializers.CharField(max_length=60, required=False, allow_blank=True, default="")
    note = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")


class StockAdjustSerializer(serializers.Serializer):
    new_quantity = serializers.IntegerField(min_value=0)
    reason = serializers.CharField(max_length=255)


class TransferSerializer(serializers.Serializer):
    to_warehouse = serializers.PrimaryKeyRelatedField(queryset=Warehouse.objects.all())
    quantity = serializers.IntegerField(min_value=1)
    bin_code = serializers.CharField(max_length=60, required=False, allow_blank=True, default="")


class StockUpdateSerializer(serializers.Serializer):
    bin_code = serializers.CharField(max_length=60, required=False, allow_blank=True)
    listed = serializers.BooleanField(required=False)
    shop_price = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=0, required=False,
                                          allow_null=True)


class StockFilter(django_filters.FilterSet):
    floor = django_filters.ChoiceFilter(choices=[("warehouse", "Warehouse inventory"), ("shop", "Shop floor")],
                                        method="filter_floor")
    status = django_filters.ChoiceFilter(
        choices=[(k, v) for k, v in STATUS_LABELS.items()] + [("listed", "Listed"), ("hidden", "Hidden")],
        method="filter_status")
    warehouse = django_filters.NumberFilter(field_name="warehouse_id")
    product = django_filters.NumberFilter(field_name="variant__product_id")
    country = django_filters.CharFilter(field_name="warehouse__country__iso2", lookup_expr="iexact")

    class Meta:
        model = StockItem
        fields = ["floor", "status", "warehouse", "product", "country"]

    def filter_floor(self, qs, name, value):
        return qs.filter(warehouse__type=Warehouse.Type.SHOP) if value == "shop" else qs.exclude(
            warehouse__type=Warehouse.Type.SHOP)

    def filter_status(self, qs, name, value):
        low = F("variant__product__low_stock_threshold")
        avail = F("quantity") - F("reserved")
        return {
            "out_of_stock": qs.filter(quantity__lte=0),
            "reserved": qs.filter(quantity__gt=0, reserved__gte=F("quantity")),
            "low_stock": qs.alias(a=avail).filter(quantity__gt=0, a__gt=0, a__lte=low),
            "in_stock": qs.alias(a=avail).filter(a__gt=low),
            "listed": qs.filter(listed=True, quantity__gt=0),
            "hidden": qs.filter(listed=False, quantity__gt=0),
        }[value]


@extend_schema(tags=["inventory"])
class StockViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin,
                   viewsets.GenericViewSet):
    """Stock per SKU and location (Inventory tab) and at shops (Shop Floor tab)."""

    module = Module.WAREHOUSE
    permission_classes = [HasModulePermission]
    read_modules = (Module.ECOMMERCE, Module.ORDERS)
    serializer_class = StockItemSerializer
    filterset_class = StockFilter
    search_fields = ["variant__sku", "variant__product__name", "bin_code", "warehouse__name", "warehouse__code"]
    ordering_fields = ["quantity", "updated_at", "variant__sku"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        return (StockItem.objects.select_related("variant__product__category", "variant__product__origin_country",
                                                 "warehouse__city")
                .order_by("warehouse__code", "variant__sku", "id"))

    def _respond(self, item, code=status.HTTP_200_OK):
        return Response(StockItemSerializer(self.get_queryset().get(pk=item.pk)).data, status=code)

    @extend_schema(request=StockUpdateSerializer)
    def partial_update(self, request, *args, **kwargs):
        item = self.get_object()
        s = StockUpdateSerializer(data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        before = snapshot(item)
        for key, value in s.validated_data.items():
            setattr(item, key, value)
        item.save()
        changes = diff(before, snapshot(item))
        if changes:
            record_audit(action="update", request=request, instance=item, changes=changes)
        return self._respond(item)

    def update(self, request, *args, **kwargs):
        return self.partial_update(request, *args, **kwargs)

    @extend_schema(request=StockReceiveSerializer, responses={201: StockItemSerializer})
    @action(detail=False, methods=["post"])
    def receive(self, request):
        s = StockReceiveSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        item = run(services.receive, d["variant"], d["warehouse"], d["quantity"], user=request.user,
                   bin_code=d["bin_code"], note=d["note"], request=request)
        return self._respond(item, status.HTTP_201_CREATED)

    @extend_schema(request=StockAdjustSerializer)
    @action(detail=True, methods=["post"])
    def adjust(self, request, pk=None):
        s = StockAdjustSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        item = run(services.adjust, self.get_object(), user=request.user, request=request, **s.validated_data)
        return self._respond(item)

    @extend_schema(request=TransferSerializer, responses=StockItemSerializer)
    @action(detail=True, methods=["post"])
    def transfer(self, request, pk=None):
        s = TransferSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        target = run(services.transfer, self.get_object(), d["to_warehouse"], d["quantity"], user=request.user,
                     bin_code=d["bin_code"], request=request)
        return self._respond(target)

    @extend_schema(responses=MovementSerializer(many=True))
    @action(detail=True)
    def movements(self, request, pk=None):
        rows = self.get_object().movements.select_related("created_by", "order")[:100]
        return Response(MovementSerializer(rows, many=True).data)

    @action(detail=False)
    def stats(self, request):
        warehouse = StockItem.objects.exclude(warehouse__type=Warehouse.Type.SHOP)
        low = F("variant__product__low_stock_threshold")
        return Response({
            **warehouse.aggregate(
                total_skus=Count("variant", distinct=True),
                out_of_stock=Count("id", filter=Q(quantity__lte=0)),
                reserved=Count("id", filter=Q(quantity__gt=0, reserved__gte=F("quantity"))),
            ),
            "in_stock": warehouse.alias(a=F("quantity") - F("reserved")).filter(a__gt=low).count(),
            "low_stock": warehouse.alias(a=F("quantity") - F("reserved")).filter(quantity__gt=0, a__gt=0,
                                                                                a__lte=low).count(),
            "shop_items": StockItem.objects.filter(warehouse__type=Warehouse.Type.SHOP).count(),
        })
