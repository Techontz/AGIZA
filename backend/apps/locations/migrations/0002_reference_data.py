"""
Reference data: countries AGIZA operates with, Tanzania's 31 regions,
the Tanzanian cities used in logistics, and the international sourcing hubs.
This is master data, not demo data.
"""
from django.db import migrations

COUNTRIES = [
    # iso2, name, display_name, currency, is_sourcing_origin
    ("TZ", "Tanzania", "Tanzania", "TZS", True),
    ("CN", "China", "China", "CNY", True),
    ("US", "United States", "United States", "USD", True),
    ("GB", "United Kingdom", "United Kingdom", "GBP", True),
    ("AE", "United Arab Emirates", "Dubai, UAE", "AED", True),
    ("IN", "India", "India", "INR", True),
    ("KE", "Kenya", "Kenya", "KES", False),
    ("UG", "Uganda", "Uganda", "UGX", False),
    ("RW", "Rwanda", "Rwanda", "RWF", False),
    ("BI", "Burundi", "Burundi", "BIF", False),
]

TZ_REGIONS = [
    "Arusha", "Dar es Salaam", "Dodoma", "Geita", "Iringa", "Kagera", "Katavi", "Kigoma",
    "Kilimanjaro", "Lindi", "Manyara", "Mara", "Mbeya", "Morogoro", "Mtwara", "Mwanza",
    "Njombe", "Pwani", "Rukwa", "Ruvuma", "Shinyanga", "Simiyu", "Singida", "Songwe",
    "Tabora", "Tanga", "Kaskazini Unguja", "Kusini Unguja", "Mjini Magharibi",
    "Kaskazini Pemba", "Kusini Pemba",
]

# (country iso2, region, city)
CITIES = [
    ("TZ", "Dar es Salaam", "Dar es Salaam"),
    ("TZ", "Mwanza", "Mwanza"),
    ("TZ", "Arusha", "Arusha"),
    ("TZ", "Dodoma", "Dodoma"),
    ("TZ", "Mbeya", "Mbeya"),
    ("TZ", "Morogoro", "Morogoro"),
    ("TZ", "Tanga", "Tanga"),
    ("TZ", "Kilimanjaro", "Moshi"),
    ("TZ", "Iringa", "Iringa"),
    ("TZ", "Tabora", "Tabora"),
    ("TZ", "Kigoma", "Kigoma"),
    ("TZ", "Mara", "Musoma"),
    ("TZ", "Shinyanga", "Shinyanga"),
    ("TZ", "Geita", "Geita"),
    ("TZ", "Kagera", "Bukoba"),
    ("TZ", "Rukwa", "Sumbawanga"),
    ("TZ", "Katavi", "Mpanda"),
    ("TZ", "Ruvuma", "Songea"),
    ("TZ", "Mtwara", "Mtwara"),
    ("TZ", "Lindi", "Lindi"),
    ("TZ", "Singida", "Singida"),
    ("TZ", "Manyara", "Babati"),
    ("TZ", "Njombe", "Njombe"),
    ("TZ", "Simiyu", "Bariadi"),
    ("TZ", "Songwe", "Vwawa"),
    ("TZ", "Pwani", "Kibaha"),
    ("TZ", "Pwani", "Bagamoyo"),
    ("TZ", "Pwani", "Kisarawe"),
    ("TZ", "Pwani", "Mafia"),
    ("TZ", "Mjini Magharibi", "Zanzibar"),
    ("TZ", "Kusini Pemba", "Chake Chake"),
    ("TZ", "Kaskazini Pemba", "Wete"),
    ("CN", "Guangdong", "Guangzhou"),
    ("CN", "Guangdong", "Shenzhen"),
    ("CN", "Zhejiang", "Yiwu"),
    ("AE", "Dubai", "Dubai"),
    ("IN", "Maharashtra", "Mumbai"),
    ("GB", "England", "London"),
    ("US", "New Jersey", "Newark"),
    ("KE", "Nairobi", "Nairobi"),
    ("UG", "Kampala", "Kampala"),
    ("RW", "Kigali", "Kigali"),
    ("BI", "Bujumbura", "Bujumbura"),
]


def seed(apps, schema_editor):
    Country = apps.get_model("locations", "Country")
    Region = apps.get_model("locations", "Region")
    City = apps.get_model("locations", "City")

    countries = {}
    for iso2, name, display, currency, origin in COUNTRIES:
        countries[iso2], _ = Country.objects.get_or_create(
            iso2=iso2,
            defaults={"name": name, "display_name": display, "currency": currency, "is_sourcing_origin": origin},
        )

    for region in TZ_REGIONS:
        Region.objects.get_or_create(country=countries["TZ"], name=region)

    for iso2, region_name, city_name in CITIES:
        region, _ = Region.objects.get_or_create(country=countries[iso2], name=region_name)
        City.objects.get_or_create(region=region, name=city_name, defaults={"country": countries[iso2]})


def unseed(apps, schema_editor):
    for model in ("City", "Region", "Country"):
        apps.get_model("locations", model).objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [("locations", "0001_initial")]
    operations = [migrations.RunPython(seed, unseed)]
