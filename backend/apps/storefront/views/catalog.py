from decimal import Decimal, InvalidOperation

from django.db.models import Count, Prefetch, Q
from django.http import Http404
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.response import Response

from apps.catalog.models import ProductImage, StoreSettings
from apps.catalog.search import filter_products, normalize
from apps.core.pagination import StandardPagination
from apps.core.uploads import file_response
from apps.locations.models import City, Country

from .. import checkout, otp
from ..catalog import AGIZA_STORE_SLUG, available_by_variant, public_vendors, visible_categories, visible_products
from ..serializers import (
    CategorySerializer,
    CitySerializer,
    ProductCardSerializer,
    ProductDetailSerializer,
    store_payload,
)
from .base import PublicAPIView

ORDERING = {"newest": ("-created_at", "-id"), "price": ("price", "id"), "-price": ("-price", "id"),
            "name": ("name", "id"), "popular": ("-popularity", "-created_at", "-id")}


def _price(value: str | None) -> Decimal | None:
    if not value:
        return None
    try:
        return Decimal(value)
    except InvalidOperation:
        raise Http404


def _stock_for(products) -> dict[int, int]:
    return available_by_variant(v.pk for p in products for v in getattr(p, "shop_variants", []))


def _card_context(request, products) -> dict:
    from apps.marketplace.reviews import product_ratings

    return {"request": request, "stock": _stock_for(products), "ratings": product_ratings(p.pk for p in products)}


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
    OpenApiParameter("store", str, description='Store slug ("agiza" = sold by AGIZA)'),
    OpenApiParameter("min_price", str), OpenApiParameter("max_price", str),
    OpenApiParameter("in_stock", bool, description="Only products that can be bought now"),
])
class ProductListView(PublicAPIView):
    def get(self, request):
        qs = visible_products()
        params = request.query_params
        if search := params.get("search", "").strip()[:100]:
            qs = filter_products(qs, search)  # case, accents and punctuation don't matter ("levis" → "Levi's")
        if store := params.get("store", "").strip():
            qs = qs.filter(vendor__isnull=True) if store == AGIZA_STORE_SLUG else qs.filter(vendor__slug=store)
        if (low := _price(params.get("min_price"))) is not None:
            qs = qs.filter(price__gte=low)
        if (high := _price(params.get("max_price"))) is not None:
            qs = qs.filter(price__lte=high)
        if params.get("in_stock") in ("1", "true"):
            from django.db.models import Exists, F, OuterRef

            from apps.inventory.models import StockItem

            from ..catalog import RESERVABLE_WAREHOUSE_STATUSES

            sellable = StockItem.objects.filter(variant__product=OuterRef("pk"), variant__status="active",
                                                warehouse__status__in=RESERVABLE_WAREHOUSE_STATUSES,
                                                quantity__gt=F("reserved"))
            qs = qs.filter(status="active").filter(Exists(sellable))
        if category := params.get("category"):
            if not category.isdigit():
                raise Http404
            qs = qs.filter(Q(category_id=category) | Q(subcategory_id=category))
        if params.get("featured") in ("1", "true"):
            qs = qs.filter(featured=True)
        if params.get("deals") in ("1", "true"):
            qs = qs.filter(ofa_kali=True)
        ordering = params.get("ordering", "newest")
        if ordering == "popular":
            qs = qs.annotate(popularity=Count("variants__order_items", filter=~Q(
                variants__order_items__order__status="cancelled")))
        qs = qs.order_by(*ORDERING.get(ordering, ORDERING["newest"]))
        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response(
            ProductCardSerializer(page, many=True, context=_card_context(request, page)).data)


@extend_schema(tags=["app: shop"], responses=ProductDetailSerializer)
class ProductDetailView(PublicAPIView):
    def get(self, request, pk: int):
        product = get_object_or_404(visible_products().prefetch_related(
            "images", "specifications", "shipping_methods"), pk=pk)
        from apps.marketplace.reviews import distribution

        body = ProductDetailSerializer(product, context=_card_context(request, [product])).data
        body["rating_distribution"] = distribution(product)
        return Response(body)


@extend_schema(tags=["app: stores"], responses=OpenApiTypes.OBJECT, parameters=[OpenApiParameter("search", str)])
class StoreListView(PublicAPIView):
    """Stores customers can browse: approved, active vendors (and AGIZA's own store)."""

    def get(self, request):
        counts = dict(visible_products().order_by().values("vendor_id").annotate(n=Count("id"))
                      .values_list("vendor_id", "n"))
        stores = public_vendors().select_related("city").order_by("-verified", "name")
        search = normalize(request.query_params.get("search", ""))
        if search:
            stores = stores.filter(Q(name__icontains=search) | Q(slug__icontains=search.replace(" ", "-"))
                                   | Q(description__icontains=search))
        paginator = StandardPagination()
        page = paginator.paginate_queryset(stores, request, view=self)
        from apps.marketplace.reviews import store_ratings

        ratings = store_ratings(v.pk for v in page)
        rows = [store_payload(request, v, products_count=counts.get(v.pk, 0), rating=ratings.get(v.pk, {}))
                for v in page]
        if paginator.page.number == 1 and counts.get(None) and (not search or search in "agiza"):
            rows.insert(0, store_payload(request, None, products_count=counts[None]))
        return paginator.get_paginated_response(rows)


@extend_schema(tags=["app: stores"], responses=OpenApiTypes.OBJECT)
class StoreDetailView(PublicAPIView):
    def get(self, request, slug: str):
        if slug == AGIZA_STORE_SLUG:
            vendor = None
            count = visible_products().filter(vendor__isnull=True).count()
        else:
            vendor = get_object_or_404(public_vendors().select_related("city"), slug=slug)
            count = visible_products().filter(vendor=vendor).count()
        return Response(store_payload(request, vendor, products_count=count, detail=True))


@extend_schema(tags=["app: stores"], responses={(200, "image/*"): OpenApiTypes.BINARY})
class StoreMediaView(PublicAPIView):
    """A public store's logo or banner."""

    throttle_classes = []

    def get(self, request, slug: str, kind: str):
        vendor = get_object_or_404(public_vendors(), slug=slug)
        file = getattr(vendor, kind)
        if not file:
            raise Http404
        response = file_response(file, getattr(vendor, f"{kind}_content_type"))
        response["Cache-Control"] = "public, max-age=3600"
        return response


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
