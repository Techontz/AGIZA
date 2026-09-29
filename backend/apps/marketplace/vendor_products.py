"""
Products a vendor manages itself. Everything goes through the same catalogue service
staff use (`catalog.services.save_product`), with what the vendor may not choose
forced on the server:

- the product belongs to the vendor, and its stock is at the vendor's own location;
- commission fields, featuring, labels, costs and shipping profiles stay AGIZA's;
- with product review on, a new product, or a change to what customers see (name,
  description, category, brand, condition, specifications, images), waits for AGIZA's
  approval before it is shown. Price and stock changes don't need a review.
"""
from __future__ import annotations

import uuid

from django.db import transaction
from django.utils import timezone

from apps.catalog import services as catalog
from apps.catalog.models import LocationKind, Product, ProductImage, ProductStatus, ReviewStatus, Vendor
from apps.core.audit import record_audit
from apps.core.workflow import WorkflowError

from .models import MarketplaceSettings

VENDOR_STATUSES = {ProductStatus.DRAFT, ProductStatus.ACTIVE, ProductStatus.INACTIVE}
REVIEWED_FIELDS = {"name", "description", "category", "subcategory", "brand", "condition", "condition_description",
                   "specifications", "has_variations"}


def listing_state(product: Product) -> str:
    """One word for the vendor: draft, pending_review, published, rejected, disabled or inactive."""
    if product.review_status == ReviewStatus.DISABLED:
        return "disabled"
    if product.status == ProductStatus.DRAFT:
        return "draft"
    if product.review_status == ReviewStatus.REJECTED:
        return "rejected"
    if product.review_status == ReviewStatus.PENDING:
        return "pending_review"
    if product.status in (ProductStatus.ACTIVE, ProductStatus.OUT_OF_STOCK):
        return "published"
    return "inactive"


def require_active(vendor: Vendor):
    if vendor.approval_status == Vendor.ApprovalStatus.SUSPENDED:
        raise WorkflowError("Your store is suspended, so it can't be changed. Contact AGIZA.", conflict=True)
    if not vendor.is_public:
        raise WorkflowError("Your store isn't approved yet.", conflict=True)
    if vendor.warehouse_id is None:
        raise WorkflowError("Your store location isn't set up yet. Contact AGIZA.", conflict=True)


def _needs_review(data: dict, product: Product | None) -> bool:
    if not MarketplaceSettings.load().require_product_review:
        return False
    if product is None:
        return True
    if product.review_status in (ReviewStatus.PENDING, ReviewStatus.REJECTED):
        return True  # still waiting, or a correction after a rejection
    for key in REVIEWED_FIELDS & set(data):
        current = getattr(product, key, None) if key != "specifications" else None
        if key == "specifications" or current != data[key]:
            return True
    return False


@transaction.atomic
def save(vendor: Vendor, data: dict, *, product: Product | None = None, request=None) -> Product:
    require_active(vendor)
    data = dict(data)
    if product is not None:
        product = Product.objects.select_for_update().get(pk=product.pk)
        if product.vendor_id != vendor.pk:
            raise WorkflowError("Product not found.", conflict=True)
        if product.review_status == ReviewStatus.DISABLED:
            raise WorkflowError("AGIZA disabled this product. Contact AGIZA to discuss it.", conflict=True)
    status = data.get("status")
    if status is not None and status not in VENDOR_STATUSES:
        raise WorkflowError("Choose Draft, Active or Inactive.", field="status")
    if product is None and not data.get("sku"):
        data["sku"] = f"{vendor.reference}-{uuid.uuid4().hex[:6].upper()}"
    review = _needs_review(data, product)
    # What the vendor can never choose:
    data.update(vendor=vendor, location_kind=LocationKind.VENDOR, location=vendor.warehouse)
    if product is None:
        data.setdefault("status", ProductStatus.DRAFT)
        data["review_status"] = ReviewStatus.PENDING if review else ReviewStatus.NOT_REQUIRED
    elif review and product.review_status != ReviewStatus.PENDING:
        data["review_status"] = ReviewStatus.PENDING
    product = catalog.save_product(data, user=None, product=product, request=request)
    if data.get("review_status") == ReviewStatus.PENDING and product.status != ProductStatus.DRAFT:
        _submitted(vendor, product)
    return product


def _submitted(vendor: Vendor, product: Product):
    from .services import _notify_staff

    _notify_staff(f"Product to review · {vendor.name}", product.name,
                  f"/ecommerce?section=products&review=pending&product={product.pk}")


@transaction.atomic
def add_image(vendor: Vendor, product: Product, upload, content_type: str, request=None) -> ProductImage:
    require_active(vendor)
    if product.vendor_id != vendor.pk:
        raise WorkflowError("Product not found.", conflict=True)
    if product.images.count() >= 10:
        raise WorkflowError("A product can have up to 10 images.", field="file")
    primary = not product.images.filter(is_primary=True, variant__isnull=True).exists()
    image = ProductImage.objects.create(product=product, file=upload, content_type=content_type, is_primary=primary,
                                        sort_order=product.images.count())
    _images_changed(vendor, product)
    record_audit(action="create", request=request, instance=image, changes={"product": [None, product.sku]},
                 object_repr=f"Image of {product.name} (by {vendor.name})")
    return image


@transaction.atomic
def remove_image(vendor: Vendor, image: ProductImage, request=None):
    require_active(vendor)
    product = image.product
    was_primary = image.is_primary
    image.file.delete(save=False)
    image.delete()
    if was_primary:
        nxt = product.images.filter(variant__isnull=True).order_by("sort_order", "id").first()
        if nxt:
            nxt.is_primary = True
            nxt.save(update_fields=["is_primary"])
    _images_changed(vendor, product)


@transaction.atomic
def make_primary(vendor: Vendor, image: ProductImage):
    require_active(vendor)
    product = image.product
    product.images.filter(is_primary=True, variant__isnull=True).update(is_primary=False)
    image.is_primary = True
    image.save(update_fields=["is_primary"])


def _images_changed(vendor: Vendor, product: Product):
    """New pictures are part of what customers see: they go through review like other content."""
    if MarketplaceSettings.load().require_product_review and product.review_status == ReviewStatus.APPROVED:
        Product.objects.filter(pk=product.pk).update(review_status=ReviewStatus.PENDING, updated_at=timezone.now())
        product.review_status = ReviewStatus.PENDING
        if product.status != ProductStatus.DRAFT:
            _submitted(vendor, product)


@transaction.atomic
def set_stock(vendor: Vendor, variant, quantity: int, request=None):
    """The vendor's count of what it has on hand at its own location (the stock ledger records the change)."""
    from apps.inventory import services as inventory
    from apps.inventory.models import StockItem

    require_active(vendor)
    if variant.product.vendor_id != vendor.pk:
        raise WorkflowError("Product not found.", conflict=True)
    if quantity < 0 or quantity > 100000:
        raise WorkflowError("Enter a quantity between 0 and 100,000.", field="quantity")
    item = StockItem.objects.filter(variant=variant, warehouse=vendor.warehouse).first()
    if item is None:
        if quantity > 0:
            inventory.receive(variant, vendor.warehouse, quantity, user=None, note=f"Stock set by {vendor.name}",
                              request=request)
        return
    if item.quantity != quantity:
        inventory.adjust(item, new_quantity=quantity, user=None, reason=f"Stock count by {vendor.name}", request=request)


@transaction.atomic
def delete(vendor: Vendor, product: Product, request=None) -> str:
    """Delete a product that was never ordered; otherwise it is deactivated (order history keeps it)."""
    require_active(vendor)
    from apps.orders.models import OrderItem

    if OrderItem.objects.filter(variant__product=product).exists():
        product.status = ProductStatus.INACTIVE
        product.save(update_fields=["status", "updated_at"])
        return "deactivated"
    from apps.inventory.models import StockItem

    if StockItem.objects.filter(variant__product=product, quantity__gt=0).exists():
        raise WorkflowError("Set the stock to 0 before deleting this product, or deactivate it.", conflict=True)
    for image in product.images.all():
        image.file.delete(save=False)
    StockItem.objects.filter(variant__product=product).delete()
    record_audit(action="delete", request=request, instance=product, changes={},
                 object_repr=f"{product.name} (by {vendor.name})")
    product.delete()
    return "deleted"


# --------------------------------------------------------------------------- #
# Staff moderation
# --------------------------------------------------------------------------- #
MODERATION = {"approve": ReviewStatus.APPROVED, "reject": ReviewStatus.REJECTED, "disable": ReviewStatus.DISABLED}


@transaction.atomic
def moderate(product: Product, action: str, *, user, note: str = "", request=None) -> Product:
    product = Product.objects.select_for_update().select_related("vendor").get(pk=product.pk)
    if product.vendor_id is None or not product.vendor.self_service:
        raise WorkflowError("Only products vendors manage themselves go through review.", conflict=True)
    target = MODERATION[action]
    note = note.strip()
    if target in (ReviewStatus.REJECTED, ReviewStatus.DISABLED) and not note:
        raise WorkflowError("Tell the vendor why.", field="note")
    if target == ReviewStatus.APPROVED and product.review_status == ReviewStatus.APPROVED:
        raise WorkflowError("This product is already approved.", conflict=True)
    before = product.review_status
    product.review_status = target
    product.review_note = note
    product.reviewed_at = timezone.now()
    product.reviewed_by = user
    product.save(update_fields=["review_status", "review_note", "reviewed_at", "reviewed_by", "updated_at"])
    record_audit(action="status_change", request=request, actor=user, instance=product,
                 changes={"review_status": [before, target], **({"note": [None, note]} if note else {})})
    from .services import _notify_owner

    titles = {ReviewStatus.APPROVED: "Product approved", ReviewStatus.REJECTED: "Product needs changes",
              ReviewStatus.DISABLED: "Product disabled by AGIZA"}
    _notify_owner(product.vendor, titles[target], f"{product.name}{': ' + note if note else ' is now live.'}",
                  {"product": product.pk})
    return product
