"""
Delivery options and prices for a cart, from the Shipping Engine (RateCalculator).

The calculator prices one shipment. A cart becomes one shipment per group of lines
that travel together, i.e. that share an origin and a shipping profile. Lines whose
product has a product-specific rule are priced on their own, so that rule applies.
A method is offered only when every group can be priced with it, and the delivery
fee is the sum of the group prices. React Native never computes a price.

Marketplace: goods held in AGIZA warehouses travel together whoever sells them, but
goods a vendor keeps at its own premises are collected there, so each such vendor is
its own shipment (from the vendor's city). Every option lists its shipments so the
customer sees why the fee is what it is.

Imported items (shipped from outside the store's country) travel in two legs, each priced
by the Shipping Engine: `import_options` from the origin country to the store's city (the
hub: air, sea…), then `delivery_options` from the hub to the customer, together with the
local items. The customer chooses a method for each leg.
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
    vendor: object = None  # set when the goods are collected from a vendor's own premises
    vendor_ids: set = field(default_factory=set)  # sellers whose items are in this shipment (None = AGIZA)
    quantity: int = 0
    weight_kg: Decimal = Decimal("0")
    cbm: Decimal | None = Decimal("0")
    missing_weight: list[str] = field(default_factory=list)
    imported: bool = False  # holds imported items, delivered on from the hub


def _at_vendor(product) -> bool:
    return product.location_kind == LocationKind.VENDOR and product.vendor_id is not None


def _origin(product, store_city: City | None) -> tuple[Country | None, City | None]:
    """Where the goods ship from: the warehouse holding them, the (foreign) source country, else the store's city."""
    if product.location_kind == LocationKind.WAREHOUSE and product.location_id:
        return product.location.country, product.location.city
    if _at_vendor(product):
        if product.location_id:
            return product.location.country, product.location.city
        if product.vendor.city_id:
            return product.vendor.city.country, product.vendor.city
    if product.origin_country_id and product.origin_country.iso2 != "TZ":
        return product.origin_country, None
    if store_city is not None:
        return store_city.country, store_city
    return None, None


def store_hub() -> City | None:
    """Where imported goods arrive and local deliveries start: the store's city."""
    return StoreSettings.load().location


def origin_country(product, hub: City | None) -> Country | None:
    return _origin(product, hub)[0]


def is_imported(product, hub: City | None) -> bool:
    """Shipped from outside the store's country (a warehouse or seller abroad, or sourced abroad)."""
    country = origin_country(product, hub)
    return hub is not None and country is not None and country.pk != hub.country_id


def split_imported(lines: list[Line], hub: City | None) -> tuple[list[Line], list[Line]]:
    """(local lines, imported lines)."""
    local, imported = [], []
    for line in lines:
        (imported if is_imported(line.variant.product, hub) else local).append(line)
    return local, imported


def _item_cbm(variant: ProductVariant) -> Decimal | None:
    product = variant.product
    dims = [variant.length_cm or product.length_cm, variant.width_cm or product.width_cm,
            variant.height_cm or product.height_cm]
    if not all(dims):
        return None
    return dims[0] * dims[1] * dims[2] / Decimal("1000000")


def _groups(lines: list[Line], *, onward: bool = False) -> list[_Group]:
    """Shipments for one leg. onward=True: imported items travel on from the hub with the local items."""
    store_city = store_hub()
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
        pickup_vendor = product.vendor if _at_vendor(product) else None
        imported = onward and is_imported(product, store_city)
        if imported:  # arrived at the hub: delivered from there like AGIZA's own stock
            country, city, pickup_vendor = store_city.country, store_city, None
        # Imported items join AGIZA's own stock at the hub: the order is delivered together once they arrive.
        key = (country.pk, getattr(city, "pk", None), product.shipping_profile_id, sku, getattr(pickup_vendor, "pk", None))
        group = groups.setdefault(key, _Group(country, city, product.shipping_profile, sku, pickup_vendor))
        group.imported = group.imported or imported
        group.vendor_ids.add(product.vendor_id)
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


def _describe(group: _Group) -> dict:
    """A shipment as the customer sees it: where it is collected and whose items are in it."""
    place = group.origin_city.name if group.origin_city else group.origin_country.name
    if group.imported:
        label = f"From AGIZA, {place} (with your imported items)"
    elif group.vendor is not None:
        label = f"From {group.vendor.name}, {place}"
    elif group.origin_country.iso2 != "TZ":
        label = f"Imported from {group.origin_country.name}"
    else:
        label = f"From AGIZA, {place}"
    return {"label": label, "origin": place, "vendor_ids": sorted(group.vendor_ids, key=lambda v: (v is not None, v or 0))}


def allocation(option: dict) -> dict:
    """The delivery fee of an option split by seller ({vendor_id or None: fee}), for vendor accounting."""
    shares: dict = {}
    for shipment in option.get("shipments") or []:
        sellers = shipment["vendor_ids"] or [None]
        cost = shipment["cost"]
        each = (cost / len(sellers)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        for i, seller in enumerate(sellers):
            part = cost - each * (len(sellers) - 1) if i == len(sellers) - 1 else each
            shares[seller] = shares.get(seller, Decimal("0")) + part
    return shares


def delivery_options(lines: list[Line], destination: City, *, currency: str) -> list[dict]:
    """
    Delivery to the customer: every candidate method with its price (or why it can't be used),
    cheapest available first. Imported items are included from the hub they arrive at.
    """
    if not lines:
        return []
    hub = store_hub()
    local, _ = split_imported(lines, hub)
    try:
        groups = _groups(lines, onward=True)
    except RateCalculationError as exc:
        logger.error("Delivery options unavailable: %s", exc.message)
        return []
    # Products limit the methods of the leg they travel on: imported items' methods are for the import leg.
    return _price_options(groups, candidate_methods(local), destination, currency)


def import_options(lines: list[Line], *, currency: str) -> list[dict]:
    """
    Shipping imported items from abroad to the hub (the store's city): methods the Shipping Engine
    has a route for (air, sea…), cheapest first. Empty when no line is imported.
    """
    hub = store_hub()
    _, imported = split_imported(lines, hub)
    if not imported:
        return []
    try:
        groups = _groups(imported)
    except RateCalculationError as exc:
        logger.error("Import options unavailable: %s", exc.message)
        return []
    options = _price_options(groups, candidate_methods(imported), hub, currency, skip_unrouted=True)
    for option in options:
        option["shipments"] = [{**sh, "label": sh["label"].replace("Imported from", "From")} for sh in option["shipments"]]
    return options


def _price_options(groups: list[_Group], methods: list[ShippingMethod], destination: City, currency: str, *,
                   skip_unrouted: bool = False) -> list[dict]:
    """Each method priced for every group. skip_unrouted: leave out methods with no route at all for these goods."""
    calculator = RateCalculator(EngineSettings.load())
    options = []
    for method in methods:
        option = {"method_id": method.pk, "code": method.code, "name": method.name, "category": method.category,
                  "description": method.description, "available": False, "cost": None, "currency": currency,
                  "estimated_delivery": method.estimated_delivery or None, "carrier": None, "message": "",
                  "eta_min_days": None, "eta_max_days": None, "shipments": []}
        total, rule_ids, carriers, shipments = Decimal("0"), [], set(), []
        try:
            for group in groups:
                result = _price_group(calculator, method, group, destination)
                if result["status"] != "priced":
                    raise RateCalculationError(UNAVAILABLE_MESSAGES.get(result["status"], result["message"]),
                                               code=f"unpriced:{result['status']}")
                if result["pricing"]["target_currency"] != currency:
                    logger.error("Shipping Engine display currency %s differs from the store currency %s",
                                 result["pricing"]["target_currency"], currency)
                    raise RateCalculationError("Delivery pricing is being updated. Please try again later.")
                total += result["pricing"]["total"]
                shipments.append({**_describe(group), "cost": result["pricing"]["total"]})
                rule_ids.append(result["rule"]["id"])
                if result["carrier"]:
                    carriers.add(result["carrier"]["name"])
        except RateCalculationError as exc:
            if skip_unrouted and exc.code == "unpriced:no_rule":
                continue
            if exc.code == "invalid_shipment" or exc.code.startswith("unpriced:"):
                option["message"] = exc.message
            else:  # engine configuration problems are for staff, not customers
                logger.error("Shipping Engine configuration error for %s: %s", method.code, exc.message)
                option["message"] = "Delivery pricing is being updated. Please try again later."
            options.append(option)
            continue
        rules = list(ShippingRule.objects.filter(pk__in=rule_ids).values_list("eta_min_days", "eta_max_days"))
        mins = [r[0] for r in rules if r[0] is not None]
        maxes = [r[1] for r in rules if r[1] is not None]
        eta_min, eta_max = (max(mins) if mins else None), (max(maxes) if maxes else None)
        eta = eta_label(eta_min, eta_max)
        option.update(available=True, cost=total, carrier=", ".join(sorted(carriers)) or None,
                      estimated_delivery=eta if eta != "—" else option["estimated_delivery"], shipments=shipments,
                      eta_min_days=eta_min, eta_max_days=eta_max)
        options.append(option)
    options.sort(key=lambda o: (not o["available"], o["cost"] if o["cost"] is not None else 0, o["name"]))
    return options


def combined_eta(*options: dict | None) -> str:
    """Delivery time of legs travelled one after the other (import, then local delivery)."""
    legs = [o for o in options if o]
    mins = [o["eta_min_days"] for o in legs]
    maxes = [o["eta_max_days"] for o in legs]
    if any(m is None for m in mins) or any(m is None for m in maxes):
        return " + ".join(o["estimated_delivery"] for o in legs if o.get("estimated_delivery"))[:60]
    label = eta_label(sum(mins), sum(maxes))
    return "" if label == "—" else label
