"""
Demo data for Commerce & Finance, from the Figma Make mock records:
E-commerce Platform (products, vendors, options, labels, brands, store
settings), Warehouse inventory and shop floor, E-commerce Shop Orders and
Finance (invoices, wallets, installment plans).

Stock, orders, payments and plans are created through the real services,
so every quantity has a ledger entry and every order a status history.
"""
from datetime import timedelta
from decimal import Decimal as D

from django.utils import timezone

from apps.accounts.models import User
from apps.catalog import services as catalog
from apps.catalog.models import (
    Brand,
    Category,
    DeliveryEstimateRoute,
    Label,
    OriginEstimate,
    Product,
    ProductImage,
    ProductOption,
    ProductOptionValue,
    ProductSpecification,
    ProductVariant,
    StoreSettings,
    Vendor,
)
from apps.core.seeding import Seeder, seeded_ids
from apps.deliveries import services as deliveries
from apps.deliveries.models import Delivery, DeliveryEvent, DeliveryPhoto, DeliveryProof
from apps.finance import services as finance
from apps.finance.models import Installment, InstallmentPlan, Invoice, InvoiceItem, Wallet, WalletTransaction
from apps.inventory import services as inventory
from apps.inventory.models import StockItem, StockMovement
from apps.locations.models import City, Country, Warehouse
from apps.orders import services as orders
from apps.orders import shop
from apps.orders.models import Order, OrderItem, OrderStatusHistory, Payment, ShopDetails
from apps.parties.models import Customer
from apps.quotes.models import QuoteRequest
from apps.shipping_engine.models import ShippingMethod, ShippingProfile

from .files import product_image, signature_png
from .operations import WAREHOUSES

SEED = "commerce"
FLUSH_ORDER = [
    WalletTransaction, Wallet, Installment, InstallmentPlan, InvoiceItem, Invoice, DeliveryPhoto, DeliveryProof,
    DeliveryEvent, Delivery, Payment, StockMovement, OrderItem, ShopDetails, OrderStatusHistory, Order, StockItem,
    ProductImage, ProductSpecification, ProductVariant, Product, ProductOptionValue, ProductOption, Label, Brand,
    Vendor, Category, DeliveryEstimateRoute, OriginEstimate, Customer, Warehouse,
]

CATEGORIES = {
    "Electronics": ["Smartphones", "Laptops", "Cameras", "Audio", "TVs", "Drones"],
    "Fashion": ["Shoes", "Clothing"],
    "Home & Garden": ["Kitchen Appliances"],
    "Home & Office": ["Furniture"],
}
BRANDS = [("Samsung", "South Korea", "active"), ("Nike", "USA", "active"), ("Apple", "USA", "active"),
          ("IKEA", "Sweden", "active"), ("Adidas", "Germany", "inactive"), ("Xiaomi", "China", "active"),
          ("Sony", "Japan", "active"), ("LG", "South Korea", "active"), ("Levi's", "USA", "active"),
          ("Canon", "Japan", "active"), ("DJI", "China", "active"), ("Philips", "Netherlands", "active")]
LABELS = [("New Arrival", "blue", True), ("Sale", "red", True), ("Best Seller", "yellow", True),
          ("Limited Edition", "purple", True), ("Flash Deal", "orange", False), ("Trending", "green", True)]
OPTIONS = [("Size", "size", ["XS", "S", "M", "L", "XL", "XXL"]), ("Color", "color", ["Black", "White", "Red", "Blue",
           "Green", "Yellow"]), ("Bundle", "bundle", ["Single", "2-Pack", "3-Pack", "5-Pack"]),
           ("Storage", "storage", ["64GB", "128GB", "256GB", "512GB"]),
           ("Material", "text", ["Cotton", "Polyester", "Leather", "Nylon"])]
VENDORS = [
    ("TechHub Electronics", "contact@techhub.co.tz", "+255 712 345 678", "Dar es Salaam", "active", "percent", "15",
     "all", "2024-01-15"),
    ("Fashion Forward", "sales@fashionforward.co.tz", "+255 754 987 654", "Arusha", "active", "fixed", "25000",
     "per_product", "2024-02-20"),
    ("Home Essentials Ltd", "info@homeessentials.co.tz", "+255 765 432 109", "Mwanza", "active", "percent", "20", "all",
     "2023-11-10"),
    ("Sports Zone", "team@sportszone.co.tz", "+255 743 210 987", "Dodoma", "active", "fixed", "30000", "all",
     "2024-03-05"),
    ("Smart Gadgets", "hello@smartgadgets.co.tz", "+255 789 654 321", "Dar es Salaam", "inactive", "percent", "12",
     "per_product", "2023-09-18"),
    ("Mama Saida Shop", "mamasaida@shop.tz", "+255 788 333 444", "Dar es Salaam", "active", "percent", "10", "all",
     "2025-06-10"),
]
VENDOR_RATINGS = {"TechHub Electronics": "4.7", "Fashion Forward": "4.5", "Home Essentials Ltd": "4.4",
                  "Sports Zone": "4.2", "Mama Saida Shop": "4.6"}
# sku, name, category, sub, brand, price, cost, status, origin, profile, vendor, weight, description,
# specs, labels, colour, stock [(warehouse, bin, qty)]
PRODUCTS = [
    ("ELEC-SAM-A54", "Samsung Galaxy A54 5G", "Electronics", "Smartphones", "Samsung", "850000", "690000", "active",
     "AE", "Electronics", "TechHub Electronics", "0.35", '6.4" Super AMOLED Display, 128GB Storage, 8GB RAM',
     {"Color": "Awesome Violet", "Storage": "128GB", "RAM": "8GB", "Display": '6.4" Super AMOLED'},
     ["New Arrival", "Best Seller"], (124, 58, 237), [("Dar es Salaam Central Warehouse", "A-12-3", 15)]),
    ("FASH-NIKE-AM270", "Nike Air Max 270", "Fashion", "Shoes", "Nike", "180000", "120000", "active", "US", None,
     "Fashion Forward", "0.9", "Men's Running Shoes - Black/White",
     {"Color": "Black/White", "Size": "42", "Material": "Mesh Upper", "Type": "Running Shoes"}, ["Trending"],
     (31, 41, 55), [("Dar es Salaam Central Warehouse", "C-08-2", 8)]),
    ("ELEC-APPLE-MBA-M2", "MacBook Air M2", "Electronics", "Laptops", "Apple", "2500000", "2050000", "active", "CN",
     "Laptops", "TechHub Electronics", "1.24", '13.6" Liquid Retina, 256GB SSD, 8GB RAM',
     {"Color": "Space Gray", "Storage": "256GB SSD", "RAM": "8GB", "Processor": "Apple M2"}, ["Limited Edition"],
     (148, 163, 184), [("Dar es Salaam Central Warehouse", "A-05-1", 3)]),
    ("ELEC-SONY-WH1000XM5", "Sony WH-1000XM5 Headphones", "Electronics", "Audio", "Sony", "650000", "480000",
     "active", "AE", "Electronics", "TechHub Electronics", "0.25", "Wireless Noise Cancelling Headphones",
     {"Color": "Black", "Connectivity": "Bluetooth 5.2", "Battery": "30 hours"}, ["Sale"], (17, 24, 39),
     [("Dar es Salaam Central Warehouse", "A-14-2", 12)]),
    ("FASH-ADID-UB22", "Adidas Ultraboost 22", "Fashion", "Shoes", "Adidas", "220000", "150000", "inactive", "US",
     None, "Sports Zone", "0.8", "Running Shoes - White/Blue", {"Color": "White/Blue", "Size": "43"}, [],
     (59, 130, 246), []),
    ("ELEC-LG-55UK", 'LG 55" 4K Smart TV', "Electronics", "TVs", "LG", "1200000", "950000", "active", "CN",
     "Fragile Items", "Home Essentials Ltd", "14.5", '55" 4K UHD Smart TV with WebOS',
     {"Screen Size": '55"', "Resolution": "4K UHD", "HDR": "HDR10"}, [], (30, 41, 59),
     [("Mwanza Lakeside Center", "TV-01-1", 5)]),
    ("FASH-LEVI-501", "Levi's 501 Original Jeans", "Fashion", "Clothing", "Levi's", "95000", "60000", "active", "US",
     None, "Fashion Forward", "0.6", "Classic Fit Jeans - Blue Denim",
     {"Fit": "Classic Straight", "Material": "100% Cotton"}, ["Best Seller"], (37, 99, 235), None),
    ("ELEC-CANON-R6", "Canon EOS R6 Camera", "Electronics", "Cameras", "Canon", "4500000", "3700000", "active", "CN",
     "Cameras", "TechHub Electronics", "0.68", "Full-Frame Mirrorless Camera Body",
     {"Sensor": "Full-Frame 20.1MP", "Video": "4K 60fps", "Stabilization": "5-axis IBIS"}, [], (55, 65, 81),
     [("Dar es Salaam Central Warehouse", "A-02-4", 2)]),
    # Inventory design extras
    ("ELEC-DJI-MINI4", "DJI Mini 4 Pro Drone", "Electronics", "Drones", "DJI", "2100000", "1650000", "active", "CN",
     "Drone — Special Air Cargo", "TechHub Electronics", "0.25", "Mini drone with 4K HDR camera",
     {"Weight": "249g", "Camera": "4K/60fps HDR"}, ["New Arrival"], (100, 116, 139),
     [("Guangzhou Consolidation Hub", "DR-01-4", 6)]),
    ("HOME-AIRFRY-XL", "Air Fryer XL 5.5L", "Home & Garden", "Kitchen Appliances", "Philips", "320000", "210000",
     "active", "CN", None, "Home Essentials Ltd", "4.2", "5.5L digital air fryer", {"Capacity": "5.5L",
     "Power": "1700W"}, ["Flash Deal"], (15, 23, 42), [("Mwanza Lakeside Center", "B-03-1", 4)]),
    ("ELEC-SAM-TV65", 'Samsung 65" QLED TV', "Electronics", "TVs", "Samsung", "3800000", "3100000", "active", "AE",
     "Fragile Items", "TechHub Electronics", "22", '65" QLED 4K Smart TV', {"Screen Size": '65"'}, [],
     (15, 23, 42), [("Dubai Jebel Ali Center", "TV-02-2", 2)]),
    ("HOME-CHAIR-ERG", "Ergonomic Office Chair", "Home & Office", "Furniture", "IKEA", "550000", "380000", "active",
     "CN", "Oversized", "Home Essentials Ltd", "15", "Adjustable ergonomic chair with lumbar support",
     {"Material": "Mesh"}, [], (71, 85, 105), [("Dar es Salaam Central Warehouse", "D-11-5", 1)]),
    ("ELEC-IPHONE-15PM", "iPhone 15 Pro Max 256GB", "Electronics", "Smartphones", "Apple", "4200000", "3600000",
     "active", "AE", "Electronics", "TechHub Electronics", "0.22", "6.7\" Super Retina XDR, 256GB",
     {"Storage": "256GB"}, ["Trending"], (68, 64, 60), [("Arusha Pickup Point", "P-01-2", 2)]),
]
# (warehouse design id → name) shop floor: sku, shop, shelf, qty, price, listed
SHOP_FLOOR = [
    ("ELEC-SAM-A54", "Agiza Shop — Dar es Salaam", "Electronics Wall — Bay 3", 5, "850000", True),
    ("FASH-NIKE-AM270", "Agiza Shop — Dar es Salaam", "Footwear Rack — Row 2", 3, "180000", True),
    ("HOME-AIRFRY-XL", "Agiza Shop — Mwanza", "Kitchen Appliances — Bay 1", 2, "320000", True),
    ("ELEC-APPLE-MBA-M2", "Agiza Shop — Dar es Salaam", "Laptops — Display Cabinet", 0, "2500000", True),
    ("HOME-CHAIR-ERG", "Agiza Shop — Dar es Salaam", "Office Section — Floor Display", 1, "550000", False),
]
# customer, email, phone, items [(sku, qty)], status, paid, address, area, city
SHOP_ORDERS = [
    ("Fatuma Hassan", "fatuma@email.com", "+255712000101", [("ELEC-SAM-A54", 1), ("ELEC-SONY-WH1000XM5", 1)],
     "processing", True, "Mikocheni, Sam Nujoma Road", "Mikocheni", "Dar es Salaam"),
    ("John Mwamba", "john.mwamba@email.com", "+255712000102", [("FASH-NIKE-AM270", 2)], "shipped", True,
     "Njiro Road, House 14", "Njiro", "Arusha"),
    ("Grace Kimaro", "grace.k@email.com", "+255712000103", [("ELEC-APPLE-MBA-M2", 1)], "pending", False,
     "Peninsula Apartments, Flat 3B", "Masaki", "Dar es Salaam"),
    ("Ahmed Salim", "ahmed.s@email.com", "+255712000104", [("ELEC-LG-55UK", 1), ("ELEC-SONY-WH1000XM5", 1)],
     "delivered", True, "Mwanza Industrial Estate, Unit 8", "Isamilo", "Mwanza"),
    ("Neema Mkwawa", "neema.m@email.com", "+255712000105", [("FASH-LEVI-501-32", 3)], "processing", True,
     "Central Market Area, Shop 67", "Msasani", "Dodoma"),
    ("David Lyimo", "david.l@email.com", "+255712000106", [("ELEC-CANON-R6", 1)], "pending", True,
     "Kinondoni Road, Near Police Station", "Kinondoni", "Dar es Salaam"),
    ("Tech Hub Arusha", "orders@techhub-arusha.co.tz", "+255713100206", [("ELEC-DJI-MINI4", 6)], "pending", False,
     "Arusha Business Center, Plot 123", "Njiro", "Arusha"),
]
ESTIMATE_ROUTES = [("Arusha", 2, 3), ("Mwanza", 4, 6)]
ORIGIN_RULES = [("CN", 7, 12, 35, 45), ("US", 10, 14, 45, 60), ("AE", 4, 7, 20, 30), ("IN", 5, 8, 25, 35),
                ("GB", 10, 14, 45, 60)]


def _city(name):
    return City.objects.get(name=name, country__iso2="TZ")


def seed(stdout=None) -> Seeder:
    s = Seeder(SEED, stdout)
    actor = User.objects.filter(is_superuser=True).order_by("id").first()
    today = timezone.localdate()

    def track(obj):
        if obj is not None:
            s.register(obj)
        return obj

    # ---- Locations ---------------------------------------------------------
    warehouses = {}
    for name, wtype, iso, city, address, contact, phone, email, capacity, wstatus in WAREHOUSES:
        warehouses[name], _ = s.get_or_create(Warehouse, name=name, defaults={
            "type": wtype, "country": Country.objects.get(iso2=iso),
            "city": City.objects.get(name=city, country__iso2=iso), "address": address, "contact_person": contact,
            "phone": phone, "email": email, "capacity_percent": capacity, "status": wstatus,
            "last_audit_at": today - timedelta(days=12)})

    # ---- Store settings & delivery estimates -------------------------------
    settings = StoreSettings.load()
    if settings.location_id is None:
        settings.location = _city("Dar es Salaam")
        settings.description = "Your trusted online marketplace in Tanzania for electronics, fashion, and more."
        settings.save()
    for city, low, high in ESTIMATE_ROUTES:
        s.get_or_create(DeliveryEstimateRoute, from_city=_city("Dar es Salaam"), to_city=_city(city),
                        defaults={"min_days": low, "max_days": high})
    for iso, air_lo, air_hi, sea_lo, sea_hi in ORIGIN_RULES:
        country = Country.objects.get(iso2=iso)
        s.get_or_create(OriginEstimate, country=country, method="air", defaults={"min_days": air_lo, "max_days": air_hi})
        s.get_or_create(OriginEstimate, country=country, method="sea", defaults={"min_days": sea_lo, "max_days": sea_hi})

    # ---- Catalogue reference data ------------------------------------------
    categories = {}
    for top, subs in CATEGORIES.items():
        parent, _ = s.get_or_create(Category, name=top, parent=None)
        categories[top] = parent
        for sub in subs:
            categories[(top, sub)], _ = s.get_or_create(Category, name=sub, parent=parent)
    brands = {n: s.get_or_create(Brand, name=n, defaults={"country": c, "status": st})[0] for n, c, st in BRANDS}
    labels = {n: s.get_or_create(Label, name=n, defaults={"color": c, "visible": v})[0] for n, c, v in LABELS}
    options = {}
    for name, otype, values in OPTIONS:
        opt, created = s.get_or_create(ProductOption, name=name, defaults={"type": otype})
        if created:
            for i, v in enumerate(values):
                ProductOptionValue.objects.create(option=opt, value=v, sort_order=i)
        options[name] = opt
    vendors = {}
    for name, email, phone, loc, st, ptype, pval, scope, joined in VENDORS:
        vendors[name], _ = s.get_or_create(Vendor, name=name, defaults={
            "email": email, "phone": phone, "location": loc, "status": st, "profit_type": ptype,
            "profit_value": D(pval), "profit_scope": scope, "joined_date": joined, "verified": st == "active",
            "rating": D(VENDOR_RATINGS[name]) if name in VENDOR_RATINGS else None})

    # ---- Products (through the product editor service) ---------------------
    air = ShippingMethod.objects.filter(code="AIR").first()
    local = list(ShippingMethod.objects.filter(code__in=["RIDER", "PICKUP", "BUS"]))
    for i, (sku, name, cat, sub, brand, price, cost, status, origin, profile, vendor, weight, desc, specs,
            label_names, colour, stock) in enumerate(PRODUCTS, start=1):
        if Product.objects.filter(sku=sku).exists():
            s.existing += 1
            continue
        location = warehouses[stock[0][0]] if stock else warehouses["Dar es Salaam Central Warehouse"]
        data = {
            "name": name, "sku": sku, "category": categories[cat], "subcategory": categories[(cat, sub)],
            "brand": brands[brand], "status": status, "price": D(price), "purchase_cost": D(cost),
            "compare_at_price": (D(price) * D("1.12")).quantize(D("1000")), "origin_country":
            Country.objects.get(iso2=origin), "location": location, "bin_code": stock[0][1] if stock else "",
            "shipping_profile": ShippingProfile.objects.filter(name=profile).first() if profile else None,
            "weight_kg": D(weight), "length_cm": D("30"), "width_cm": D("20"), "height_cm": D("10"),
            "shipping_methods": [m for m in (air, *local) if m], "vendor": vendors[vendor], "description": desc,
            "specifications": [{"name": k, "value": v} for k, v in specs.items()],
            "labels": [labels[n] for n in label_names], "featured": "Best Seller" in label_names,
            "keywords": ", ".join(name.lower().split()[:4]),
        }
        if stock is None:  # variations by size
            size = {v.value: v for v in options["Size"].values.all()}
            data |= {"has_variations": True, "variation_options": [options["Size"]], "variants": [
                {"name": f"Size {w}", "sku": f"{sku}-{w}", "option_values": [size[s_]], "stock": qty}
                for w, s_, qty in (("30", "S", 6), ("32", "M", 10), ("34", "L", 9))]}
        product = track(catalog.save_product(data, user=actor))
        for img_i in range(2 if i <= 4 else 1):
            track(ProductImage.objects.create(product=product, file=product_image(i * 10 + img_i, colour),
                                              content_type="image/png", is_primary=img_i == 0, sort_order=img_i,
                                              uploaded_by=actor))
        variant = product.variants.filter(is_default=True).first()
        for wh_name, bin_code, qty in (stock or []):
            if wh_name == location.name:
                inventory.receive(variant, location, qty, user=actor, bin_code=bin_code, note="Opening stock")
            else:  # pragma: no cover - every product lists its main location first
                inventory.receive(variant, warehouses[wh_name], qty, user=actor, bin_code=bin_code)
    for row in Product.objects.filter(pk__in=seeded_ids(SEED, Product)):
        for model_rows in (row.variants.all(), row.specifications.all()):
            for obj in model_rows:
                track(obj)
    for item in StockItem.objects.filter(variant__product_id__in=seeded_ids(SEED, Product)):
        track(item)

    # ---- Shop floor (transfers from the warehouse to the shops) ------------
    for sku, shop_name, shelf, qty, price, listed in SHOP_FLOOR:
        variant = ProductVariant.objects.filter(sku=sku).first()
        shop_wh = warehouses[shop_name]
        if variant is None or StockItem.objects.filter(variant=variant, warehouse=shop_wh).exists():
            continue
        source = variant.product.location
        source_item = StockItem.objects.filter(variant=variant, warehouse=source).first()
        if qty and source_item:
            inventory.receive(variant, source, qty, user=actor, note="Stock for the shop floor")
            item = inventory.transfer(StockItem.objects.get(pk=source_item.pk), shop_wh, qty, user=actor,
                                      bin_code=shelf)
        else:
            item = inventory.stock_for(variant, shop_wh, bin_code=shelf)
        StockItem.objects.filter(pk=item.pk).update(listed=listed, shop_price=D(price), bin_code=shelf)
        track(item)

    # ---- E-commerce shop orders --------------------------------------------
    drivers = list(User.objects.filter(staff_level="driver", is_active=True).order_by("id"))
    for cust, email, phone, items, target, paid, address, area, city in SHOP_ORDERS:
        customer = Customer.objects.filter(full_name=cust).first() or track(
            Customer.objects.create(full_name=cust, phone=phone, email=email))
        if Order.objects.filter(order_type="shop", customer=customer).exists():
            s.existing += 1
            continue
        order = track(shop.create_shop_order(
            customer=customer, items=[{"variant": ProductVariant.objects.get(sku=sku), "quantity": q}
                                      for sku, q in items],
            shipping_address=address, area=area, city=_city(city), customer_email=email, user=actor,
            channel="web", delivery_fee=D("10000")))
        s.created += 1
        if paid:
            track(orders.record_payment(order, amount=order.total_amount, method="mobile_money", user=actor,
                                        reference=f"MPESA-{order.reference}"))
        if target == "pending":
            continue
        orders.transition(order, "processing", actor, "Payment confirmed — preparing the order")
        if target == "processing":
            continue
        driver = drivers[len(order.reference) % len(drivers)] if drivers else None
        shop.ship(Order.objects.get(pk=order.pk), user=actor, driver=driver)
        delivery = Delivery.objects.get(order=order)
        track(delivery)
        if target == "shipped":
            continue
        deliveries.transition(delivery, "out_for_delivery", user=driver or actor)
        deliveries.complete(Delivery.objects.get(pk=delivery.pk), user=driver or actor, signature_name=cust,
                            signature_image=signature_png(order.id), signature_content_type="image/png",
                            notes="Delivered to the customer")
    for model in (DeliveryProof, DeliveryPhoto):
        for row in model.objects.filter(delivery__order__order_type="shop"):
            track(row)

    # ---- Finance: invoices, wallets, installment plans ---------------------
    if not Invoice.objects.filter(pk__in=seeded_ids(SEED, Invoice)).exists():
        quote = QuoteRequest.objects.filter(quoted_amount__isnull=False, description__startswith="Bulk order").first()
        if quote:
            inv = track(finance.create_invoice(source="quote", quote=quote, user=actor, due_date=today + timedelta(15)))
            finance.send_invoice(inv, user=actor)
        eco = Order.objects.filter(order_type="shop", status="processing").first()
        if eco:
            track(finance.create_invoice(source="order", order=eco, user=actor))
        fatuma = Customer.objects.filter(full_name="Fatuma Hassan").first()
        if fatuma:
            track(finance.create_invoice(source="manual", customer=fatuma, user=actor, tax_rate=D("18"),
                                         due_date=today + timedelta(30), notes="Consolidation handling",
                                         items=[{"description": "Customs documentation support", "quantity": 1,
                                                 "unit_price": D("150000")}]))
    for name, amount in (("Fatuma Hassan", "150000"), ("Ahmed Salim", "75000")):
        customer = Customer.objects.filter(full_name=name).first()
        if customer and not Wallet.objects.filter(customer=customer).exists():
            finance.top_up(customer, amount=D(amount), user=actor, method="mobile_money",
                           reference=f"MP-{customer.reference}", note="Deposit for upcoming orders")
            wallet = Wallet.objects.get(customer=customer)
            track(wallet)
            for tx in wallet.transactions.all():
                track(tx)
    # Plans for the two orders on installments: approved already (Ahmed) / waiting for Finance (Emmanuel).
    for items in ("Machinery Parts - Industrial Equipment", "Medical Equipment - Diagnostic Devices"):
        order = Order.objects.filter(item_details=items).first()
        if order is None or InstallmentPlan.objects.filter(order=order).exists():
            continue
        plan = finance.create_plan(order, number_of_installments=3, first_due_date=today + timedelta(days=14),
                                   user=actor, notes="Agreed with the customer")
        track(plan)
        for inst in plan.installments.all():
            track(inst)
    for inv in Invoice.objects.filter(pk__in=seeded_ids(SEED, Invoice)):
        for item in inv.items.all():
            track(item)
    # Every stock row and ledger entry of the demo products is demo data too.
    for item in StockItem.objects.filter(variant__product_id__in=seeded_ids(SEED, Product)):
        track(item)
        for movement in item.movements.all():
            track(movement)
    return s
