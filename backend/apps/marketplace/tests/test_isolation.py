"""
Vendor isolation, enforced by the server: vendor A can never read or change vendor B's
products, stock, orders, earnings or payouts, nor reach staff-only functions, whatever ids
it sends. Customers stay isolated from each other as before.
"""
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.catalog.models import Product
from apps.inventory.models import StockItem
from apps.marketplace.models import VendorFulfillment

from .conftest import APP, SELLER
from .test_checkout import checkout

pytestmark = pytest.mark.django_db


def test_vendor_a_cannot_read_or_change_vendor_b_products(vendor_a, vendor_b):
    a, b_product, b_variant = vendor_a.client, vendor_b.product, vendor_b.variant
    listed = [p["name"] for p in a.get(f"{SELLER}/products/").json()["results"]]
    assert listed == ["Tecno Spark 20"]
    assert a.get(f"{SELLER}/products/{b_product.pk}/").status_code == 404
    assert a.patch(f"{SELLER}/products/{b_product.pk}/", {"price": "1"}, format="json").status_code == 404
    assert a.delete(f"{SELLER}/products/{b_product.pk}/").status_code == 404
    assert a.post(f"{SELLER}/products/{b_product.pk}/stock/", {"variant": b_variant.pk, "quantity": 0},
                  format="json").status_code == 404
    # Nor through its own product id with B's variant.
    assert a.post(f"{SELLER}/products/{vendor_a.product.pk}/stock/", {"variant": b_variant.pk, "quantity": 0},
                  format="json").status_code == 404
    png = SimpleUploadedFile("x.png", b"\x89PNG\r\n\x1a\n" + b"0" * 64, content_type="image/png")
    assert a.post(f"{SELLER}/products/{b_product.pk}/images/", {"file": png}, format="multipart").status_code == 404
    # Nor by claiming B's product in a variation id.
    res = a.patch(f"{SELLER}/products/{vendor_a.product.pk}/", {
        "has_variations": True, "variants": [{"id": b_variant.pk, "name": "Stolen", "stock": 1}]}, format="json")
    assert res.status_code == 400
    b_product.refresh_from_db()
    assert b_product.price == 45000 and b_product.vendor == vendor_b.vendor
    assert StockItem.objects.get(variant=b_variant).quantity == 10
    assert b_variant.name == Product.objects.get(pk=b_product.pk).variants.get(is_default=True).name


def test_vendor_a_cannot_see_vendor_b_images(vendor_a, vendor_b):
    from apps.catalog.models import ProductImage
    from apps.catalog.tests.test_catalog import PNG

    vendor_b.client.post(f"{SELLER}/products/{vendor_b.product.pk}/images/",
                         {"file": SimpleUploadedFile("b.png", PNG, content_type="image/png")}, format="multipart")
    image = ProductImage.objects.get(product=vendor_b.product)
    assert vendor_b.client.get(f"{SELLER}/images/{image.pk}/").status_code == 200
    assert vendor_a.client.get(f"{SELLER}/images/{image.pk}/").status_code == 404
    assert vendor_a.client.delete(f"{SELLER}/products/{vendor_b.product.pk}/images/{image.pk}/").status_code == 404
    assert vendor_a.client.delete(f"{SELLER}/products/{vendor_a.product.pk}/images/{image.pk}/").status_code == 404


def test_vendor_sees_only_its_own_part_of_a_shared_order(vendor_a, vendor_b, app, home, shop):
    order = checkout(app, home, shop, [(shop.cable_variant, 1), (vendor_a.variant, 1), (vendor_b.variant, 2)])
    part_a = VendorFulfillment.objects.get(order=order, vendor=vendor_a.vendor)
    part_b = VendorFulfillment.objects.get(order=order, vendor=vendor_b.vendor)
    rows = vendor_a.client.get(f"{SELLER}/orders/").json()["results"]
    assert [r["id"] for r in rows] == [part_a.pk]
    detail = vendor_a.client.get(f"{SELLER}/orders/{part_a.pk}/").json()
    assert [i["name"] for i in detail["items"]] == ["Tecno Spark 20"]  # not B's dress, not AGIZA's cable
    text = str(detail)
    assert "Kitenge" not in text and "USB-C" not in text and "Vendor B" not in text
    # Only what's needed to prepare the order: a first name and the delivery city — no phone or address.
    assert detail["customer"] == "Neema" and detail["delivery_city"] == "Dar es Salaam"
    assert "255712345678" not in text and "Mikocheni" not in text
    # B's part doesn't exist for A.
    assert vendor_a.client.get(f"{SELLER}/orders/{part_b.pk}/").status_code == 404
    assert vendor_a.client.post(f"{SELLER}/orders/{part_b.pk}/accept/").status_code == 404
    part_b.refresh_from_db()
    assert part_b.status == "pending"


def test_vendor_earnings_are_its_own(vendor_a, vendor_b, app, home, shop):
    checkout(app, home, shop, [(vendor_a.variant, 1), (vendor_b.variant, 2)])
    a = vendor_a.client.get(f"{SELLER}/earnings/").json()["summary"]
    b = vendor_b.client.get(f"{SELLER}/earnings/").json()["summary"]
    assert a["gross_sales"] == "320000.00" and b["gross_sales"] == "90000.00"
    assert vendor_a.client.get(f"{SELLER}/dashboard/").json()["earnings"]["gross_sales"] == "320000.00"
    # Payout details are the vendor's own and never exposed publicly.
    assert "0713000001" not in str(app.get(f"{APP}/stores/{vendor_a.vendor.slug}/").json())


def test_vendors_cannot_reach_staff_functions(vendor_a, vendor_b):
    a = vendor_a.client
    for url in ["/api/catalog/vendors/", "/api/marketplace/earnings/", "/api/marketplace/fulfillments/",
                "/api/marketplace/payouts/", "/api/marketplace/settings/", "/api/catalog/products/",
                "/api/orders/shop/"]:
        assert a.get(url).status_code == 401, url
    assert a.post(f"/api/catalog/products/{vendor_a.product.pk}/moderate/", {"action": "approve"},
                  format="json").status_code == 401
    assert a.patch("/api/marketplace/settings/", {"default_commission_percent": "0"}, format="json").status_code == 401
    assert a.post("/api/marketplace/payouts/", {"vendor": vendor_a.vendor.pk, "method": "cash"},
                  format="json").status_code == 401


def test_customers_without_a_store_have_no_seller_access(app, vendor_a):
    for url in ["store/", "dashboard/", "products/", "orders/", "earnings/", f"products/{vendor_a.product.pk}/"]:
        assert app.get(f"{SELLER}/{url}").status_code == 404, url


def test_customers_stay_isolated_on_marketplace_orders(vendor_a, app, other_app, home, shop):
    order = checkout(app, home, shop, [(vendor_a.variant, 1)])
    assert other_app.get(f"{APP}/orders/{order.reference}/").status_code == 404
    assert other_app.get(f"{APP}/cart/").json()["items"] == []
    assert other_app.post(f"{APP}/checkout/preview/", {"address": home.pk}, format="json").status_code == 404
