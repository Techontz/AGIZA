"""Vendor products: ownership forced by the server, moderation before publishing, stock at the vendor's location."""
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.catalog.models import Product, ProductStatus, ReviewStatus
from apps.inventory.models import StockItem
from apps.marketplace.models import MarketplaceSettings

from .conftest import APP, SELLER, product_payload

pytestmark = pytest.mark.django_db


def png(name="p.png"):
    from apps.catalog.tests.test_catalog import PNG

    return SimpleUploadedFile(name, PNG, content_type="image/png")


def public_names(client, **params):
    return [p["name"] for p in client.get(f"{APP}/products/", params).json()["results"]]


def test_new_vendor_product_waits_for_review_then_shows_sold_by(make_seller, staff, anon, shop):
    seller = make_seller("Vendor A Electronics", "255713000001", "Tecno Spark 20", approve_product=False)
    product = seller.product
    assert product.review_status == ReviewStatus.PENDING and product.vendor == seller.vendor
    assert product.location == seller.vendor.warehouse and product.location_kind == "vendor"
    assert "Tecno Spark 20" not in public_names(anon)
    assert seller.client.get(f"{SELLER}/products/{product.pk}/").json()["listing_state"] == "pending_review"
    pending = staff.get("/api/catalog/products/", {"review_status": "pending"}).json()["results"]
    assert [p["name"] for p in pending] == ["Tecno Spark 20"] and pending[0]["seller"]["self_service"]
    staff.post(f"/api/catalog/products/{product.pk}/moderate/", {"action": "approve"}, format="json")
    assert "Tecno Spark 20" in public_names(anon)
    card = anon.get(f"{APP}/products/{product.pk}/").json()
    assert card["vendor"]["name"] == "Vendor A Electronics" and card["vendor"]["slug"] == seller.vendor.slug
    assert card["variants"][0]["available"] == 10
    assert "commission" not in str(card) and "profit" not in str(card)


def test_agiza_products_are_sold_by_agiza_and_need_no_review(anon, shop):
    card = anon.get(f"{APP}/products/{shop.product.pk}/").json()
    assert card["vendor"] == {"slug": "agiza", "name": "AGIZA", "logo": None, "verified": True, "is_agiza": True,
                              "city": None}
    assert Product.objects.get(pk=shop.product.pk).review_status == ReviewStatus.NOT_REQUIRED


def test_price_and_stock_changes_stay_live_but_content_changes_are_reviewed(vendor_a, anon, staff):
    pid, owner = vendor_a.product.pk, vendor_a.client
    res = owner.patch(f"{SELLER}/products/{pid}/", {"price": "299000"}, format="json")
    assert res.status_code == 200 and res.json()["listing_state"] == "published"
    assert anon.get(f"{APP}/products/{pid}/").json()["price"] == "299000.00"
    res = owner.post(f"{SELLER}/products/{pid}/stock/", {"variant": vendor_a.variant.pk, "quantity": 4}, format="json")
    assert res.json()["stock"] == 4
    assert StockItem.objects.get(variant=vendor_a.variant).warehouse == vendor_a.vendor.warehouse
    assert anon.get(f"{APP}/products/{pid}/").json()["variants"][0]["available"] == 4
    # Renaming changes what customers see: back to review, hidden meanwhile.
    res = owner.patch(f"{SELLER}/products/{pid}/", {"name": "Tecno Spark 20 Pro (NEW!!)"}, format="json")
    assert res.json()["listing_state"] == "pending_review"
    assert anon.get(f"{APP}/products/{pid}/").status_code == 404
    # A new image also needs a look.
    staff.post(f"/api/catalog/products/{pid}/moderate/", {"action": "approve"}, format="json")
    res = owner.post(f"{SELLER}/products/{pid}/images/", {"file": png()}, format="multipart")
    assert res.status_code == 201 and res.json()["images"][0]["is_primary"]
    assert res.json()["listing_state"] == "pending_review"


def test_reject_needs_a_reason_and_the_vendor_can_correct_and_resubmit(vendor_a, staff, anon):
    pid, owner = vendor_a.product.pk, vendor_a.client
    owner.patch(f"{SELLER}/products/{pid}/", {"description": "Best phone!!! call 0712..."}, format="json")
    assert staff.post(f"/api/catalog/products/{pid}/moderate/", {"action": "reject"}, format="json").status_code == 400
    staff.post(f"/api/catalog/products/{pid}/moderate/", {"action": "reject", "note": "No phone numbers in text."},
               format="json")
    body = owner.get(f"{SELLER}/products/{pid}/").json()
    assert body["listing_state"] == "rejected" and body["review_note"] == "No phone numbers in text."
    owner.patch(f"{SELLER}/products/{pid}/", {"description": "6.6\" display, 128GB"}, format="json")
    assert owner.get(f"{SELLER}/products/{pid}/").json()["listing_state"] == "pending_review"


def test_disabled_products_stay_off_and_the_vendor_cant_revive_them(vendor_a, staff, anon):
    pid, owner = vendor_a.product.pk, vendor_a.client
    staff.post(f"/api/catalog/products/{pid}/moderate/", {"action": "disable", "note": "Counterfeit report"},
               format="json")
    assert anon.get(f"{APP}/products/{pid}/").status_code == 404
    assert owner.patch(f"{SELLER}/products/{pid}/", {"status": "active"}, format="json").status_code == 409
    assert owner.get(f"{SELLER}/products/{pid}/").json()["listing_state"] == "disabled"


def test_without_review_vendor_products_publish_straight_away(make_seller, anon):
    settings = MarketplaceSettings.load()
    settings.require_product_review = False
    settings.save()
    seller = make_seller("Vendor A Electronics", "255713000001", "Tecno Spark 20", approve_product=False)
    assert seller.product.review_status == ReviewStatus.NOT_REQUIRED
    assert "Tecno Spark 20" in public_names(anon)


def test_vendors_cannot_set_what_is_agizas_to_decide(vendor_a, shop):
    pid, owner = vendor_a.product.pk, vendor_a.client
    res = owner.patch(f"{SELLER}/products/{pid}/", {
        "vendor": 999, "vendor_profit_value": "0", "vendor_profit_type": "fixed", "featured": True,
        "ofa_kali": True, "location": shop.warehouse.pk, "purchase_cost": "1", "review_status": "approved",
        "status": "hidden",
    }, format="json")
    assert res.status_code == 400  # "hidden" isn't a vendor status
    owner.patch(f"{SELLER}/products/{pid}/", {"vendor_profit_value": "0", "featured": True, "ofa_kali": True,
                                              "location": shop.warehouse.pk, "review_status": "approved"},
                format="json")
    product = Product.objects.get(pk=pid)
    assert product.vendor == vendor_a.vendor and product.location == vendor_a.vendor.warehouse
    assert product.vendor_profit_value is None and not product.featured and not product.ofa_kali


def test_draft_inactive_and_delete(vendor_a, anon, shop):
    owner = vendor_a.client
    res = owner.post(f"{SELLER}/products/", product_payload(shop.product.category, name="Draft Phone",
                                                            status="draft", stock=0), format="json")
    draft = res.json()
    assert draft["listing_state"] == "draft" and draft["sku"].startswith(vendor_a.vendor.reference)
    assert owner.delete(f"{SELLER}/products/{draft['id']}/").json() == {"result": "deleted"}
    assert not Product.objects.filter(pk=draft["id"]).exists()
    owner.patch(f"{SELLER}/products/{vendor_a.product.pk}/", {"status": "inactive"}, format="json")
    assert anon.get(f"{APP}/products/{vendor_a.product.pk}/").status_code == 404
    assert Product.objects.get(pk=vendor_a.product.pk).status == ProductStatus.INACTIVE


def test_products_with_variations(vendor_a, staff, anon, shop):
    owner = vendor_a.client
    res = owner.post(f"{SELLER}/products/", product_payload(shop.product.category, name="Kanga Set", has_variations=True,
                                                            variants=[{"name": "Red", "stock": 3},
                                                                      {"name": "Blue", "price": "30000", "stock": 0}]),
                     format="json")
    assert res.status_code == 201, res.json()
    body = res.json()
    assert [v["name"] for v in body["variants"]] == ["Red", "Blue"] and body["stock"] == 3
    staff.post(f"/api/catalog/products/{body['id']}/moderate/", {"action": "approve"}, format="json")
    public = anon.get(f"{APP}/products/{body['id']}/").json()
    assert {v["name"]: v["available"] for v in public["variants"]} == {"Red": 3, "Blue": 0}


def test_moderation_applies_only_to_vendor_managed_products(staff, shop):
    res = staff.post(f"/api/catalog/products/{shop.product.pk}/moderate/", {"action": "approve"}, format="json")
    assert res.status_code == 409
