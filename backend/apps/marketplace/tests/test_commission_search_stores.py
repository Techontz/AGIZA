"""Commission rules, normalised search (mobile and web share it), public stores, and Selcom on a multi-vendor order."""
from decimal import Decimal as D

import pytest
from django.test import override_settings

from apps.catalog.models import Brand, Category, Product, Vendor
from apps.catalog.search import normalize, product_search_text
from apps.marketplace import commission
from apps.marketplace.models import CategoryCommission, MarketplaceSettings, VendorFulfillment
from apps.orders.models import Payment
from apps.payments.models import GatewayPayment
from apps.payments.tests.test_selcom import SELCOM, Gateway  # noqa: F401  (fixture helper)

from .conftest import APP
from .test_checkout import fill_cart

pytestmark = pytest.mark.django_db


# --------------------------------------------------------------------------- #
# Commission
# --------------------------------------------------------------------------- #
@pytest.fixture
def cats(db):
    top = Category.objects.create(name="Electronics")
    sub = Category.objects.create(name="Phones", parent=top)
    return top, sub


def product(cats, vendor, **extra):
    top, sub = cats
    return Product(name="X", sku="X", category=top, subcategory=sub, price=D("100000"), vendor=vendor, **extra)


def test_default_then_category_then_subcategory(cats):
    MarketplaceSettings.load()
    vendor = Vendor.objects.create(name="V", commission_mode="default")
    p = product(cats, vendor)
    assert commission.rate_for(p) == commission.Rate("percent", D("10.00"), "default")
    CategoryCommission.objects.create(category=cats[0], percent=D("8"))
    assert commission.rate_for(p).source == "category" and commission.rate_for(p).value == D("8")
    CategoryCommission.objects.create(category=cats[1], percent=D("6.5"))
    assert commission.rate_for(p) == commission.Rate("percent", D("6.5"), "subcategory")
    assert commission.commission_for(commission.rate_for(p), D("100000"), 3) == D("19500.00")


def test_vendor_agreement_and_per_product_override(cats):
    vendor = Vendor.objects.create(name="V", commission_mode="custom", profit_type="percent", profit_value=D("15"))
    CategoryCommission.objects.create(category=cats[1], percent=D("5"))
    assert commission.rate_for(product(cats, vendor)).source == "vendor"  # the agreement wins over categories
    vendor.profit_scope = "per_product"
    p = product(cats, vendor, vendor_profit_type="fixed", vendor_profit_value=D("7000"))
    rate = commission.rate_for(p)
    assert (rate.kind, rate.value, rate.source) == ("fixed", D("7000"), "product")
    assert commission.commission_for(rate, D("100000"), 2) == D("14000.00")


def test_commission_never_exceeds_the_sale_and_agiza_products_have_none(cats):
    rate = commission.Rate("fixed", D("50000"), "vendor")
    assert commission.commission_for(rate, D("30000"), 1) == D("30000.00")
    assert commission.rate_for(product(cats, None)) is None
    assert commission.commission_for(None, D("30000"), 2) == D("0")


def test_percent_rounding_is_to_the_cent():
    rate = commission.Rate("percent", D("12.5"), "default")
    assert commission.commission_for(rate, D("333.33"), 1) == D("41.67")


# --------------------------------------------------------------------------- #
# Search
# --------------------------------------------------------------------------- #
def test_normalize_ignores_case_accents_and_punctuation():
    assert normalize("Levi's 501® Jeans") == "levis 501 jeans"
    assert normalize("LEVI’S") == "levis"
    assert normalize('LG 55" 4K Smart-TV') == "lg 55 4k smart tv"
    assert normalize("Café Crème") == "cafe creme"


@pytest.mark.parametrize("query", ["levis", "Levi's", "LEVIS 501", "levi’s jeans", "501", "  levis   "])
def test_levis_is_found_however_it_is_typed(api, shop, query):
    brand = Brand.objects.create(name="Levi's")
    Product.objects.filter(pk=shop.cable.pk).update(name="Levi's 501 Original Jeans")
    shop.cable.refresh_from_db()
    shop.cable.brand = brand
    shop.cable.save()
    names = [p["name"] for p in api.get(f"{APP}/products/", {"search": query}).json()["results"]]
    assert names == ["Levi's 501 Original Jeans"]


def test_search_matches_brand_category_vendor_and_joined_words(api, shop, vendor_a):
    assert [p["name"] for p in api.get(f"{APP}/products/", {"search": "phones"}).json()["results"]] \
        == ["Tecno Spark 20", "USB-C Cable", "Galaxy A54"]
    assert [p["name"] for p in api.get(f"{APP}/products/", {"search": "vendor a"}).json()["results"]] \
        == ["Tecno Spark 20"]
    assert [p["name"] for p in api.get(f"{APP}/products/", {"search": "galaxya54"}).json()["results"]] \
        == ["Galaxy A54"]
    assert [p["name"] for p in api.get(f"{APP}/products/", {"search": "usbc"}).json()["results"]] == ["USB-C Cable"]
    assert api.get(f"{APP}/products/", {"search": "levis"}).json()["results"] == []


def test_renaming_a_brand_or_vendor_keeps_search_in_step(api, shop, vendor_a):
    vendor = vendor_a.vendor
    vendor.name = "Mlimani Gadgets"
    vendor.save()
    assert [p["name"] for p in api.get(f"{APP}/products/", {"search": "mlimani"}).json()["results"]] \
        == ["Tecno Spark 20"]
    assert product_search_text(Product.objects.get(pk=vendor_a.product.pk)).startswith("tecno spark 20")


# --------------------------------------------------------------------------- #
# Stores
# --------------------------------------------------------------------------- #
def test_stores_list_only_public_sellers_and_agiza(api, app, shop, vendor_a, vendor_b):
    from .conftest import SELLER, application

    app.post(f"{SELLER}/store/", application(name="Pending Store"), format="json")
    rows = api.get(f"{APP}/stores/").json()["results"]
    assert [r["name"] for r in rows] == ["AGIZA", "Vendor A Electronics", "Vendor B Fashion"]
    assert rows[1]["products_count"] == 1 and rows[1]["verified"] and rows[1]["city"] == "Dar es Salaam"
    for row in rows:  # nothing private
        assert not {"tin", "payout_account_number", "legal_name", "phone", "commission"} & set(row)
    assert [r["name"] for r in api.get(f"{APP}/stores/", {"search": "fashion"}).json()["results"]] \
        == ["Vendor B Fashion"]
    detail = api.get(f"{APP}/stores/{vendor_a.vendor.slug}/").json()
    assert detail["name"] == "Vendor A Electronics" and "description" in detail
    assert api.get(f"{APP}/stores/agiza/").json()["products_count"] == 2
    assert api.get(f"{APP}/stores/pending-store/").status_code == 404
    names = [p["name"] for p in api.get(f"{APP}/products/", {"store": vendor_b.vendor.slug}).json()["results"]]
    assert names == ["Kitenge Dress"]
    assert [p["name"] for p in api.get(f"{APP}/products/", {"store": "agiza"}).json()["results"]] \
        == ["USB-C Cable", "Galaxy A54"]


def test_store_logo_is_public_only_for_public_stores(api, vendor_a, staff):
    from django.core.files.uploadedfile import SimpleUploadedFile

    from apps.catalog.tests.test_catalog import PNG

    from .conftest import SELLER

    res = vendor_a.client.post(f"{SELLER}/store/logo/", {"file": SimpleUploadedFile("l.png", PNG,
                                                                                    content_type="image/png")},
                               format="multipart")
    assert res.status_code == 200 and res.json()["logo"]
    assert api.get(f"{APP}/stores/{vendor_a.vendor.slug}/logo/").status_code == 200
    assert api.get(f"{APP}/stores/{vendor_a.vendor.slug}/").json()["logo"].endswith("/logo/")
    staff.post(f"/api/catalog/vendors/{vendor_a.vendor.pk}/review/", {"status": "suspended", "note": "x"},
               format="json")
    assert api.get(f"{APP}/stores/{vendor_a.vendor.slug}/logo/").status_code == 404


def test_price_filters_and_popular_ordering(api, shop, vendor_a):
    names = [p["name"] for p in api.get(f"{APP}/products/", {"min_price": "20000", "max_price": "400000"})
             .json()["results"]]
    assert names == ["Tecno Spark 20"]
    assert api.get(f"{APP}/products/", {"ordering": "popular"}).status_code == 200


# --------------------------------------------------------------------------- #
# Selcom regression on a multi-vendor order
# --------------------------------------------------------------------------- #
def test_one_selcom_payment_funds_every_seller(app, home, shop, vendor_a, vendor_b, monkeypatch, api):
    from apps.payments import selcom

    gateway = Gateway()
    monkeypatch.setattr(selcom, "_call", gateway)
    with override_settings(**SELCOM):
        fill_cart(app, [(vendor_a.variant, 1), (vendor_b.variant, 1)])
        res = app.post(f"{APP}/checkout/place-order/", {"address": home.pk, "shipping_method": shop.rider.pk,
                                                         "payment_method": "mobile_money",
                                                         "idempotency_key": "mv-selcom-01"}, format="json")
        assert res.status_code == 201, res.json()
        body = res.json()
        assert body["payment"]["checkout_url"] == "https://checkout.selcom.test/pay/abc"
        gp = GatewayPayment.objects.get()
        assert gp.amount == D("371000")  # 320,000 + 45,000 + two rider pickups of 3,000
        # A webhook alone never credits anything: Selcom is asked, and says PENDING.
        api.post("/api/payments/selcom/webhook/", {"order_id": gp.provider_order_id, "payment_status": "COMPLETED"},
                 format="json")
        assert Payment.objects.count() == 0
        gateway.status = {"payment_status": "COMPLETED", "amount": "371000", "transid": "SELMV1"}
        api.post("/api/payments/selcom/webhook/", {"order_id": gp.provider_order_id}, format="json")
        api.post("/api/payments/selcom/webhook/", {"order_id": gp.provider_order_id}, format="json")  # repeated
    assert Payment.objects.count() == 1 and Payment.objects.get().amount == D("371000")
    # Paid, but not delivered yet: vendor earnings stay pending until delivery.
    assert set(VendorFulfillment.objects.values_list("settlement_status", flat=True)) == {"pending"}


# --------------------------------------------------------------------------- #
# The website server's catalogue reads
# --------------------------------------------------------------------------- #
def test_website_server_key_skips_only_the_anonymous_limit_for_public_reads(api, shop, monkeypatch, settings):
    from django.core.cache import cache

    from apps.storefront.views.base import PublicAnonThrottle

    monkeypatch.setattr(PublicAnonThrottle, "get_rate", lambda self: "2/min")
    cache.clear()
    settings.STOREFRONT_SERVER_KEY = "s3rver-key-for-tests"
    statuses = [api.get(f"{APP}/products/").status_code for _ in range(3)]
    assert statuses == [200, 200, 429]  # visitors are limited
    good = {"HTTP_X_STOREFRONT_KEY": "s3rver-key-for-tests"}
    assert all(api.get(f"{APP}/products/", **good).status_code == 200 for _ in range(5))
    assert api.get(f"{APP}/products/", HTTP_X_STOREFRONT_KEY="wrong").status_code == 429
    # Never for writes (sign-in, OTP): those keep their limits.
    assert api.post(f"{APP}/auth/login/", {"phone": "0712000000", "password": "x"}, format="json",
                    **good).status_code == 429
    settings.STOREFRONT_SERVER_KEY = ""  # disabled: the header means nothing
    assert api.get(f"{APP}/products/", **good).status_code == 429
