"""
Demo orders and quotations from the Figma Make design (DeliveryDashboard,
InternationalOrders, ServiceOrders and IntakeQuotes mock records).

Everything is created through the real workflow services, so each order
reaches its status by allowed transitions and has a genuine status history.
Demo staff (drivers, handlers, technicians) get unusable passwords.
"""
from datetime import timedelta
from decimal import Decimal as D

from django.utils import timezone

from apps.accounts.constants import Department as StaffDept
from apps.accounts.constants import StaffLevel
from apps.accounts.models import User
from apps.core.seeding import Seeder, seeded_ids
from apps.deliveries.models import Delivery
from apps.locations.models import City, Country
from apps.parties.models import Customer
from apps.quotes import services as quote_services
from apps.procurement.models import ProcurementOrder
from apps.quotes.models import QuoteRequest, QuoteStatusHistory
from apps.shipping.models import CargoParcel
from apps.tasks import services as tasks
from apps.tasks.models import Task

from . import services
from .models import EquipmentDetails, ExpressDetails, InternationalDetails, Order, OrderStatusHistory, Payment

SEED = "orders"
FLUSH_ORDER = [Task, QuoteStatusHistory, OrderStatusHistory, Payment, Delivery, CargoParcel, ProcurementOrder,
               ExpressDetails, InternationalDetails, EquipmentDetails, Order, QuoteRequest, Customer, User]

STAFF = [
    # name, level, department
    ("Hassan Mohamed", StaffLevel.DRIVER, StaffDept.DELIVERY),
    ("Baraka Mushi", StaffLevel.DRIVER, StaffDept.DELIVERY),
    ("Joseph Kimaro", StaffLevel.DRIVER, StaffDept.DELIVERY),
    ("Sarah Mtui", StaffLevel.ADMIN_L2, StaffDept.MANAGEMENT),
    ("Ahmed Salim", StaffLevel.PROCUREMENT, StaffDept.PROCUREMENT),
    ("Emmanuel Mollel", StaffLevel.ADMIN_L1, StaffDept.SHIPPING),
    ("David Lyimo", StaffLevel.SALES, StaffDept.SALES),
    ("John M.", StaffLevel.DATA_ENTRY, StaffDept.SUPPORT),
    ("Amani K.", StaffLevel.DATA_ENTRY, StaffDept.SUPPORT),
    ("Said H.", StaffLevel.DATA_ENTRY, StaffDept.SUPPORT),
    ("Grace L.", StaffLevel.DATA_ENTRY, StaffDept.SUPPORT),
    ("Bakari T.", StaffLevel.DATA_ENTRY, StaffDept.SUPPORT),
    ("Josephine S.", StaffLevel.DATA_ENTRY, StaffDept.SUPPORT),
]

# (customer, items, pickup, pickup city, delivery, delivery city, target status, priority, price, driver, size, notes)
EXPRESS = [
    ("Juma Mwangi", "2x Electronics Package (5kg)", "Kariakoo Market, Msimbazi St", "Dar es Salaam",
     "Mwenge, Sam Nujoma Rd", "Dar es Salaam", "in_transit", "express", "25000", "Hassan Mohamed", "small", ""),
    ("Amina Khamis", "1x Document Envelope", "Mlimani City, Sam Nujoma Rd", "Dar es Salaam",
     "Clock Tower, India St", "Arusha", "at_agiza_center", "urgent", "35000", "Baraka Mushi", "small",
     "Handle with care - important legal documents"),
    ("David Mapunda", "3x Food Containers (8kg)", "Ubungo Plaza, Morogoro Rd", "Dar es Salaam",
     "Mwanza City Center, Kenyatta Rd", "Mwanza", "quoted", "standard", "45000", None, "medium", ""),
    ("Grace Mollel", "1x Furniture Item (25kg)", "Arusha Declaration Museum Rd", "Arusha",
     "Stone Town, Kenyatta Rd", "Zanzibar", "accepted", "standard", "75000", None, "large", ""),
    ("Michael Lwiza", "5x Small Parcels (3kg total)", "Quality Center Mall, Morogoro Rd", "Dar es Salaam",
     "Dodoma Business District, Nyerere Rd", "Dodoma", "waiting_quote", "standard", None, None, "small",
     "Multiple small items - books and office supplies"),
    ("Neema Kileo", "1x Artwork (Fragile, 10kg)", "Tingatinga Arts Center, Haile Selassie Rd", "Dar es Salaam",
     "Cultural Heritage Center, Arusha-Moshi Rd", "Arusha", "waiting_quote", "express", None, None, "medium",
     "Fragile painting - requires special handling"),
    ("Emmanuel Shayo", "2x Medical Supplies (Temperature Controlled)", "Muhimbili Hospital, United Nations Rd",
     "Dar es Salaam", "Mount Meru Regional Hospital, Sokoine Rd", "Arusha", "picked_up", "urgent", "80000",
     "Joseph Kimaro", "medium", "Must maintain temperature control - urgent medical supplies"),
]
EXPRESS_PATH = ["driver_assigned", "picked_up", "at_agiza_center", "in_transit", "arrived", "delivered"]

# (customer, items, origin iso2, status, class, service, total, paid, supplier, tracking, handler,
#  installment_plan, installment_allowed, shipping cost, item cost, notes)
INTERNATIONAL = [
    ("Fatuma Hassan", "Electronics - 5x Smartphones, 10x Chargers", "CN", "in_production", "simple", "full_service",
     "2500000", "1000000", "Shenzhen Tech Co.", "", "Sarah Mtui", False, False, "200000", "1800000",
     "Customer requested quality check before shipping"),
    ("John Mwamba", "Fashion - 50x Designer T-shirts, 30x Jeans", "AE", "shipping_to_destination", "bulk",
     "deliver_for_me", "1800000", "1800000", "Dubai Fashion Hub", "DXB-TZ-2026-0845", "Ahmed Salim", False, False,
     "300000", "1200000", ""),
    ("Grace Kimaro", "Home Appliances - 2x Refrigerators, 3x Microwaves", "US", "clearance", "machinery",
     "full_service", "4200000", "4200000", "US Home Solutions", "USA-TZ-2026-1234", "Emmanuel Mollel", False, False,
     "800000", "3000000", "Customs clearance in progress - documentation submitted"),
    ("Ahmed Salim", "Machinery Parts - Industrial Equipment", "GB", "paid_supplier", "machinery", "full_service",
     "8500000", "3000000", "UK Industrial Ltd", "", "David Lyimo", True, True, "1200000", "6000000", ""),
    ("Neema Mkwawa", "Textiles - 200m Fabric Rolls", "IN", "sent_to_consolidation", "bulk", "full_service",
     "950000", "950000", "Mumbai Textiles Export", "IND-TZ-2026-5678", "Sarah Mtui", False, False, "150000",
     "600000", ""),
    ("David Lyimo", "Construction Materials - Tiles & Fixtures", "CN", "pending_payment", "bulk", "full_service",
     "3200000", "0", "Guangzhou Building Supplies", "", "Ahmed Salim", False, False, "400000", "2100000", ""),
    ("Sarah Mtui", "Beauty Products - Cosmetics & Skincare", "AE", "ready_for_collection", "fragile",
     "full_service", "650000", "650000", "Dubai Beauty Trading", "DXB-TZ-2026-9012", "Emmanuel Mollel", False, False,
     "100000", "400000", ""),
    ("Emmanuel Mollel", "Medical Equipment - Diagnostic Devices", "US", "issue_pending_payment", "fragile",
     "full_service", "12000000", "2000000", "MedTech USA Inc.", "", "David Lyimo", True, False, "1500000", "8000000",
     "Payment verification issue - customer contacted"),
]

EQUIP_PATH = ["pending", "approved", "assigned", "on_site", "in_progress", "testing"]
# (customer, phone, city, service, equipment, class, technician, status, paid, value, description, days, attention, priority)
EQUIPMENT = [
    ("Mawazo Bakery", "+255712000111", "Dar es Salaam", "installation", "Industrial Bakery Oven X100", "machinery",
     "John M.", "in_progress", "1250000", "1250000",
     "Installation of high-capacity industrial oven. Requires electrical bypass setup.", 1, False, "high"),
    ("Sarah Juma", "+255655222333", "Arusha", "product_setup", "8-Camera CCTV System (HIKVision)", "fragile",
     None, "pending", "200000", "450000", "Full house surveillance setup with remote access configuration.", 3, False,
     "medium"),
    ("Beachfront Hotel", "+255777444555", "Zanzibar", "maintenance", "Solar Water Heater 300L", "simple", "Said H.",
     "maintenance_required", "50000", "150000", "Quarterly maintenance check and filter replacement.", 0, True, "high"),
    ("Kevin Malima", "+255688666777", "Mwanza", "electronic_repair", 'LG Smart TV 65"', "fragile", "Grace L.",
     "testing", "0", "85000", "Screen flickering issue repair and software update.", 1, False, "medium"),
    ("Royal Spa", "+255622888999", "Dodoma", "product_setup", "Luxury Sauna Room (4 Person)", "machinery", None,
     "approved", "2800000", "2800000", "Complete build of cedar wood sauna room with digital controls.", 5, False, "high"),
    ("Tanga Office Complex", "+255644111222", "Tanga", "installation", "AC Units x5 (Inverter)", "bulk",
     "Josephine S.", "assigned", "300000", "650000", "Installation of 5 split AC units in the new office wing.", 2,
     False, "medium"),
]

# (customer, service, description, origin, destination, status, amount, eta days, notes)
QUOTES = [
    ("Fatuma Hassan", "international", "Need quote for importing 10 laptops from China to Dar es Salaam", "China",
     "Dar es Salaam", "new", None, None, ""),
    ("John Mwamba", "express", "Urgent delivery of documents from Dar to Arusha", "Dar es Salaam", "Arusha", "new",
     None, None, ""),
    ("Grace Kimaro", "equipment", "Home cleaning service for 3-bedroom apartment in Mikocheni", "", "", "new", None,
     None, ""),
    ("Ahmed Salim", "international", "Bulk order: 500 phone cases from Dubai", "Dubai", "Dar es Salaam", "answered",
     "1250000", 14, "Quote includes shipping via air cargo and customs clearance"),
    ("Neema Mkwawa", "express", "Package delivery from Mwanza to Dodoma - 15kg", "Mwanza", "Dodoma", "answered",
     "45000", 2, "Express delivery, 2-day service"),
    ("David Lyimo", "equipment", "Plumbing repair - kitchen sink and bathroom pipes", "", "", "waiting_reply", "85000",
     1, "Service includes parts and 2 hours labor"),
    ("Sarah Mtui", "international", "Import medical supplies from USA - 50kg", "USA", "Dar es Salaam", "waiting_reply",
     "3500000", 30, "Includes special handling for medical equipment and expedited customs"),
]


def _city(name):
    return City.objects.get(name=name, country__iso2="TZ")


def seed(stdout=None) -> Seeder:
    s = Seeder(SEED, stdout)
    actor = User.objects.filter(is_superuser=True).order_by("id").first()

    staff = {}
    for name, level, dept in STAFF:
        email = "demo." + name.lower().replace(" ", ".").replace("..", ".").rstrip(".") + "@agiza.demo"
        user, created = s.get_or_create(User, email=email, defaults={"full_name": name, "staff_level": level,
                                                                     "department": dept})
        if created:
            user.set_unusable_password()
            user.save(update_fields=["password"])
        staff[name] = user

    customers = {}

    def customer(name, phone=""):
        if name not in customers:
            # Each demo customer gets their own (fictional, +255 700 …) number.
            customers[name], _ = s.get_or_create(Customer, full_name=name, defaults={
                "phone": phone or f"+255 700 {len(customers) + 101:03d} {len(customers) * 37 % 1000:03d}"})
        return customers[name]

    def tracked(order: Order):
        s.register(order)
        s.created += 1
        return order

    def pay(order, amount, kind="balance"):
        if D(amount) > 0:
            p = services.record_payment(order, amount=D(amount), method="bank_transfer", kind=kind, user=actor)
            s.register(p)

    # ---- Express ----------------------------------------------------------
    for (cust, items, pickup, pcity, deliver, dcity, target, prio, price, driver, size, notes) in EXPRESS:
        if Order.objects.filter(order_type="express", item_details=items, customer__full_name=cust).exists():
            s.existing += 1
            continue
        order = tracked(services.create_order(
            "express", customer=customer(cust), item_details=items, user=actor, notes=notes,
            details={"pickup_address": pickup, "pickup_city": _city(pcity), "delivery_address": deliver,
                     "delivery_city": _city(dcity), "priority": prio, "package_size": size, "customer_package_size": size},
        ))
        if target == "waiting_quote":
            continue
        services.quote_express(order, amount=D(price), estimated_delivery_at=timezone.now() + timedelta(hours=6),
                               user=actor)
        if target == "quoted":
            continue
        services.transition(order, "accepted", actor, "Customer accepted the quote")
        if target == "accepted":
            continue
        services.assign_driver(order, staff[driver], actor)
        for step in EXPRESS_PATH[1:EXPRESS_PATH.index(target) + 1]:
            services.transition(order, step, actor)

    # ---- International ------------------------------------------------------
    for (cust, items, iso, target, klass, service, total, paid, supplier, tracking, handler, plan, allowed, ship,
         cost, notes) in INTERNATIONAL:
        if Order.objects.filter(order_type="international", item_details=items).exists():
            s.existing += 1
            continue
        order = tracked(services.create_order(
            "international", customer=customer(cust), item_details=items, user=actor, notes=notes,
            total_amount=D(total), installment_plan=plan, installment_allowed=allowed, handler=staff[handler],
            details={"source_country": Country.objects.get(iso2=iso), "order_class": klass, "service_type": service,
                     "supplier_name": supplier, "tracking_number": tracking, "item_cost": D(cost),
                     "shipping_cost": D(ship)},
        ))
        pay(order, paid, "installment" if plan else "balance")
        if target == "issue_pending_payment":
            services.transition(order, target, actor, "Payment verification issue")
        # Later stages are reached through Procurement and Shipping — see the "operations" demo set.

    # ---- Equipment ----------------------------------------------------------
    for (cust, phone, city, service, equipment, klass, tech, target, paid, value, desc, days, attention,
         prio) in EQUIPMENT:
        if Order.objects.filter(order_type="equipment", equipment__equipment=equipment).exists():
            s.existing += 1
            continue
        order = tracked(services.create_order(
            "equipment", customer=customer(cust, phone), item_details=equipment, user=actor, notes=desc,
            total_amount=D(value),
            details={"service_type": service, "equipment": equipment, "classification": klass, "city": _city(city),
                     "expected_date": timezone.localtime().replace(hour=9, minute=0, second=0, microsecond=0) + timedelta(days=days),
                     "priority": prio, "needs_attention": attention},
        ))
        pay(order, paid)
        path = EQUIP_PATH if target != "maintenance_required" else EQUIP_PATH[:5]
        for step in path[1:(path.index(target) + 1) if target in path else len(path)]:
            if step == "assigned":
                services.assign_technician(order, staff[tech], actor)
            else:
                services.transition(order, step, actor)
        if target == "maintenance_required":
            services.transition(order, "maintenance_required", actor, "Filter housing cracked")

    # ---- Quotations ---------------------------------------------------------
    for (cust, service, desc, origin, dest, target, amount, eta, notes) in QUOTES:
        quote, created = s.get_or_create(QuoteRequest, description=desc, defaults={
            "customer": customer(cust), "service_type": service, "origin": origin, "destination": dest,
            "created_by": actor,
        })
        if not created:
            continue
        QuoteStatusHistory.objects.create(quote=quote, to_status="new", changed_by=actor, note="Quotation request received")
        if target == "new":
            s.register(tasks.open_quote_task(quote, actor))
            continue
        quote_services.respond(quote, amount=D(amount), estimated_delivery=timezone.localdate() + timedelta(days=eta),
                               notes=notes, user=staff["Sarah Mtui"])
        if target == "answered":
            quote_services.record_reply(quote, accepted=True, user=actor)

    # Rows the workflows created alongside the demo orders are demo data too.
    demo_orders = Order.objects.filter(pk__in=seeded_ids(SEED, Order))
    for model in (ProcurementOrder, CargoParcel, Delivery):
        for row in model.objects.filter(order__in=demo_orders):
            s.register(row)
    return s
