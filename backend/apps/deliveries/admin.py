from django.contrib import admin

from . import models

# Read-only in the admin: statuses change only through the API workflows.
for model in [m for m in vars(models).values() if isinstance(m, type) and issubclass(m, models.models.Model)
              and not m._meta.abstract and m.__module__ == models.__name__]:
    admin.site.register(model, type(f"{model.__name__}Admin", (admin.ModelAdmin,), {
        "readonly_fields": [f.name for f in model._meta.fields if f.name in ("status", "stage", "reference", "cargo_id")],
    }))
