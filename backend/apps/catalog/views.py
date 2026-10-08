import django_filters
from django.db import transaction
from django.db.models import Count, DecimalField, F, IntegerField, OuterRef, Prefetch, Q, Subquery, Sum
from django.db.models.functions import Coalesce
from django.http import Http404
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.constants import Module, StaffLevel
from apps.accounts.permissions import HasModulePermission, has_access
from apps.core.audit import AuditedViewSetMixin, record_audit
from apps.core.exceptions import ConflictError
from apps.core.uploads import IMAGE_TYPES, file_response, validate_upload
from apps.core.workflow import run
from apps.inventory.models import StockItem
from apps.orders.models import OrderItem

from . import services
from .models import (
    Brand,
    Category,
    DeliveryEstimateRoute,
    HomeSection,
    Label,
    MobileSlider,
    OriginEstimate,
    Product,
    ProductImage,
    ProductOption,
    ProductOptionValue,
    ProductStatus,
    ProductVariant,
    StoreSettings,
    Vendor,
)
from .serializers import (
    BrandSerializer,
    CategorySerializer,
    EstimateQuerySerializer,
    EstimateRouteSerializer,
    HomeSectionSerializer,
    LabelSerializer,
    MobileSliderSerializer,
    OptionSerializer,
    OptionValueSerializer,
    OriginEstimateSerializer,
    ProductDetailSerializer,
    ProductListSerializer,
    ProductWriteSerializer,
    StoreSettingsSerializer,
    VendorSerializer,
    image_url,
)


class CatalogViewSet(AuditedViewSetMixin, viewsets.ModelViewSet):
    module = Module.ECOMMERCE
    permission_classes = [HasModulePermission]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    # Catalogue data is also read when taking shop orders.
    read_modules = (Module.ORDERS, Module.WAREHOUSE)


@extend_schema(tags=["catalog"])
class CategoryViewSet(CatalogViewSet):
    serializer_class = CategorySerializer
    filterset_fields = {"parent": ["exact", "isnull"], "is_active": ["exact"]}
    search_fields = ["name", "description"]
    pagination_class = None

    def get_queryset(self):
        return (Category.objects.select_related("parent")
                .annotate(products_count=Count("products", distinct=True) + Count("subcategory_products", distinct=True))
                .order_by("sort_order", "name"))


@extend_schema(tags=["catalog"])
class BrandViewSet(CatalogViewSet):
    serializer_class = BrandSerializer
    filterset_fields = ["status"]
    search_fields = ["name", "country"]
    pagination_class = None

    def get_queryset(self):
        return Brand.objects.annotate(products_count=Count("products")).order_by("name")

    @action(detail=True, methods=["post"], parser_classes=[MultiPartParser, FormParser])
    def logo(self, request, pk=None):
        brand = self.get_object()
        upload = request.FILES.get("file")
        brand.logo_content_type = validate_upload(upload, allowed=IMAGE_TYPES)
        if brand.logo:
            brand.logo.delete(save=False)
        brand.logo = upload
        brand.save(update_fields=["logo", "logo_content_type", "updated_at"])
        record_audit(action="update", request=request, instance=brand, changes={"logo": [None, brand.logo.name]})
        return Response(BrandSerializer(self.get_queryset().get(pk=brand.pk)).data)


class SliderPermission(HasModulePermission):
    """Sliders are managed from Settings too: Settings access grants the same level as E-commerce access."""

    def has_permission(self, request, view) -> bool:
        if super().has_permission(request, view):
            return True
        user = request.user
        return bool(user and user.is_authenticated and user.staff_level != StaffLevel.DRIVER
                    and has_access(user, Module.SETTINGS, self.required_access(request, view)))


@extend_schema(tags=["catalog"])
class HomeSectionViewSet(CatalogViewSet):
    """Blocks of the website's home page, in order (E-commerce → Website Homepage)."""

    serializer_class = HomeSectionSerializer
    pagination_class = None
    filterset_fields = ["kind", "is_active"]

    def get_queryset(self):
        return HomeSection.objects.select_related("category").prefetch_related("categories", "picks__product")

    @action(detail=False, methods=["post"])
    def reorder(self, request):
        """{"ids": [section ids in their new order]}."""
        ids = request.data.get("ids") if isinstance(request.data, dict) else None
        if not isinstance(ids, list) or not all(isinstance(i, int) for i in ids):
            return Response({"error": {"code": "validation_error", "message": "Send the section ids in order.",
                                       "details": {"ids": ["A list of section ids."]}}}, status=400)
        sections = {s.pk: s for s in HomeSection.objects.filter(pk__in=ids)}
        for position, pk in enumerate(ids, start=1):
            if (section := sections.get(pk)) and section.sort_order != position:
                section.sort_order = position
                section.save(update_fields=["sort_order", "updated_at"])
        return Response(HomeSectionSerializer(self.get_queryset(), many=True).data)


class MobileSliderViewSet(CatalogViewSet):
    """Home-screen banners of the customer app (managed under Settings or E-commerce)."""

    permission_classes = [SliderPermission]
    serializer_class = MobileSliderSerializer
    filterset_fields = ["is_active"]
    search_fields = ["title"]
    pagination_class = None

    def get_queryset(self):
        return MobileSlider.objects.all()

    @action(detail=True, methods=["post", "get"], parser_classes=[MultiPartParser, FormParser])
    def image(self, request, pk=None):
        slider = self.get_object()
        if request.method == "GET":
            if not slider.image:
                raise Http404
            return file_response(slider.image, slider.image_content_type)
        upload = request.FILES.get("file")
        slider.image_content_type = validate_upload(upload, allowed=IMAGE_TYPES)
        if slider.image:
            slider.image.delete(save=False)
        slider.image = upload
        slider.save(update_fields=["image", "image_content_type", "updated_at"])
        record_audit(action="update", request=request, instance=slider, changes={"image": [None, slider.image.name]})
        return Response(MobileSliderSerializer(slider).data)


@extend_schema(tags=["catalog"])
class LabelViewSet(CatalogViewSet):
    serializer_class = LabelSerializer
    filterset_fields = ["visible", "color"]
    search_fields = ["name"]
    pagination_class = None

    def get_queryset(self):
        return Label.objects.annotate(products_count=Count("products")).order_by("name")


@extend_schema(tags=["catalog"])
class OptionViewSet(CatalogViewSet):
    serializer_class = OptionSerializer
    filterset_fields = ["status", "type"]
    search_fields = ["name", "values__value"]
    pagination_class = None

    def get_queryset(self):
        return ProductOption.objects.prefetch_related("values").order_by("name").distinct()

    @extend_schema(request=OptionValueSerializer, responses=OptionSerializer)
    @action(detail=True, methods=["post"])
    def values(self, request, pk=None):
        option = self.get_object()
        value = (request.data.get("value") or "").strip()
        if not value:
            raise ValidationError({"value": ["Enter a value."]})
        if option.values.filter(value__iexact=value).exists():
            raise ValidationError({"value": [f"{value} is already in {option.name}."]})
        ProductOptionValue.objects.create(option=option, value=value[:60], sort_order=option.values.count())
        record_audit(action="update", request=request, instance=option, changes={"values": [None, value]})
        return Response(OptionSerializer(self.get_queryset().get(pk=option.pk)).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["delete"], url_path=r"values/(?P<value_id>\d+)")
    def remove_value(self, request, pk=None, value_id=None):
        option = self.get_object()
        value = get_object_or_404(ProductOptionValue, pk=value_id, option=option)
        if value.variants.exists():
            raise ConflictError(f"“{value.value}” is used by product variations.")
        value.delete()
        record_audit(action="update", request=request, instance=option, changes={"values": [value.value, None]})
        return Response(OptionSerializer(self.get_queryset().get(pk=option.pk)).data)


class VendorFilter(django_filters.FilterSet):
    approval_status = django_filters.BaseInFilter(field_name="approval_status")
    self_service = django_filters.BooleanFilter(field_name="owner", lookup_expr="isnull", exclude=True)

    class Meta:
        model = Vendor
        fields = ["status", "profit_type", "verified", "approval_status", "commission_mode", "self_service"]


@extend_schema(tags=["catalog"])
class VendorViewSet(CatalogViewSet):
    """
    Vendors: staff-managed sellers and self-service stores. Application review and account
    status go through `review` (never a plain field edit), which records history and notifies.
    """

    serializer_class = VendorSerializer
    read_modules = (Module.ORDERS, Module.WAREHOUSE, Module.PEOPLE, Module.FINANCE)
    filterset_class = VendorFilter
    search_fields = ["name", "email", "location", "reference", "phone", "legal_name", "contact_person"]
    ordering_fields = ["name", "joined_date", "submitted_at", "created_at"]

    def perform_update(self, serializer):
        super().perform_update(serializer)
        vendor = serializer.instance
        if vendor.owner_id:
            from apps.marketplace.services import ensure_stock_location

            ensure_stock_location(vendor)

    @extend_schema(responses=OpenApiTypes.OBJECT)
    @action(detail=False)
    def counts(self, request):
        rows = dict(Vendor.objects.order_by().values("approval_status").annotate(n=Count("id"))
                    .values_list("approval_status", "n"))
        return Response({**{k: rows.get(k, 0) for k in Vendor.ApprovalStatus.values}, "all": sum(rows.values())})

    @extend_schema(request=OpenApiTypes.OBJECT, responses=VendorSerializer)
    @action(detail=True, methods=["post"])
    def review(self, request, pk=None):
        """{"status": under_review|approved|rejected|changes_requested|suspended, "note": "..."}"""
        from apps.marketplace import services as marketplace

        vendor = self.get_object()
        run(marketplace.change_status, vendor, str(request.data.get("status", "")), user=request.user,
            note=str(request.data.get("note", ""))[:2000], request=request)
        return Response(self.get_serializer(self.get_queryset().get(pk=vendor.pk)).data)

    @extend_schema(responses=OpenApiTypes.OBJECT)
    @action(detail=True)
    def history(self, request, pk=None):
        vendor = self.get_object()
        labels = dict(Vendor.ApprovalStatus.choices)
        rows = vendor.status_history.select_related("changed_by").order_by("-created_at", "-id")
        return Response([{"from_status": h.from_status, "to_status": h.to_status,
                          "to_status_display": labels.get(h.to_status, h.to_status), "note": h.note,
                          "by": "Vendor" if h.by_vendor else (h.changed_by.full_name if h.changed_by else "System"),
                          "at": h.created_at} for h in rows])

    @extend_schema(request=OpenApiTypes.OBJECT, responses=VendorSerializer)
    @action(detail=True, methods=["post"], parser_classes=[MultiPartParser, FormParser],
            url_path=r"media/(?P<kind>logo|banner)")
    def media(self, request, pk=None, kind=None):
        vendor = self.get_object()
        upload = request.FILES.get("file")
        content_type = validate_upload(upload, allowed=IMAGE_TYPES, max_bytes=4 * 1024 * 1024)
        old = getattr(vendor, kind)
        if old:
            old.delete(save=False)
        setattr(vendor, kind, upload)
        setattr(vendor, f"{kind}_content_type", content_type)
        vendor.save(update_fields=[kind, f"{kind}_content_type", "updated_at"])
        record_audit(action="update", request=request, instance=vendor, changes={kind: [None, getattr(vendor, kind).name]})
        return Response(self.get_serializer(self.get_queryset().get(pk=vendor.pk)).data)

    def get_queryset(self):
        sales = (OrderItem.objects.filter(variant__product__vendor=OuterRef("pk")).exclude(order__status="cancelled")
                 .order_by().values("variant__product__vendor").annotate(s=Sum("line_total")).values("s"))
        orders = (OrderItem.objects.filter(variant__product__vendor=OuterRef("pk")).exclude(order__status="cancelled")
                  .order_by().values("variant__product__vendor").annotate(n=Count("order", distinct=True)).values("n"))
        pending = (Product.objects.filter(vendor=OuterRef("pk"), review_status="pending").order_by()
                   .values("vendor").annotate(n=Count("id")).values("n"))
        return (Vendor.objects.select_related("owner__customer", "city", "warehouse")
                .annotate(products_count=Count("products", distinct=True),
                          orders_count=Coalesce(Subquery(orders, output_field=IntegerField()), 0),
                          pending_products=Coalesce(Subquery(pending, output_field=IntegerField()), 0),
                          sales_total=Subquery(sales, output_field=DecimalField(max_digits=16, decimal_places=2)))
                .order_by("name"))


class ProductFilter(django_filters.FilterSet):
    category = django_filters.NumberFilter(method="filter_category")
    status = django_filters.BaseInFilter(field_name="status")
    stock = django_filters.ChoiceFilter(choices=[("in_stock", "In stock"), ("low", "Low"), ("out", "Out of stock")],
                                        method="filter_stock")

    review_status = django_filters.BaseInFilter(field_name="review_status")
    seller = django_filters.CharFilter(method="filter_seller")

    class Meta:
        model = Product
        fields = ["category", "status", "brand", "vendor", "featured", "stock", "review_status", "seller"]

    def filter_seller(self, qs, name, value):
        """"agiza" = sold by AGIZA itself; "vendors" = any vendor; otherwise a vendor id."""
        if value == "agiza":
            return qs.filter(vendor__isnull=True)
        if value == "vendors":
            return qs.filter(vendor__isnull=False)
        return qs.filter(vendor_id=value) if value.isdigit() else qs.none()

    def filter_category(self, qs, name, value):
        return qs.filter(Q(category_id=value) | Q(subcategory_id=value))

    def filter_stock(self, qs, name, value):
        qs = qs.annotate(avail=Coalesce(Sum("variants__stock__quantity"), 0) - Coalesce(Sum("variants__stock__reserved"), 0))
        if value == "out":
            return qs.filter(avail__lte=0)
        if value == "low":
            return qs.filter(avail__gt=0, avail__lte=F("low_stock_threshold"))
        return qs.filter(avail__gt=0)


@extend_schema(tags=["catalog"])
class ProductViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
                     mixins.UpdateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """Product catalogue with the full product editor (variants, specs, relations, images)."""

    module = Module.ECOMMERCE
    permission_classes = [HasModulePermission]
    read_modules = (Module.ORDERS, Module.WAREHOUSE)
    filterset_class = ProductFilter
    search_fields = ["name", "sku", "variants__sku", "brand__name", "keywords"]
    ordering_fields = ["name", "price", "created_at", "updated_at"]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        stock = StockItem.objects.only("id", "variant_id", "warehouse_id", "quantity", "reserved")
        variants = ProductVariant.objects.prefetch_related(Prefetch("stock", queryset=stock), "images",
                                                           "option_values__option")
        qs = (Product.objects.select_related("brand", "category", "origin_country", "location__country",
                                             "location__city", "vendor")
              .prefetch_related(Prefetch("variants", queryset=variants), "images", "labels")
              .order_by("name", "id").distinct())
        if self.action == "retrieve":
            qs = qs.select_related("subcategory", "shipping_profile", "vendor").prefetch_related(
                "specifications", "shipping_methods", "variation_options", "related_products", "bought_together",
                "gifts")
        return qs

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return ProductWriteSerializer
        return ProductDetailSerializer if self.action == "retrieve" else ProductListSerializer

    def _respond(self, product, code=status.HTTP_200_OK):
        self.action = "retrieve"
        return Response(ProductDetailSerializer(self.get_queryset().get(pk=product.pk)).data, status=code)

    @extend_schema(request=ProductWriteSerializer, responses={201: ProductDetailSerializer})
    def create(self, request, *args, **kwargs):
        s = ProductWriteSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        product = run(services.save_product, s.validated_data, user=request.user, request=request)
        return self._respond(product, status.HTTP_201_CREATED)

    @extend_schema(request=ProductWriteSerializer, responses=ProductDetailSerializer)
    def partial_update(self, request, *args, **kwargs):
        product = self.get_object()
        s = ProductWriteSerializer(data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        product = run(services.save_product, s.validated_data, user=request.user, product=product, request=request)
        return self._respond(product)

    def update(self, request, *args, **kwargs):
        return self.partial_update(request, *args, **kwargs)

    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        product = self.get_object()
        variants = product.variants.all()
        if OrderItem.objects.filter(variant__in=variants).exists() or StockItem.objects.filter(
                variant__in=variants, quantity__gt=0).exists():
            raise ConflictError("This product has orders or stock. Set it to Inactive instead of deleting it.")
        record_audit(action="delete", request=request, instance=product, changes={})
        for img in product.images.all():
            img.file.delete(save=False)
        StockItem.objects.filter(variant__in=variants).delete()
        product.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], parser_classes=[MultiPartParser, FormParser, JSONParser])
    def images(self, request, pk=None):
        """Upload an image (optionally for a variation). The first product image becomes primary."""
        product = self.get_object()
        upload = request.FILES.get("file")
        ctype = validate_upload(upload, allowed=IMAGE_TYPES)
        variant = None
        if request.data.get("variant"):
            variant = get_object_or_404(ProductVariant, pk=request.data["variant"], product=product)
        if product.images.count() >= 20:
            raise ValidationError({"file": ["A product can have at most 20 images."]})
        primary = variant is None and not product.images.filter(variant__isnull=True, is_primary=True).exists()
        img = ProductImage.objects.create(product=product, variant=variant, file=upload, content_type=ctype,
                                          is_primary=primary, sort_order=product.images.count(),
                                          uploaded_by=request.user)
        record_audit(action="create", request=request, instance=img, changes={"product": [None, product.sku]})
        return self._respond(product, status.HTTP_201_CREATED)

    @extend_schema(methods=["POST"], operation_id="catalog_products_image_make_primary", responses=ProductDetailSerializer)
    @extend_schema(methods=["DELETE"], operation_id="catalog_products_image_delete", responses=ProductDetailSerializer)
    @action(detail=True, methods=["post", "delete"], url_path=r"images/(?P<image_id>\d+)")
    @transaction.atomic
    def image(self, request, pk=None, image_id=None):
        """POST = make primary, DELETE = remove the image."""
        product = self.get_object()
        img = get_object_or_404(ProductImage, pk=image_id, product=product)
        if request.method == "DELETE":
            was_primary = img.is_primary
            img.file.delete(save=False)
            img.delete()
            if was_primary:
                nxt = product.images.filter(variant__isnull=True).first()
                if nxt:
                    nxt.is_primary = True
                    nxt.save(update_fields=["is_primary"])
            record_audit(action="delete", request=request, instance=product, changes={"image": [image_id, None]})
        else:
            if img.variant_id:
                raise ValidationError({"image": ["Variation images can't be the product's main image."]})
            product.images.filter(is_primary=True).update(is_primary=False)
            img.is_primary = True
            img.save(update_fields=["is_primary"])
        return self._respond(product)

    @extend_schema(request=OpenApiTypes.OBJECT, responses=ProductDetailSerializer)
    @action(detail=True, methods=["post"])
    def moderate(self, request, pk=None):
        """Review a vendor's product: {"action": "approve" | "reject" | "disable", "note": "..."}."""
        from apps.marketplace import vendor_products

        product = self.get_object()
        action_name = str(request.data.get("action", ""))
        if action_name not in vendor_products.MODERATION:
            raise ValidationError({"action": ["Choose approve, reject or disable."]})
        run(vendor_products.moderate, product, action_name, user=request.user,
            note=str(request.data.get("note", ""))[:2000], request=request)
        return self._respond(self.get_queryset().get(pk=product.pk))

    @action(detail=False)
    def stats(self, request):
        qs = Product.objects.all()
        out_of_stock = (qs.annotate(avail=Coalesce(Sum("variants__stock__quantity"), 0)
                                    - Coalesce(Sum("variants__stock__reserved"), 0))
                        .filter(avail__lte=0).count())
        return Response({
            "total": qs.count(),
            "active": qs.filter(status=ProductStatus.ACTIVE).count(),
            "out_of_stock": out_of_stock,
            "inventory_value": f"{services.inventory_value():.2f}",
        })

    @action(detail=False)
    def variants(self, request):
        """Sellable variants (for shop orders and stock), searchable by name or SKU."""
        term = request.query_params.get("search", "").strip()
        qs = (ProductVariant.objects.select_related("product").filter(product__status=ProductStatus.ACTIVE,
                                                                       status="active")
              .prefetch_related("stock"))
        if term:
            qs = qs.filter(Q(sku__icontains=term) | Q(product__name__icontains=term) | Q(name__icontains=term))
        rows = []
        for v in qs.order_by("product__name", "id")[:30]:
            rows.append({"id": v.id, "sku": v.sku, "name": v.product.name if v.is_default else f"{v.product.name} — {v.name}",
                         "price": f"{v.effective_price:.2f}", "available": sum(s.available for s in v.stock.all())})
        return Response(rows)


class VendorMediaFileView(APIView):
    module = Module.ECOMMERCE
    permission_classes = [HasModulePermission]
    read_modules = (Module.ORDERS, Module.PEOPLE, Module.FINANCE)

    @extend_schema(tags=["catalog"], responses={(200, "image/*"): OpenApiTypes.BINARY})
    def get(self, request, pk, kind):
        if kind not in ("logo", "banner"):
            raise Http404
        vendor = get_object_or_404(Vendor, pk=pk)
        file = getattr(vendor, kind)
        if not file:
            raise Http404
        return file_response(file, getattr(vendor, f"{kind}_content_type"))


class ImageFileView(APIView):
    module = Module.ECOMMERCE
    permission_classes = [HasModulePermission]
    read_modules = (Module.ORDERS, Module.WAREHOUSE)

    @extend_schema(tags=["catalog"], responses={200: bytes})
    def get(self, request, pk):
        img = get_object_or_404(ProductImage, pk=pk)
        return file_response(img.file, img.content_type)


class BrandLogoView(APIView):
    module = Module.ECOMMERCE
    permission_classes = [HasModulePermission]
    read_modules = (Module.ORDERS, Module.WAREHOUSE)

    @extend_schema(tags=["catalog"], responses={200: bytes})
    def get(self, request, pk):
        brand = get_object_or_404(Brand, pk=pk)
        if not brand.logo:
            raise ValidationError({"logo": ["This brand has no logo."]})
        return file_response(brand.logo, brand.logo_content_type)


@extend_schema(tags=["catalog"])
class StoreSettingsView(APIView):
    module = Module.ECOMMERCE
    permission_classes = [HasModulePermission]
    required_access = {"PUT": "manage", "PATCH": "manage"}

    @extend_schema(responses=StoreSettingsSerializer)
    def get(self, request):
        return Response(StoreSettingsSerializer(StoreSettings.load()).data)

    @extend_schema(request=StoreSettingsSerializer, responses=StoreSettingsSerializer)
    def patch(self, request):
        obj = StoreSettings.load()
        s = StoreSettingsSerializer(obj, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        before = StoreSettingsSerializer(obj).data
        obj = s.save(updated_by=request.user)
        after = StoreSettingsSerializer(obj).data
        changes = {k: [before[k], after[k]] for k in after if k != "updated_at" and before.get(k) != after[k]}
        if changes:
            record_audit(action="update", request=request, instance=obj, changes=changes)
        return Response(after)

    put = patch


@extend_schema(tags=["catalog"])
class EstimateRouteViewSet(CatalogViewSet):
    serializer_class = EstimateRouteSerializer
    pagination_class = None
    required_access = {"create": "manage", "partial_update": "manage", "destroy": "manage"}

    def get_queryset(self):
        return DeliveryEstimateRoute.objects.select_related("from_city", "to_city")


@extend_schema(tags=["catalog"])
class OriginEstimateViewSet(CatalogViewSet):
    serializer_class = OriginEstimateSerializer
    pagination_class = None
    required_access = {"create": "manage", "partial_update": "manage", "destroy": "manage"}

    def get_queryset(self):
        return OriginEstimate.objects.select_related("country")


class DeliveryEstimateView(APIView):
    """The Delivery Estimator plugin: days to the customer's city, from the store's rules."""

    module = Module.ECOMMERCE
    permission_classes = [HasModulePermission]
    read_modules = (Module.ORDERS,)

    @extend_schema(tags=["catalog"], parameters=[EstimateQuerySerializer], responses=OpenApiTypes.OBJECT)
    def get(self, request):
        s = EstimateQuerySerializer(data=request.query_params)
        s.is_valid(raise_exception=True)
        return Response(s.estimate())


@extend_schema(tags=["catalog"], request=OpenApiTypes.OBJECT, responses=OpenApiTypes.OBJECT)
class HotSalesView(APIView):
    """
    Featured products in their display order: "Hot Sales" on the app's home and the featured row of
    the website. GET lists them; POST {"ids": [...]} saves the whole list in that order (products left
    out stop being featured, new ones become featured).
    """

    module = Module.ECOMMERCE
    permission_classes = [HasModulePermission]

    @staticmethod
    def _rows():
        products = (Product.objects.filter(featured=True).prefetch_related("images")
                    .order_by("featured_position", "-created_at", "-id"))
        rows = []
        for p in products:
            images = [i for i in p.images.all() if i.variant_id is None]
            primary = next((i for i in images if i.is_primary), images[0] if images else None)
            rows.append({"id": p.id, "name": p.name, "sku": p.sku, "price": str(p.price), "status": p.status,
                         "image": image_url(primary) if primary else None})
        return rows

    def get(self, request):
        return Response(self._rows())

    @transaction.atomic
    def post(self, request):
        ids = request.data.get("ids") if isinstance(request.data, dict) else None
        if not isinstance(ids, list) or not all(isinstance(i, int) for i in ids) or len(ids) != len(set(ids)):
            return Response({"error": {"code": "validation_error", "message": "Send the product ids in order.",
                                       "details": {"ids": ["A list of different product ids."]}}}, status=400)
        if len(ids) > 60:
            return Response({"error": {"code": "validation_error", "message": "Hot Sales can hold up to 60 products.",
                                       "details": {"ids": ["Up to 60 products."]}}}, status=400)
        found = {p.pk: p for p in Product.objects.select_for_update().filter(pk__in=ids)}
        if missing := [i for i in ids if i not in found]:
            return Response({"error": {"code": "validation_error", "message": f"Unknown products: {missing}",
                                       "details": {"ids": [f"Unknown products: {missing}"]}}}, status=400)
        before = list(Product.objects.filter(featured=True).order_by("featured_position", "-created_at")
                      .values_list("id", flat=True))
        Product.objects.filter(featured=True).exclude(pk__in=ids).update(featured=False, featured_position=0)
        for position, pk in enumerate(ids, start=1):
            product = found[pk]
            if not product.featured or product.featured_position != position:
                product.featured, product.featured_position = True, position
                product.save(update_fields=["featured", "featured_position", "updated_at"])
        record_audit(action="update", request=request, object_repr="Hot Sales (featured products)",
                     changes={"hot_sales": [before, ids]})
        return Response(self._rows())
