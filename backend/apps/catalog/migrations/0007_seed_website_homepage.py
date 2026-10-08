"""The website home page as it was laid out in code, as editable sections (only when none exist yet)."""
from django.db import migrations

DEFAULT_SECTIONS = [
    {"kind": "banners", "title": "", "limit": 6},
    {"kind": "products", "title": "Featured products", "source": "featured", "fill_with_newest": True, "limit": 12},
    {"kind": "products", "title": "Ofa kali deals", "source": "deals", "limit": 12},
    {"kind": "services", "title": ""},
    {"kind": "products", "title": "Popular right now", "source": "popular", "limit": 12},
    {"kind": "categories", "title": "Top Categories", "limit": 8},
    {"kind": "category_rows", "title": "", "limit": 3},
    {"kind": "products", "title": "New arrivals", "source": "newest", "limit": 12},
    {"kind": "stores", "title": "Stores on AGIZA", "limit": 6},
]


def seed(apps, schema_editor):
    HomeSection = apps.get_model("catalog", "HomeSection")
    if HomeSection.objects.exists():
        return
    for position, row in enumerate(DEFAULT_SECTIONS, start=1):
        HomeSection.objects.create(sort_order=position, **row)


class Migration(migrations.Migration):
    dependencies = [("catalog", "0006_website_homepage")]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
