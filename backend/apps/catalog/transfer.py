"""
Products export / import (E-commerce → Products Management).

The file is CSV (UTF-8 with BOM, so Excel opens it directly). One row per product, matched by SKU on
import: a known SKU updates that product, a new SKU creates one. Only the columns present are changed,
so a sheet with just `sku,price,stock` updates prices and stock. Every row goes through the product
editor's own rules (catalog.services.save_product), and a preview (`dry_run`) checks the whole file
without saving.

Products with variations are updated at product level only (their variations and their stock stay as
they are; edit those in the product editor).
"""
from __future__ import annotations

import csv
import io
from decimal import Decimal, InvalidOperation

from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.core.workflow import WorkflowError
from apps.locations.models import Country, Warehouse

from . import services
from .models import Brand, Category, Condition, Product, ProductStatus
from .serializers import ProductWriteSerializer

COLUMNS = [
    "sku", "name", "category", "subcategory", "brand", "status", "condition", "price", "compare_at_price",
    "purchase_cost", "stock", "location", "origin_country", "weight_kg", "length_cm", "width_cm", "height_cm",
    "featured", "keywords", "video_url", "description",
]
# Export-only (ignored on import).
INFO_COLUMNS = ["seller", "has_variations", "uploaded"]
MAX_ROWS = 2000
TRUE = {"yes", "y", "true", "1", "ndiyo"}
FALSE = {"no", "n", "false", "0", "hapana", ""}


# --------------------------------------------------------------------------- #
# Export
# --------------------------------------------------------------------------- #
def _stock(product: Product) -> int:
    return sum(max(s.quantity - s.reserved, 0) for v in product.variants.all() for s in v.stock.all())


def export_csv(products) -> bytes:
    out = io.StringIO()
    out.write("﻿")  # Excel reads UTF-8 (Swahili names, emoji) only with a BOM
    writer = csv.writer(out)
    writer.writerow(COLUMNS + INFO_COLUMNS)
    for p in products:
        writer.writerow([
            p.sku, p.name,
            p.category.name if p.category_id else "",
            p.subcategory.name if p.subcategory_id else "",
            p.brand.name if p.brand_id else "",
            p.status, p.condition, p.price, p.compare_at_price or "", p.purchase_cost or "",
            _stock(p), p.location.code if p.location_id else "",
            p.origin_country.iso2 if p.origin_country_id else "",
            p.weight_kg or "", p.length_cm or "", p.width_cm or "", p.height_cm or "",
            "yes" if p.featured else "no", p.keywords, p.video_url, p.description,
            p.vendor.name if p.vendor_id else "AGIZA",
            "yes" if p.has_variations else "no",
            f"{p.created_at:%Y-%m-%d}",
        ])
    return out.getvalue().encode("utf-8")


def template_csv() -> bytes:
    out = io.StringIO()
    out.write("﻿")
    writer = csv.writer(out)
    writer.writerow(COLUMNS)
    writer.writerow(["SAMSUNG-A54-128", "Samsung Galaxy A54 128GB", "Phones", "", "Samsung", "active", "new",
                     "850000", "950000", "700000", "10", "", "CN", "0.4", "", "", "", "no", "samsung, simu",
                     "https://www.youtube.com/shorts/aqz-KE-bpKQ",
                     "Brand new, 1 year warranty"])
    return out.getvalue().encode("utf-8")


# --------------------------------------------------------------------------- #
# Import
# --------------------------------------------------------------------------- #
def _read(upload) -> list[dict]:
    if upload is None:
        raise ValidationError({"file": ["Choose a CSV file."]})
    if upload.size > 5 * 1024 * 1024:
        raise ValidationError({"file": ["The file must be 5 MB or smaller."]})
    raw = upload.read()
    for encoding in ("utf-8-sig", "cp1252"):  # Excel on Windows may save CSV as Windows-1252
        try:
            text = raw.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise ValidationError({"file": ["Save the sheet as CSV (UTF-8) and try again."]})
    try:
        dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    headers = [h.strip().lower() for h in (reader.fieldnames or [])]
    if "sku" not in headers:
        raise ValidationError({"file": ["The first row must hold the column names, including “sku”. "
                                        "Download the template to see them."]})
    rows = [{(k or "").strip().lower(): (v or "").strip() for k, v in row.items()} for row in reader]
    rows = [r for r in rows if any(r.values())]
    if len(rows) > MAX_ROWS:
        raise ValidationError({"file": [f"Import at most {MAX_ROWS} products at a time."]})
    return rows


def _decimal(value: str, column: str):
    if value == "":
        return None
    try:
        return Decimal(value.replace(",", "").replace(" ", ""))
    except InvalidOperation:
        raise WorkflowError(f"{column}: “{value}” isn't a number.", field=column) from None


def _category(name: str, parent=None):
    qs = Category.objects.filter(parent=parent)
    match = qs.filter(name__iexact=name).first() or qs.filter(slug__iexact=name).first()
    if match is None:
        where = f" under {parent.name}" if parent else ""
        raise WorkflowError(f"category: “{name}”{where} doesn't exist. Create it first in Categories.",
                            field="category")
    return match


def _payload(row: dict, product: Product | None) -> dict:
    """Turn a sheet row into the product editor's input (names → records, text → values)."""
    data: dict = {}
    if row.get("name"):
        data["name"] = row["name"]
    data["sku"] = row["sku"]
    category = product.category if product else None
    if row.get("category"):
        category = _category(row["category"])
        data["category"] = category.pk
    if "subcategory" in row:
        data["subcategory"] = _category(row["subcategory"], category).pk if row["subcategory"] and category else None
    if "brand" in row:
        data["brand"] = Brand.objects.get_or_create(name=row["brand"])[0].pk if row["brand"] else None
    if row.get("status"):
        status = row["status"].lower().replace(" ", "_")
        if status not in ProductStatus.values:
            raise WorkflowError(f"status: use one of {', '.join(ProductStatus.values)}.", field="status")
        data["status"] = status
    if row.get("condition"):
        condition = row["condition"].lower().replace(" ", "_")
        if condition not in Condition.values:
            raise WorkflowError(f"condition: use one of {', '.join(Condition.values)}.", field="condition")
        data["condition"] = condition
    for column in ("price", "compare_at_price", "purchase_cost", "weight_kg", "length_cm", "width_cm", "height_cm"):
        if column in row:
            value = _decimal(row[column], column)
            if value is not None or column != "price":
                data[column] = value
    if row.get("location"):
        location = Warehouse.objects.filter(code__iexact=row["location"]).first() or \
            Warehouse.objects.filter(name__iexact=row["location"]).first()
        if location is None:
            raise WorkflowError(f"location: no warehouse “{row['location']}” (use its code, e.g. WH-001).",
                                field="location")
        data["location"] = location.pk
    if "origin_country" in row:
        code = row["origin_country"].upper()
        country = Country.objects.filter(iso2=code).first() if code else None
        if code and country is None:
            raise WorkflowError(f"origin_country: “{row['origin_country']}” — use the 2-letter code (CN, AE, TZ).",
                                field="origin_country")
        data["origin_country"] = country.pk if country else None
    if row.get("featured") is not None and "featured" in row:
        value = row["featured"].lower()
        if value not in TRUE | FALSE:
            raise WorkflowError("featured: write yes or no.", field="featured")
        data["featured"] = value in TRUE
    for column in ("keywords", "description", "video_url"):
        if column in row:
            data[column] = row[column]
    if row.get("stock", "") != "" and not (product and product.has_variations):
        try:
            data["stock"] = int(Decimal(row["stock"]))
        except (InvalidOperation, ValueError):
            raise WorkflowError(f"stock: “{row['stock']}” isn't a whole number.", field="stock") from None
        if "location" not in data and product and product.location_id:
            data["location"] = product.location_id
    if product is None:
        missing = [c for c in ("name", "category", "price") if c not in data]
        if missing:
            raise WorkflowError(f"New product: fill {', '.join(missing)}.", field=missing[0])
    return data


def _errors(exc) -> str:
    if isinstance(exc, WorkflowError):
        return exc.message
    detail = getattr(exc, "detail", exc)
    if isinstance(detail, dict):
        return "; ".join(f"{k}: {' '.join(str(m) for m in (v if isinstance(v, list) else [v]))}"
                         for k, v in detail.items())
    return str(detail)


def import_csv(upload, *, user, dry_run: bool, request=None) -> dict:
    """Create / update products from the sheet. With `dry_run` nothing is saved (a preview)."""
    rows = _read(upload)
    result = {"rows": len(rows), "created": 0, "updated": 0, "errors": [], "dry_run": dry_run}
    seen = set()
    with transaction.atomic():
        for number, row in enumerate(rows, start=2):  # row 1 holds the column names
            sku = row.get("sku", "")
            try:
                if not sku:
                    raise WorkflowError("sku is empty.", field="sku")
                if sku.lower() in seen:
                    raise WorkflowError(f"SKU {sku} appears twice in the file.", field="sku")
                seen.add(sku.lower())
                product = Product.objects.filter(sku__iexact=sku).first()
                data = _payload(row, product)
                s = ProductWriteSerializer(data=data, partial=product is not None)
                s.is_valid(raise_exception=True)
                with transaction.atomic():  # one bad row never leaves half a product behind
                    services.save_product(s.validated_data, user=user, product=product, request=request)
                result["updated" if product else "created"] += 1
            except (WorkflowError, ValidationError) as exc:
                result["errors"].append({"row": number, "sku": sku, "message": _errors(exc)})
        if dry_run:
            transaction.set_rollback(True)
    return result
