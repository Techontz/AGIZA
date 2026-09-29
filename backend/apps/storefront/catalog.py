"""
What the shop shows customers: visible products, sellable variants and live stock.

Availability follows `inventory.reserve`: stock counts only at warehouses that are
active or full, so the app never offers quantities checkout would refuse.
"""
from __future__ import annotations

from django.db.models import F, Prefetch, Sum
from django.urls import reverse

from apps.catalog.models import Category, Product, ProductImage, ProductStatus, ProductVariant, VariantStatus
from apps.inventory.models import StockItem

VISIBLE_STATUSES = (ProductStatus.ACTIVE, ProductStatus.OUT_OF_STOCK)
RESERVABLE_WAREHOUSE_STATUSES = ("active", "full")


def visible_products():
    return (
        Product.objects.filter(status__in=VISIBLE_STATUSES, category__is_active=True)
        .select_related("brand", "category", "subcategory")
        .prefetch_related(
            Prefetch("images", queryset=ProductImage.objects.filter(variant__isnull=True), to_attr="shop_images"),
            Prefetch("variants", queryset=ProductVariant.objects.filter(status=VariantStatus.ACTIVE)
                     .prefetch_related("option_values__option"), to_attr="shop_variants"),
            "labels",
        )
    )


def visible_categories():
    return Category.objects.filter(is_active=True)


def available_by_variant(variant_ids) -> dict[int, int]:
    rows = (StockItem.objects.filter(variant_id__in=list(variant_ids),
                                     warehouse__status__in=RESERVABLE_WAREHOUSE_STATUSES)
            .values("variant_id").annotate(available=Sum(F("quantity") - F("reserved"))))
    return {r["variant_id"]: max(r["available"] or 0, 0) for r in rows}


def is_sellable(variant: ProductVariant) -> bool:
    return variant.status == VariantStatus.ACTIVE and variant.product.status == ProductStatus.ACTIVE


def image_url(request, image: ProductImage | None) -> str | None:
    if image is None:
        return None
    path = reverse("storefront:product-image", kwargs={"pk": image.pk})
    return request.build_absolute_uri(path) if request is not None else path


def primary_image(product: Product) -> ProductImage | None:
    images = getattr(product, "shop_images", None)
    if images is None:
        images = list(product.images.filter(variant__isnull=True))
    return images[0] if images else None
