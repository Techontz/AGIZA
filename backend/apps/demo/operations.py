"""
Demo data for the Operations modules (Procurement, Shipping & Tracking,
Deliveries, Returns, Tasks), based on the Figma Make mock records.

Everything moves through the real workflow services: the design's
international orders (from the "orders" set) reach their statuses by
procurement, cargo receipt and shipment milestones; extra orders fill the
Shipping, Deliveries and Returns screens. Files (signatures, delivery photos,
shipment documents) are real generated images and PDFs.
"""
from datetime import timedelta
from decimal import Decimal as D

from django.utils import timezone

from apps.accounts.constants import Department as StaffDept
from apps.accounts.constants import StaffLevel
from apps.accounts.models import User
from apps.core.seeding import Seeder, seeded_ids
from apps.deliveries import services as deliveries
from apps.deliveries.models import Delivery, DeliveryEvent, DeliveryPhoto, DeliveryProof
from apps.locations.models import City, Country, Warehouse
from apps.orders import services as orders
from apps.orders.demo import INTERNATIONAL
from apps.orders.models import (
    EquipmentDetails,
    ExpressDetails,
    InternationalDetails,
    Order,
    OrderStatusHistory,
    Payment,
)
from apps.quotes.models import QuoteRequest, QuoteStatusHistory
from apps.parties.models import Address, Customer
from apps.procurement import services as procurement
from apps.procurement.models import ProcurementOrder, ProcurementStatusHistory, Supplier
from apps.returns import services as returns
from apps.returns.models import ReturnRequest, ReturnStatusHistory
from apps.shipping import services as shipping
from apps.shipping.models import CargoParcel, Shipment, ShipmentDocument, ShipmentEvent
from apps.shipping_engine.models import Carrier, ShippingMethod
from apps.tasks import services as tasks
from apps.tasks.models import Task, TaskActivity

from .files import parcel_photo, pdf_file, signature_png

SEED = "operations"
# This set moves the "orders" set's demo orders along, so both are removed
# together, in one dependency-safe order covering the rows of both.
FLUSH_WITH = ["orders"]
FLUSH_ORDER = [
    TaskActivity, Task, ReturnStatusHistory, ReturnRequest, QuoteStatusHistory, Payment, DeliveryPhoto,
    DeliveryProof, DeliveryEvent, Delivery, ShipmentDocument, ShipmentEvent, CargoParcel, Shipment,
    ProcurementStatusHistory, ProcurementOrder, OrderStatusHistory, ExpressDetails, InternationalDetails,
    EquipmentDetails, Order, QuoteRequest, Address, Customer, Supplier, Warehouse, Carrier, ShippingMethod, User,
]

STAFF = [
    ("Ahmed Msemo", StaffLevel.DATA_ENTRY, StaffDept.WAREHOUSE),
    ("Peter Kimani", StaffLevel.DATA_ENTRY, StaffDept.WAREHOUSE),
    ("Sarah Juma", StaffLevel.SALES, StaffDept.SUPPORT),
    ("Mary Komba", StaffLevel.SALES, StaffDept.SUPPORT),
    ("John Maleko", StaffLevel.DRIVER, StaffDept.DELIVERY),
    ("David Mwita", StaffLevel.DRIVER, StaffDept.DELIVERY),
    ("Juma Kamara", StaffLevel.DRIVER, StaffDept.DELIVERY),
]

# name, country iso2, contact
SUPPLIERS = [
    ("Shenzhen Tech Co.", "CN", "Li Wei"), ("Guangzhou Building Supplies", "CN", "Zhang Min"),
    ("Yiwu Commodities Trading", "CN", "Wang Fang"), ("Dubai Fashion Hub", "AE", "Omar Khalid"),
    ("Dubai Beauty Trading", "AE", "Fatima Noor"), ("US Home Solutions", "US", "Mike Brown"),
    ("MedTech USA Inc.", "US", "Karen White"), ("UK Industrial Ltd", "GB", "James Taylor"),
    ("Mumbai Textiles Export", "IN", "Priya Shah"),
]

# The design's shippers (Shipping & Tracking filter list; People → Shippers):
# name, type, origins, services, rating, email
SHIPPERS = [
    ("Silent Ocean", "international_sea", ["CN", "US", "GB"], ["sea_cargo"], "4.8", "ops@silentocean.co.tz"),
    ("Umoja Cargo", "international_sea", ["US", "GB", "AE"], ["air_cargo", "sea_cargo"], "4.6", "contact@umojacargo.tz"),
    ("Inland Strategy", "international_air", ["GB", "TZ"], ["local_land_cargo", "air_cargo"], "4.7",
     "ops@inlandstrategy.co.tz"),
    ("Abdulraheem Dubai", "international_air", ["AE"], ["air_cargo"], "4.9", "info@abdulraheemdubai.ae"),
    ("Swala Dubai", "international_air", ["AE"], ["air_cargo"], "4.5", "cargo@swaladubai.ae"),
    ("Wakina Bady Dubai", "international_sea", ["AE"], ["sea_cargo"], "4.3", "info@wakinabady.ae"),
    ("KTM India Cargo", "international_sea", ["IN"], ["sea_cargo", "air_cargo"], "4.4", "ops@ktmcargo.in"),
    ("Freedom Yiwu ZNZ Cargo", "international_sea", ["CN"], ["sea_cargo"], "4.6", "yiwu@freedomcargo.co.tz"),
]
# Consolidation hubs each shipper is linked to (People → Shipper → Consolidation Warehouses)
SHIPPER_HUBS = {"Silent Ocean": ["CN", "IN"], "Umoja Cargo": ["GB", "US"], "Abdulraheem Dubai": ["AE"],
                "Swala Dubai": ["AE"], "KTM India Cargo": ["IN"], "Freedom Yiwu ZNZ Cargo": ["CN"]}

# Warehouse & Pick Up Points design: name, type, country, city, address, contact, phone, email, capacity, status
WAREHOUSES = [
    ("Guangzhou Consolidation Hub", "consolidation", "CN", "Guangzhou", "No. 123 Baiyun District, Guangzhou, Guangdong",
     "Chen Wei", "+86 20 1234 5678", "gz-hub@agiza.co.tz", 85, "active"),
    ("Dubai Jebel Ali Center", "consolidation", "AE", "Dubai", "Jebel Ali Free Zone, South 1, Dubai", "Ahmed Hassan",
     "+971 4 881 1234", "dxb-hub@agiza.co.tz", 60, "active"),
    ("Mumbai Export Hub", "consolidation", "IN", "Mumbai", "Andheri East, Mumbai, Maharashtra", "Rajesh Kumar",
     "+91 22 9876 5432", "mum-hub@agiza.co.tz", 45, "active"),
    ("London Gateway Center", "consolidation", "GB", "London", "Stanford-le-Hope, London", "Sarah Jones",
     "+44 20 7946 0000", "uk-hub@agiza.co.tz", 30, "active"),
    ("New Jersey East Coast Hub", "consolidation", "US", "Newark", "Elizabeth, NJ 07201, USA", "John Smith",
     "+1 201 555 0123", "nj-hub@agiza.co.tz", 75, "active"),
    ("Dar es Salaam Central Warehouse", "fulfillment", "TZ", "Dar es Salaam", "Plot 45, Nyerere Road, Vingunguti",
     "Juma Ramadhani", "+255 712 000 111", "dar-main@agiza.co.tz", 92, "full"),
    ("Arusha Pickup Point", "pickup_point", "TZ", "Arusha", "Sokoine Road, Opposite Clock Tower", "Mary Mollel",
     "+255 754 222 333", "arusha-pick@agiza.co.tz", 20, "active"),
    ("Mwanza Lakeside Center", "fulfillment", "TZ", "Mwanza", "Kenyatta Road, Ilemela District", "Peter Kamau",
     "+255 788 444 555", "mwanza-hub@agiza.co.tz", 55, "active"),
    ("Agiza Shop — Dar es Salaam", "shop", "TZ", "Dar es Salaam", "Kariakoo Market Complex, Ground Floor",
     "Amina Suleiman", "+255 765 000 222", "shop-dar@agiza.co.tz", 40, "active"),
    ("Agiza Shop — Mwanza", "shop", "TZ", "Mwanza", "Pamba Road, Mwanza City Centre", "Grace Shimba",
     "+255 765 000 333", "shop-mwanza@agiza.co.tz", 25, "active"),
]
HUB = {"CN": "Guangzhou Consolidation Hub", "AE": "Dubai Jebel Ali Center", "IN": "Mumbai Export Hub",
       "GB": "London Gateway Center", "US": "New Jersey East Coast Hub"}

# How the design's international orders (orders demo set) got where they are:
# customer -> (supplier, shipper, method, weight, cbm, exception flag, supplier tracking)
DESIGN_INTL = {
    "Fatuma Hassan": ("Shenzhen Tech Co.", "Silent Ocean", "SEA", "150", "2.5", "", "SZ-20260115-8842"),
    "John Mwamba": (None, "Swala Dubai", "AIR", "420", "5.8", "", "DXB-TZ-2026-0845"),
    "Grace Kimaro": ("US Home Solutions", "Umoja Cargo", "SEA", "890", "12.4", "", "USHS-7842-2026"),
    "Ahmed Salim": ("UK Industrial Ltd", "Inland Strategy", "AIR", "", "", "", ""),
    "Neema Mkwawa": ("Mumbai Textiles Export", "KTM India Cargo", "SEA", "85", "1.8", "", "MTE-IN-5521"),
    "David Lyimo": (None, None, None, "", "", "payment_issue", ""),
    "Sarah Mtui": ("Dubai Beauty Trading", "Abdulraheem Dubai", "AIR", "45", "0.8", "", "DBT-2026-9921"),
    "Emmanuel Mollel": ("MedTech USA Inc.", None, None, "", "", "quality_concern", ""),
}

# Extra orders for the Shipping, Deliveries and Returns screens.
# key, customer, phone, items, origin, service, class, total, stage, shipper, method, weight, cbm, packages, extra
EXTRA = [
    # Waiting to Receive
    ("W1", "Rehema Said", "+255713100201", "Fashion Items - Assorted Clothing", "CN", "full_service", "bulk", "2400000",
     "waiting", "Silent Ocean", "SEA", "", "", 5, {"tracking": "CN-YW-2026-4521", "eta": 6,
     "description": "100 pieces of assorted fashion clothing including t-shirts, jeans, and dresses"}),
    ("W2", "Baraka Mrema", "+255713100202", "Electronics - Laptops", "AE", "deliver_for_me", "simple", "900000",
     "waiting", "Abdulraheem Dubai", "AIR", "", "", 2, {"tracking": "DXB-2026-8934", "eta": 4,
     "description": "10 laptops purchased by client from Dubai supplier"}),
    ("W3", "Kilimo Tools Ltd", "+255713100203", "Industrial Equipment - CNC Machine Parts", "US", "full_service",
     "machinery", "7400000", "waiting", "Umoja Cargo", "SEA", "", "", 8, {"tracking": "USA-SF-2026-1122", "eta": 9,
     "description": "Heavy machinery parts for industrial manufacturing"}),
    ("W4", "Afya Lab Services", "+255713100204", "Medical Equipment - Laboratory Glassware", "GB", "full_service",
     "fragile", "3100000", "waiting", "Inland Strategy", "AIR", "", "", 3, {"tracking": "UK-LON-2026-6633", "eta": 7,
     "description": "Fragile laboratory equipment including microscopes and test tubes"}),
    ("W5", "Zawadi Textiles", "+255713100205", "Textiles - Fabric Rolls", "IN", "deliver_for_me", "bulk", "650000",
     "waiting", "KTM India Cargo", "SEA", "", "", 12, {"tracking": "IN-MUM-2026-3344", "eta": 8,
     "description": "500 meters of assorted textile fabrics for clothing manufacturing"}),
    # Ready for Shipment
    ("R1", "Tech Hub Arusha", "+255713100206", "Electronics Accessories - Power Banks & Chargers", "CN", "full_service",
     "simple", "1900000", "ready", "Silent Ocean", "SEA", "150", "2.5", 6, {"cargo_type": "electronic_battery"}),
    ("R2", "Zanzibar Home Store", "+255713100207", "Bulk Kitchenware - Pots & Utensils", "CN", "full_service", "bulk",
     "1300000", "ready", "Freedom Yiwu ZNZ Cargo", "SEA", "85", "1.8", 4, {"city": "Zanzibar"}),
    ("R3", "Nuru Beauty", "+255713100208", "Perfume Collection (30 bottles)", "AE", "full_service", "fragile",
     "750000", "ready", "Abdulraheem Dubai", "AIR", "45", "0.8", 2, {"estimated": True, "cargo_type": "standard"}),
    ("R4", "Arusha Engineering", "+255713100209", "Machinery Spare Parts", "IN", "deliver_for_me", "machinery",
     "2200000", "ready", "KTM India Cargo", "SEA", "220", "3.2", 5, {"city": "Arusha", "unpaid": True}),
    # CN shipment on the way (with documents)
    ("S1", "Mwanga Solar", "+255713100210", "Solar Panels - 20x 450W", "CN", "full_service", "bulk", "9800000",
     "shipping", "Silent Ocean", "SEA", "500", "7.2", 20, {}),
    ("S2", "Ofisi Bora Ltd", "+255713100211", "Office Furniture Set", "CN", "full_service", "bulk", "6500000",
     "shipping", "Silent Ocean", "SEA", "750", "11.3", 14, {}),
    # Open CN shipment (booked) to demo "Add to Existing Shipment"
    ("S3", "Simu Plus", "+255713100212", "Phone Accessories - Cases & Screen Guards", "CN", "full_service", "simple",
     "850000", "booked", "Silent Ocean", "SEA", "60", "0.9", 3, {}),
    # Arrived shipment: last-mile deliveries and returns
    ("D1", "Fatuma Hassan", "", "Samsung Galaxy A54 5G", "CN", "full_service", "simple", "850000", "arrived",
     "Freedom Yiwu ZNZ Cargo", "SEA", "2", "0.01", 1, {"city": "Dar es Salaam", "area": "Mikocheni", "address": "House #45, Mikocheni Beach Road"}),
    ("D2", "John Mwamba", "", "Nike Air Max 270", "CN", "full_service", "simple", "180000", "arrived",
     "Freedom Yiwu ZNZ Cargo", "SEA", "1.5", "0.01", 1, {"city": "Arusha", "area": "Njiro", "address": "Arusha Business Center, Plot 123"}),
    ("D3", "Grace Kimaro", "", "MacBook Air M2", "CN", "full_service", "fragile", "2500000", "arrived",
     "Freedom Yiwu ZNZ Cargo", "SEA", "2", "0.01", 1, {"city": "Dar es Salaam", "area": "Masaki", "address": "Peninsula Apartments, Flat 3B"}),
    ("D4", "Neema Mkwawa", "", "Home Appliances Package", "CN", "full_service", "bulk", "500000", "arrived",
     "Freedom Yiwu ZNZ Cargo", "SEA", "25", "0.2", 2, {"city": "Dodoma", "area": "Msasani", "address": "Central Market Area, Shop 67"}),
    ("D5", "David Lyimo", "", "Canon EOS R6 Camera", "CN", "full_service", "fragile", "4500000", "arrived",
     "Freedom Yiwu ZNZ Cargo", "SEA", "3", "0.02", 1, {"city": "Dar es Salaam", "area": "Kinondoni", "address": "Kinondoni Road, Near Police Station"}),
    ("D6", "Ahmed Salim", "", 'LG 55" 4K Smart TV', "CN", "full_service", "fragile", "1200000", "arrived",
     "Freedom Yiwu ZNZ Cargo", "SEA", "18", "0.3", 1, {"city": "Mwanza", "area": "Isamilo", "address": "Mwanza Industrial Estate, Unit 8"}),
    ("D7", "Amina Khamis", "", "Electronics Package", "CN", "full_service", "simple", "350000", "arrived",
     "Freedom Yiwu ZNZ Cargo", "SEA", "4", "0.05", 1, {"city": "Dar es Salaam", "area": "Posta", "address": "Posta Office Complex"}),
    ("D8", "Charles Mbwana", "+255713100213", "Kitchen Blender Set", "CN", "full_service", "simple", "280000",
     "arrived", "Freedom Yiwu ZNZ Cargo", "SEA", "5", "0.04", 1, {"city": "Dar es Salaam", "area": "Mbezi Beach", "address": "Mbezi Beach Villas, Villa 12"}),
]


def seed(stdout=None) -> Seeder:
    s = Seeder(SEED, stdout)
    actor = User.objects.filter(is_superuser=True).order_by("id").first()
    now = timezone.now()
    today = timezone.localdate()

    def track(obj):
        if obj is not None:
            s.register(obj)
        return obj

    # ---- Staff, suppliers, shippers, warehouses -----------------------------
    staff = {u.full_name: u for u in User.objects.filter(email__endswith="@agiza.demo")}
    for name, level, dept in STAFF:
        email = "demo." + name.lower().replace(" ", ".") + "@agiza.demo"
        user, created = s.get_or_create(User, email=email, defaults={"full_name": name, "staff_level": level,
                                                                     "department": dept})
        if created:
            user.set_unusable_password()
            user.save(update_fields=["password"])
        staff[name] = user

    suppliers = {}
    for name, iso, contact in SUPPLIERS:
        suppliers[name], _ = s.get_or_create(Supplier, name=name, defaults={
            "country": Country.objects.get(iso2=iso), "contact_person": contact,
            "email": name.lower().split()[0].strip(".") + "@supplier.demo"})

    shippers = {}
    for name, ctype, origins, services_, rating, email in SHIPPERS:
        obj, created = s.get_or_create(Carrier, name=name, defaults={
            "type": ctype, "services": services_, "rating": D(rating), "contact_email": email})
        if created:
            obj.origins.set(Country.objects.filter(iso2__in=origins))
            obj.destinations.set(Country.objects.filter(iso2="TZ"))
        shippers[name] = obj

    methods = {code: ShippingMethod.objects.filter(code=code).first() for code in ("AIR", "SEA")}
    if not all(methods.values()):  # the shipping set wasn't loaded: create the two methods we need
        for code, name, cat in (("AIR", "Air Cargo", "air"), ("SEA", "Sea Cargo", "sea")):
            if not methods[code]:
                methods[code], _ = s.get_or_create(ShippingMethod, code=code, defaults={"name": name, "category": cat})

    warehouses = {}
    for name, wtype, iso, city, address, contact, phone, email, capacity, wstatus in WAREHOUSES:
        warehouses[name], _ = s.get_or_create(Warehouse, name=name, defaults={
            "type": wtype, "country": Country.objects.get(iso2=iso),
            "city": City.objects.get(name=city, country__iso2=iso), "address": address, "contact_person": contact,
            "phone": phone, "email": email, "capacity_percent": capacity, "status": wstatus,
            "last_audit_at": today - timedelta(days=12)})

    for name, isos in SHIPPER_HUBS.items():
        if not shippers[name].warehouses.exists():
            shippers[name].warehouses.set([warehouses[HUB[iso]] for iso in isos])

    dar = City.objects.get(name="Dar es Salaam", country__iso2="TZ")

    def city(name):
        return City.objects.get(name=name, country__iso2="TZ")

    def pay_in_full(order):
        due = orders.payment_summary(order).due
        if due and due > 0:
            track(orders.record_payment(order, amount=due, method="bank_transfer", user=actor,
                                        reference=f"BNK-{order.reference}"))

    def buy(order, supplier_name, tracking="", flag=""):
        proc = order.procurement
        procurement.select_supplier(proc, supplier=suppliers[supplier_name], user=actor,
                                    item_cost=order.international.item_cost or (order.total_amount * D("0.7")),
                                    expected_at_cargo=today + timedelta(days=5))
        if flag:
            ProcurementOrder.objects.filter(pk=proc.pk).update(exception_flag=flag)
        proc.refresh_from_db()
        order.refresh_from_db()
        procurement.mark_paid(proc, user=actor, payment_reference=f"TT-{order.reference}",
                              supplier_tracking_number=tracking)
        return proc

    def receive(order, shipper, method, weight, cbm, packages=1, destination=None, estimated=False, cargo_type=None):
        parcel = CargoParcel.objects.get(order=order)
        hub = warehouses[HUB[order.international.source_country.iso2]]
        return shipping.receive_parcel(
            parcel, user=staff.get("Ahmed Msemo", actor), weight_kg=D(weight), cbm=D(cbm) if cbm else None,
            weight_type="estimated" if estimated else "exact", packages_quantity=packages, warehouse=hub,
            shipper=shippers[shipper], shipping_method=methods[method], destination_city=destination or dar,
            cargo_type=cargo_type)

    def ship(orders_, shipper, method, to_status, *, eta_days=10, alert="", docs=False, destination=None):
        parcels = [CargoParcel.objects.get(order=o) for o in orders_]
        shipment = shipping.create_shipment(
            parcels=parcels, shipper=shippers[shipper], shipping_method=methods[method],
            destination_city=destination or dar, user=staff.get("Emmanuel Mollel", actor),
            origin_warehouse=warehouses[HUB[orders_[0].international.source_country.iso2]],
            eta=today + timedelta(days=eta_days), master_tracking_number=f"BL-{orders_[0].reference}")
        track(shipment)
        path = ["booked", "loaded", "export_cleared", "shipping_to_destination", "clearance", "completed"]
        for step in path[:path.index(to_status) + 1] if to_status in path else []:
            shipping.transition(shipment, step, user=staff.get("Emmanuel Mollel", actor),
                                location={"booked": "", "loaded": "Origin port", "export_cleared": "Origin customs",
                                          "clearance": "Dar es Salaam port"}.get(step, ""))
        if to_status == "shipping_to_destination":
            shipping.add_tracking_update(shipment, user=actor, description="Vessel departed, next port Mombasa",
                                         location="Indian Ocean")
        if alert:
            shipping.set_alert(shipment, alert, user=actor, note="Raised by the clearing agent")
        if docs:
            for name, notes in (("Bill of Lading.pdf", "Original BoL"), ("Commercial Invoice.pdf", "")):
                doc = ShipmentDocument.objects.create(
                    shipment=shipment, name=name, notes=notes, content_type="application/pdf", uploaded_by=actor,
                    file=pdf_file(name.replace(" ", "-").lower(), name.removesuffix(".pdf"),
                                  [f"Shipment {shipment.shipment_number}", f"Cargo {shipment.cargo_id}",
                                   f"Shipper: {shipment.shipper.name}",
                                   *[f"{p.order.reference}  {p.item_name}" for p in parcels]]))
                track(doc)
        return shipment

    # ---- The design's international orders ---------------------------------
    for (cust, items, iso, target, *_rest) in INTERNATIONAL:
        order = Order.objects.filter(order_type="international", item_details=items).first()
        if order is None or order.status not in ("pending_payment", "issue_pending_payment"):
            s.existing += 1
            continue
        if order.international.service_type != "deliver_for_me" and \
                order.procurement.status != "pending_sourcing":
            s.existing += 1
            continue
        supplier, shipper, method, weight, cbm, flag, tracking = DESIGN_INTL[cust]
        s.created += 1
        if target == "pending_payment":
            if order.procurement.exception_flag == flag:
                s.created -= 1
                s.existing += 1
            ProcurementOrder.objects.filter(order=order).update(exception_flag=flag)
            continue
        if target == "issue_pending_payment":
            procurement.select_supplier(order.procurement, supplier=suppliers[supplier], user=actor,
                                        item_cost=order.international.item_cost)
            ProcurementOrder.objects.filter(order=order).update(exception_flag=flag)
            continue
        if order.international.service_type == "deliver_for_me":
            pay_in_full(order)
            orders.transition(order, "supplier_confirmed", actor, "Customer confirmed the supplier order")
        else:
            if target == "paid_supplier":  # installment plan approved: pay the supplier now
                order.refresh_from_db()
            else:
                pay_in_full(order)
            buy(order, supplier, tracking)
        order.refresh_from_db()
        if target == "in_production":
            orders.transition(order, "in_production", actor, "Supplier started production")
            continue
        if target == "paid_supplier":
            continue
        receive(order, shipper, method, weight, cbm)
        if target == "sent_to_consolidation":
            continue
        order.refresh_from_db()
        to = {"shipping_to_destination": "shipping_to_destination", "clearance": "clearance",
              "ready_for_collection": "completed"}[target]
        ship([order], shipper, method, to, alert="customs_hold" if target == "clearance" else "",
             eta_days=3 if target == "clearance" else 6)

    # ---- Extra orders for the Operations screens ---------------------------
    created = {}
    for (key, cust, phone, items, iso, service, klass, total, stage, shipper, method, weight, cbm, packages,
         extra) in EXTRA:
        if Order.objects.filter(order_type="international", item_details=items).exists():
            s.existing += 1
            continue
        customer = Customer.objects.filter(full_name=cust).first()
        if customer is None:
            customer = track(Customer.objects.create(full_name=cust, phone=phone or "+255700000000"))
        order = track(orders.create_order(
            "international", customer=customer, item_details=items, user=actor, total_amount=D(total),
            handler=staff.get("Emmanuel Mollel"),
            details={"source_country": Country.objects.get(iso2=iso), "order_class": klass, "service_type": service,
                     "item_cost": D(total) * D("0.75"), "shipping_cost": D(total) * D("0.15"),
                     "tracking_number": extra.get("tracking", "")},
        ))
        created[key] = order
        destination = city(extra["city"]) if "city" in extra else dar
        if "address" in extra and not customer.addresses.exists():
            track(Address.objects.create(customer=customer, label="Home", line1=extra["address"],
                                         area=extra.get("area", ""), city=destination, region=destination.region,
                                         country=destination.country, is_default=True))
        if service == "deliver_for_me":
            if not extra.get("unpaid"):
                pay_in_full(order)
                orders.transition(order, "supplier_confirmed", actor, "Customer confirmed the supplier order")
        else:
            pay_in_full(order)
            order.refresh_from_db()
            supplier = {"CN": "Yiwu Commodities Trading", "AE": "Dubai Fashion Hub", "US": "US Home Solutions",
                        "GB": "UK Industrial Ltd", "IN": "Mumbai Textiles Export"}[iso]
            buy(order, supplier, extra.get("tracking", ""))
        parcel = CargoParcel.objects.get(order=order)
        CargoParcel.objects.filter(pk=parcel.pk).update(
            shipper=shippers[shipper], shipping_method=methods[method], destination_city=destination,
            packages_quantity=packages, description=extra.get("description", ""),
            estimated_arrival=today + timedelta(days=extra.get("eta", 5)))
        track(parcel)
        order.refresh_from_db()
        if stage == "waiting":
            continue
        receive(order, shipper, method, weight, cbm, packages, destination, extra.get("estimated", False),
                extra.get("cargo_type"))

    if "S1" in created:
        ship([created["S1"], created["S2"]], "Silent Ocean", "SEA", "shipping_to_destination", eta_days=12, docs=True)
    if "S3" in created:
        ship([created["S3"]], "Silent Ocean", "SEA", "booked", eta_days=30)
    arrived = [created[k] for k in ("D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8") if k in created]
    if arrived:
        ship(arrived, "Freedom Yiwu ZNZ Cargo", "SEA", "completed", eta_days=-2)
        _deliveries_and_returns(s, track, created, staff, actor)

    # ---- Tasks --------------------------------------------------------------
    if not Task.objects.filter(pk__in=seeded_ids(SEED, Task)).exists():
        _tasks(track, staff, actor, now)

    # Rows created by the workflows for these orders are demo data too.
    # (Seeder.register never re-registers a row another demo set already owns.)
    demo = Order.objects.filter(pk__in=seeded_ids(SEED, Order) + seeded_ids("orders", Order))
    for model in (ProcurementOrder, CargoParcel, Delivery, ReturnRequest, Payment):
        for row in model.objects.filter(order__in=demo, order__order_type="international"):
            track(row)
    for model in (DeliveryProof, DeliveryPhoto):  # registered so their files are removed on --flush
        for row in model.objects.filter(delivery__order__in=demo):
            track(row)
    return s


def _deliveries_and_returns(s, track, created, staff, actor):
    drivers = [staff[n] for n in ("Hassan Mohamed", "David Mwita", "John Maleko", "Juma Kamara") if n in staff]
    now = timezone.now()

    def delivery_for(key):
        return Delivery.objects.get(order=created[key])

    def go(key, driver, *, scheduled_hours=2):
        d = delivery_for(key)
        deliveries.assign_driver(d, driver, user=actor, scheduled_at=now + timedelta(hours=scheduled_hours))
        return Delivery.objects.get(pk=d.pk)

    def deliver(key, driver, signer, notes, photos=2):
        d = go(key, driver, scheduled_hours=-5)
        deliveries.transition(d, "out_for_delivery", user=driver)
        deliveries.complete(d, user=driver, signature_name=signer, notes=notes, signature_image=signature_png(d.id),
                            signature_content_type="image/png",
                            photos=[(parcel_photo(d.id + i), "image/png") for i in range(photos)])
        return d

    hassan, mwita, maleko, kamara = (drivers + [actor] * 4)[:4]
    deliver("D1", hassan, "Fatuma Hassan", "Package delivered to customer at door. Customer verified ID.")
    deliver("D2", mwita, "John Mwamba", "Left with the customer at the business center reception.", photos=1)
    deliver("D3", hassan, "Grace Kimaro", "Delivered to the customer in person.")
    deliver("D6", mwita, "Ahmed Salim", "Package delivered to customer at door. Customer verified ID.")
    # D4: failed → returned (opens a Delivery Failed return)
    d4 = go("D4", maleko, scheduled_hours=-20)
    deliveries.transition(d4, "out_for_delivery", user=maleko)
    deliveries.transition(d4, "failed", user=maleko, exception_flag="customer_unavailable",
                          note="Customer not reachable on phone; shop closed")
    # D5: out for delivery (customer then asks to cancel → return initiated)
    d5 = go("D5", hassan, scheduled_hours=1)
    deliveries.transition(d5, "out_for_delivery", user=hassan)
    # D7: rescheduled, address unclear
    d7 = go("D7", hassan, scheduled_hours=-3)
    deliveries.transition(d7, "out_for_delivery", user=hassan)
    deliveries.transition(d7, "rescheduled", user=hassan, exception_flag="address_unclear",
                          note="Kinondoni Road, near the police station — customer to share a pin",
                          scheduled_at=now + timedelta(days=1))
    # D8: pending, then assigned driver
    go("D8", kamara, scheduled_hours=3)
    deliveries.transition(Delivery.objects.get(pk=d4.pk), "returned", user=maleko,
                          note="Returned to Dar es Salaam Central Warehouse")

    handlers = {n: staff.get(n) for n in ("Ahmed Msemo", "Hassan Mohamed", "Sarah Juma", "Mary Komba",
                                           "Peter Kimani", "Sarah Mtui")}

    def new_return(key, rtype, reason, handler, **kw):
        return returns.create_return(created[key], user=actor, return_type=rtype, reason_code=reason,
                                     handler=handlers[handler], **kw)

    r1 = new_return("D1", "damaged_item", "damaged_in_transit", "Ahmed Msemo", exception_flag="high_value_item",
                    notes="Screen cracked on arrival")
    returns.transition(r1, "received", user=actor, note="Customer dropped the phone at the warehouse")
    returns.inspect(r1, user=handlers["Ahmed Msemo"], item_condition="damaged",
                    notes="Cracked screen, box crushed — transit damage confirmed")

    r2 = new_return("D2", "wrong_item", "item_mismatch", "Hassan Mohamed", financial_impact="replacement_required",
                    notes="Customer ordered size 42, received 40")
    returns.transition(r2, "in_transit", user=actor, note="Driver collecting from the customer")

    r3 = new_return("D3", "customer_rejected", "customer_changed_mind", "Sarah Juma", exception_flag="dispute")
    returns.transition(r3, "received", user=actor)
    returns.inspect(r3, user=handlers["Peter Kimani"], item_condition="as_described", notes="Sealed, unused")
    returns.decide(r3, user=handlers["Sarah Mtui"], approve=True, notes="Within the 7-day return window",
                   refund_amount=D("2500000"))

    r5 = new_return("D5", "cancellation_after_dispatch", "customer_changed_mind", "Mary Komba",
                    exception_flag="customer_complaint", notes="Customer called to cancel while out for delivery")

    r6 = new_return("D6", "damaged_item", "damaged_in_transit", "Peter Kimani")
    returns.transition(r6, "received", user=actor)
    returns.inspect(r6, user=handlers["Peter Kimani"], item_condition="damaged", notes="Panel cracked")
    returns.decide(r6, user=handlers["Sarah Mtui"], approve=True, notes="Transit damage", refund_amount=D("1200000"))
    returns.close(r6, user=handlers["Sarah Mtui"], refund_method="mobile_money", refund_reference="MPESA-7781",
                  notes="Refund paid to the customer's M-Pesa")

    r7 = new_return("D7", "delivery_failed", "address_incorrect", "Sarah Juma")
    returns.decide(r7, user=handlers["Sarah Mtui"], approve=False,
                   notes="Delivery rescheduled instead — the customer confirmed the address")

    # The failed delivery's return (D4) was opened automatically; move it to Received.
    auto = ReturnRequest.objects.filter(order=created["D4"]).first()
    if auto:
        returns.transition(auto, "received", user=handlers["Ahmed Msemo"], note="Back at Dar es Salaam Central")
    for ret in (r1, r2, r3, r5, r6, r7, auto):
        track(ret)
    for p in Payment.objects.filter(kind="refund", order__in=created.values()):
        track(p)


def _tasks(track, staff, actor, now):
    def order(items):
        return Order.objects.filter(item_details=items).first()

    rows = [
        ("verify_payment", order("Electronics - 5x Smartphones, 10x Chargers"), None, "in_progress", "Sarah Mtui",
         "finance", timedelta(hours=5), "high", "Verify partial payment of TSh 1,000,000 for Fatuma Hassan order",
         ["Customer sent payment receipt", "Awaiting bank confirmation"]),
        ("follow_up_client", order("Construction Materials - Tiles & Fixtures"), None, "waiting_for_client",
         "Ahmed Salim", "support", timedelta(hours=-3), "high",
         "Follow up on unpaid order - Construction Materials for David Lyimo",
         ["Client requested payment extension", "Waiting for response since yesterday"]),
        ("customs_clearance", order("Home Appliances - 2x Refrigerators, 3x Microwaves"), None, "blocked",
         "Emmanuel Mollel", "shipping", timedelta(hours=2), "high",
         "Complete customs documentation for Grace Kimaro refrigerators",
         ["Missing import permit", "Customer contacted for documents"]),
        ("arrange_delivery", order("Beauty Products - Cosmetics & Skincare"), None, "in_progress", "Hassan Mohamed",
         "delivery", timedelta(hours=1, minutes=30), "high", "Schedule delivery for the Dubai beauty products", []),
        ("pricing_approval", order("Medical Equipment - Diagnostic Devices"), None, "review_required", None,
         "procurement", timedelta(hours=6), "high", "Approve special pricing for medical equipment order",
         ["Customer requested 15% discount", "Requires manager approval"]),
        ("quality_check", order("Electronics - 5x Smartphones, 10x Chargers"), None, "waiting_for_payment",
         "Peter Kimani", "warehouse", timedelta(hours=20), "medium",
         "Quality inspection for smartphones before shipping", ["Waiting for full payment before inspection"]),
        ("assign_cargo", order("Textiles - 200m Fabric Rolls"), None, "in_progress", "Sarah Mtui", "shipping",
         timedelta(hours=7), "medium", "Assign consolidation warehouse for textile shipment", []),
        ("pricing_approval", None, QuoteRequest.objects.filter(description__startswith="Import medical").first(),
         "review_required", None, "sales", timedelta(days=2), "low",
         "Confirm expedited customs fee in the medical supplies quotation", []),
    ]
    for (ttype, linked_order, quote, status, owner, dept, due, priority, desc, notes) in rows:
        task = tasks.create_task(task_type=ttype, description=desc, sla_deadline=now + due, user=actor,
                                 department=dept, owner=staff.get(owner) if owner else None, order=linked_order,
                                 quote=quote, priority=priority, status=status)
        track(task)
        for note in notes:
            tasks.add_note(task, note, user=staff.get(owner) or actor)
    done = tasks.create_task(task_type="verify_payment", description="Confirm Sarah Mtui's full payment",
                             sla_deadline=now - timedelta(hours=20), user=actor, department="finance",
                             owner=staff.get("Sarah Mtui"), order=order("Beauty Products - Cosmetics & Skincare"))
    tasks.change_status(done, "completed", user=staff.get("Sarah Mtui") or actor, note="Bank transfer confirmed")
    track(done)
