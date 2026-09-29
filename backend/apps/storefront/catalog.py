"""
What the shop shows customers: visible products, sellable variants and live stock.

Availability follows `inventory.reserve`: stock counts only at warehouses that are
active or full, so the app never offers quantities checkout would refuse.
"""
from __future__ import annotations

from django.db.models import F, Prefetch, Q, Sum
from django.urls import reverse

from apps.catalog.models import (
    PUBLISHABLE_REVIEW,
    Category,
    Product,
    ProductImage,
    ProductStatus,
    ProductVariant,
    Status,
    VariantStatus,
    Vendor,
)
from apps.inventory.models import StockItem

VISIBLE_STATUSES = (ProductStatus.ACTIVE, ProductStatus.OUT_OF_STOCK)
RESERVABLE_WAREHOUSE_STATUSES = ("active", "full")
AGIZA_STORE_SLUG = "agiza"

# A marketplace product is shown when AGIZA sells it, or its vendor is approved and active;
# vendor-submitted products also need to have passed moderation.
SELLER_IS_PUBLIC = Q(vendor__isnull=True) | Q(vendor__approval_status=Vendor.ApprovalStatus.APPROVED,
                                               vendor__status=Status.ACTIVE)


def public_vendors():
    return Vendor.objects.filter(approval_status=Vendor.ApprovalStatus.APPROVED, status=Status.ACTIVE)


def visible_products():
    return (
        Product.objects.filter(status__in=VISIBLE_STATUSES, category__is_active=True,
                               review_status__in=PUBLISHABLE_REVIEW)
        .filter(SELLER_IS_PUBLIC)
        .select_related("brand", "category", "subcategory", "vendor__city")
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
    product = variant.product
    vendor_ok = product.vendor_id is None or product.vendor.is_public
    return (variant.status == VariantStatus.ACTIVE and product.status == ProductStatus.ACTIVE and vendor_ok
            and product.review_status in PUBLISHABLE_REVIEW)


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


def vendor_media_url(request, vendor: Vendor | None, kind: str) -> str | None:
    if vendor is None or not getattr(vendor, kind):
        return None
    path = reverse("storefront:store-media", kwargs={"slug": vendor.slug, "kind": kind})
    return request.build_absolute_uri(path) if request is not None else path


def seller_payload(request, vendor: Vendor | None) -> dict:
    """Who sells a product, as customers see it ("Sold by …")."""
    if vendor is None:
        return {"slug": AGIZA_STORE_SLUG, "name": "AGIZA", "logo": None, "verified": True, "is_agiza": True,
                "city": None}
    return {"slug": vendor.slug, "name": vendor.name, "logo": vendor_media_url(request, vendor, "logo"),
            "verified": vendor.verified, "is_agiza": False, "city": vendor.city.name if vendor.city_id else None}
