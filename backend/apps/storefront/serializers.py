"""
Customer app serializers. Shop-front shapes only: nothing staff-only (costs, vendor
profit, internal notes, handlers) is ever exposed, and money is always computed on
the server; inputs never carry prices or totals.
"""
from __future__ import annotations

from decimal import Decimal

from django.urls import reverse
from rest_framework import serializers

from apps.catalog.models import Category, Product, ProductVariant
from apps.locations.models import City
from apps.orders.models import Order
from apps.orders.workflows import OrderType, status_label
from apps.parties.models import Address, Customer
from apps.quotes.models import QuoteRequest

from .catalog import image_url, primary_image, seller_payload, vendor_media_url
from .phone import display_phone, normalize_phone


def payment_window_hours() -> int:
    from apps.shipping_engine.models import EngineSettings

    return EngineSettings.load().import_payment_window_hours


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
    app = serializers.ChoiceField(choices=["customer", "seller"], default="customer")


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
    available = serializers.SerializerMethodField()
    labels = serializers.SerializerMethodField()
    vendor = serializers.SerializerMethodField()
    rating = serializers.SerializerMethodField()
    rating_count = serializers.SerializerMethodField()
    ships_from = serializers.SerializerMethodField()
    can_request = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = ["id", "name", "price", "price_max", "compare_at_price", "image", "brand", "category",
                  "condition", "featured", "ofa_kali", "in_stock", "available", "labels", "vendor", "created_at", "rating",
                  "rating_count", "ships_from", "can_request"]

    def get_ships_from(self, product) -> str | None:
        """The country an imported product ships from (e.g. "China"); null for products held in Tanzania."""
        return self.context.get("imported", {}).get(product.pk)

    def _rating(self, product) -> dict:
        return self.context.get("ratings", {}).get(product.pk, {"rating": None, "rating_count": 0})

    def get_rating(self, product) -> str | None:
        return self._rating(product)["rating"]

    def get_rating_count(self, product) -> int:
        return self._rating(product)["rating_count"]

    def get_vendor(self, product) -> dict:
        return seller_payload(self.context.get("request"), product.vendor)

    def get_price(self, product) -> str:
        return money(_price_range(product)[0])

    def get_price_max(self, product) -> str:
        return money(_price_range(product)[1])

    def get_image(self, product) -> str | None:
        return image_url(self.context.get("request"), primary_image(product))

    def get_in_stock(self, product) -> bool:
        stock = self.context.get("stock", {})
        return product.status == "active" and any(stock.get(v.pk, 0) > 0 for v in getattr(product, "shop_variants", []))

    def get_available(self, product) -> int:
        """Units customers can buy now, over all shop variants (shown as "8 in stock" on tiles).
        Imported products count as orderable (MAX_LINE_QUANTITY per variant) since AGIZA buys them abroad."""
        if product.status != "active":
            return 0
        stock = self.context.get("stock", {})
        return sum(max(stock.get(v.pk, 0), 0) for v in getattr(product, "shop_variants", []))

    def get_can_request(self, product) -> bool:
        """Out of stock (nothing to buy now; imported products are always orderable): the customer can
        ask AGIZA to source it (Intake & Quotes). Every out-of-stock product can be requested."""
        return self.get_available(product) == 0

    def get_labels(self, product) -> list[dict]:
        return [{"name": lb.name, "color": lb.color} for lb in product.labels.all() if lb.visible]


def product_requestable(product) -> bool:
    """
    Whether a customer may ask AGIZA for this shop product (the out-of-stock "Request" button):
    shown in the shop and out of stock now. Same rule as ProductCardSerializer.can_request:
    imported products are bought abroad, so never out of stock.
    """
    from .catalog import available_by_variant, visible_products
    from .shipping import is_imported, store_hub

    product = visible_products().filter(pk=product.pk).first()
    if product is None:
        return False
    if product.status != "active":
        return True
    if is_imported(product, store_hub()):
        return False
    stock = available_by_variant(v.pk for v in product.shop_variants)
    return not any(stock.get(v.pk, 0) > 0 for v in product.shop_variants)


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
# Stores (vendors)
# --------------------------------------------------------------------------- #
def store_payload(request, vendor, *, products_count: int | None = None, detail: bool = False,
                  rating: dict | None = None) -> dict:
    """
    A store as customers see it. Never includes business, payout or commission details. The rating
    is computed from customer reviews (pass it in to avoid a query per store).
    """
    from apps.marketplace import reviews

    if vendor is None:  # the products AGIZA sells itself
        from apps.catalog.models import StoreSettings

        store = StoreSettings.load()
        rating = rating or reviews.agiza_rating()
        data = {"slug": "agiza", "name": "AGIZA", "logo": None, "banner": None, "verified": True, "is_agiza": True,
                "city": store.location.name if store.location_id else None, "rating": rating["rating"],
                "rating_count": rating["rating_count"], "joined": None, "products_count": products_count}
        if detail:
            data["description"] = store.description or "Products sold and delivered by AGIZA."
        return data
    data = {"slug": vendor.slug, "name": vendor.name, "logo": vendor_media_url(request, vendor, "logo"),
            "banner": vendor_media_url(request, vendor, "banner"), "verified": vendor.verified, "is_agiza": False,
            "city": vendor.city.name if vendor.city_id else (vendor.location or None),
            "joined": vendor.joined_date, "products_count": products_count}
    rating = rating if rating is not None else reviews.store_ratings([vendor.pk]).get(vendor.pk, {})
    data["rating"] = rating.get("rating")
    data["rating_count"] = rating.get("rating_count", 0)
    if detail:
        data["description"] = vendor.description
    return data


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
            "id": item.pk,  # null in a visitor's (browser) cart
            "vendor": seller_payload(request, product.vendor),
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
            "imported": line["imported"],  # ships from abroad (bought after payment)
            "origin": line["origin"],  # e.g. "China"
        })
    groups = [{"vendor": seller_payload(request, g["vendor"]), "subtotal": money(g["subtotal"]),
               "variant_ids": [line["item"].variant_id for line in g["lines"]]} for g in summary["groups"]]
    return {"items": lines, "groups": groups, "item_count": summary["item_count"],
            "subtotal": money(summary["subtotal"]), "currency": summary["currency"],
            "has_issues": summary["has_issues"], "has_imported": summary["has_imported"]}


class GuestCartSerializer(serializers.Serializer):
    class Line(serializers.Serializer):
        variant = serializers.IntegerField(min_value=1)
        quantity = serializers.IntegerField(min_value=1, max_value=100)

    items = Line(many=True, allow_empty=True, max_length=50)


class CheckoutPreviewSerializer(serializers.Serializer):
    address = serializers.IntegerField()
    shipping_method = serializers.IntegerField(required=False, allow_null=True)
    import_method = serializers.IntegerField(required=False, allow_null=True)


class PlaceOrderSerializer(serializers.Serializer):
    address = serializers.IntegerField()
    shipping_method = serializers.IntegerField()
    import_method = serializers.IntegerField(required=False, allow_null=True)
    payment_method = serializers.CharField(max_length=20)
    notes = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")
    idempotency_key = serializers.RegexField(r"^[A-Za-z0-9_-]{8,64}$", max_length=64)
    expected_total = serializers.DecimalField(max_digits=14, decimal_places=2, required=False, allow_null=True)


class DeliveryEstimateSerializer(serializers.Serializer):
    variant = serializers.IntegerField(min_value=1)
    quantity = serializers.IntegerField(min_value=1, max_value=100, default=1)
    city = serializers.PrimaryKeyRelatedField(queryset=City.objects.filter(is_active=True))


class GuestCheckoutPreviewSerializer(serializers.Serializer):
    """Website checkout without an account: the browser cart and the delivery city."""

    items = GuestCartSerializer.Line(many=True, max_length=50)
    city = serializers.PrimaryKeyRelatedField(queryset=City.objects.filter(is_active=True))
    shipping_method = serializers.IntegerField(required=False, allow_null=True)
    import_method = serializers.IntegerField(required=False, allow_null=True)


class GuestPlaceOrderSerializer(serializers.Serializer):
    items = GuestCartSerializer.Line(many=True, max_length=50)
    full_name = serializers.CharField(max_length=150)
    phone = serializers.CharField(max_length=32)
    email = serializers.EmailField(required=False, allow_blank=True, default="")
    city = serializers.PrimaryKeyRelatedField(queryset=City.objects.filter(is_active=True))
    line1 = serializers.CharField(max_length=255)
    area = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")
    shipping_method = serializers.IntegerField()
    import_method = serializers.IntegerField(required=False, allow_null=True)
    payment_method = serializers.CharField(max_length=20)
    notes = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")
    idempotency_key = serializers.RegexField(r"^[A-Za-z0-9_-]{8,64}$", max_length=64)
    expected_total = serializers.DecimalField(max_digits=14, decimal_places=2, required=False, allow_null=True)

    def validate_full_name(self, value: str) -> str:
        if not value.strip():
            raise serializers.ValidationError("Enter your full name.")
        return value.strip()

    def validate_phone(self, value: str) -> str:
        phone = normalize_phone(value)
        if not phone:
            raise serializers.ValidationError("Enter a valid phone number, e.g. 0712 345 678.")
        return phone

    def validate_email(self, value: str) -> str:
        return (value or "").strip().lower()

    def validate_line1(self, value: str) -> str:
        if not value.strip():
            raise serializers.ValidationError("Enter the street, building or a landmark.")
        return value.strip()

    def validate_area(self, value: str) -> str:
        return value.strip()




def option_payload(option: dict) -> dict:
    shipments = [{"label": sh["label"], "origin": sh["origin"], "cost": money(sh["cost"])}
                 for sh in option.get("shipments") or []]
    return {**option, "cost": money(option["cost"]), "shipments": shipments}


def quote_payload(quote, request, *, payment_methods: list[dict] | None = None) -> dict:
    """
    shipping_fee is the whole delivery charge: import_fee (abroad → Tanzania, for imported items)
    plus delivery_fee (to the customer's address). total = subtotal + shipping_fee + customs_fee;
    customs estimates (customs.estimate) are shown but not charged. Everything is computed here.
    delivery_fee_pending: the chosen option needs a manual quote (option.manual_quote): delivery_fee and
    shipping_fee are null, total is everything but the delivery, and the order can't be paid until AGIZA
    sets the delivery cost.
    """
    return {
        "cart": cart_payload(quote.summary, request),
        "shipping_options": [option_payload(o) for o in quote.options],
        "selected_shipping_method": quote.selected["method_id"] if quote.selected else None,
        "import_options": [option_payload(o) for o in quote.import_options],
        "selected_import_method": quote.import_selected["method_id"] if quote.import_selected else None,
        "subtotal": money(quote.summary["subtotal"]),
        "import_fee": money(quote.import_fee),
        "delivery_fee": money(quote.delivery_fee),
        "shipping_fee": money(quote.shipping_fee),
        "delivery_fee_pending": quote.delivery_fee_pending,
        "total": money(quote.total),
        "currency": quote.summary["currency"],
        "estimated_delivery": quote.estimated_delivery or None,
        "customs_fee": money(quote.customs.included),
        "customs": quote.customs.as_dict() if quote.customs.status else None,
        "payment_window_hours": payment_window_hours() if quote.prepayment_required else None,
        "payment_methods": quote.payment_methods if payment_methods is None else payment_methods,
        "prepayment_required": quote.prepayment_required,
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
    delivery_fee_pending = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = ["reference", "type", "type_display", "status", "status_display", "group", "item_details",
                  "total", "currency", "payment_status", "image", "created_at", "delivery_fee_pending"]

    def get_delivery_fee_pending(self, order) -> bool:
        """Waiting for AGIZA to set the delivery cost (manual quote): the order can't be paid yet."""
        details = getattr(order, "shop", None) if order.order_type == OrderType.SHOP else None
        return bool(details and details.delivery_fee_pending and order.status != "cancelled")

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
    photos = serializers.SerializerMethodField()
    # Multi-item quotations (staff intake): one line per item, priced once AGIZA sends the quotation.
    items = serializers.SerializerMethodField()

    class Meta:
        model = QuoteRequest
        fields = ["id", "reference", "service_type", "description", "origin", "destination", "status",
                  "status_display", "requested_at", "quoted_amount", "currency", "estimated_delivery",
                  "response_notes", "responded_at", "customer_replied_at", "order", "can_reply", "photos",
                  "items"]

    def get_items(self, quote) -> list[dict]:
        from apps.quotes.serializers import app_item_lines

        return app_item_lines(quote)

    def get_photos(self, quote) -> list[dict]:
        request = self.context.get("request")
        rows = []
        for a in quote.attachments.all():
            path = reverse("storefront:request-photo", args=[quote.pk, a.pk])
            rows.append({"id": a.pk, "url": request.build_absolute_uri(path) if request else path,
                         "from": "agiza" if a.from_agiza else "me"})
        return rows

    def get_order(self, quote) -> str | None:
        order = getattr(quote, "created_order", None)
        return order.reference if order else None

    def get_can_reply(self, quote) -> bool:
        return quote.status == "waiting_reply"


class QuoteCreateSerializer(serializers.Serializer):
    REQUEST_TYPES = {"buy_for_me": "Buy for me", "deliver_for_me": "Deliver for me",
                     "local_delivery": "Local delivery"}

    request_type = serializers.ChoiceField(choices=list(REQUEST_TYPES))
    item_name = serializers.CharField(max_length=160)
    link = serializers.URLField(max_length=500, required=False, allow_blank=True)
    quantity = serializers.IntegerField(min_value=1, max_value=100000, default=1)
    origin_country = serializers.CharField(max_length=2, required=False, allow_blank=True)
    # Optional for parcels from abroad: the request falls back to the customer's default address and staff
    # confirm delivery when quoting. A local delivery must say where it goes.
    destination_city = serializers.PrimaryKeyRelatedField(queryset=City.objects.filter(is_active=True), required=False,
                                                          allow_null=True)
    # Local delivery (a parcel moved inside Tanzania): where it's collected and who receives it
    pickup_city = serializers.PrimaryKeyRelatedField(queryset=City.objects.filter(is_active=True), required=False,
                                                     allow_null=True)
    pickup_address = serializers.CharField(max_length=300, required=False, allow_blank=True)
    dropoff_address = serializers.CharField(max_length=300, required=False, allow_blank=True)
    contact_name = serializers.CharField(max_length=120, required=False, allow_blank=True)  # the receiver
    contact_phone = serializers.CharField(max_length=30, required=False, allow_blank=True)
    sender_name = serializers.CharField(max_length=120, required=False, allow_blank=True)
    sender_phone = serializers.CharField(max_length=30, required=False, allow_blank=True)
    PACKAGE_SIZES = {"small": "Small", "medium": "Medium", "large": "Large"}
    package_size = serializers.ChoiceField(choices=list(PACKAGE_SIZES), required=False, allow_blank=True)
    weight_kg = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, allow_null=True,
                                         min_value=0)
    tracking_number = serializers.CharField(max_length=80, required=False, allow_blank=True)
    # Set when the customer asks for a shop product that is out of stock.
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all(), required=False, allow_null=True)
    SHIPPING_METHODS = {"air": "Air freight", "sea": "Sea freight"}
    shipping_method = serializers.ChoiceField(choices=list(SHIPPING_METHODS), required=False, allow_blank=True)
    details = serializers.CharField(max_length=2000, required=False, allow_blank=True)

    def validate_product(self, product):
        if product is not None and not product_requestable(product):
            raise serializers.ValidationError("This product can't be requested: it is in stock or AGIZA "
                                              "doesn't take requests for it.")
        return product

    def validate(self, attrs):
        if attrs["request_type"] == "local_delivery" and not attrs.get("destination_city"):
            raise serializers.ValidationError({"destination_city": "Choose the city to deliver to."})
        if attrs["request_type"] == "local_delivery":
            if not attrs.get("pickup_city"):
                raise serializers.ValidationError({"pickup_city": "Choose where the parcel is collected."})
            return attrs
        # A product request may leave the country to staff; a parcel already on its way must say where from.
        if attrs["request_type"] == "deliver_for_me" and not attrs.get("origin_country", "").strip():
            raise serializers.ValidationError({"origin_country": "Choose the country the item comes from."})
        if attrs["request_type"] == "deliver_for_me" and not attrs.get("tracking_number", "").strip():
            raise serializers.ValidationError({"tracking_number": "Enter the supplier's tracking number."})
        return attrs


class ReplySerializer(serializers.Serializer):
    note = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")


class CancelSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=300)


class ChatSendSerializer(serializers.Serializer):
    body = serializers.CharField(max_length=2000)
