"""Inventory ledger and e-commerce shop orders (reservation → shipping → delivery → delivered)."""
from decimal import Decimal as D

import pytest

from apps.accounts.constants import StaffLevel
from apps.catalog.models import Category, Product, ProductVariant
from apps.inventory import services as inventory
from apps.inventory.models import StockItem
from apps.locations.models import City, Country, Warehouse
from apps.parties.models import Customer

pytestmark = pytest.mark.django_db

STOCK = "/api/inventory/stock"
SHOP = "/api/orders/shop"


@pytest.fixture
def world(db, make_user):
    tz = Country.objects.get(iso2="TZ")
    dar = City.objects.get(name="Dar es Salaam", country=tz)
    main = Warehouse.objects.create(name="Dar Central", type="fulfillment", country=tz, city=dar)
    shop = Warehouse.objects.create(name="Agiza Shop Dar", type="shop", country=tz, city=dar)
    cat = Category.objects.create(name="Electronics")
    product = Product.objects.create(name="Galaxy A54", sku="A54", category=cat, price=D("850000"),
                                     purchase_cost=D("700000"), status="active", location=main)
    variant = ProductVariant.objects.create(product=product, name="Default", sku="A54", is_default=True)
    admin = make_user(StaffLevel.TOP_ADMIN)
    inventory.receive(variant, main, 10, user=admin, bin_code="A-12-3")
    customer = Customer.objects.create(full_name="Grace Kimaro", phone="+255700000009", email="grace@example.com")
    return {"main": main, "shop": shop, "variant": variant, "customer": customer, "dar": dar, "product": product}


def order_payload(world, qty=2, **extra):
    return {"customer": world["customer"].id, "items": [{"variant": world["variant"].id, "quantity": qty}],
            "shipping_address": "Peninsula Apartments, Flat 3B", "city": world["dar"].id, "area": "Masaki",
            "delivery_fee": "10000", **extra}


def test_stock_ledger_receive_adjust_transfer(ops, world):
    item = StockItem.objects.get(variant=world["variant"], warehouse=world["main"])
    res = ops.post(f"{STOCK}/{item.id}/adjust/", {"new_quantity": 8, "reason": ""}, format="json")
    assert res.status_code == 400
    assert ops.post(f"{STOCK}/{item.id}/adjust/", {"new_quantity": 8, "reason": "Cycle count"},
                    format="json").json()["quantity"] == 8
    res = ops.post(f"{STOCK}/{item.id}/transfer/", {"to_warehouse": world["shop"].id, "quantity": 20}, format="json")
    assert res.status_code == 400
    shop_item = ops.post(f"{STOCK}/{item.id}/transfer/", {"to_warehouse": world["shop"].id, "quantity": 3,
                                                          "bin_code": "Electronics Wall — Bay 3"}, format="json").json()
    assert shop_item["quantity"] == 3 and shop_item["status"] == "listed" and shop_item["price"] == "850000.00"
    kinds = [m["kind"] for m in ops.get(f"{STOCK}/{item.id}/movements/").json()]
    assert kinds == ["transfer_out", "adjustment", "receipt"]
    assert ops.get(f"{STOCK}/?floor=shop").json()["count"] == 1
    assert ops.get(f"{STOCK}/?floor=warehouse&status=in_stock").json()["count"] == 1
    hidden = ops.patch(f"{STOCK}/{shop_item['id']}/", {"listed": False, "shop_price": "820000"}, format="json").json()
    assert hidden["status"] == "hidden" and hidden["price"] == "820000.00"
    received = ops.post(f"{STOCK}/receive/", {"variant": world["variant"].id, "warehouse": world["main"].id,
                                              "quantity": 2}, format="json").json()
    assert received["quantity"] == 7
    stats = ops.get(f"{STOCK}/stats/").json()
    assert stats["total_skus"] == 1 and stats["shop_items"] == 1


def test_shop_order_reserves_ships_and_delivers(ops, world, client_for):
    res = ops.post(f"{SHOP}/", order_payload(world, qty=11), format="json")
    assert res.status_code == 400 and "Not enough stock" in res.json()["error"]["message"]
    res = ops.post(f"{SHOP}/", order_payload(world), format="json")
    assert res.status_code == 201, res.json()
    order = res.json()
    assert order["reference"].startswith("ECO-") and order["status"] == "pending"
    assert order["total_amount"] == "1710000.00" and order["details"]["subtotal"] == "1700000.00"
    assert order["items"][0]["unit_price"] == "850000.00" and order["payment_status"] == "pending"
    item = StockItem.objects.get(variant=world["variant"], warehouse=world["main"])
    assert (item.quantity, item.reserved) == (10, 2)
    # Shipping needs processing first; processing is a normal status change.
    assert ops.post(f"{SHOP}/{order['id']}/ship/", {}, format="json").status_code == 409
    ops.post(f"{SHOP}/{order['id']}/transition/", {"status": "processing"}, format="json")
    driver = client_for(StaffLevel.DRIVER).user
    body = ops.post(f"{SHOP}/{order['id']}/ship/", {"driver": driver.id}, format="json").json()
    assert body["status"] == "shipped" and body["delivery"]["status"] == "assigned_driver"
    item.refresh_from_db()
    assert (item.quantity, item.reserved) == (8, 0)
    delivery_id = body["delivery"]["id"]
    ops.post(f"/api/deliveries/{delivery_id}/transition/", {"status": "out_for_delivery"}, format="json")
    ops.post(f"/api/deliveries/{delivery_id}/complete/", {"signature_name": "Grace Kimaro"})
    assert ops.get(f"{SHOP}/{order['id']}/").json()["status"] == "delivered"
    stats = ops.get(f"{SHOP}/stats/").json()
    assert stats["delivered"] == 1 and stats["revenue"] == "1710000.00"
    delivery = ops.get(f"/api/deliveries/{delivery_id}/").json()
    assert delivery["source"] == "shop" and delivery["destination_area"] == "Masaki"


def test_shop_order_cancel_releases_stock_and_rules(ops, world, client_for):
    order = ops.post(f"{SHOP}/", order_payload(world, qty=3), format="json").json()
    item = StockItem.objects.get(variant=world["variant"], warehouse=world["main"])
    assert item.reserved == 3
    assert ops.post(f"{SHOP}/{order['id']}/transition/", {"status": "cancelled"}, format="json").status_code == 400
    sales = client_for(StaffLevel.SALES)  # orders: edit, not manage
    assert sales.post(f"{SHOP}/{order['id']}/cancel/", {"reason": "x"}, format="json").status_code == 403
    assert ops.post(f"{SHOP}/{order['id']}/cancel/", {"reason": " "}, format="json").status_code == 400
    body = ops.post(f"{SHOP}/{order['id']}/cancel/", {"reason": "Customer changed mind"}, format="json").json()
    assert body["status"] == "cancelled"
    item.refresh_from_db()
    assert item.reserved == 0 and item.quantity == 10
    # Inactive products can't be ordered; duplicates are refused.
    Product.objects.filter(pk=world["product"].pk).update(status="hidden")
    assert ops.post(f"{SHOP}/", order_payload(world), format="json").status_code == 400
    Product.objects.filter(pk=world["product"].pk).update(status="active")
    dup = order_payload(world)
    dup["items"] = dup["items"] * 2
    assert ops.post(f"{SHOP}/", dup, format="json").status_code == 400
    assert ops.patch(f"{SHOP}/{order['id']}/", {"notes": "Refund pending"}, format="json").status_code == 200
    assert ops.patch(f"{SHOP}/{order['id']}/", {"total_amount": "1"}, format="json").status_code == 400
    assert ops.get(f"{SHOP}/?search=A54").json()["count"] == 1
