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
