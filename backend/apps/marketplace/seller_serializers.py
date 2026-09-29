"""
Shapes of the seller (vendor) API. A vendor sees its own store, products, order parts,
earnings and payouts, and nothing else: customers appear only as a first name and a
delivery city (AGIZA collects and delivers), and other vendors never appear at all.
"""
from __future__ import annotations

from decimal import Decimal

from rest_framework import serializers

from apps.catalog.models import Brand, Category, Condition, Product, Vendor
from apps.locations.models import City
from apps.storefront.serializers import money

from . import commission as commissions
from .models import FulfillmentStatus, VendorFulfillment
from .vendor_products import listing_state

BUSINESS_FIELDS = ["name", "description", "city", "business_address", "contact_person", "phone", "email",
                   "business_type", "legal_name", "registration_number", "tin", "payout_method", "payout_provider",
                   "payout_account_name", "payout_account_number"]


class ApplicationSerializer(serializers.ModelSerializer):
    """Applying to sell (and correcting the application when AGIZA asks for changes)."""

    city = serializers.PrimaryKeyRelatedField(queryset=City.objects.filter(is_active=True))
    name = serializers.CharField(max_length=150)
    business_address = serializers.CharField(max_length=255)
    contact_person = serializers.CharField(max_length=150)
    business_type = serializers.ChoiceField(choices=Vendor.BusinessType.choices)
    description = serializers.CharField(max_length=2000, required=False, allow_blank=True)

    class Meta:
        model = Vendor
        fields = BUSINESS_FIELDS

    def validate_name(self, value: str) -> str:
        value = " ".join(value.split())
        if len(value) < 3:
            raise serializers.ValidationError("Enter your store's name.")
        return value


class StoreProfileSerializer(serializers.ModelSerializer):
    """What an approved vendor keeps up to date itself. The store name, commission and status stay AGIZA's."""

    city = serializers.PrimaryKeyRelatedField(queryset=City.objects.filter(is_active=True), required=False)

    class Meta:
        model = Vendor
        fields = ["description", "city", "business_address", "contact_person", "phone", "email", "payout_method",
                  "payout_provider", "payout_account_name", "payout_account_number"]


def store_media(request, vendor: Vendor, kind: str) -> str | None:
    from django.urls import reverse

    if not getattr(vendor, kind):
        return None
    return request.build_absolute_uri(reverse("storefront:seller-store-media", kwargs={"kind": kind}))


def vendor_payload(vendor: Vendor, request) -> dict:
    rate = commissions.rate_for(Product(category_id=None, subcategory_id=None), vendor) \
        if vendor.commission_mode == Vendor.CommissionMode.CUSTOM else None
    history = [{"status": h.to_status, "status_display": dict(Vendor.ApprovalStatus.choices).get(h.to_status),
                "note": h.note, "at": h.created_at} for h in vendor.status_history.all()]
    return {
        "id": vendor.pk, "reference": vendor.reference, "slug": vendor.slug,
        **{f: getattr(vendor, f) for f in BUSINESS_FIELDS if f != "city"},
        "city": vendor.city_id, "city_name": vendor.city.name if vendor.city_id else None,
        "approval_status": vendor.approval_status, "approval_status_display": vendor.get_approval_status_display(),
        "review_note": vendor.review_note, "verified": vendor.verified, "is_public": vendor.is_public,
        "can_sell": vendor.is_public and vendor.warehouse_id is not None,
        "can_edit_application": vendor.approval_status in ("pending", "changes_requested"),
        "logo": store_media(request, vendor, "logo"), "banner": store_media(request, vendor, "banner"),
        "joined_date": vendor.joined_date, "submitted_at": vendor.submitted_at,
        "commission": rate.label() if rate else "Marketplace rates (by category)",
        "history": history,
    }


# --------------------------------------------------------------------------- #
# Products
# --------------------------------------------------------------------------- #
class SpecSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=80)
    value = serializers.CharField(max_length=200)


class VariantWriteSerializer(serializers.Serializer):
    id = serializers.IntegerField(required=False)
    name = serializers.CharField(max_length=120)
    sku = serializers.CharField(max_length=64, required=False, allow_blank=True)
    price = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0"), required=False,
                                     allow_null=True)
    compare_at_price = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0"),
                                                required=False, allow_null=True)
    weight_kg = serializers.DecimalField(max_digits=10, decimal_places=3, min_value=Decimal("0"), required=False,
                                         allow_null=True)
    stock = serializers.IntegerField(min_value=0, max_value=100000, required=False)
    status = serializers.ChoiceField(choices=["active", "inactive"], default="active")


class SellerProductWriteSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=200)
    sku = serializers.CharField(max_length=64, required=False, allow_blank=True)
    category = serializers.PrimaryKeyRelatedField(queryset=Category.objects.filter(is_active=True, parent__isnull=True))
    subcategory = serializers.PrimaryKeyRelatedField(queryset=Category.objects.filter(is_active=True),
                                                     required=False, allow_null=True)
    brand = serializers.PrimaryKeyRelatedField(queryset=Brand.objects.filter(status="active"), required=False,
                                               allow_null=True)
    condition = serializers.ChoiceField(choices=Condition.choices, default=Condition.NEW)
    condition_description = serializers.CharField(max_length=1000, required=False, allow_blank=True)
    description = serializers.CharField(max_length=5000, required=False, allow_blank=True)
    price = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("1"))
    compare_at_price = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0"),
                                                required=False, allow_null=True)
    weight_kg = serializers.DecimalField(max_digits=10, decimal_places=3, min_value=Decimal("0.001"),
                                         help_text="Needed to calculate delivery")
    length_cm = serializers.DecimalField(max_digits=8, decimal_places=1, min_value=Decimal("0"), required=False,
                                         allow_null=True)
    width_cm = serializers.DecimalField(max_digits=8, decimal_places=1, min_value=Decimal("0"), required=False,
                                        allow_null=True)
    height_cm = serializers.DecimalField(max_digits=8, decimal_places=1, min_value=Decimal("0"), required=False,
                                         allow_null=True)
    keywords = serializers.CharField(max_length=255, required=False, allow_blank=True)
    ready_to_ship_days = serializers.IntegerField(min_value=0, max_value=60, required=False)
    status = serializers.ChoiceField(choices=["draft", "active", "inactive"], required=False)
    stock = serializers.IntegerField(min_value=0, max_value=100000, required=False,
                                     help_text="Units on hand (products without variations)")
    specifications = SpecSerializer(many=True, required=False, max_length=30)
    has_variations = serializers.BooleanField(default=False)
    variants = VariantWriteSerializer(many=True, required=False, max_length=50)

    def validate(self, attrs):
        if attrs.get("has_variations") and not attrs.get("variants") and not self.partial:
            raise serializers.ValidationError({"variants": "Add at least one variation."})
        for row in attrs.get("variants") or []:
            if not row.get("sku"):
                row.pop("sku", None)
        return attrs

    def to_service(self, vendor: Vendor, product: Product | None) -> dict:
        data = dict(self.validated_data)
        for i, row in enumerate(data.get("variants") or []):
            row.setdefault("sku", f"{(data.get('sku') or getattr(product, 'sku', '') or vendor.reference)}-{i + 1}")
        if "variants" in data and product is not None:
            own = set(product.variants.values_list("pk", flat=True))
            for row in data["variants"]:
                if row.get("id") and row["id"] not in own:
                    raise serializers.ValidationError({"variants": "That variation belongs to another product."})
        return data


def _image_url(request, image) -> str:
    from django.urls import reverse

    return request.build_absolute_uri(reverse("storefront:seller-image", kwargs={"pk": image.pk}))


def seller_product_payload(product: Product, request, *, stock: dict | None = None, detail: bool = False) -> dict:
    stock = stock or {}
    variants = [v for v in product.variants.all() if v.is_default != product.has_variations]
    rows = [{"id": v.pk, "name": v.name, "sku": v.sku, "is_default": v.is_default, "status": v.status,
             "price": money(v.effective_price), "compare_at_price": money(v.compare_at_price),
             "weight_kg": str(v.weight_kg) if v.weight_kg is not None else None,
             **stock.get(v.pk, {"quantity": 0, "reserved": 0, "available": 0})} for v in variants]
    images = list(product.images.all())
    body = {
        "id": product.pk, "reference": product.reference, "name": product.name, "sku": product.sku,
        "category": product.category_id, "category_name": product.category.name,
        "subcategory": product.subcategory_id, "brand": product.brand_id,
        "price": money(product.price), "compare_at_price": money(product.compare_at_price),
        "status": product.status, "review_status": product.review_status, "review_note": product.review_note,
        "listing_state": listing_state(product), "has_variations": product.has_variations,
        "stock": sum(r["quantity"] for r in rows), "available": sum(r["available"] for r in rows),
        "image": _image_url(request, images[0]) if images else None,
        "updated_at": product.updated_at, "created_at": product.created_at,
    }
    if detail:
        body.update({
            "condition": product.condition, "condition_description": product.condition_description,
            "description": product.description, "keywords": product.keywords,
            "weight_kg": str(product.weight_kg) if product.weight_kg is not None else None,
            "length_cm": str(product.length_cm) if product.length_cm is not None else None,
            "width_cm": str(product.width_cm) if product.width_cm is not None else None,
            "height_cm": str(product.height_cm) if product.height_cm is not None else None,
            "ready_to_ship_days": product.ready_to_ship_days,
            "specifications": [{"name": s.name, "value": s.value} for s in product.specifications.all()],
            "variants": rows,
            "images": [{"id": img.pk, "url": _image_url(request, img), "is_primary": img.is_primary} for img in images],
        })
    return body


# --------------------------------------------------------------------------- #
# Orders and earnings
# --------------------------------------------------------------------------- #
def _first_name(name: str) -> str:
    return (name or "Customer").split()[0]


def fulfillment_payload(f: VendorFulfillment, request, *, detail: bool = False) -> dict:
    order = f.order
    shop = getattr(order, "shop", None)
    body = {
        "id": f.pk, "reference": f.reference, "order_reference": order.reference, "status": f.status,
        "status_display": f.get_status_display(), "order_status": order.status, "item_count": f.item_count,
        "subtotal": money(f.subtotal), "commission": money(f.commission), "vendor_net": money(f.vendor_net),
        "settlement_status": f.settlement_status, "settlement_display": f.get_settlement_status_display(),
        "customer": _first_name(order.customer.full_name),
        "delivery_city": shop.city.name if shop and shop.city_id else None,
        "created_at": f.created_at, "accepted_at": f.accepted_at, "ready_at": f.ready_at,
        "can_accept": f.status == "pending" and order.status != "cancelled",
        "can_mark_ready": f.status == "accepted" and order.status != "cancelled",
    }
    if detail:
        body["items"] = [{"name": i.product_name, "variant_name": i.variant_name, "sku": i.sku, "quantity": i.quantity,
                          "unit_price": money(i.unit_price), "line_total": money(i.line_total),
                          "commission": money(i.commission_amount)} for i in f.items.all()]
        labels = dict(FulfillmentStatus.choices)
        body["events"] = [{"status": e.to_status, "status_display": labels.get(e.to_status, e.to_status), "note": e.note,
                           "at": e.created_at, "by_you": e.by_vendor}
                          for e in f.events.all()]
        body["payout"] = f.payout.reference if f.payout_id else None
    return body
