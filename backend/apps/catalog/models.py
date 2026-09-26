"""
E-commerce catalogue: categories (with subcategories), brands, labels,
global option sets, vendors, products and their variants, images and
specifications, plus the store settings used for delivery estimates.

Every product has at least one variant: a product without variations has a
single default variant carrying its SKU, so stock, order lines and prices
always refer to a variant.
"""
from decimal import Decimal

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q
from django.utils.text import slugify

from apps.core.models import TimeStampedModel
from apps.core.references import next_reference

POSITIVE = [MinValueValidator(Decimal("0"))]


class Status(models.TextChoices):
    ACTIVE = "active", "Active"
    INACTIVE = "inactive", "Inactive"


class Category(TimeStampedModel):
    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=140, unique=True)
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.PROTECT, related_name="children",
                               help_text="Set for a subcategory")
    description = models.TextField(blank=True)
    sort_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["sort_order", "name"]
        verbose_name_plural = "categories"
        constraints = [
            models.UniqueConstraint(fields=["parent", "name"], name="uniq_category_name_per_parent"),
            models.UniqueConstraint(fields=["name"], condition=Q(parent__isnull=True), name="uniq_top_category_name"),
        ]

    def __str__(self) -> str:
        return f"{self.parent.name} › {self.name}" if self.parent_id else self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(f"{self.parent.name}-{self.name}" if self.parent_id else self.name) or "category"
            slug, n = base, 1
            while Category.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                n += 1
                slug = f"{base}-{n}"
            self.slug = slug
        super().save(*args, **kwargs)


def brand_logo_path(instance, filename):
    return f"catalog/brands/{filename}"


class Brand(TimeStampedModel):
    reference = models.CharField(max_length=20, unique=True, editable=False)
    name = models.CharField(max_length=120, unique=True)
    country = models.CharField(max_length=80, blank=True, help_text="Country of origin")
    description = models.TextField(blank=True)
    logo = models.FileField(upload_to=brand_logo_path, blank=True)
    logo_content_type = models.CharField(max_length=100, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name

    def save(self, *args, **kwargs):
        if not self.reference:
            self.reference = next_reference("BRD", width=3)
        super().save(*args, **kwargs)


class Label(TimeStampedModel):
    class Color(models.TextChoices):
        BLUE = "blue", "Blue"
        RED = "red", "Red"
        YELLOW = "yellow", "Yellow"
        PURPLE = "purple", "Purple"
        ORANGE = "orange", "Orange"
        GREEN = "green", "Green"
        GRAY = "gray", "Gray"

    reference = models.CharField(max_length=20, unique=True, editable=False)
    name = models.CharField(max_length=60, unique=True)
    color = models.CharField(max_length=10, choices=Color.choices, default=Color.BLUE)
    visible = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name

    def save(self, *args, **kwargs):
        if not self.reference:
            self.reference = next_reference("LBL", width=3)
        super().save(*args, **kwargs)


class ProductOption(TimeStampedModel):
    """A global option set (Size, Color, Storage...) used to build variations."""

    class Type(models.TextChoices):
        SIZE = "size", "Size"
        COLOR = "color", "Color"
        BUNDLE = "bundle", "Bundle"
        STORAGE = "storage", "Storage"
        TEXT = "text", "Text / Other"

    reference = models.CharField(max_length=20, unique=True, editable=False)
    name = models.CharField(max_length=60, unique=True)
    type = models.CharField(max_length=10, choices=Type.choices, default=Type.TEXT)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name

    def save(self, *args, **kwargs):
        if not self.reference:
            self.reference = next_reference("OPT", width=3)
        super().save(*args, **kwargs)


class ProductOptionValue(models.Model):
    option = models.ForeignKey(ProductOption, on_delete=models.CASCADE, related_name="values")
    value = models.CharField(max_length=60)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]
        constraints = [models.UniqueConstraint(fields=["option", "value"], name="uniq_option_value")]

    def __str__(self) -> str:
        return f"{self.option.name}: {self.value}"


class Vendor(TimeStampedModel):
    """A seller whose products Agiza lists, with a profit agreement."""

    class ProfitType(models.TextChoices):
        FIXED = "fixed", "Fixed Amount (TSh)"
        PERCENT = "percent", "Percentage (%)"

    class ProfitScope(models.TextChoices):
        ALL = "all", "Apply to All Products"
        PER_PRODUCT = "per_product", "Configure Per Product"

    reference = models.CharField(max_length=20, unique=True, editable=False)
    name = models.CharField(max_length=150, unique=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=32, blank=True)
    location = models.CharField(max_length=120, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    verified = models.BooleanField(default=False)
    profit_type = models.CharField(max_length=10, choices=ProfitType.choices, default=ProfitType.PERCENT)
    profit_value = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"), validators=POSITIVE)
    profit_scope = models.CharField(max_length=12, choices=ProfitScope.choices, default=ProfitScope.ALL)
    joined_date = models.DateField(null=True, blank=True)
    rating = models.DecimalField(max_digits=2, decimal_places=1, null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.CheckConstraint(name="vendor_percent_at_most_100",
                                   condition=~Q(profit_type="percent") | Q(profit_value__lte=100)),
        ]

    def __str__(self) -> str:
        return self.name

    def save(self, *args, **kwargs):
        if not self.reference:
            self.reference = next_reference("VEND", width=3)
        super().save(*args, **kwargs)

    def profit_for(self, price: Decimal, product=None) -> Decimal:
        """Agiza's profit on one sale at `price` under this agreement."""
        if self.profit_scope == self.ProfitScope.PER_PRODUCT and product is not None \
                and product.vendor_profit_value is not None:
            ptype, value = product.vendor_profit_type or self.profit_type, product.vendor_profit_value
        else:
            ptype, value = self.profit_type, self.profit_value
        if ptype == self.ProfitType.FIXED:
            return value
        return (price * value / Decimal("100")).quantize(Decimal("0.01"))


class ProductStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    DRAFT = "draft", "Draft"
    HIDDEN = "hidden", "Hidden"
    OUT_OF_STOCK = "out_of_stock", "Out of Stock"
    INACTIVE = "inactive", "Inactive"


class Condition(models.TextChoices):
    NEW = "new", "New"
    USED = "used", "Used"
    REFURBISHED = "refurbished", "Refurbished"
    OPEN_BOX = "open_box", "Open Box"


class TaxCategory(models.TextChoices):
    STANDARD = "standard", "Standard Rate (VAT 18%)"
    ZERO = "zero", "Zero Rated"
    EXEMPT = "exempt", "Exempt"
    SPECIAL = "special", "Special Goods"


class LocationKind(models.TextChoices):
    WAREHOUSE = "warehouse", "Agiza warehouse / shop"
    VENDOR = "vendor", "Vendor Location (not Agiza warehouse)"
    TRANSIT = "transit", "In Transit"


class StockOverride(models.TextChoices):
    AUTO = "", "Auto (from stock qty)"
    IN_STOCK = "in_stock", "In Stock"
    RESERVED = "reserved", "Reserved"
    IN_TRANSIT = "in_transit", "In Transit"


class Product(TimeStampedModel):
    reference = models.CharField(max_length=20, unique=True, editable=False)
    # 1. Basic information
    name = models.CharField(max_length=200)
    sku = models.CharField(max_length=64, unique=True)
    brand = models.ForeignKey(Brand, null=True, blank=True, on_delete=models.PROTECT, related_name="products")
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="products")
    subcategory = models.ForeignKey(Category, null=True, blank=True, on_delete=models.PROTECT,
                                    related_name="subcategory_products")
    status = models.CharField(max_length=14, choices=ProductStatus.choices, default=ProductStatus.DRAFT,
                              db_index=True)
    condition = models.CharField(max_length=12, choices=Condition.choices, default=Condition.NEW)
    condition_description = models.TextField(blank=True)
    # 2. Price & inventory
    price = models.DecimalField(max_digits=14, decimal_places=2, validators=POSITIVE)
    compare_at_price = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True, validators=POSITIVE)
    purchase_cost = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True, validators=POSITIVE,
                                        help_text="What Agiza pays per unit")
    low_stock_threshold = models.PositiveIntegerField(default=3)
    pata_bei = models.BooleanField(default=False, help_text='Keep visible for "Pata Bei" quotations when out of stock')
    # 3. Product location (where the product physically is — not the customer's address)
    location_kind = models.CharField(max_length=10, choices=LocationKind.choices, default=LocationKind.WAREHOUSE)
    location = models.ForeignKey("locations.Warehouse", null=True, blank=True, on_delete=models.PROTECT,
                                 related_name="located_products")
    bin_code = models.CharField(max_length=40, blank=True)
    stock_override = models.CharField(max_length=12, choices=StockOverride.choices, blank=True, default="")
    origin_country = models.ForeignKey("locations.Country", null=True, blank=True, on_delete=models.PROTECT,
                                       related_name="+")
    # 4-6. Shipping
    shipping_profile = models.ForeignKey("shipping_engine.ShippingProfile", null=True, blank=True,
                                         on_delete=models.PROTECT, related_name="products")
    weight_kg = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True, validators=POSITIVE)
    length_cm = models.DecimalField(max_digits=8, decimal_places=1, null=True, blank=True, validators=POSITIVE)
    width_cm = models.DecimalField(max_digits=8, decimal_places=1, null=True, blank=True, validators=POSITIVE)
    height_cm = models.DecimalField(max_digits=8, decimal_places=1, null=True, blank=True, validators=POSITIVE)
    packages = models.PositiveSmallIntegerField(default=1)
    shipping_methods = models.ManyToManyField("shipping_engine.ShippingMethod", blank=True, related_name="products")
    ready_to_ship_days = models.PositiveSmallIntegerField(default=1)
    shipping_notes = models.TextField(blank=True)
    # 7. Variations
    has_variations = models.BooleanField(default=False)
    variation_options = models.ManyToManyField(ProductOption, blank=True, related_name="products")
    # 8. Description
    description = models.TextField(blank=True)
    # 9. Vendor / source
    vendor = models.ForeignKey(Vendor, null=True, blank=True, on_delete=models.PROTECT, related_name="products")
    vendor_sku = models.CharField(max_length=64, blank=True)
    vendor_location = models.CharField(max_length=120, blank=True)
    vendor_profit_type = models.CharField(max_length=10, choices=Vendor.ProfitType.choices, blank=True)
    vendor_profit_value = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True,
                                              validators=POSITIVE)
    # 10. Shop & discovery
    featured = models.BooleanField(default=False)
    ofa_kali = models.BooleanField(default=False)
    allow_save = models.BooleanField(default=True)
    allow_chat = models.BooleanField(default=True)
    keywords = models.CharField(max_length=255, blank=True)
    labels = models.ManyToManyField(Label, blank=True, related_name="products")
    # 11-13. Related, bought together, gifts
    related_products = models.ManyToManyField("self", blank=True, symmetrical=False, related_name="related_to")
    bought_together = models.ManyToManyField("self", blank=True, symmetrical=False, related_name="bought_with")
    gift_eligible = models.BooleanField(default=False)
    gifts = models.ManyToManyField("self", blank=True, symmetrical=False, related_name="gift_for")
    # 14. Tax
    tax_category = models.CharField(max_length=10, choices=TaxCategory.choices, default=TaxCategory.STANDARD)
    vat_applicable = models.BooleanField(default=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="+")

    class Meta:
        ordering = ["name"]
        indexes = [models.Index(fields=["category", "status"]), models.Index(fields=["vendor"])]

    def __str__(self) -> str:
        return self.name

    def save(self, *args, **kwargs):
        if not self.reference:
            self.reference = next_reference("PROD", width=3)
        super().save(*args, **kwargs)

    @property
    def cbm(self) -> Decimal | None:
        if not (self.length_cm and self.width_cm and self.height_cm):
            return None
        return (self.length_cm * self.width_cm * self.height_cm / Decimal("1000000")).quantize(Decimal("0.0001"))

    def volumetric_kg(self, divisor: int = 5000) -> Decimal | None:
        if not (self.length_cm and self.width_cm and self.height_cm):
            return None
        return (self.length_cm * self.width_cm * self.height_cm / Decimal(divisor)).quantize(Decimal("0.01"))


class ProductSpecification(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="specifications")
    name = models.CharField(max_length=80)
    value = models.CharField(max_length=200)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]


class VariantStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    INACTIVE = "inactive", "Inactive"
    OUT_OF_STOCK = "out_of_stock", "Out of Stock"


class ProductVariant(TimeStampedModel):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="variants")
    name = models.CharField(max_length=120, help_text='e.g. "128GB / Midnight Black"; "Default" for single products')
    sku = models.CharField(max_length=64, unique=True)
    is_default = models.BooleanField(default=False)
    price = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True, validators=POSITIVE,
                                help_text="Empty = product price")
    compare_at_price = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True, validators=POSITIVE)
    purchase_cost = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True, validators=POSITIVE)
    weight_kg = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True, validators=POSITIVE)
    length_cm = models.DecimalField(max_digits=8, decimal_places=1, null=True, blank=True, validators=POSITIVE)
    width_cm = models.DecimalField(max_digits=8, decimal_places=1, null=True, blank=True, validators=POSITIVE)
    height_cm = models.DecimalField(max_digits=8, decimal_places=1, null=True, blank=True, validators=POSITIVE)
    status = models.CharField(max_length=14, choices=VariantStatus.choices, default=VariantStatus.ACTIVE)
    option_values = models.ManyToManyField(ProductOptionValue, blank=True, related_name="variants")
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-is_default", "id"]
        constraints = [
            models.UniqueConstraint(fields=["product"], condition=Q(is_default=True), name="one_default_variant"),
        ]

    def __str__(self) -> str:
        return f"{self.product.name} — {self.name}" if not self.is_default else self.product.name

    @property
    def effective_price(self) -> Decimal:
        return self.price if self.price is not None else self.product.price

    @property
    def effective_cost(self) -> Decimal | None:
        return self.purchase_cost if self.purchase_cost is not None else self.product.purchase_cost


def product_image_path(instance, filename):
    return f"catalog/products/{instance.product_id}/{filename}"


class ProductImage(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="images")
    variant = models.ForeignKey(ProductVariant, null=True, blank=True, on_delete=models.CASCADE,
                                related_name="images")
    file = models.FileField(upload_to=product_image_path)
    content_type = models.CharField(max_length=100, blank=True)
    is_primary = models.BooleanField(default=False)
    sort_order = models.PositiveSmallIntegerField(default=0)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                    related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-is_primary", "sort_order", "id"]
        constraints = [
            models.UniqueConstraint(fields=["product"], condition=Q(is_primary=True, variant__isnull=True),
                                    name="one_primary_product_image"),
        ]


# --------------------------------------------------------------------------- #
# Store settings and delivery estimates
# --------------------------------------------------------------------------- #
class StoreSettings(TimeStampedModel):
    """Singleton (pk=1): store preferences and default delivery estimates."""

    store_name = models.CharField(max_length=120, default="Agiza E-commerce Store")
    description = models.TextField(blank=True)
    location = models.ForeignKey("locations.City", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    currency = models.CharField(max_length=3, default="TZS")
    same_city_min_days = models.PositiveSmallIntegerField(default=1)
    same_city_max_days = models.PositiveSmallIntegerField(default=2)
    regional_min_days = models.PositiveSmallIntegerField(default=3)
    regional_max_days = models.PositiveSmallIntegerField(default=5)
    guest_checkout = models.BooleanField(default=True)
    product_reviews = models.BooleanField(default=True)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="+")

    class Meta:
        verbose_name_plural = "store settings"
        constraints = [
            models.CheckConstraint(name="store_same_city_range",
                                   condition=Q(same_city_min_days__lte=models.F("same_city_max_days"))),
            models.CheckConstraint(name="store_regional_range",
                                   condition=Q(regional_min_days__lte=models.F("regional_max_days"))),
        ]

    def __str__(self) -> str:
        return self.store_name

    @classmethod
    def load(cls) -> "StoreSettings":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class DeliveryEstimateRoute(TimeStampedModel):
    """Custom city-to-city delivery estimate (e.g. Dar es Salaam → Arusha: 2-3 days)."""

    from_city = models.ForeignKey("locations.City", on_delete=models.PROTECT, related_name="+")
    to_city = models.ForeignKey("locations.City", on_delete=models.PROTECT, related_name="+")
    min_days = models.PositiveSmallIntegerField()
    max_days = models.PositiveSmallIntegerField()

    class Meta:
        ordering = ["from_city__name", "to_city__name"]
        constraints = [
            models.UniqueConstraint(fields=["from_city", "to_city"], name="uniq_estimate_route"),
            models.CheckConstraint(name="estimate_route_range", condition=Q(min_days__lte=models.F("max_days"))),
        ]


class OriginEstimate(TimeStampedModel):
    """Global origin rule: days from a sourcing country by air or sea (e.g. China Air 7-12)."""

    class Method(models.TextChoices):
        AIR = "air", "Air"
        SEA = "sea", "Sea"

    country = models.ForeignKey("locations.Country", on_delete=models.PROTECT, related_name="+")
    method = models.CharField(max_length=3, choices=Method.choices)
    min_days = models.PositiveSmallIntegerField(validators=[MaxValueValidator(365)])
    max_days = models.PositiveSmallIntegerField(validators=[MaxValueValidator(365)])

    class Meta:
        ordering = ["country__name", "method"]
        constraints = [
            models.UniqueConstraint(fields=["country", "method"], name="uniq_origin_estimate"),
            models.CheckConstraint(name="origin_estimate_range", condition=Q(min_days__lte=models.F("max_days"))),
        ]
