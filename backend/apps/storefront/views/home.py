"""
The website's home page as staff arranged it (E-commerce → Website Homepage): every visible block in order,
with its products, categories, stores or banners already resolved, so the site renders it in one call.
"""
from django.db.models import Count, Prefetch, Q
from django.urls import reverse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.response import Response

from apps.catalog.models import HomeSection, MobileSlider, SliderPlacement

from ..catalog import public_vendors, visible_categories, visible_products
from ..serializers import CategorySerializer, ProductCardSerializer, store_payload
from .base import PublicAPIView
from .catalog import ORDERING, _card_context

K, S = HomeSection.Kind, HomeSection.Source
SOURCE_HREF = {S.FEATURED: "/shop?featured=1", S.DEALS: "/shop?deals=1", S.POPULAR: "/shop?sort=popular",
               S.NEWEST: "/shop?sort=newest"}


def _cards(request, products: list) -> list[dict]:
    return ProductCardSerializer(products, many=True, context=_card_context(request, products)).data


def _newest(exclude=(), limit: int = 12) -> list:
    return list(visible_products().exclude(pk__in=list(exclude)).order_by(*ORDERING["newest"])[:limit])


def _section_products(section: HomeSection) -> list:
    qs, limit = visible_products(), section.limit
    if section.source == S.MANUAL:
        order = [p.product_id for p in section.picks.all()]
        found = {p.pk: p for p in qs.filter(pk__in=order)}
        items = [found[pk] for pk in order if pk in found][:limit]  # hidden / sold-off picks drop out
    else:
        if section.source == S.FEATURED:
            qs = qs.filter(featured=True).order_by(*ORDERING["featured"])
        elif section.source == S.DEALS:
            qs = qs.filter(ofa_kali=True).order_by(*ORDERING["newest"])
        elif section.source == S.POPULAR:
            qs = qs.annotate(popularity=Count("variants__order_items", filter=~Q(
                variants__order_items__order__status="cancelled"))).order_by(*ORDERING["popular"])
        elif section.source == S.CATEGORY and section.category_id:
            qs = qs.filter(Q(category_id=section.category_id) | Q(subcategory_id=section.category_id)) \
                .order_by(*ORDERING["newest"])
        else:
            qs = qs.order_by(*ORDERING["newest"])
        items = list(qs[:limit])
    if section.fill_with_newest and len(items) < limit:
        items += _newest(exclude=[p.pk for p in items], limit=limit - len(items))
    return items


def _top_categories(limit: int, chosen=None) -> list:
    children = Prefetch("children", queryset=visible_categories(), to_attr="shop_children")
    if chosen:
        visible = {c.pk: c for c in visible_categories().filter(pk__in=chosen).prefetch_related(children)}
        return [visible[pk] for pk in chosen if pk in visible][:limit]
    return list(visible_categories().filter(parent__isnull=True).prefetch_related(children)[:limit])


def _category_products(category, limit: int) -> list:
    return list(visible_products().filter(Q(category_id=category.pk) | Q(subcategory_id=category.pk))
                .order_by(*ORDERING["newest"])[:limit])


def _payload(request, section: HomeSection) -> dict:
    row = {"id": section.id, "kind": section.kind, "title": section.title, "href": None}
    if section.kind == K.PRODUCTS:
        row["products"] = _cards(request, _section_products(section))
        if section.source == S.CATEGORY and section.category:
            row["category"] = {"id": section.category.id, "name": section.category.name,
                               "slug": section.category.slug}
        row["href"] = SOURCE_HREF.get(section.source)
    elif section.kind == K.CATEGORIES:
        tiles = []
        chosen = [c.pk for c in section.categories.all()]
        for category in _top_categories(section.limit, chosen):
            sample = _category_products(category, 6)
            cards = _cards(request, sample)
            tiles.append({"category": CategorySerializer(category).data,
                          "image": next((c["image"] for c in cards if c.get("image")), None),
                          "count": visible_products().filter(Q(category_id=category.pk)
                                                             | Q(subcategory_id=category.pk)).count()})
        row["tiles"] = tiles
    elif section.kind == K.CATEGORY_ROWS:
        rows = []
        for category in _top_categories(8):
            items = _category_products(category, 12)
            if len(items) >= 2:
                rows.append({"category": CategorySerializer(category).data, "products": _cards(request, items)})
            if len(rows) >= section.limit:
                break
        row["rows"] = rows
    elif section.kind == K.STORES:
        counts = dict(visible_products().order_by().values("vendor_id").annotate(n=Count("id"))
                      .values_list("vendor_id", "n"))
        stores = [store_payload(request, None, products_count=counts[None])] if counts.get(None) else []
        for vendor in public_vendors().select_related("city").order_by("-verified", "name")[:section.limit]:
            stores.append(store_payload(request, vendor, products_count=counts.get(vendor.pk, 0)))
        row["stores"] = stores[:section.limit]
    elif section.kind == K.BANNERS:
        slides = MobileSlider.objects.filter(is_active=True, placement__in=[SliderPlacement.WEBSITE,
                                                                            SliderPlacement.BOTH]).exclude(image="")
        row["banners"] = [{"id": s.id, "title": s.title, "link": s.link or None,
                           "image": request.build_absolute_uri(reverse("storefront:slider-image", kwargs={"pk": s.pk}))}
                          for s in slides[:section.limit]]
    return row


@extend_schema(tags=["app: shop"], responses=OpenApiTypes.OBJECT)
class HomeView(PublicAPIView):
    """The website home page: {"sections": [{id, kind, title, href, products | tiles | rows | stores | banners}]}."""

    def get(self, request):
        sections = (HomeSection.objects.filter(is_active=True).select_related("category")
                    .prefetch_related("categories", "picks"))
        return Response({"sections": [_payload(request, s) for s in sections]})
