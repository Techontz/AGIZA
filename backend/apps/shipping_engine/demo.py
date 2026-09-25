"""
Demo Shipping Engine configuration, taken from the Figma Make design
(docs/Delivery Management Dashboard/src/app/components/ShippingEngine.tsx):
methods, carriers, profiles, zones, routes, rules and overrides.

A few rules marked `# illustrative` are NOT in the design; they exist so every
pricing model (per CBM, per volumetric weight, fixed) has a working example.
Override dates keep the design's day/month but use 2026 so some are current.
"""
from datetime import date
from decimal import Decimal as D

from apps.core.seeding import Seeder
from apps.locations.models import City, Country, Region

from .constants import AppliesTo, PricingModel, Scope, Status, ZoneStatus
from .models import (
    Carrier,
    ExchangeRate,
    Route,
    RuleOverride,
    ShippingMethod,
    ShippingProfile,
    ShippingRule,
    Zone,
    ZoneDestination,
)

SEED = "shipping"

# Removal order for --flush (children before parents).
FLUSH_ORDER = [RuleOverride, ShippingRule, Route, ZoneDestination, Zone, ShippingMethod, ShippingProfile, Carrier, ExchangeRate]

CARRIERS = [
    # name, type, origins, contact, specializations
    ("SF Express", "international_air", ["CN"], "logistics@sfexpress.com", ["Electronics", "Standard Goods"]),
    ("DHL", "international_air", ["AE", "US", "GB"], "api@dhl.com", ["All Types"]),
    ("FedEx", "international_air", ["US", "GB"], "partners@fedex.com", ["Electronics", "Express"]),
    ("Emirates Air Cargo", "international_air", ["AE"], "cargo@emirates.com", ["All Types"]),
    ("Local Bus Partner", "local_ground", ["TZ"], "ops@agiza.co.tz", ["Standard Goods", "Oversized"]),
    ("Agiza Riders", "local_delivery", ["TZ"], "riders@agiza.co.tz", ["Standard Goods", "Small Packages"]),
]

METHODS = [
    # name, code, category, eta, max kg, special, carriers, description
    ("Air Cargo", "AIR", "air", "5–10 days", None, False, ["SF Express"], "Standard air freight for general goods. Fast and reliable."),
    ("Air Cargo — Sensitive", "AIR-SENS", "air", "5–10 days", None, True, ["SF Express"], "Air freight for electronics, fragile, and battery items. Special handling included."),
    ("Sea Freight", "SEA", "sea", "25–40 days", None, False, [], "Standard sea freight via container. Best for large, heavy, and non-urgent shipments."),
    ("Sea Freight — Sensitive", "SEA-SENS", "sea", "25–40 days", None, True, [], "Sea freight for electronics and fragile items. Climate-controlled containers."),
    ("Bus Cargo", "BUS", "land", "1–3 days", D("50"), False, ["Local Bus Partner"], "Local inter-city bus cargo within Tanzania. Economical for domestic routes."),
    ("Rider Delivery", "RIDER", "local", "Same day – 24 hrs", D("15"), False, ["Agiza Riders"], "Motorcycle courier for last-mile delivery within city limits."),
    ("Courier (DHL / FedEx)", "COURIER", "air", "3–7 days", None, False, ["DHL", "FedEx"], "Door-to-door express courier service. Premium pricing, fastest delivery."),
    ("Pickup In Store", "PICKUP", "local", "Ready in 1–2 hrs", None, False, [], "Customer collects from an Agiza physical shop location. No shipping cost."),
    ("Manual Quote", "MANUAL", "air", "TBD", None, False, [], "Custom shipping arrangement requiring admin to provide a manual quote to the customer."),
]

PROFILES = [
    ("Standard Goods", "standard", [], "General merchandise with no special handling requirements"),
    ("Electronics", "specialized", ["fragile"], "Electronic devices requiring careful handling"),
    ("Laptops", "specialized", ["fragile", "special_documentation"], "Laptop computers and accessories"),
    ("Drone — Special Air Cargo", "restricted", ["contains_battery", "special_documentation", "restricted"], "Products such as drones requiring special international shipping treatment"),
    ("Battery / Restricted", "restricted", ["contains_battery", "hazardous", "restricted"], "Items containing lithium batteries or restricted materials"),
    ("Oversized", "oversized", ["special_documentation"], "Items exceeding standard size limits requiring special logistics"),
    ("Manual Quote", "manual", [], "Items that require manual pricing — no automatic rate applied"),
    ("Cameras", "specialized", ["fragile", "special_documentation"], "Camera equipment and photography gear"),
    ("Fragile Items", "specialized", ["fragile"], "Glassware, ceramics, and other fragile products"),
]

ZONES = [
    # name, type, description, status, cities, regions, countries
    ("Zone A — Short Distance", "local", "Cities within 100km of Dar es Salaam", "active", ["Bagamoyo", "Kibaha", "Morogoro", "Kisarawe"], [], []),
    ("Zone B — Medium Distance", "local", "Cities 100–400km from Dar es Salaam", "active", ["Dodoma", "Iringa", "Tanga", "Arusha"], [], []),
    ("Zone C — Long Distance", "local", "Cities 400km+ from Dar es Salaam", "active", ["Mwanza", "Geita", "Tabora", "Shinyanga"], ["Kagera"], []),
    # The design lists Mahale and Gombe (national parks in Kigoma region).
    ("Zone D — Remote", "local", "Remote regions with limited transport access", "active", [], ["Rukwa", "Katavi", "Kigoma"], []),
    ("Zone E — Islands", "local", "Island destinations requiring ferry or air", "active", ["Zanzibar", "Mafia"], ["Kaskazini Pemba", "Kusini Pemba"], []),
    ("East Africa", "international", "East African Community member countries", "draft", [], [], ["KE", "UG", "RW", "BI"]),
]

# origin (city name or country iso2), destination (city name, zone name or country iso2), methods, kind
ROUTES = [
    ("Dar es Salaam", "Mwanza", ["BUS"], "city"),
    ("Dar es Salaam", "Dodoma", ["BUS", "COURIER"], "city"),
    ("Dar es Salaam", "Zone A — Short Distance", ["RIDER"], "zone"),
    ("Dar es Salaam", "Zone C — Long Distance", ["BUS"], "zone"),
    ("Dar es Salaam", "Zone D — Remote", ["BUS"], "zone"),
    ("Dar es Salaam", "Zone E — Islands", ["BUS"], "zone"),
    ("Mwanza", "Dar es Salaam", ["BUS", "RIDER"], "city"),
    ("CN", "TZ", ["AIR", "SEA"], "country"),
    ("AE", "TZ", ["AIR", "COURIER"], "country"),
    ("US", "TZ", ["AIR", "SEA"], "country"),
    ("GB", "TZ", ["AIR"], "country"),
    ("IN", "TZ", ["AIR", "SEA"], "country"),
]

# route key (origin, destination), method, applies_to, profile, model, rate, currency, min, eta (min,max), carrier, status, extra
RULES = [
    (("CN", "TZ"), "AIR", "general", None, "per_kg", "12", "USD", "30", (7, 14), "SF Express", "active", {}),  # SR001
    (("CN", "TZ"), "AIR", "profile", "Electronics", "per_kg", "25", "USD", "50", (7, 14), "SF Express", "active", {}),  # SR002
    (("CN", "TZ"), "AIR", "profile", "Drone — Special Air Cargo", "per_item", "50", "USD", "50", (7, 14), "SF Express", "active", {}),  # SR003
    (("AE", "TZ"), "AIR", "general", None, "per_kg", "18", "USD", "40", (5, 10), "Emirates Air Cargo", "active", {}),  # SR004
    (("AE", "TZ"), "AIR", "profile", "Drone — Special Air Cargo", "per_item", "80", "USD", None, (5, 10), "Emirates Air Cargo", "active", {}),  # R003
    (("US", "TZ"), "SEA", "general", None, "manual", None, "USD", None, (21, 30), None, "active", {}),  # SR005
    (("Dar es Salaam", "Zone A — Short Distance"), "RIDER", "general", None, "per_kg", "800", "TZS", "3000", (0, 0), "Agiza Riders", "active", {}),  # SR006
    (("Dar es Salaam", "Zone C — Long Distance"), "BUS", "general", None, "per_kg", "1500", "TZS", "8000", (2, 3), "Local Bus Partner", "active", {}),  # SR007
    (("Dar es Salaam", "Zone C — Long Distance"), "BUS", "profile", "Oversized", "per_kg", "2000", "TZS", None, (2, 3), "Local Bus Partner", "inactive", {}),  # R004
    (("Dar es Salaam", "Zone E — Islands"), "BUS", "general", None, "manual", None, "TZS", None, (3, 5), None, "active", {}),  # SR008
    (("Dar es Salaam", "Mwanza"), "BUS", "general", None, "per_kg", "1200", "TZS", None, (1, 2), "Local Bus Partner", "active", {}),  # R002
    (("Dar es Salaam", "Zone D — Remote"), "BUS", "general", None, "per_kg", "2000", "TZS", None, (3, 5), "Local Bus Partner", "active", {}),  # OV003 base
    # illustrative — one example for each remaining pricing model
    (("CN", "TZ"), "SEA", "general", None, "per_cbm", "280", "USD", "50", (25, 40), None, "active", {}),
    (("GB", "TZ"), "AIR", "general", None, "per_vol_weight", "15", "USD", "40", (10, 18), None, "active", {"volumetric_divisor": 6000}),
    (("IN", "TZ"), "AIR", "general", None, "per_vol_weight", "14", "USD", "35", (10, 20), None, "active", {"volumetric_divisor": 5000}),
    (("IN", "TZ"), "SEA", "general", None, "per_vol_weight", "6", "USD", "30", (25, 35), None, "active", {"volumetric_divisor": 3000}),
    (("Dar es Salaam", "Dodoma"), "COURIER", "general", None, "fixed", "15000", "TZS", None, (1, 1), "DHL", "active", {}),
    (("Dar es Salaam", "Dodoma"), "BUS", "general", None, "per_kg", "1000", "TZS", "5000", (1, 1), "Local Bus Partner", "active", {}),
    (("Mwanza", "Dar es Salaam"), "BUS", "general", None, "per_kg", "1200", "TZS", None, (1, 2), "Local Bus Partner", "active", {}),
]

# route key, destination (city or region name or None), profile, model, rate, currency, reason, start, end, status
OVERRIDES = [
    (("Dar es Salaam", "Zone C — Long Distance"), ("region", "Kagera"), None, "per_kg", "2000", "TZS",
     "Carrier price increase for Kagera region", date(2026, 9, 20), date(2026, 9, 30), "active"),
    (("CN", "TZ"), None, "Electronics", "per_kg", "22", "USD",
     "Promotional rate for Q4 electronics season", date(2026, 10, 1), date(2026, 12, 31), "active"),
    (("Dar es Salaam", "Zone D — Remote"), ("region", "Katavi"), None, "per_kg", "2500", "TZS",
     "Road access disruption — fuel surcharge", date(2026, 9, 15), date(2026, 10, 15), "active"),
    (("AE", "TZ"), None, None, "per_kg", "16", "USD",
     "Volume deal with Emirates Air Cargo", date(2026, 8, 1), date(2026, 8, 31), "inactive"),
    (("Dar es Salaam", "Zone E — Islands"), ("city", "Zanzibar"), "Oversized", "fixed", "45000", "TZS",
     "Fixed ferry rate agreement", date(2026, 9, 1), date(2026, 11, 30), "active"),
]


def _country(iso2: str) -> Country:
    return Country.objects.get(iso2=iso2)


def _tz_city(name: str) -> City:
    return City.objects.get(name=name, country__iso2="TZ")


def seed(stdout=None) -> Seeder:
    s = Seeder(SEED, stdout)

    carriers = {}
    for name, ctype, origins, contact, specs in CARRIERS:
        obj, created = s.get_or_create(Carrier, name=name, defaults={
            "type": ctype, "contact_email": contact, "specializations": specs,
        })
        if created:
            obj.origins.set([_country(c) for c in origins])
            obj.destinations.set([_country("TZ")])
        carriers[name] = obj

    methods = {}
    for name, code, cat, eta, max_kg, special, method_carriers, desc in METHODS:
        obj, created = s.get_or_create(ShippingMethod, code=code, defaults={
            "name": name, "category": cat, "estimated_delivery": eta, "max_weight_kg": max_kg,
            "requires_special_handling": special, "description": desc,
        })
        if created:
            obj.carriers.set([carriers[c] for c in method_carriers])
        methods[code] = obj

    profiles = {}
    for name, ptype, handling, desc in PROFILES:
        profiles[name], _ = s.get_or_create(ShippingProfile, name=name, defaults={
            "type": ptype, "handling": handling, "description": desc,
        })

    zones = {}
    for name, ztype, desc, status, cities, regions, countries in ZONES:
        zone, created = s.get_or_create(Zone, name=name, defaults={"type": ztype, "description": desc, "status": status})
        zones[name] = zone
        if not created:
            continue
        for c in cities:
            city = _tz_city(c)
            if not ZoneDestination.objects.filter(city=city).exists():
                s.get_or_create(ZoneDestination, zone=zone, city=city)
        for r in regions:
            region = Region.objects.get(name=r, country__iso2="TZ")
            if not ZoneDestination.objects.filter(region=region).exists():
                s.get_or_create(ZoneDestination, zone=zone, region=region)
        for iso in countries:
            country = _country(iso)
            if not ZoneDestination.objects.filter(country=country).exists():
                s.get_or_create(ZoneDestination, zone=zone, country=country)

    routes = {}
    for origin, dest, method_codes, kind in ROUTES:
        lookup = {}
        if len(origin) == 2:
            lookup.update(origin_country=_country(origin), origin_city=None)
        else:
            city = _tz_city(origin)
            lookup.update(origin_country=city.country, origin_city=city)
        if kind == "zone":
            lookup.update(destination_zone=zones[dest], destination_country=None, destination_city=None)
        elif kind == "city":
            city = _tz_city(dest)
            lookup.update(destination_country=city.country, destination_city=city, destination_zone=None)
        else:
            lookup.update(destination_country=_country(dest), destination_city=None, destination_zone=None)
        route_type = Scope.LOCAL if lookup["origin_country"].iso2 == "TZ" else Scope.INTERNATIONAL
        route, created = s.get_or_create(Route, defaults={"type": route_type}, **lookup)
        if created:
            route.methods.set([methods[c] for c in method_codes])
        routes[(origin, dest)] = route

    for key, method, applies, profile, model, rate, cur, minimum, eta, carrier, status, extra in RULES:
        lookup = {
            "route": routes[key],
            "method": methods[method],
            "applies_to": applies,
            "profile": profiles[profile] if profile else None,
            "product_sku": "",
            "pricing_model": model,
        }
        s.get_or_create(ShippingRule, defaults={
            "rate": D(rate) if rate else None,
            "currency": cur,
            "minimum_charge": D(minimum) if minimum else None,
            "eta_min_days": eta[0],
            "eta_max_days": eta[1],
            "carrier": carriers[carrier] if carrier else None,
            "status": status,
            **extra,
        }, **lookup)

    for key, dest, profile, model, rate, cur, reason, start, end, status in OVERRIDES:
        lookup = {"route": routes[key], "start_date": start, "reason": reason}
        defaults = {
            "profile": profiles[profile] if profile else None,
            "pricing_model": model,
            "rate": D(rate),
            "currency": cur,
            "end_date": end,
            "status": status,
        }
        if dest and dest[0] == "city":
            defaults["destination_city"] = _tz_city(dest[1])
        elif dest:
            defaults["destination_region"] = Region.objects.get(name=dest[1], country__iso2="TZ")
        s.get_or_create(RuleOverride, defaults=defaults, **lookup)

    # The design converts USD at 2,550 TSh (Test Rate: $50 → TSh 127,500).
    if not ExchangeRate.objects.filter(base_currency="USD", quote_currency="TZS").exists():
        s.get_or_create(ExchangeRate, base_currency="USD", quote_currency="TZS", effective_date=date(2026, 1, 1),
                        defaults={"rate": D("2550")})
    return s
