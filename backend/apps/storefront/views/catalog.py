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

from .. import cart as carts
from .. import checkout, otp
from ..catalog import AGIZA_STORE_SLUG, available_by_variant, is_sellable, public_vendors, visible_categories, visible_products
from ..models import MAX_LINE_QUANTITY
from ..serializers import (
    CategorySerializer,
    CitySerializer,
    DeliveryEstimateSerializer,
    ProductCardSerializer,
    ProductDetailSerializer,
    option_payload,
    store_payload,
)
from ..shipping import Line, delivery_options, import_options, is_imported, origin_country, store_hub
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


def _imported(products) -> dict[int, str]:
    """{product id: country it ships from} for imported products (no local stock needed to order them)."""
    hub = store_hub()
    found = {}
    for product in products:
        if is_imported(product, hub):
            found[product.pk] = origin_country(product, hub).name
    return found


def _stock_for(products, imported: dict[int, str]) -> dict[int, int]:
    stock = available_by_variant(v.pk for p in products for v in getattr(p, "shop_variants", []))
    for product in products:
        if product.pk in imported:  # bought abroad once ordered: always orderable
            for variant in getattr(product, "shop_variants", []):
                stock[variant.pk] = MAX_LINE_QUANTITY
    return stock


def _card_context(request, products) -> dict:
    from apps.marketplace.reviews import product_ratings

    imported = _imported(products)
    return {"request": request, "stock": _stock_for(products, imported), "imported": imported,
            "ratings": product_ratings(p.pk for p in products)}


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


@extend_schema(tags=["app: shop"], responses=OpenApiTypes.OBJECT, parameters=[
    OpenApiParameter("variant", int, required=True), OpenApiParameter("city", int, required=True),
    OpenApiParameter("quantity", int)])
class DeliveryEstimateView(PublicAPIView):
    """
    "Calculate delivery" on a product page: what delivering this item to a city costs with each
    method, priced by the Shipping Engine exactly as checkout will (imported items: shipping to
    Tanzania plus delivery to the city).
    """

    def get(self, request):
        s = DeliveryEstimateSerializer(data=request.query_params)
        s.is_valid(raise_exception=True)
        data = s.validated_data
        items = carts.guest_items([{"variant": data["variant"], "quantity": data["quantity"]}])
        if not items or not is_sellable(items[0].variant):
            raise Http404
        variant = items[0].variant
        lines = [Line(variant, data["quantity"])]
        currency = StoreSettings.load().currency
        hub = store_hub()
        imported = is_imported(variant.product, hub)
        imports = import_options(lines, currency=currency)
        return Response({
            "imported": imported,
            "ships_from": origin_country(variant.product, hub).name if imported else None,
            "hub": hub.name if imported and hub else None,
            "import_options": [option_payload(o) for o in imports],
            "customs": _customs_estimate(variant, data["quantity"], imports, hub, currency) if imported else None,
            "shipping_options": [option_payload(o) for o in delivery_options(lines, data["city"], currency=currency)],
            "currency": currency,
            "prepayment_required": imported,
        })


def _customs_estimate(variant, quantity: int, imports: list[dict], hub, currency: str) -> dict | None:
    """Customs for this item with the cheapest import option, computed exactly as checkout does."""
    from apps.shipping_engine import customs
    from apps.shipping_engine.calculator import RateCalculationError

    cheapest = next((o for o in imports if o["available"]), None)
    item = customs.Item(variant.product, quantity, variant.effective_price * quantity,
                        origin_country(variant.product, hub).pk)
    try:
        result = customs.calculate([item], currency=currency, import_shipping=cheapest["cost"] if cheapest else 0)
    except RateCalculationError:
        return None
    return result.as_dict()
