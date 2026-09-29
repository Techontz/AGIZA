"""
Delivery options and prices for a cart, from the Shipping Engine (RateCalculator).

The calculator prices one shipment. A cart becomes one shipment per group of lines
that travel together, i.e. that share an origin and a shipping profile. Lines whose
product has a product-specific rule are priced on their own, so that rule applies.
A method is offered only when every group can be priced with it, and the delivery
fee is the sum of the group prices. React Native never computes a price.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal

from apps.catalog.models import LocationKind, ProductVariant, StoreSettings
from apps.locations.models import City, Country
from apps.shipping_engine.calculator import RateCalculationError, RateCalculator, Shipment
from apps.shipping_engine.constants import AppliesTo, Status
from apps.shipping_engine.models import EngineSettings, ShippingMethod, ShippingProfile, ShippingRule, eta_label

logger = logging.getLogger("apps.storefront")

UNAVAILABLE_MESSAGES = {
    "manual_quote": "This delivery needs a custom quote. Choose another option or contact AGIZA.",
    "blocked": "Not available for these items.",
    "no_rule": "Not available for this address.",
}


@dataclass
class Line:
    variant: ProductVariant
    quantity: int


@dataclass
class _Group:
    origin_country: Country
    origin_city: City | None
    profile: ShippingProfile | None
    product_sku: str = ""
    quantity: int = 0
    weight_kg: Decimal = Decimal("0")
    cbm: Decimal | None = Decimal("0")
    missing_weight: list[str] = field(default_factory=list)


def _origin(product, store_city: City | None) -> tuple[Country | None, City | None]:
    """Where the goods ship from: the warehouse holding them, the (foreign) source country, else the store's city."""
    if product.location_kind == LocationKind.WAREHOUSE and product.location_id:
        return product.location.country, product.location.city
    if product.origin_country_id and product.origin_country.iso2 != "TZ":
        return product.origin_country, None
    if store_city is not None:
        return store_city.country, store_city
    return None, None


def _item_cbm(variant: ProductVariant) -> Decimal | None:
    product = variant.product
    dims = [variant.length_cm or product.length_cm, variant.width_cm or product.width_cm,
            variant.height_cm or product.height_cm]
    if not all(dims):
        return None
    return dims[0] * dims[1] * dims[2] / Decimal("1000000")


def _groups(lines: list[Line]) -> list[_Group]:
    store_city = StoreSettings.load().location
    skus = {line.variant.product.sku.upper() for line in lines}
    product_rule_skus = set(ShippingRule.objects.filter(applies_to=AppliesTo.PRODUCT, status=Status.ACTIVE,
                                                        product_sku__in=skus).values_list("product_sku", flat=True))
    groups: dict[tuple, _Group] = {}
    for line in lines:
        product = line.variant.product
        country, city = _origin(product, store_city)
        if country is None:
            raise RateCalculationError("The store location isn't set up for deliveries.", code="configuration")
        sku = product.sku.upper() if product.sku.upper() in product_rule_skus else ""
        key = (country.pk, getattr(city, "pk", None), product.shipping_profile_id, sku)
        group = groups.setdefault(key, _Group(country, city, product.shipping_profile, sku))
        weight = line.variant.weight_kg or product.weight_kg
        if not weight:
            group.missing_weight.append(product.name)
        else:
            group.weight_kg += weight * line.quantity
        cbm = _item_cbm(line.variant)
        group.cbm = None if cbm is None or group.cbm is None else group.cbm + cbm * line.quantity
        group.quantity += line.quantity
    return list(groups.values())


def candidate_methods(lines: list[Line]) -> list[ShippingMethod]:
    """Methods every product in the cart allows (a product with no methods set allows any)."""
    allowed: set[int] | None = None
    for line in lines:
        ids = {m.pk for m in line.variant.product.shipping_methods.all()}
        if ids:
            allowed = ids if allowed is None else allowed & ids
    qs = ShippingMethod.objects.filter(status=Status.ACTIVE)
    if allowed is not None:
        qs = qs.filter(pk__in=allowed)
    return list(qs.order_by("name"))


def _per_item(total: Decimal | None, quantity: int, places: str) -> Decimal | None:
    if total is None:
        return None
    return (total / quantity).quantize(Decimal(places), rounding=ROUND_HALF_UP)


def _price_group(calculator: RateCalculator, method: ShippingMethod, group: _Group, destination: City) -> dict:
    if group.missing_weight:
        raise RateCalculationError(f"Delivery can't be calculated for {', '.join(group.missing_weight)} yet.")
    shipment = Shipment(
        origin_country=group.origin_country, origin_city=group.origin_city, method=method,
        weight_kg=_per_item(group.weight_kg, group.quantity, "0.000001"), quantity=group.quantity,
        destination_country=destination.country, destination_city=destination, profile=group.profile,
        product_sku=group.product_sku, cbm=_per_item(group.cbm, group.quantity, "0.000001"),
    )
    return calculator.calculate(shipment)


def delivery_options(lines: list[Line], destination: City, *, currency: str) -> list[dict]:
    """Every candidate method with its price (or why it can't be used), cheapest available first."""
    if not lines:
        return []
    calculator = RateCalculator(EngineSettings.load())
    try:
        groups = _groups(lines)
    except RateCalculationError as exc:
        logger.error("Delivery options unavailable: %s", exc.message)
        return []
    options = []
    for method in candidate_methods(lines):
        option = {"method_id": method.pk, "code": method.code, "name": method.name, "category": method.category,
                  "description": method.description, "available": False, "cost": None, "currency": currency,
                  "estimated_delivery": method.estimated_delivery or None, "carrier": None, "message": ""}
        total, rule_ids, carriers = Decimal("0"), [], set()
        try:
            for group in groups:
                result = _price_group(calculator, method, group, destination)
                if result["status"] != "priced":
                    raise RateCalculationError(UNAVAILABLE_MESSAGES.get(result["status"], result["message"]))
                if result["pricing"]["target_currency"] != currency:
                    logger.error("Shipping Engine display currency %s differs from the store currency %s",
                                 result["pricing"]["target_currency"], currency)
                    raise RateCalculationError("Delivery pricing is being updated. Please try again later.")
                total += result["pricing"]["total"]
                rule_ids.append(result["rule"]["id"])
                if result["carrier"]:
                    carriers.add(result["carrier"]["name"])
        except RateCalculationError as exc:
            if exc.code == "invalid_shipment":
                option["message"] = exc.message
            else:  # engine configuration problems are for staff, not customers
                logger.error("Shipping Engine configuration error for %s: %s", method.code, exc.message)
                option["message"] = "Delivery pricing is being updated. Please try again later."
            options.append(option)
            continue
        rules = list(ShippingRule.objects.filter(pk__in=rule_ids).values_list("eta_min_days", "eta_max_days"))
        mins = [r[0] for r in rules if r[0] is not None]
        maxes = [r[1] for r in rules if r[1] is not None]
        eta = eta_label(max(mins) if mins else None, max(maxes) if maxes else None)
        option.update(available=True, cost=total, carrier=", ".join(sorted(carriers)) or None,
                      estimated_delivery=eta if eta != "—" else option["estimated_delivery"])
        options.append(option)
    options.sort(key=lambda o: (not o["available"], o["cost"] if o["cost"] is not None else 0, o["name"]))
    return options
