"""
AGIZA's commission on a vendor sale. The first rule that applies wins:

1. the product's own rate, when the vendor's agreement is configured per product;
2. the vendor's agreement, when the vendor is on a custom agreement;
3. the product's subcategory rate, then its category rate;
4. the marketplace default.

Fixed-amount agreements are per unit sold. Commission never exceeds the line's value.
Products AGIZA sells itself have no vendor and no commission: the whole sale is AGIZA's.
Vendors never influence any of this; it is read from staff-controlled settings only.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from apps.catalog.models import Vendor

from .models import CategoryCommission, MarketplaceSettings

CENT = Decimal("0.01")


@dataclass(frozen=True)
class Rate:
    kind: str  # "percent" | "fixed"
    value: Decimal
    source: str  # product | vendor | subcategory | category | default

    def label(self) -> str:
        return f"{self.value.normalize():f}%" if self.kind == "percent" else f"TSh {self.value:,.0f} per unit"


def _category_rates(product) -> dict[int, Decimal]:
    ids = [i for i in (product.subcategory_id, product.category_id) if i]
    return dict(CategoryCommission.objects.filter(category_id__in=ids).values_list("category_id", "percent"))


def rate_for(product, vendor: Vendor | None = None, *, settings=None,
             category_rates: dict[int, Decimal] | None = None) -> Rate | None:
    """`settings`: MarketplaceSettings, or a callable returning it (loaded only when the default rate is needed)."""
    vendor = vendor if vendor is not None else product.vendor
    if vendor is None:
        return None
    if vendor.commission_mode == Vendor.CommissionMode.CUSTOM:
        if vendor.profit_scope == Vendor.ProfitScope.PER_PRODUCT and product.vendor_profit_value is not None:
            return Rate(product.vendor_profit_type or vendor.profit_type, product.vendor_profit_value, "product")
        return Rate(vendor.profit_type, vendor.profit_value, "vendor")
    rates = category_rates if category_rates is not None else _category_rates(product)
    if product.subcategory_id in rates:
        return Rate("percent", rates[product.subcategory_id], "subcategory")
    if product.category_id in rates:
        return Rate("percent", rates[product.category_id], "category")
    settings = settings() if callable(settings) else (settings or MarketplaceSettings.load())
    return Rate("percent", settings.default_commission_percent, "default")


def commission_for(rate: Rate | None, unit_price: Decimal, quantity: int) -> Decimal:
    gross = (unit_price * quantity).quantize(CENT)
    if rate is None:
        return Decimal("0")
    if rate.kind == Vendor.ProfitType.FIXED:
        amount = rate.value * quantity
    else:
        amount = gross * rate.value / Decimal("100")
    return min(amount.quantize(CENT, rounding=ROUND_HALF_UP), gross)
