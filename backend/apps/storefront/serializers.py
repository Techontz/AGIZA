"""
Customer app serializers. Shop-front shapes only: nothing staff-only (costs, vendor
profit, internal notes, handlers) is ever exposed, and money is always computed on
the server; inputs never carry prices or totals.
"""
from __future__ import annotations

from decimal import Decimal

from rest_framework import serializers

from apps.catalog.models import Category, Product, ProductVariant
from apps.locations.models import City
from apps.orders.models import Order
from apps.orders.workflows import OrderType, status_label
from apps.parties.models import Address, Customer
from apps.quotes.models import QuoteRequest

from .catalog import image_url, primary_image
from .phone import display_phone


def money(value) -> str | None:
    """Every amount the app receives has two decimals ("3000.00"), whatever its source."""
    return None if value is None else f"{Decimal(value):.2f}"


# --------------------------------------------------------------------------- #
# Account
# --------------------------------------------------------------------------- #
class RequestCodeSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=32)
    purpose = serializers.ChoiceField(choices=["register", "reset_password"])


class RegisterSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=32)
    code = serializers.CharField(max_length=10)
    full_name = serializers.CharField(max_length=150)
    email = serializers.EmailField(required=False, allow_blank=True)
    password = serializers.CharField(max_length=128, write_only=True, trim_whitespace=False)


class LoginSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=32)
    password = serializers.CharField(max_length=128, write_only=True, trim_whitespace=False)


class RefreshSerializer(serializers.Serializer):
    refresh = serializers.CharField()


class ResetPasswordSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=32)
    code = serializers.CharField(max_length=10)
    password = serializers.CharField(max_length=128, write_only=True, trim_whitespace=False)


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(max_length=128, trim_whitespace=False)
    new_password = serializers.CharField(max_length=128, trim_whitespace=False)


class DeleteAccountSerializer(serializers.Serializer):
    password = serializers.CharField(max_length=128, trim_whitespace=False)


class ProfileSerializer(serializers.ModelSerializer):
    phone = serializers.SerializerMethodField()

    class Meta:
        model = Customer
        fields = ["reference", "full_name", "email", "phone", "company_name", "created_at"]
        read_only_fields = ["reference", "phone", "created_at"]
        extra_kwargs = {"full_name": {"allow_blank": False}}

    def get_phone(self, customer) -> str:
        return display_phone(customer.account.phone)

    def validate_email(self, value: str) -> str:
        value = (value or "").strip().lower()
        if value and Customer.objects.filter(email=value).exclude(pk=self.instance.pk).exists():
            raise serializers.ValidationError("This email is already used by another customer.")
        return value


class DeviceSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=255)
    platform = serializers.ChoiceField(choices=["android", "ios", "unknown"], default="unknown")


# --------------------------------------------------------------------------- #
# Locations & addresses
# --------------------------------------------------------------------------- #
class CitySerializer(serializers.ModelSerializer):
    region = serializers.CharField(source="region.name", default="")
    country = serializers.CharField(source="country.iso2")

    class Meta:
        model = City
        fields = ["id", "name", "region", "country"]


class AddressSerializer(serializers.ModelSerializer):
    city = serializers.PrimaryKeyRelatedField(queryset=City.objects.filter(is_active=True))
    city_name = serializers.CharField(source="city.name", read_only=True)
    region_name = serializers.CharField(source="region.name", read_only=True)
    one_line = serializers.CharField(read_only=True)

    class Meta:
        model = Address
        fields = ["id", "label", "line1", "area", "city", "city_name", "region_name", "latitude", "longitude",
                  "is_default", "one_line"]

    def validate_line1(self, value: str) -> str:
        if not value.strip():
            raise serializers.ValidationError("Enter the street, building or a landmark.")
        return value.strip()

    def validate(self, attrs):
        lat, lng = attrs.get("latitude"), attrs.get("longitude")
        if (lat is None) != (lng is None):
            raise serializers.ValidationError({"latitude": "Send both latitude and longitude, or neither."})
        if lat is not None and not (-90 <= lat <= 90 and -180 <= lng <= 180):
            raise serializers.ValidationError({"latitude": "The location is out of range."})
        return attrs


# --------------------------------------------------------------------------- #
# Catalogue
# --------------------------------------------------------------------------- #
class CategorySerializer(serializers.ModelSerializer):
    children = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = ["id", "name", "slug", "description", "children"]

    def get_children(self, category) -> list[dict]:
        children = getattr(category, "shop_children", None)
        if children is None:
            return []
        return [{"id": c.id, "name": c.name, "slug": c.slug} for c in children]


def _price_range(product) -> tuple:
    prices = [v.effective_price for v in getattr(product, "shop_variants", [])] or [product.price]
    return min(prices), max(prices)


class ProductCardSerializer(serializers.ModelSerializer):
    """Product in a list or grid."""

    price = serializers.SerializerMethodField()
    price_max = serializers.SerializerMethodField()
    image = serializers.SerializerMethodField()
    brand = serializers.CharField(source="brand.name", default=None)
    category = serializers.CharField(source="category.name")
    in_stock = serializers.SerializerMethodField()
    labels = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = ["id", "name", "price", "price_max", "compare_at_price", "image", "brand", "category",
                  "condition", "featured", "ofa_kali", "in_stock", "labels"]

    def get_price(self, product) -> str:
        return money(_price_range(product)[0])

    def get_price_max(self, product) -> str:
        return money(_price_range(product)[1])

    def get_image(self, product) -> str | None:
        return image_url(self.context.get("request"), primary_image(product))

    def get_in_stock(self, product) -> bool:
        stock = self.context.get("stock", {})
        return product.status == "active" and any(stock.get(v.pk, 0) > 0 for v in getattr(product, "shop_variants", []))

    def get_labels(self, product) -> list[dict]:
        return [{"name": lb.name, "color": lb.color} for lb in product.labels.all() if lb.visible]


class VariantSerializer(serializers.ModelSerializer):
    price = serializers.SerializerMethodField()
    compare_at_price = serializers.SerializerMethodField()
    available = serializers.SerializerMethodField()
    options = serializers.SerializerMethodField()

    class Meta:
        model = ProductVariant
        fields = ["id", "name", "sku", "is_default", "price", "compare_at_price", "available", "options"]

    def get_price(self, variant) -> str:
        return money(variant.effective_price)

    def get_compare_at_price(self, variant) -> str | None:
        value = variant.compare_at_price if variant.compare_at_price is not None else variant.product.compare_at_price
        return money(value)

    def get_available(self, variant) -> int:
        if variant.product.status != "active":
            return 0
        return self.context.get("stock", {}).get(variant.pk, 0)

    def get_options(self, variant) -> list[dict]:
        return [{"option": v.option.name, "value": v.value} for v in variant.option_values.all()]


class ProductDetailSerializer(ProductCardSerializer):
    images = serializers.SerializerMethodField()
    variants = serializers.SerializerMethodField()
    specifications = serializers.SerializerMethodField()
    subcategory = serializers.CharField(source="subcategory.name", default=None)
    condition_display = serializers.CharField(source="get_condition_display")
    shipping_methods = serializers.SerializerMethodField()

    class Meta(ProductCardSerializer.Meta):
        fields = [*ProductCardSerializer.Meta.fields, "description", "condition_display", "condition_description",
                  "subcategory", "images", "variants", "specifications", "shipping_methods", "ready_to_ship_days",
                  "allow_chat"]

    def get_images(self, product) -> list[str]:
        request = self.context.get("request")
        return [image_url(request, img) for img in product.images.all()]

    def get_variants(self, product) -> list[dict]:
        return VariantSerializer(getattr(product, "shop_variants", []), many=True, context=self.context).data

    def get_specifications(self, product) -> list[dict]:
        return [{"name": s.name, "value": s.value} for s in product.specifications.all()]

    def get_shipping_methods(self, product) -> list[str]:
        return [m.name for m in product.shipping_methods.all() if m.status == "active"]


# --------------------------------------------------------------------------- #
# Cart & checkout
# --------------------------------------------------------------------------- #
class CartAddSerializer(serializers.Serializer):
    variant = serializers.PrimaryKeyRelatedField(queryset=ProductVariant.objects.select_related("product"))
    quantity = serializers.IntegerField(min_value=1, max_value=100, default=1)


class CartQuantitySerializer(serializers.Serializer):
    quantity = serializers.IntegerField(min_value=1, max_value=100)


def cart_payload(summary: dict, request) -> dict:
    lines = []
    for line in summary["lines"]:
        item = line["item"]
        variant, product = item.variant, item.variant.product
        lines.append({
            "id": item.pk,
            "product_id": product.pk,
            "variant_id": variant.pk,
            "name": product.name,
            "variant_name": "" if variant.is_default else variant.name,
            "image": image_url(request, primary_image(product)),
            "unit_price": money(line["unit_price"]),
            "quantity": item.quantity,
            "line_total": money(line["line_total"]),
            "available": line["available"],
            "issue": line["issue"],
        })
    return {"items": lines, "item_count": summary["item_count"], "subtotal": money(summary["subtotal"]),
            "currency": summary["currency"], "has_issues": summary["has_issues"]}


class CheckoutPreviewSerializer(serializers.Serializer):
    address = serializers.IntegerField()
    shipping_method = serializers.IntegerField(required=False, allow_null=True)


class PlaceOrderSerializer(serializers.Serializer):
    address = serializers.IntegerField()
    shipping_method = serializers.IntegerField()
    payment_method = serializers.CharField(max_length=20)
    notes = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")
    idempotency_key = serializers.RegexField(r"^[A-Za-z0-9_-]{8,64}$", max_length=64)
    expected_total = serializers.DecimalField(max_digits=14, decimal_places=2, required=False, allow_null=True)




def option_payload(option: dict) -> dict:
    return {**option, "cost": money(option["cost"])}


def quote_payload(quote, request, *, payment_methods: list[dict]) -> dict:
    return {
        "cart": cart_payload(quote.summary, request),
        "shipping_options": [option_payload(o) for o in quote.options],
        "selected_shipping_method": quote.selected["method_id"] if quote.selected else None,
        "subtotal": money(quote.summary["subtotal"]),
        "shipping_fee": money(quote.shipping_fee),
        "total": money(quote.total),
        "currency": quote.summary["currency"],
        "payment_methods": payment_methods,
        "issues": quote.issues,
        "can_place_order": quote.can_place_order,
    }


# --------------------------------------------------------------------------- #
# Orders
# --------------------------------------------------------------------------- #
ACTIVE_GROUP = "active"
TERMINAL_STATUSES = {"delivered", "completed", "cancelled"}


def order_group(order: Order) -> str:
    if order.status == "cancelled":
        return "cancelled"
    return "completed" if order.status in TERMINAL_STATUSES else ACTIVE_GROUP


class OrderCardSerializer(serializers.ModelSerializer):
    type = serializers.CharField(source="order_type")
    type_display = serializers.CharField(source="get_order_type_display")
    status_display = serializers.SerializerMethodField()
    group = serializers.SerializerMethodField()
    total = serializers.DecimalField(source="total_amount", max_digits=14, decimal_places=2, allow_null=True)
    payment_status = serializers.SerializerMethodField()
    image = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = ["reference", "type", "type_display", "status", "status_display", "group", "item_details",
                  "total", "currency", "payment_status", "image", "created_at"]

    def get_status_display(self, order) -> str:
        return status_label(order.order_type, order.status)

    def get_group(self, order) -> str:
        return order_group(order)

    def get_payment_status(self, order) -> str:
        from apps.orders.services import payment_summary, prefetched_net_paid

        return payment_summary(order, paid=prefetched_net_paid(order)).status

    def get_image(self, order) -> str | None:
        if order.order_type != OrderType.SHOP:
            return None
        items = list(order.items.all())
        product = items[0].variant.product if items else None
        return image_url(self.context.get("request"), primary_image(product)) if product else None


class QuoteRequestSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    order = serializers.SerializerMethodField()
    can_reply = serializers.SerializerMethodField()

    class Meta:
        model = QuoteRequest
        fields = ["id", "reference", "service_type", "description", "origin", "destination", "status",
                  "status_display", "requested_at", "quoted_amount", "currency", "estimated_delivery",
                  "response_notes", "responded_at", "customer_replied_at", "order", "can_reply"]

    def get_order(self, quote) -> str | None:
        order = getattr(quote, "created_order", None)
        return order.reference if order else None

    def get_can_reply(self, quote) -> bool:
        return quote.status == "waiting_reply"


class QuoteCreateSerializer(serializers.Serializer):
    REQUEST_TYPES = {"buy_for_me": "Buy for me", "deliver_for_me": "Deliver for me"}

    request_type = serializers.ChoiceField(choices=list(REQUEST_TYPES))
    item_name = serializers.CharField(max_length=160)
    link = serializers.URLField(max_length=500, required=False, allow_blank=True)
    quantity = serializers.IntegerField(min_value=1, max_value=100000, default=1)
    origin_country = serializers.CharField(max_length=2)
    destination_city = serializers.PrimaryKeyRelatedField(queryset=City.objects.filter(is_active=True))
    weight_kg = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, allow_null=True,
                                         min_value=0)
    tracking_number = serializers.CharField(max_length=80, required=False, allow_blank=True)
    details = serializers.CharField(max_length=2000, required=False, allow_blank=True)

    def validate(self, attrs):
        if attrs["request_type"] == "deliver_for_me" and not attrs.get("tracking_number", "").strip():
            raise serializers.ValidationError({"tracking_number": "Enter the supplier's tracking number."})
        return attrs


class ReplySerializer(serializers.Serializer):
    note = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")


class CancelSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=300)


class ChatSendSerializer(serializers.Serializer):
    body = serializers.CharField(max_length=2000)
