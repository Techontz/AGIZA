"""Catalogue: categories, brands, labels, options, vendors, products (editor), images and store settings."""
import base64

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.accounts.constants import StaffLevel
from apps.catalog.models import Category, Product, ProductVariant
from apps.inventory.models import StockItem, StockMovement
from apps.locations.models import City, Country, Warehouse

pytestmark = pytest.mark.django_db

C = "/api/catalog"
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
)


@pytest.fixture
def ecom(client_for):
    return client_for(StaffLevel.ADMIN_L2)


@pytest.fixture
def dar_wh(db):
    tz = Country.objects.get(iso2="TZ")
    return Warehouse.objects.create(name="Dar es Salaam Central", type="fulfillment", country=tz,
                                    city=City.objects.get(name="Dar es Salaam", country=tz))


@pytest.fixture
def cats(db):
    electronics = Category.objects.create(name="Electronics")
    phones = Category.objects.create(name="Smartphones", parent=electronics)
    return electronics, phones


def product_payload(cats, **extra):
    return {"name": "Samsung Galaxy A54 5G", "sku": "ELEC-SAM-A54", "category": cats[0].id,
            "subcategory": cats[1].id, "status": "active", "price": "850000", "compare_at_price": "950000",
            "purchase_cost": "700000", "specifications": [{"name": "RAM", "value": "8GB"}], **extra}


def test_categories_subcategories_and_protection(ecom, cats):
    res = ecom.get(f"{C}/categories/?parent__isnull=true").json()
    assert [c["name"] for c in res] == ["Electronics"]
    assert ecom.post(f"{C}/categories/", {"name": "Deep", "parent": cats[1].id}, format="json").status_code == 400
    Product.objects.create(name="X", sku="X-1", category=cats[0], price=1)
    assert ecom.delete(f"{C}/categories/{cats[0].id}/").status_code == 409


def test_create_simple_product_with_stock_and_edit(ecom, cats, dar_wh):
    bad = ecom.post(f"{C}/products/", product_payload(cats, stock=5), format="json")
    assert bad.status_code == 400 and "location" in bad.json()["error"]["message"].lower()
    res = ecom.post(f"{C}/products/", product_payload(cats, stock=5, location=dar_wh.id, bin_code="A-12-3"),
                    format="json")
    assert res.status_code == 201, res.json()
    body = res.json()
    assert body["reference"].startswith("PROD-") and body["stock"] == 5 and body["location_stock"] == 5
    assert body["specifications"] == [{"name": "RAM", "value": "8GB"}]
    variant = ProductVariant.objects.get(product_id=body["id"])
    assert variant.is_default and variant.sku == "ELEC-SAM-A54"
    assert StockMovement.objects.get(stock_item__variant=variant).kind == "receipt"
    # Changing the editor's stock writes an adjustment, never a silent overwrite.
    res = ecom.patch(f"{C}/products/{body['id']}/", {"stock": 3, "price": "820000"}, format="json")
    assert res.json()["stock"] == 3 and res.json()["price"] == "820000.00"
    assert StockMovement.objects.filter(kind="adjustment").count() == 1
    # SKUs are unique across products and variants.
    dup = ecom.post(f"{C}/products/", product_payload(cats, name="Other"), format="json")
    assert dup.status_code == 400 and "SKU" in dup.json()["error"]["message"]
    wrong_sub = ecom.post(f"{C}/products/", product_payload(cats, sku="S2", category=cats[1].id), format="json")
    assert wrong_sub.status_code == 400


def test_variations_with_options(ecom, cats, dar_wh):
    opt = ecom.post(f"{C}/options/", {"name": "Storage", "type": "storage"}, format="json").json()
    for v in ("128GB", "256GB"):
        opt = ecom.post(f"{C}/options/{opt['id']}/values/", {"value": v}, format="json").json()
    assert ecom.post(f"{C}/options/{opt['id']}/values/", {"value": "128gb"}, format="json").status_code == 400
    v128, v256 = [v["id"] for v in opt["values"]]
    payload = product_payload(cats, has_variations=True, location=dar_wh.id, variation_options=[opt["id"]], variants=[
        {"name": "128GB", "sku": "A54-128", "price": "850000", "option_values": [v128], "stock": 4},
        {"name": "256GB", "sku": "A54-256", "price": "950000", "option_values": [v256], "stock": 2},
    ])
    body = ecom.post(f"{C}/products/", payload, format="json").json()
    assert body["variants_count"] == 2 and body["stock"] == 6
    assert {v["sku"] for v in body["variants"]} == {"A54-128", "A54-256"}
    assert ecom.post(f"{C}/products/", product_payload(cats, sku="Z", has_variations=True),
                     format="json").status_code == 400  # variations required
    # Removing a variation with stock deactivates it instead of deleting it.
    keep = next(v for v in body["variants"] if v["sku"] == "A54-128")
    res = ecom.patch(f"{C}/products/{body['id']}/", {"variants": [{"id": keep["id"], "name": "128GB",
                                                                   "sku": "A54-128"}]}, format="json").json()
    statuses = {v["sku"]: v["status"] for v in res["variants"]}
    assert statuses == {"A54-128": "active", "A54-256": "inactive"}
    assert ecom.delete(f"{C}/options/{opt['id']}/values/{v128}/").status_code == 409


def test_images_primary_and_validation(ecom, cats):
    pid = ecom.post(f"{C}/products/", product_payload(cats), format="json").json()["id"]
    url = f"{C}/products/{pid}/images/"
    assert ecom.post(url, {"file": SimpleUploadedFile("x.png", b"not png", content_type="image/png")},
                     format="multipart").status_code == 400
    first = ecom.post(url, {"file": SimpleUploadedFile("a.png", PNG, content_type="image/png")}, format="multipart")
    assert first.status_code == 201 and first.json()["images"][0]["is_primary"] is True
    body = ecom.post(url, {"file": SimpleUploadedFile("b.png", PNG, content_type="image/png")},
                     format="multipart").json()
    second = next(i for i in body["images"] if not i["is_primary"])
    body = ecom.post(f"{url}{second['id']}/", format="json").json()
    assert next(i for i in body["images"] if i["is_primary"])["id"] == second["id"]
    assert ecom.get(f"/api/{body['image']}/").status_code == 200
    body = ecom.delete(f"{url}{second['id']}/").json()
    assert len(body["images"]) == 1 and body["images"][0]["is_primary"] is True


def test_list_filters_stats_delete_and_permissions(ecom, client_for, cats, dar_wh):
    a = ecom.post(f"{C}/products/", product_payload(cats, stock=10, location=dar_wh.id), format="json").json()
    ecom.post(f"{C}/products/", product_payload(cats, sku="OOS-1", name="Out of stock item"), format="json")
    assert ecom.get(f"{C}/products/?stock=out").json()["count"] == 1
    assert ecom.get(f"{C}/products/?stock=in_stock&category={cats[1].id}").json()["count"] == 1
    assert ecom.get(f"{C}/products/?search=ELEC-SAM").json()["count"] == 1
    stats = ecom.get(f"{C}/products/stats/").json()
    assert stats == {"total": 2, "active": 2, "out_of_stock": 1, "inventory_value": "8500000.00"}
    assert ecom.delete(f"{C}/products/{a['id']}/").status_code == 409  # has stock
    sales = client_for(StaffLevel.SALES)  # ecommerce: view
    assert sales.get(f"{C}/products/").status_code == 200
    assert sales.post(f"{C}/products/", product_payload(cats, sku="S-9"), format="json").status_code == 403
    assert client_for(StaffLevel.DRIVER).get(f"{C}/products/").status_code == 403


def test_vendors_brands_labels(ecom, cats):
    res = ecom.post(f"{C}/vendors/", {"name": "TechHub Electronics", "profit_type": "percent", "profit_value": "150"},
                    format="json")
    assert res.status_code == 400
    v = ecom.post(f"{C}/vendors/", {"name": "TechHub Electronics", "profit_type": "percent", "profit_value": "15",
                                    "location": "Dar es Salaam"}, format="json").json()
    assert v["reference"].startswith("VEND-") and v["total_sales"] == "0.00"
    brand = ecom.post(f"{C}/brands/", {"name": "Samsung", "country": "South Korea"}, format="json").json()
    logo = ecom.post(f"{C}/brands/{brand['id']}/logo/",
                     {"file": SimpleUploadedFile("l.png", PNG, content_type="image/png")}, format="multipart").json()
    assert ecom.get(f"/api/{logo['logo_url']}/").status_code == 200
    label = ecom.post(f"{C}/labels/", {"name": "New Arrival", "color": "blue"}, format="json").json()
    ecom.post(f"{C}/products/", product_payload(cats, vendor=v["id"], brand=brand["id"], labels=[label["id"]]),
              format="json")
    assert ecom.get(f"{C}/labels/").json()[0]["products_count"] == 1
    assert ecom.patch(f"{C}/labels/{label['id']}/", {"visible": False}, format="json").json()["visible"] is False


def test_store_settings_and_delivery_estimates(ecom, client_for):
    dar = City.objects.get(name="Dar es Salaam", country__iso2="TZ")
    arusha = City.objects.get(name="Arusha", country__iso2="TZ")
    bad = ecom.patch(f"{C}/settings/", {"same_city_min_days": 5, "same_city_max_days": 2}, format="json")
    assert bad.status_code == 400
    ecom.patch(f"{C}/settings/", {"location": dar.id, "same_city_min_days": 1, "same_city_max_days": 2},
               format="json")
    assert client_for(StaffLevel.ADMIN_L1).patch(f"{C}/settings/", {"store_name": "X"},
                                                 format="json").status_code == 403  # manage only
    ecom.post(f"{C}/estimate-routes/", {"from_city": dar.id, "to_city": arusha.id, "min_days": 2, "max_days": 3},
              format="json")
    china = Country.objects.get(iso2="CN")
    ecom.post(f"{C}/origin-estimates/", {"country": china.id, "method": "air", "min_days": 7, "max_days": 12},
              format="json")
    est = ecom.get(f"{C}/delivery-estimate/?destination_city={arusha.id}").json()
    assert est == {"available": True, "min_days": 2, "max_days": 3, "basis": "Dar es Salaam → Arusha"}
    est = ecom.get(f"{C}/delivery-estimate/?destination_city={dar.id}").json()
    assert (est["min_days"], est["max_days"]) == (1, 2)
    est = ecom.get(f"{C}/delivery-estimate/?origin_country={china.id}&destination_city={arusha.id}"
                   f"&method=air&sensitive=true").json()
    assert (est["min_days"], est["max_days"]) == (7 + 2 + 3, 12 + 4 + 5)
    assert ecom.get(f"{C}/delivery-estimate/?origin_country={china.id}&method=sea").json()["available"] is False
    assert StockItem.objects.count() == 0


def _set_access(level, **modules):
    from apps.accounts.models import RolePermission

    for module, access in modules.items():
        RolePermission.objects.update_or_create(staff_level=level, module=module, defaults={"access": access})


def test_sliders_managed_through_settings_or_ecommerce(client_for):
    # Settings manage alone (no e-commerce access) manages sliders end to end.
    _set_access(StaffLevel.SALES, ecommerce="none", settings="manage")
    settings_admin = client_for(StaffLevel.SALES)
    made = settings_admin.post(f"{C}/sliders/", {"title": "Eid deals", "sort_order": 1}, format="json")
    assert made.status_code == 201, made.json()
    sid = made.json()["id"]
    img = settings_admin.post(f"{C}/sliders/{sid}/image/",
                              {"file": SimpleUploadedFile("b.png", PNG, content_type="image/png")}, format="multipart")
    assert img.status_code == 200 and img.json()["has_image"] is True
    assert settings_admin.patch(f"{C}/sliders/{sid}/", {"is_active": False}, format="json").status_code == 200
    assert [s["title"] for s in settings_admin.get(f"{C}/sliders/").json()] == ["Eid deals"]
    # The grant is limited to sliders.
    assert settings_admin.post(f"{C}/categories/", {"name": "Toys"}, format="json").status_code == 403

    # E-commerce access still works on its own.
    _set_access(StaffLevel.FINANCE, ecommerce="manage", settings="none")
    assert client_for(StaffLevel.FINANCE).delete(f"{C}/sliders/{sid}/").status_code == 204

    # Settings view only reads; no related module → no access; drivers never.
    _set_access(StaffLevel.DATA_ENTRY, ecommerce="none", settings="view")
    viewer = client_for(StaffLevel.DATA_ENTRY)
    assert viewer.get(f"{C}/sliders/").status_code == 200
    assert viewer.post(f"{C}/sliders/", {"title": "x"}, format="json").status_code == 403
    _set_access(StaffLevel.PROCUREMENT, ecommerce="none", settings="none", orders="none", warehouse="none")
    assert client_for(StaffLevel.PROCUREMENT).get(f"{C}/sliders/").status_code == 403
    _set_access(StaffLevel.DRIVER, settings="manage")
    assert client_for(StaffLevel.DRIVER).get(f"{C}/sliders/").status_code == 403


def csv_file(text: str, name="products.csv"):
    return SimpleUploadedFile(name, text.encode("utf-8"), content_type="text/csv")


def test_products_export_template_and_import(ecom, cats, dar_wh, client_for):
    ecom.post(f"{C}/products/", product_payload(cats, stock=5, location=dar_wh.id), format="json")
    res = ecom.get(f"{C}/products/export/")
    assert res.status_code == 200 and res["Content-Type"].startswith("text/csv")
    text = res.content.decode("utf-8-sig")
    header, row = text.splitlines()[:2]
    assert header.startswith("sku,name,category,subcategory,brand,status")
    assert row.startswith("ELEC-SAM-A54,Samsung Galaxy A54 5G,Electronics,Smartphones,") and ",5," in row
    assert "sku," in ecom.get(f"{C}/products/export/?template=1").content.decode("utf-8-sig")
    assert ecom.get(f"{C}/products/export/?search=nothing-matches").content.decode("utf-8-sig").count("\n") == 1

    sheet = (
        "sku,name,category,subcategory,brand,price,stock,location,origin_country,featured\n"
        f"ELEC-SAM-A54,,,,,799000,8,{dar_wh.code},,yes\n"           # update price + stock of an existing product
        "NEW-TV-55,Hisense 55 inch TV,Electronics,,Hisense,1200000,2,,CN,no\n"  # new one (stock needs a location)
        "NEW-TV-43,Hisense 43 inch TV,Electronics,,Hisense,900000,,,CN,no\n"   # new one, no stock
        "BAD-1,Thing,Toys,,,100,,,,\n"                                         # unknown category
        "NEW-TV-43,Duplicate,Electronics,,,1,,,,\n"                            # duplicate SKU in the file
    )
    preview = ecom.post(f"{C}/products/import/", {"file": csv_file(sheet), "dry_run": "true"}, format="multipart")
    assert preview.status_code == 200, preview.json()
    body = preview.json()
    assert body["dry_run"] is True and body["updated"] == 1 and body["created"] == 1
    assert {e["row"] for e in body["errors"]} == {3, 5, 6}
    assert "location" in next(e for e in body["errors"] if e["row"] == 3)["message"].lower()
    assert "Toys" in next(e for e in body["errors"] if e["row"] == 5)["message"]
    assert not Product.objects.filter(sku="NEW-TV-43").exists()  # the preview saved nothing
    assert str(Product.objects.get(sku="ELEC-SAM-A54").price) == "850000.00"

    done = ecom.post(f"{C}/products/import/", {"file": csv_file(sheet), "dry_run": "false"}, format="multipart")
    assert done.json()["created"] == 1 and done.json()["updated"] == 1
    phone = Product.objects.get(sku="ELEC-SAM-A54")
    assert str(phone.price) == "799000.00" and phone.featured is True and phone.name == "Samsung Galaxy A54 5G"
    assert StockItem.objects.get(variant__product=phone, warehouse=dar_wh).quantity == 8
    tv = Product.objects.get(sku="NEW-TV-43")
    assert tv.brand.name == "Hisense" and tv.origin_country.iso2 == "CN" and tv.status == "draft"
    # Excel-style semicolons and a missing sku column.
    semi = ecom.post(f"{C}/products/import/", {"file": csv_file("sku;price\nNEW-TV-43;950000\n"), "dry_run": "false"},
                     format="multipart")
    assert semi.json()["updated"] == 1 and str(Product.objects.get(sku="NEW-TV-43").price) == "950000.00"
    assert ecom.post(f"{C}/products/import/", {"file": csv_file("name\nX\n")}, format="multipart").status_code == 400
    # Viewers can export but not import.
    viewer = client_for(StaffLevel.DRIVER)
    assert viewer.post(f"{C}/products/import/", {"file": csv_file(sheet)}, format="multipart").status_code == 403
