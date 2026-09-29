"""
Customer reviews. Only a customer with a delivered order containing a product can review it —
once (they can edit their review). A store's owner can't review its own products, and vendors
can't edit reviews: they may reply publicly or flag a review for AGIZA to look at. Every rating
shown anywhere is computed here from visible reviews; clients never send aggregates.
"""
from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.db.models import Avg, Count, Q
from django.utils import timezone

from apps.core.audit import record_audit
from apps.core.workflow import WorkflowError

from .models import VISIBLE_REVIEW, MarketplaceSettings, ProductReview, ReviewStatus

MODERATION = {"publish": ReviewStatus.PUBLISHED, "hide": ReviewStatus.HIDDEN}


def purchase_of(customer, product):
    """The customer's delivered order line for this product (the proof of purchase), if any."""
    from apps.orders.models import OrderItem

    return (OrderItem.objects.filter(order__customer=customer, order__status="delivered", variant__product=product)
            .exclude(fulfillment__status="cancelled").order_by("-order__created_at", "-id").first())


@transaction.atomic
def submit(customer, product, *, rating: int, title: str = "", body: str = "", account=None,
           request=None) -> tuple[ProductReview, bool]:
    """Create or edit the customer's review of a product they bought. Returns (review, created)."""
    if product.vendor_id and account is not None and product.vendor.owner_id == account.pk:
        raise WorkflowError("You can't review your own store's products.", conflict=True)
    try:
        rating = int(rating)
    except (TypeError, ValueError):
        rating = 0
    if not 1 <= rating <= 5:
        raise WorkflowError("Choose a rating from 1 to 5 stars.", field="rating")
    item = purchase_of(customer, product)
    if item is None:
        raise WorkflowError("You can review products after they are delivered to you.", conflict=True)
    title, body = title.strip()[:120], body.strip()[:2000]
    status = ReviewStatus.PUBLISHED if MarketplaceSettings.load().auto_publish_reviews else ReviewStatus.PENDING
    review = ProductReview.objects.select_for_update().filter(customer=customer, product=product).first()
    created = review is None
    if created:
        review = ProductReview.objects.create(product=product, vendor=product.vendor, customer=customer,
                                              order_item=item, rating=rating, title=title, body=body, status=status)
    else:
        if review.status == ReviewStatus.HIDDEN:
            raise WorkflowError("This review was hidden by AGIZA and can't be edited.", conflict=True)
        review.rating, review.title, review.body = rating, title, body
        review.edited_at = timezone.now()
        review.status = status if review.status != ReviewStatus.FLAGGED else ReviewStatus.FLAGGED
        review.save(update_fields=["rating", "title", "body", "edited_at", "status", "updated_at"])
    record_audit(action="create" if created else "update", request=request, actor=None, instance=review,
                 changes={"rating": [None, rating]}, object_repr=f"Review of {product.name}")
    if created and product.vendor_id:
        from .services import _notify_owner

        _notify_owner(product.vendor, "New review", f"{rating}★ on {product.name}", {"review": review.pk})
    return review, created


@transaction.atomic
def reply(review: ProductReview, *, vendor, text: str) -> ProductReview:
    review = ProductReview.objects.select_for_update().get(pk=review.pk)
    if review.vendor_id != vendor.pk:
        raise WorkflowError("Review not found.", conflict=True)
    text = text.strip()
    if not text:
        raise WorkflowError("Write your reply.", field="text")
    review.vendor_reply = text[:1000]
    review.vendor_replied_at = timezone.now()
    review.save(update_fields=["vendor_reply", "vendor_replied_at", "updated_at"])
    return review


@transaction.atomic
def flag(review: ProductReview, *, vendor, reason: str) -> ProductReview:
    """A vendor asks AGIZA to look at a review (abusive, not about the product…). It stays visible meanwhile."""
    review = ProductReview.objects.select_for_update().get(pk=review.pk)
    if review.vendor_id != vendor.pk:
        raise WorkflowError("Review not found.", conflict=True)
    reason = reason.strip()
    if len(reason) < 5:
        raise WorkflowError("Say why AGIZA should look at this review.", field="reason")
    if review.status == ReviewStatus.PUBLISHED:
        review.status = ReviewStatus.FLAGGED
    review.flag_reason = reason[:255]
    review.save(update_fields=["status", "flag_reason", "updated_at"])
    from .services import _notify_staff

    _notify_staff(f"Review flagged · {review.product.name}", f"{vendor.name}: {reason}"[:500],
                  "/ecommerce?section=reviews&status=flagged")
    return review


@transaction.atomic
def moderate(review: ProductReview, action: str, *, user, note: str = "", request=None) -> ProductReview:
    if action not in MODERATION:
        raise WorkflowError("Choose publish or hide.", field="action")
    review = ProductReview.objects.select_for_update().get(pk=review.pk)
    if action == "hide" and not note.strip():
        raise WorkflowError("Give the reason for hiding the review.", field="note")
    before = review.status
    review.status = MODERATION[action]
    review.moderation_note = note.strip()[:255]
    review.moderated_by = user
    review.save(update_fields=["status", "moderation_note", "moderated_by", "updated_at"])
    record_audit(action="status_change", request=request, actor=user, instance=review,
                 changes={"status": [before, review.status], **({"note": [None, note]} if note else {})})
    return review


# --------------------------------------------------------------------------- #
# Ratings (always computed from visible reviews)
# --------------------------------------------------------------------------- #
def _round(avg) -> str | None:
    return None if avg is None else f"{Decimal(str(avg)).quantize(Decimal('0.1'))}"


def product_ratings(product_ids) -> dict[int, dict]:
    rows = (ProductReview.objects.filter(product_id__in=list(product_ids), status__in=VISIBLE_REVIEW)
            .values("product_id").annotate(avg=Avg("rating"), n=Count("id")))
    return {r["product_id"]: {"rating": _round(r["avg"]), "rating_count": r["n"]} for r in rows}


def distribution(product) -> dict[str, int]:
    rows = dict(ProductReview.objects.filter(product=product, status__in=VISIBLE_REVIEW)
                .values("rating").annotate(n=Count("id")).values_list("rating", "n"))
    return {str(star): rows.get(star, 0) for star in range(5, 0, -1)}


def store_ratings(vendor_ids) -> dict[int, dict]:
    rows = (ProductReview.objects.filter(vendor_id__in=list(vendor_ids), status__in=VISIBLE_REVIEW)
            .values("vendor_id").annotate(avg=Avg("rating"), n=Count("id")))
    return {r["vendor_id"]: {"rating": _round(r["avg"]), "rating_count": r["n"]} for r in rows}


def agiza_rating() -> dict:
    agg = ProductReview.objects.filter(vendor__isnull=True, status__in=VISIBLE_REVIEW).aggregate(
        avg=Avg("rating"), n=Count("id"))
    return {"rating": _round(agg["avg"]), "rating_count": agg["n"]}


def visible_reviews(product):
    return (ProductReview.objects.filter(product=product, status__in=VISIBLE_REVIEW)
            .select_related("customer").order_by("-created_at", "-id"))


def reviewable_items(customer):
    """Delivered purchases the customer hasn't reviewed yet (one per product)."""
    from apps.orders.models import OrderItem

    reviewed = ProductReview.objects.filter(customer=customer).values_list("product_id", flat=True)
    items = (OrderItem.objects.filter(order__customer=customer, order__status="delivered")
             .exclude(fulfillment__status="cancelled").exclude(variant__product_id__in=reviewed)
             .select_related("variant__product", "order").order_by("-order__created_at"))
    seen, out = set(), []
    for item in items:
        if item.variant.product_id not in seen:
            seen.add(item.variant.product_id)
            out.append(item)
    return out


VISIBLE_Q = Q(status__in=VISIBLE_REVIEW)
