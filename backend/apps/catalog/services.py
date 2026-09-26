"""
Catalogue services: saving a product with its variants, specifications and
relations in one transaction, stock set from the product editor, and the
delivery-estimate plugin driven by the store settings.
"""
from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.db.models import Sum

from apps.core.audit import diff, record_audit, snapshot
from apps.core.workflow import WorkflowError

from .models import (
    DeliveryEstimateRoute,
    LocationKind,
    OriginEstimate,
    Product,
    ProductSpecification,
    ProductVariant,
    StoreSettings,
    VariantStatus,
)

M2M = ("shipping_methods", "variation_options", "labels", "related_products", "bought_together", "gifts")
VARIANT_FIELDS = ("name", "sku", "price", "compare_at_price", "purchase_cost", "weight_kg", "length_cm", "width_cm",
                  "height_cm", "status", "notes")


def available_stock(variant_ids) -> int:
    from apps.inventory.models import StockItem

    agg = StockItem.objects.filter(variant_id__in=variant_ids).aggregate(q=Sum("quantity"), r=Sum("reserved"))
    return (agg["q"] or 0) - (agg["r"] or 0)


def _check_skus(product: Product | None, sku: str, variants: list[dict]):
    skus = [sku] + [v["sku"] for v in variants if v.get("sku")]
    if len(skus) != len(set(skus)):
        raise WorkflowError("Each variation needs its own SKU.", field="variants")
    own = set(product.variants.values_list("pk", flat=True)) if product else set()
    clash = ProductVariant.objects.filter(sku__in=skus).exclude(pk__in=own).values_list("sku", flat=True).first()
    if clash:
        raise WorkflowError(f"SKU {clash} is already used by another product.", field="sku")
    if Product.objects.filter(sku=sku).exclude(pk=getattr(product, "pk", None)).exists():
        raise WorkflowError(f"SKU {sku} is already used by another product.", field="sku")


def _validate(data: dict):
    sub, cat = data.get("subcategory"), data.get("category")
    if sub and (sub.parent_id is None or sub.parent_id != getattr(cat, "pk", None)):
        raise WorkflowError("The subcategory must belong to the chosen category.", field="subcategory")
    if cat and cat.parent_id:
        raise WorkflowError("Choose a top-level category (and the subcategory separately).", field="category")
    if data.get("has_variations") and not data.get("variants"):
        raise WorkflowError("Add at least one variation, or set Has Variations to No.", field="variants")
    stock = data.get("stock")
    in_stock = (stock or 0) > 0 or any((v.get("stock") or 0) > 0 for v in data.get("variants") or [])
    if in_stock and data.get("location_kind", LocationKind.WAREHOUSE) == LocationKind.WAREHOUSE \
            and not data.get("location"):
        raise WorkflowError("Choose the warehouse / location — required when the product is in stock.",
                            field="location")
    if data.get("compare_at_price") is not None and data.get("price") is not None \
            and data["compare_at_price"] < data["price"]:
        raise WorkflowError("The compare-at price should be higher than the price.", field="compare_at_price")


def _set_stock(variant: ProductVariant, target: int | None, location, user, bin_code: str = ""):
    """The editor's Stock field: bring stock at the product location to `target`."""
    if target is None or location is None:
        return
    from apps.inventory import services as inventory
    from apps.inventory.models import StockItem

    item = StockItem.objects.filter(variant=variant, warehouse=location).first()
    if item is None:
        if target > 0:
            inventory.receive(variant, location, target, user=user, bin_code=bin_code, note="Initial stock")
        return
    if item.quantity != target:
        inventory.adjust(item, new_quantity=target, user=user, reason="Updated from the product editor")


@transaction.atomic
def save_product(data: dict, *, user, product: Product | None = None, request=None) -> Product:
    data = dict(data)
    specs = data.pop("specifications", None)
    variants = data.pop("variants", None)
    stock = data.pop("stock", None)
    m2m = {k: data.pop(k) for k in M2M if k in data}
    if product is None:
        merged = data | {"variants": variants or []} | {"stock": stock}
    else:
        merged = {**{f.name: getattr(product, f.name) for f in Product._meta.concrete_fields if f.name != "id"},
                  "category": product.category, "subcategory": product.subcategory, "location": product.location,
                  **data, "variants": variants if variants is not None else [], "stock": stock}
        if variants is None and merged.get("has_variations"):
            merged["variants"] = [{"sku": v.sku} for v in product.variants.filter(is_default=False)]
    _validate(merged)
    _check_skus(product, merged["sku"], variants or [])

    before = snapshot(product) if product else None
    if product is None:
        product = Product.objects.create(created_by=user, **data)
    else:
        for key, value in data.items():
            setattr(product, key, value)
        product.save()
    for key, value in m2m.items():
        if key in ("related_products", "bought_together", "gifts"):
            value = [p for p in value if p.pk != product.pk]
        getattr(product, key).set(value)
    if specs is not None:
        product.specifications.all().delete()
        ProductSpecification.objects.bulk_create([
            ProductSpecification(product=product, name=s["name"], value=s["value"], sort_order=i)
            for i, s in enumerate(specs) if s.get("name") and s.get("value")
        ])

    default = product.variants.filter(is_default=True).first()
    if not product.has_variations:
        if default is None:
            default = ProductVariant.objects.create(product=product, name="Default", sku=product.sku, is_default=True)
        elif default.sku != product.sku or default.status != VariantStatus.ACTIVE:
            default.sku = product.sku
            default.status = VariantStatus.ACTIVE
            default.save(update_fields=["sku", "status", "updated_at"])
        product.variants.filter(is_default=False).update(status=VariantStatus.INACTIVE)
        _set_stock(default, stock, product.location, user, product.bin_code)
    else:
        if default is not None:  # a simple product gained variations: keep the old SKU for history
            default.is_default = False
            default.status = VariantStatus.INACTIVE
            default.name = default.name if default.name != "Default" else "Original (before variations)"
            default.save(update_fields=["is_default", "status", "name", "updated_at"])
        if variants is not None:
            keep = []
            for row in variants:
                option_values = row.pop("option_values", None)
                row_stock = row.pop("stock", None)
                vid = row.pop("id", None)
                fields = {k: row[k] for k in VARIANT_FIELDS if k in row}
                if vid:
                    variant = product.variants.filter(pk=vid).first()
                    if variant is None:
                        raise WorkflowError("That variation belongs to another product.", field="variants")
                    for k, v in fields.items():
                        setattr(variant, k, v)
                    variant.save()
                else:
                    variant = ProductVariant.objects.create(product=product, **fields)
                if option_values is not None:
                    variant.option_values.set(option_values)
                _set_stock(variant, row_stock, product.location, user, product.bin_code)
                keep.append(variant.pk)
            # Variations removed in the editor: delete if never used, otherwise deactivate.
            for gone in product.variants.exclude(pk__in=keep).exclude(status=VariantStatus.INACTIVE):
                if gone.order_items.exists() or gone.stock.exists():
                    gone.status = VariantStatus.INACTIVE
                    gone.save(update_fields=["status", "updated_at"])
                else:
                    gone.delete()

    after = snapshot(product)
    if before is None:
        record_audit(action="create", request=request, actor=user, instance=product,
                     changes={"sku": [None, product.sku], "price": [None, str(product.price)]})
    else:
        changes = diff(before, after)
        if changes:
            record_audit(action="update", request=request, actor=user, instance=product, changes=changes)
    return product


# --------------------------------------------------------------------------- #
# Delivery estimate plugin
# --------------------------------------------------------------------------- #
def delivery_estimate(*, origin_country=None, destination_city=None, method: str = "air",
                      sensitive: bool = False) -> dict:
    """Days from where the product is to the customer's city, from the store's own rules."""
    settings = StoreSettings.load()
    store_city = settings.location
    if origin_country is not None and origin_country.iso2 != "TZ":
        rule = OriginEstimate.objects.filter(country=origin_country, method=method).first()
        if rule is None:
            return {"available": False, "message": f"No {method} estimate configured for {origin_country.name}."}
        low, high = rule.min_days, rule.max_days
        basis = f"{origin_country.display_name} {rule.get_method_display()}"
        if destination_city is not None and destination_city.name != "Dar es Salaam":
            low, high = low + 2, high + 4
    else:
        route = None
        if store_city and destination_city:
            route = DeliveryEstimateRoute.objects.filter(from_city=store_city, to_city=destination_city).first()
        if route:
            low, high, basis = route.min_days, route.max_days, f"{store_city.name} → {destination_city.name}"
        elif store_city and destination_city and store_city.pk == destination_city.pk:
            low, high, basis = settings.same_city_min_days, settings.same_city_max_days, "Same city delivery"
        else:
            low, high, basis = settings.regional_min_days, settings.regional_max_days, "Regional delivery"
    if sensitive:
        low, high = low + 3, high + 5
    return {"available": True, "min_days": low, "max_days": high, "basis": basis}


def inventory_value() -> Decimal:
    from apps.inventory.models import StockItem

    total = Decimal("0")
    rows = StockItem.objects.select_related("variant__product").filter(quantity__gt=0)
    for item in rows:
        total += item.variant.effective_price * item.quantity
    return total
