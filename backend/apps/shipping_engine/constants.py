from decimal import Decimal

from django.db import models


class Status(models.TextChoices):
    ACTIVE = "active", "Active"
    INACTIVE = "inactive", "Inactive"


class ZoneStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    INACTIVE = "inactive", "Inactive"
    DRAFT = "draft", "Draft"


class Scope(models.TextChoices):
    LOCAL = "local", "Local"
    INTERNATIONAL = "international", "International"


class Currency(models.TextChoices):
    TZS = "TZS", "TSh — Tanzanian Shilling"
    USD = "USD", "USD — US Dollar"
    AED = "AED", "AED — UAE Dirham"
    CNY = "CNY", "CNY — Chinese Yuan"


CURRENCY_SYMBOL = {"TZS": "TSh ", "USD": "$", "AED": "AED ", "CNY": "¥"}
# Decimal places used when presenting a final amount in each currency.
CURRENCY_DECIMALS = {"TZS": 0, "USD": 2, "AED": 2, "CNY": 2}


class PricingModel(models.TextChoices):
    PER_KG = "per_kg", "Per KG"
    PER_CBM = "per_cbm", "Per CBM"
    PER_VOL_WEIGHT = "per_vol_weight", "Per Vol. Weight"
    PER_ITEM = "per_item", "Per Item"
    FIXED = "fixed", "Fixed Shipment"
    MANUAL = "manual", "Manual Quote"


PRICING_UNIT = {
    PricingModel.PER_KG: "KG",
    PricingModel.PER_CBM: "CBM",
    PricingModel.PER_VOL_WEIGHT: "KG",
    PricingModel.PER_ITEM: "Item",
    PricingModel.FIXED: "flat",
}


class VolumetricDivisor(models.IntegerChoices):
    STANDARD_AIR = 5000, "5,000 (standard air)"
    IATA = 6000, "6,000 (IATA standard)"
    SEA_EXPRESS = 3000, "3,000 (sea/express)"
    CUSTOM = 4000, "4,000 (custom)"


class AppliesTo(models.TextChoices):
    PRODUCT = "product", "Specific Product"
    PROFILE = "profile", "Shipping Profile"
    GENERAL = "general", "General Route"


# Lower tier wins: product rule > profile rule > general route rule.
RULE_TIER = {AppliesTo.PRODUCT: 1, AppliesTo.PROFILE: 2, AppliesTo.GENERAL: 3}


class ProfileType(models.TextChoices):
    STANDARD = "standard", "Standard"
    SPECIALIZED = "specialized", "Specialized"
    RESTRICTED = "restricted", "Restricted"
    OVERSIZED = "oversized", "Oversized"
    MANUAL = "manual", "Manual"


class Handling(models.TextChoices):
    CONTAINS_BATTERY = "contains_battery", "Contains battery"
    FRAGILE = "fragile", "Fragile"
    ELECTRONICS = "electronics", "Electronics"
    HAZARDOUS = "hazardous", "Hazardous material"
    RESTRICTED = "restricted", "Restricted handling"
    SPECIAL_DOCUMENTATION = "special_documentation", "Special documentation"
    TEMPERATURE_CONTROLLED = "temperature_controlled", "Temperature controlled"
    OVERSIZED = "oversized", "Oversized"
    OTHER = "other", "Other"


class CarrierType(models.TextChoices):
    INTERNATIONAL_AIR = "international_air", "International Air"
    INTERNATIONAL_SEA = "international_sea", "International Sea"
    LOCAL_GROUND = "local_ground", "Local Ground"
    LOCAL_DELIVERY = "local_delivery", "Local Delivery"
    EXPRESS_COURIER = "express_courier", "Express Courier"


class MethodCategory(models.TextChoices):
    AIR = "air", "Air"
    SEA = "sea", "Sea"
    LAND = "land", "Land"
    LOCAL = "local", "Local"


class NoRuleFallback(models.TextChoices):
    MANUAL_QUOTE = "manual_quote", "Return Manual Quote"
    BLOCK = "block", "Block checkout"
    ERROR = "error", "Return error to API"


class CbmMethod(models.TextChoices):
    DIMENSIONS = "dimensions", "Length × Width × Height ÷ 1,000,000"
    MANUAL = "manual", "Manual input only"


class WeightRounding(models.TextChoices):
    HALF_KG = "half_kg", "Round up to nearest 0.5 KG"
    ONE_KG = "one_kg", "Round up to nearest 1 KG"
    EXACT = "exact", "Exact weight"


WEIGHT_ROUNDING_STEP = {
    WeightRounding.HALF_KG: Decimal("0.5"),
    WeightRounding.ONE_KG: Decimal("1"),
    WeightRounding.EXACT: None,
}


class ExchangeRateSource(models.TextChoices):
    MANUAL = "manual", "Manual (set rate below)"
    AUTO = "auto", "Auto (live rate API)"
