from decimal import Decimal as D

from apps.catalog.models import Category, Product

APP = "/api/app"


def _names(client) -> set[str]:
    return {p["name"] for p in client.get(f"{APP}/products/", {"for_you": "1"}).json()["results"]}


def test_home_shows_products_from_the_interests_staff_set(app, other_app, shop, client_for, api):
    phones = shop.product.category
    laptops = Category.objects.create(name="Computers")
    gaming = Category.objects.create(name="Gaming laptops", parent=laptops)
    Product.objects.create(name="ROG Strix", sku="ROG", category=laptops, subcategory=gaming, price=D("3000000"),
                           status="active", location=shop.warehouse)
    Product.objects.create(name="Office PC", sku="OPC", category=laptops, price=D("900000"), status="active",
                           location=shop.warehouse)
    everything = {"ROG Strix", "Office PC", "Galaxy A54", "USB-C Cable"}
    assert _names(app) == everything  # nothing known about them yet: best sellers across the shop

    staff = client_for("admin_l2")
    url = f"/api/customers/{app.account.customer_id}/interests/"
    res = staff.post(url, {"category": gaming.pk}, format="json")
    assert res.status_code == 201, res.json()
    assert res.json()[0]["category_name"] == "Computers › Gaming laptops" and res.json()[0]["source"] == "manual"
    assert staff.post(url, {}, format="json").status_code == 400  # needs a category or a label
    assert _names(app) == {"ROG Strix"}  # a subcategory interest doesn't pull in the whole category

    staff.post(url, {"category": phones.pk}, format="json")
    assert _names(app) == {"ROG Strix", "Galaxy A54", "USB-C Cable"}  # drafts stay hidden
    assert _names(other_app) == everything  # another customer's interests are their own
    assert api.get(f"{APP}/products/", {"for_you": "1"}).json()["results"] == []  # guests get nothing


def test_without_interests_the_categories_they_bought_or_saved_are_used(app, shop):
    from apps.orders.models import Order, OrderItem
    from apps.storefront.models import WishlistItem

    laptops = Category.objects.create(name="Computers")
    pc = Product.objects.create(name="Office PC", sku="OPC", category=laptops, price=D("900000"), status="active",
                                location=shop.warehouse)
    WishlistItem.objects.create(customer=app.account.customer, product=pc)
    assert _names(app) == {"Office PC"}  # saved a computer: computers
    order = Order.objects.filter(customer=app.account.customer).first()
    if order is None:
        from apps.orders import services

        order = services.create_order("shop", customer=app.account.customer, item_details="Phone", details={},
                                      user=None)
    OrderItem.objects.create(order=order, variant=shop.variant, quantity=1, unit_price=D("1"), line_total=D("1"))
    assert _names(app) == {"Office PC", "Galaxy A54", "USB-C Cable"}  # bought a phone: phones too
