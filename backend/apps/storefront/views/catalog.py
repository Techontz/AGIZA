from django.db.models import Prefetch, Q
from django.http import Http404
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.response import Response

from apps.catalog.models import ProductImage, StoreSettings
from apps.core.pagination import StandardPagination
from apps.core.uploads import file_response
from apps.locations.models import City, Country

from .. import checkout, otp
from ..catalog import available_by_variant, visible_categories, visible_products
from ..serializers import CategorySerializer, CitySerializer, ProductCardSerializer, ProductDetailSerializer
from .base import PublicAPIView

ORDERING = {"newest": ("-created_at", "-id"), "price": ("price", "id"), "-price": ("-price", "id"),
            "name": ("name", "id")}


def _stock_for(products) -> dict[int, int]:
    return available_by_variant(v.pk for p in products for v in getattr(p, "shop_variants", []))


@extend_schema(tags=["app: shop"], responses=OpenApiTypes.OBJECT)
class ConfigView(PublicAPIView):
    """What the app needs at start-up: store currency, payment methods, verification availability."""

    def get(self, request):
        store = StoreSettings.load()
        return Response({"store_name": store.store_name, "currency": store.currency,
                         "payment_methods": checkout.payment_methods(),
                         "phone_verification": otp.sms_configured()})


@extend_schema(tags=["app: shop"], responses=CategorySerializer(many=True))
class CategoryListView(PublicAPIView):
    def get(self, request):
        children = Prefetch("children", queryset=visible_categories(), to_attr="shop_children")
        tops = visible_categories().filter(parent__isnull=True).prefetch_related(children)
        return Response(CategorySerializer(tops, many=True).data)


@extend_schema(tags=["app: shop"], responses=ProductCardSerializer(many=True), parameters=[
    OpenApiParameter("search", str), OpenApiParameter("category", int), OpenApiParameter("featured", bool),
    OpenApiParameter("deals", bool), OpenApiParameter("ordering", str, enum=list(ORDERING)),
])
class ProductListView(PublicAPIView):
    def get(self, request):
        qs = visible_products()
        params = request.query_params
        if search := params.get("search", "").strip()[:100]:
            qs = qs.filter(Q(name__icontains=search) | Q(keywords__icontains=search) | Q(brand__name__icontains=search)
                           | Q(category__name__icontains=search))
        if category := params.get("category"):
            if not category.isdigit():
                raise Http404
            qs = qs.filter(Q(category_id=category) | Q(subcategory_id=category))
        if params.get("featured") in ("1", "true"):
            qs = qs.filter(featured=True)
        if params.get("deals") in ("1", "true"):
            qs = qs.filter(ofa_kali=True)
        qs = qs.order_by(*ORDERING.get(params.get("ordering", "newest"), ORDERING["newest"]))
        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        context = {"request": request, "stock": _stock_for(page)}
        return paginator.get_paginated_response(ProductCardSerializer(page, many=True, context=context).data)


@extend_schema(tags=["app: shop"], responses=ProductDetailSerializer)
class ProductDetailView(PublicAPIView):
    def get(self, request, pk: int):
        product = get_object_or_404(visible_products().prefetch_related(
            "images", "specifications", "shipping_methods"), pk=pk)
        context = {"request": request, "stock": _stock_for([product])}
        return Response(ProductDetailSerializer(product, context=context).data)


@extend_schema(tags=["app: shop"], responses={(200, "image/*"): OpenApiTypes.BINARY})
class ProductImageView(PublicAPIView):
    """Images of products the shop shows (other product images stay private)."""

    throttle_classes = []  # a product grid loads many images at once

    def get(self, request, pk: int):
        image = get_object_or_404(ProductImage.objects.filter(product__in=visible_products()), pk=pk)
        response = file_response(image.file, image.content_type)
        response["Cache-Control"] = "public, max-age=86400"
        return response


@extend_schema(tags=["app: shop"], responses=CitySerializer(many=True))
class CityListView(PublicAPIView):
    """Delivery cities (Tanzania by default)."""

    def get(self, request):
        country = request.query_params.get("country", "TZ").upper()[:2]
        cities = City.objects.filter(is_active=True, country__iso2=country).select_related("region", "country")
        return Response(CitySerializer(cities.order_by("name"), many=True).data)


@extend_schema(tags=["app: shop"], responses=OpenApiTypes.OBJECT)
class SourcingCountryListView(PublicAPIView):
    """Countries AGIZA buys from and ships from (for Buy for me / Deliver for me requests)."""

    def get(self, request):
        countries = Country.objects.filter(is_active=True, is_sourcing_origin=True).order_by("name")
        return Response([{"iso2": c.iso2, "name": c.display_name or c.name} for c in countries])
