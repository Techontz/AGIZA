from decimal import Decimal

from rest_framework import serializers

from apps.locations.models import City, Country, Warehouse
from apps.orders.serializers import _dec
from apps.shipping_engine.models import ShippingMethod, ShippingProfile

from . import services
from .models import (
    Brand,
    Category,
    Condition,
    DeliveryEstimateRoute,
    Label,
    LocationKind,
    OriginEstimate,
    Product,
    ProductImage,
    ProductOption,
    ProductOptionValue,
    ProductStatus,
    ProductVariant,
    StockOverride,
    StoreSettings,
    TaxCategory,
    VariantStatus,
    Vendor,
)

MONEY = {"max_digits": 14, "decimal_places": 2, "min_value": Decimal("0")}
DIM = {"max_digits": 8, "decimal_places": 1, "min_value": Decimal("0")}


def image_url(img: ProductImage) -> str:
    return f"catalog/images/{img.id}/file"


class CategorySerializer(serializers.ModelSerializer):
    products_count = serializers.IntegerField(read_only=True, default=0)
    parent_name = serializers.CharField(source="parent.name", read_only=True, default=None)

    class Meta:
        model = Category
        fields = ["id", "name", "slug", "parent", "parent_name", "description", "sort_order", "is_active",
                  "products_count", "created_at", "updated_at"]
        read_only_fields = ["id", "slug", "created_at", "updated_at"]

    def validate_parent(self, parent):
        if parent and parent.parent_id:
            raise serializers.ValidationError("Subcategories can't have subcategories.")
        if parent and self.instance and parent.pk == self.instance.pk:
            raise serializers.ValidationError("A category can't be its own parent.")
        return parent


class BrandSerializer(serializers.ModelSerializer):
    products_count = serializers.IntegerField(read_only=True, default=0)
    logo_url = serializers.SerializerMethodField()

    class Meta:
        model = Brand
        fields = ["id", "reference", "name", "country", "description", "status", "logo_url", "products_count",
                  "created_at", "updated_at"]
        read_only_fields = ["id", "reference", "created_at", "updated_at"]

    def get_logo_url(self, obj) -> str | None:
        return f"catalog/brands/{obj.id}/logo/file" if obj.logo else None


class LabelSerializer(serializers.ModelSerializer):
    products_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Label
        fields = ["id", "reference", "name", "color", "visible", "products_count", "created_at", "updated_at"]
        read_only_fields = ["id", "reference", "created_at", "updated_at"]


class OptionValueSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductOptionValue
        fields = ["id", "value", "sort_order"]


class OptionSerializer(serializers.ModelSerializer):
    values = OptionValueSerializer(many=True, read_only=True)

    class Meta:
        model = ProductOption
        fields = ["id", "reference", "name", "type", "status", "values", "created_at", "updated_at"]
        read_only_fields = ["id", "reference", "created_at", "updated_at"]


class VendorSerializer(serializers.ModelSerializer):
    products_count = serializers.IntegerField(read_only=True, default=0)
    total_sales = serializers.SerializerMethodField()
    profit_value = serializers.DecimalField(**MONEY)

    class Meta:
        model = Vendor
        fields = ["id", "reference", "name", "email", "phone", "location", "status", "verified", "profit_type",
                  "profit_value", "profit_scope", "joined_date", "notes", "products_count", "total_sales",
                  "created_at", "updated_at"]
        read_only_fields = ["id", "reference", "created_at", "updated_at"]

    def get_total_sales(self, obj) -> str:
        return _dec(getattr(obj, "sales_total", None) or Decimal("0"))

    def validate(self, attrs):
        ptype = attrs.get("profit_type", getattr(self.instance, "profit_type", None))
        value = attrs.get("profit_value", getattr(self.instance, "profit_value", None))
        if ptype == Vendor.ProfitType.PERCENT and value is not None and value > 100:
            raise serializers.ValidationError({"profit_value": "A percentage can't exceed 100."})
        return attrs


# --------------------------------------------------------------------------- #
# Products
# --------------------------------------------------------------------------- #
def _ref(obj, *fields) -> dict | None:
    if obj is None:
        return None
    return {"id": obj.id, **{f: getattr(obj, f) for f in fields}}


class VariantSerializer(serializers.ModelSerializer):
    option_values = serializers.SerializerMethodField()
    stock = serializers.SerializerMethodField()
    images = serializers.SerializerMethodField()

    class Meta:
        model = ProductVariant
        fields = ["id", "name", "sku", "is_default", "price", "compare_at_price", "purchase_cost", "weight_kg",
                  "length_cm", "width_cm", "height_cm", "status", "notes", "option_values", "stock", "images"]

    def get_option_values(self, obj) -> list[dict]:
        return [{"id": v.id, "option": v.option.name, "value": v.value} for v in obj.option_values.all()]

    def get_stock(self, obj) -> int:
        return sum(s.quantity - s.reserved for s in obj.stock.all())

    def get_images(self, obj) -> list[dict]:
        return [{"id": i.id, "url": image_url(i)} for i in obj.images.all()]


class ProductListSerializer(serializers.ModelSerializer):
    brand = serializers.SerializerMethodField()
    category = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    origin = serializers.SerializerMethodField()
    image = serializers.SerializerMethodField()
    stock = serializers.SerializerMethodField()
    labels = serializers.SerializerMethodField()
    variants_count = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = ["id", "reference", "name", "sku", "brand", "category", "status", "status_display", "price",
                  "compare_at_price", "description", "origin", "image", "stock", "low_stock_threshold", "labels",
                  "has_variations", "variants_count", "featured", "updated_at"]

    def get_brand(self, obj) -> dict | None:
        return _ref(obj.brand, "name")

    def get_category(self, obj) -> dict:
        return _ref(obj.category, "name")

    def get_origin(self, obj) -> str | None:
        if obj.origin_country_id:
            return obj.origin_country.display_name
        if obj.location_id:
            return obj.location.country.display_name
        return None

    def get_image(self, obj) -> str | None:
        images = [i for i in obj.images.all() if i.variant_id is None]
        primary = next((i for i in images if i.is_primary), images[0] if images else None)
        return image_url(primary) if primary else None

    def get_stock(self, obj) -> int:
        return sum(s.quantity - s.reserved for v in obj.variants.all() if v.status != VariantStatus.INACTIVE
                   for s in v.stock.all())

    def get_labels(self, obj) -> list[dict]:
        return [{"id": lb.id, "name": lb.name, "color": lb.color} for lb in obj.labels.all()]

    def get_variants_count(self, obj) -> int:
        return len([v for v in obj.variants.all() if not v.is_default and v.status != VariantStatus.INACTIVE])


class ProductDetailSerializer(ProductListSerializer):
    subcategory = serializers.SerializerMethodField()
    location = serializers.SerializerMethodField()
    shipping_profile = serializers.SerializerMethodField()
    vendor = serializers.SerializerMethodField()
    images = serializers.SerializerMethodField()
    variants = serializers.SerializerMethodField()
    specifications = serializers.SerializerMethodField()
    cbm = serializers.SerializerMethodField()
    volumetric_kg = serializers.SerializerMethodField()
    relations = serializers.SerializerMethodField()
    location_stock = serializers.SerializerMethodField()

    class Meta(ProductListSerializer.Meta):
        fields = [*ProductListSerializer.Meta.fields, "subcategory", "condition", "condition_description",
                  "purchase_cost", "pata_bei", "location_kind", "location", "bin_code", "stock_override",
                  "origin_country", "shipping_profile", "weight_kg", "length_cm", "width_cm", "height_cm", "packages",
                  "cbm", "volumetric_kg", "shipping_methods", "ready_to_ship_days", "shipping_notes",
                  "variation_options", "variants", "specifications", "vendor", "vendor_sku", "vendor_location",
                  "vendor_profit_type", "vendor_profit_value", "ofa_kali", "allow_save", "allow_chat", "keywords",
                  "gift_eligible", "relations", "tax_category", "vat_applicable", "images", "location_stock",
                  "created_at"]

    def get_subcategory(self, obj) -> dict | None:
        return _ref(obj.subcategory, "name")

    def get_location(self, obj) -> dict | None:
        w = obj.location
        return {"id": w.id, "code": w.code, "name": w.name, "city": w.city.name, "country": w.country.iso2} if w else None

    def get_shipping_profile(self, obj) -> dict | None:
        p = obj.shipping_profile
        return {"id": p.id, "name": p.name, "handling": p.handling_labels} if p else None

    def get_vendor(self, obj) -> dict | None:
        return _ref(obj.vendor, "name", "verified")

    def get_images(self, obj) -> list[dict]:
        return [{"id": i.id, "url": image_url(i), "is_primary": i.is_primary, "variant": i.variant_id}
                for i in obj.images.all()]

    def get_variants(self, obj) -> list[dict]:
        return VariantSerializer(obj.variants.all(), many=True).data

    def get_specifications(self, obj) -> list[dict]:
        return [{"name": s.name, "value": s.value} for s in obj.specifications.all()]

    def get_cbm(self, obj) -> str | None:
        return _dec(obj.cbm, 4)

    def get_volumetric_kg(self, obj) -> str | None:
        return _dec(obj.volumetric_kg())

    def get_relations(self, obj) -> dict:
        def refs(qs):
            return [{"id": p.id, "name": p.name, "sku": p.sku} for p in qs.all()]
        return {"related_products": refs(obj.related_products), "bought_together": refs(obj.bought_together),
                "gifts": refs(obj.gifts)}

    def get_location_stock(self, obj) -> int | None:
        """Stock (on hand) at the product location for a product without variations."""
        if obj.has_variations or not obj.location_id:
            return None
        default = next((v for v in obj.variants.all() if v.is_default), None)
        if default is None:
            return 0
        return sum(s.quantity for s in default.stock.all() if s.warehouse_id == obj.location_id)


class SpecSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=80)
    value = serializers.CharField(max_length=200)


class VariantWriteSerializer(serializers.Serializer):
    id = serializers.IntegerField(required=False)
    name = serializers.CharField(max_length=120)
    sku = serializers.CharField(max_length=64)
    price = serializers.DecimalField(**MONEY, required=False, allow_null=True)
    compare_at_price = serializers.DecimalField(**MONEY, required=False, allow_null=True)
    purchase_cost = serializers.DecimalField(**MONEY, required=False, allow_null=True)
    weight_kg = serializers.DecimalField(max_digits=10, decimal_places=3, min_value=Decimal("0"), required=False,
                                         allow_null=True)
    length_cm = serializers.DecimalField(**DIM, required=False, allow_null=True)
    width_cm = serializers.DecimalField(**DIM, required=False, allow_null=True)
    height_cm = serializers.DecimalField(**DIM, required=False, allow_null=True)
    status = serializers.ChoiceField(choices=VariantStatus.choices, default=VariantStatus.ACTIVE)
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    option_values = serializers.PrimaryKeyRelatedField(queryset=ProductOptionValue.objects.all(), many=True,
                                                       required=False)
    stock = serializers.IntegerField(min_value=0, required=False, allow_null=True)


class ProductWriteSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=200)
    sku = serializers.CharField(max_length=64)
    brand = serializers.PrimaryKeyRelatedField(queryset=Brand.objects.all(), required=False, allow_null=True)
    category = serializers.PrimaryKeyRelatedField(queryset=Category.objects.all())
    subcategory = serializers.PrimaryKeyRelatedField(queryset=Category.objects.all(), required=False, allow_null=True)
    status = serializers.ChoiceField(choices=ProductStatus.choices, default=ProductStatus.DRAFT)
    condition = serializers.ChoiceField(choices=Condition.choices, default=Condition.NEW)
    condition_description = serializers.CharField(required=False, allow_blank=True)
    price = serializers.DecimalField(**MONEY)
    compare_at_price = serializers.DecimalField(**MONEY, required=False, allow_null=True)
    purchase_cost = serializers.DecimalField(**MONEY, required=False, allow_null=True)
    stock = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    low_stock_threshold = serializers.IntegerField(min_value=0, required=False)
    pata_bei = serializers.BooleanField(required=False)
    location_kind = serializers.ChoiceField(choices=LocationKind.choices, required=False)
    location = serializers.PrimaryKeyRelatedField(queryset=Warehouse.objects.all(), required=False, allow_null=True)
    bin_code = serializers.CharField(max_length=40, required=False, allow_blank=True)
    stock_override = serializers.ChoiceField(choices=StockOverride.choices, required=False, allow_blank=True)
    origin_country = serializers.PrimaryKeyRelatedField(queryset=Country.objects.all(), required=False,
                                                        allow_null=True)
    shipping_profile = serializers.PrimaryKeyRelatedField(queryset=ShippingProfile.objects.all(), required=False,
                                                          allow_null=True)
    weight_kg = serializers.DecimalField(max_digits=10, decimal_places=3, min_value=Decimal("0"), required=False,
                                         allow_null=True)
    length_cm = serializers.DecimalField(**DIM, required=False, allow_null=True)
    width_cm = serializers.DecimalField(**DIM, required=False, allow_null=True)
    height_cm = serializers.DecimalField(**DIM, required=False, allow_null=True)
    packages = serializers.IntegerField(min_value=1, max_value=999, required=False)
    shipping_methods = serializers.PrimaryKeyRelatedField(queryset=ShippingMethod.objects.all(), many=True,
                                                          required=False)
    ready_to_ship_days = serializers.IntegerField(min_value=0, max_value=365, required=False)
    shipping_notes = serializers.CharField(required=False, allow_blank=True)
    has_variations = serializers.BooleanField(required=False)
    variation_options = serializers.PrimaryKeyRelatedField(queryset=ProductOption.objects.all(), many=True,
                                                           required=False)
    variants = VariantWriteSerializer(many=True, required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    specifications = SpecSerializer(many=True, required=False)
    vendor = serializers.PrimaryKeyRelatedField(queryset=Vendor.objects.all(), required=False, allow_null=True)
    vendor_sku = serializers.CharField(max_length=64, required=False, allow_blank=True)
    vendor_location = serializers.CharField(max_length=120, required=False, allow_blank=True)
    vendor_profit_type = serializers.ChoiceField(choices=Vendor.ProfitType.choices, required=False, allow_blank=True)
    vendor_profit_value = serializers.DecimalField(**MONEY, required=False, allow_null=True)
    featured = serializers.BooleanField(required=False)
    ofa_kali = serializers.BooleanField(required=False)
    allow_save = serializers.BooleanField(required=False)
    allow_chat = serializers.BooleanField(required=False)
    keywords = serializers.CharField(max_length=255, required=False, allow_blank=True)
    labels = serializers.PrimaryKeyRelatedField(queryset=Label.objects.all(), many=True, required=False)
    related_products = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all(), many=True, required=False)
    bought_together = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all(), many=True, required=False)
    gift_eligible = serializers.BooleanField(required=False)
    gifts = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all(), many=True, required=False)
    tax_category = serializers.ChoiceField(choices=TaxCategory.choices, required=False)
    vat_applicable = serializers.BooleanField(required=False)


# --------------------------------------------------------------------------- #
# Store settings
# --------------------------------------------------------------------------- #
class StoreSettingsSerializer(serializers.ModelSerializer):
    location_name = serializers.CharField(source="location.name", read_only=True, default=None)

    class Meta:
        model = StoreSettings
        fields = ["store_name", "description", "location", "location_name", "currency", "same_city_min_days",
                  "same_city_max_days", "regional_min_days", "regional_max_days", "guest_checkout",
                  "product_reviews", "updated_at"]
        read_only_fields = ["updated_at"]

    def validate(self, attrs):
        for prefix in ("same_city", "regional"):
            low = attrs.get(f"{prefix}_min_days", getattr(self.instance, f"{prefix}_min_days", 0))
            high = attrs.get(f"{prefix}_max_days", getattr(self.instance, f"{prefix}_max_days", 0))
            if low > high:
                raise serializers.ValidationError({f"{prefix}_max_days": "Must be at least the minimum."})
        return attrs


class EstimateRouteSerializer(serializers.ModelSerializer):
    from_city_name = serializers.CharField(source="from_city.name", read_only=True)
    to_city_name = serializers.CharField(source="to_city.name", read_only=True)

    class Meta:
        model = DeliveryEstimateRoute
        fields = ["id", "from_city", "from_city_name", "to_city", "to_city_name", "min_days", "max_days"]

    def validate(self, attrs):
        if attrs.get("min_days", 0) > attrs.get("max_days", 0):
            raise serializers.ValidationError({"max_days": "Must be at least the minimum."})
        if attrs.get("from_city") and attrs.get("from_city") == attrs.get("to_city"):
            raise serializers.ValidationError({"to_city": "Choose a different city."})
        return attrs


class OriginEstimateSerializer(serializers.ModelSerializer):
    country_name = serializers.CharField(source="country.display_name", read_only=True)

    class Meta:
        model = OriginEstimate
        fields = ["id", "country", "country_name", "method", "min_days", "max_days"]

    def validate(self, attrs):
        if attrs.get("min_days", 0) > attrs.get("max_days", 0):
            raise serializers.ValidationError({"max_days": "Must be at least the minimum."})
        return attrs


class EstimateQuerySerializer(serializers.Serializer):
    origin_country = serializers.PrimaryKeyRelatedField(queryset=Country.objects.all(), required=False)
    destination_city = serializers.PrimaryKeyRelatedField(queryset=City.objects.all(), required=False)
    method = serializers.ChoiceField(choices=[("air", "Air"), ("sea", "Sea")], default="air")
    sensitive = serializers.BooleanField(default=False)

    def estimate(self) -> dict:
        return services.delivery_estimate(**self.validated_data)
