"""The website home page staff arrange in the admin (E-commerce → Website Homepage)."""
import pytest

from apps.catalog.models import HomeSection, MobileSlider

from .conftest import APP

pytestmark = pytest.mark.django_db
SECTIONS = "/api/catalog/home-sections/"


def kinds(api) -> list[tuple[str, str]]:
    return [(s["kind"], s["title"]) for s in api.get(f"{APP}/home/").json()["sections"]]


def test_the_current_layout_is_the_starting_point(api, shop):
    assert kinds(api) == [
        ("banners", ""), ("products", "Featured products"), ("products", "Ofa kali deals"), ("services", ""),
        ("products", "Popular right now"), ("categories", "Top Categories"), ("category_rows", ""),
        ("products", "New arrivals"), ("stores", "Stores on AGIZA")]
    featured = api.get(f"{APP}/home/").json()["sections"][1]
    names = {p["name"] for p in featured["products"]}
    assert {"Galaxy A54", "USB-C Cable"} <= names and "Unreleased Phone" not in names  # topped up, drafts hidden
    assert featured["href"] == "/shop?featured=1"


def test_staff_hand_pick_a_row_and_arrange_the_page(api, shop, client_for):
    staff = client_for("admin_l2")
    assert staff.post(SECTIONS, {"kind": "products", "title": "x"}, format="json").status_code == 400  # needs source
    assert staff.post(SECTIONS, {"kind": "products", "source": "category"}, format="json").status_code == 400
    assert staff.post(SECTIONS, {"kind": "products", "source": "manual", "product_ids": []},
                      format="json").status_code == 400
    res = staff.post(SECTIONS, {"kind": "products", "title": "Back to school", "source": "manual", "limit": 6,
                                "product_ids": [shop.cable.pk, shop.draft.pk, shop.product.pk]}, format="json")
    assert res.status_code == 201, res.json()
    picked = res.json()
    assert [p["name"] for p in picked["products"]] == ["USB-C Cable", "Unreleased Phone", "Galaxy A54"]

    ids = [s.pk for s in HomeSection.objects.order_by("sort_order", "id")]
    new_order = [picked["id"], *[i for i in ids if i != picked["id"]]]
    assert staff.post(f"{SECTIONS}reorder/", {"ids": new_order}, format="json").status_code == 200
    first = api.get(f"{APP}/home/").json()["sections"][0]
    assert first["title"] == "Back to school" and first["href"] is None
    assert [p["name"] for p in first["products"]] == ["USB-C Cable", "Galaxy A54"]  # in order; the draft is hidden

    staff.patch(f"{SECTIONS}{picked['id']}/", {"product_ids": [shop.product.pk]}, format="json")
    assert [p["name"] for p in api.get(f"{APP}/home/").json()["sections"][0]["products"]] == ["Galaxy A54"]
    staff.patch(f"{SECTIONS}{picked['id']}/", {"is_active": False}, format="json")
    assert "Back to school" not in [t for _, t in kinds(api)]  # hidden sections aren't sent
    assert client_for("sales").post(SECTIONS, {"kind": "stores"}, format="json").status_code == 403


def test_a_category_row_and_chosen_top_categories(api, shop, client_for):
    staff = client_for("admin_l2")
    category = shop.product.category
    res = staff.post(SECTIONS, {"kind": "products", "title": "Phones", "source": "category",
                                "category": category.pk}, format="json")
    assert res.status_code == 201, res.json()
    row = next(s for s in api.get(f"{APP}/home/").json()["sections"] if s["title"] == "Phones")
    assert row["category"]["id"] == category.pk and {p["name"] for p in row["products"]} == {"Galaxy A54",
                                                                                            "USB-C Cable"}
    tiles = staff.post(SECTIONS, {"kind": "categories", "title": "Shop by category", "category_ids": [category.pk]},
                       format="json").json()
    assert tiles["categories_detail"] == [{"id": category.pk, "name": category.name}]
    block = next(s for s in api.get(f"{APP}/home/").json()["sections"] if s["title"] == "Shop by category")
    assert [t["category"]["id"] for t in block["tiles"]] == [category.pk] and block["tiles"][0]["count"] == 2


def test_banners_show_where_staff_place_them(api, shop):
    for title, placement in (("App only", "app"), ("Site only", "website"), ("Everywhere", "both")):
        MobileSlider.objects.create(title=title, placement=placement, image=f"catalog/sliders/{placement}.png")
    assert [s["title"] for s in api.get(f"{APP}/sliders/").json()] == ["App only", "Everywhere"]
    banners = api.get(f"{APP}/home/").json()["sections"][0]["banners"]
    assert [b["title"] for b in banners] == ["Site only", "Everywhere"]


def test_staff_set_the_hot_sales_order(api, shop, client_for):
    from apps.catalog.models import Product

    staff = client_for("admin_l2")
    url = "/api/catalog/hot-sales/"
    assert staff.get(url).json() == []
    res = staff.post(url, {"ids": [shop.cable.pk, shop.product.pk]}, format="json")
    assert res.status_code == 200, res.json()
    assert [r["name"] for r in res.json()] == ["USB-C Cable", "Galaxy A54"]
    listed = api.get(f"{APP}/products/", {"featured": "1"}).json()["results"]
    assert [p["name"] for p in listed] == ["USB-C Cable", "Galaxy A54"]  # the app's Hot Sales, in staff order
    site_row = api.get(f"{APP}/home/").json()["sections"][1]
    assert [p["name"] for p in site_row["products"]][:2] == ["USB-C Cable", "Galaxy A54"]

    staff.post(url, {"ids": [shop.product.pk]}, format="json")  # the cable leaves Hot Sales
    assert not Product.objects.get(pk=shop.cable.pk).featured
    assert [p["name"] for p in api.get(f"{APP}/products/", {"featured": "1"}).json()["results"]] == ["Galaxy A54"]
    assert staff.post(url, {"ids": [shop.product.pk, shop.product.pk]}, format="json").status_code == 400
    assert staff.post(url, {"ids": [999999]}, format="json").status_code == 400
    assert client_for("sales").post(url, {"ids": []}, format="json").status_code == 403


def test_staff_pin_products_to_the_top_of_the_shop_and_order_categories(api, shop, client_for):
    staff = client_for("admin_l2")
    url = "/api/catalog/shop-order/"
    newest_first = [p["name"] for p in api.get(f"{APP}/products/", {"ordering": "newest"}).json()["results"]]
    assert [p["name"] for p in api.get(f"{APP}/products/").json()["results"]] == newest_first  # nothing pinned
    res = staff.post(url, {"ids": [shop.cable.pk, shop.product.pk]}, format="json")
    assert res.status_code == 200, res.json()
    assert [r["name"] for r in staff.get(url).json()] == ["USB-C Cable", "Galaxy A54"]
    listed = [p["name"] for p in api.get(f"{APP}/products/").json()["results"]]
    assert listed[:2] == ["USB-C Cable", "Galaxy A54"]
    by_category = api.get(f"{APP}/products/", {"category": shop.product.category_id}).json()["results"]
    assert [p["name"] for p in by_category][:2] == ["USB-C Cable", "Galaxy A54"]
    staff.post(url, {"ids": [shop.product.pk]}, format="json")  # the cable is unpinned
    assert [r["name"] for r in staff.get(url).json()] == ["Galaxy A54"]
    assert api.get(f"{APP}/products/").json()["results"][0]["name"] == "Galaxy A54"
    assert staff.post(url, {"ids": [999999]}, format="json").status_code == 400
    assert client_for("sales").post(url, {"ids": []}, format="json").status_code == 403

    from apps.catalog.models import Category

    a = Category.objects.create(name="Zeta", slug="zeta")
    b = Category.objects.create(name="Alpha", slug="alpha-x")
    res = staff.post("/api/catalog/categories/reorder/", {"ids": [a.pk, b.pk]}, format="json")
    assert res.status_code == 200, res.json()
    names = [c["name"] for c in api.get(f"{APP}/categories/").json() if c["name"] in ("Zeta", "Alpha")]
    assert names == ["Zeta", "Alpha"]
    child = Category.objects.create(name="Kid", slug="kid", parent=a)
    assert staff.post("/api/catalog/categories/reorder/", {"ids": [a.pk, child.pk]},
                      format="json").status_code == 400  # one level at a time


def test_staff_relist_an_older_product_as_new_and_cards_carry_the_variant(api, shop, client_for):
    from datetime import timedelta

    from django.utils import timezone

    from apps.catalog.models import Product

    Product.objects.filter(pk=shop.product.pk).update(created_at=timezone.now() - timedelta(days=30))
    newest = lambda: api.get(f"{APP}/products/", {"ordering": "newest"}).json()["results"][0]["name"]  # noqa: E731
    assert newest() != "Galaxy A54"
    staff = client_for("admin_l2")
    res = staff.post(f"/api/catalog/products/{shop.product.pk}/relist/", {}, format="json")
    assert res.status_code == 200, res.json()
    assert newest() == "Galaxy A54"
    assert staff.post(f"/api/catalog/products/{shop.product.pk}/relist/", {"date": "2026-01-05"},
                      format="json").status_code == 200
    assert Product.objects.get(pk=shop.product.pk).created_at.date().isoformat() == "2026-01-05"
    assert staff.post(f"/api/catalog/products/{shop.product.pk}/relist/", {"date": "nope"},
                      format="json").status_code == 400
    assert staff.post(f"/api/catalog/products/{shop.product.pk}/relist/", {"date": "2999-01-01"},
                      format="json").status_code == 400
    assert client_for("driver").post(f"/api/catalog/products/{shop.product.pk}/relist/", {},
                                     format="json").status_code == 403
    card = next(p for p in api.get(f"{APP}/products/").json()["results"] if p["name"] == "USB-C Cable")
    assert card["variant"] == shop.cable_variant.pk and card["in_stock"] is True
