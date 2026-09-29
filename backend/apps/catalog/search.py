"""
Customer product search. Names are matched on a normalised form, so case, accents and
punctuation never make an obvious search fail: "levis" finds "Levi's 501", "e-bike"
finds "E Bike", "tv 55" finds 'LG 55" 4K Smart TV'.

`Product.search_text` holds the normalised name, brand, category, vendor and keywords
(updated on save and when a brand, category or vendor is renamed). A query is split into
the same normalised words and every word must appear.
"""
from __future__ import annotations

import re
import unicodedata

_APOSTROPHES = re.compile(r"['’‘`´]")
_NON_WORD = re.compile(r"[^0-9a-z]+")
MAX_TERMS = 8


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch)).lower()
    text = _APOSTROPHES.sub("", text)  # levi's -> levis (not "levi s")
    return _NON_WORD.sub(" ", text).strip()


def terms(query: str) -> list[str]:
    return normalize(query[:100]).split()[:MAX_TERMS]


def product_search_text(product) -> str:
    parts = [product.name, product.keywords, product.sku]
    for relation in ("brand", "category", "subcategory", "vendor"):
        related_id = getattr(product, f"{relation}_id", None)
        if related_id:
            parts.append(getattr(product, relation).name)
    text = normalize(" ".join(p for p in parts if p))
    # Also index the words joined up, so "iphone15" or "airmax" still match.
    compact = text.replace(" ", "")
    return f"{text} {compact}"[:1000]


def filter_products(qs, query: str):
    for term in terms(query):
        qs = qs.filter(search_text__contains=term)
    return qs


def refresh_products(products_qs) -> int:
    """Recompute search_text for products (after a brand / category / vendor rename)."""
    n = 0
    for product in products_qs.select_related("brand", "category", "subcategory", "vendor"):
        text = product_search_text(product)
        if text != product.search_text:
            type(product).objects.filter(pk=product.pk).update(search_text=text)
            n += 1
    return n
