"""Helpers for idempotent, removable demo data (see SeedRecord)."""
from django.contrib.contenttypes.models import ContentType
from django.db import models

from .models import SeedRecord


class Seeder:
    """get_or_create wrapper that registers rows it creates as demo data."""

    def __init__(self, seed: str, stdout=None):
        self.seed = seed
        self.created = 0
        self.existing = 0
        self.stdout = stdout

    def register(self, obj: models.Model):
        SeedRecord.objects.get_or_create(
            content_type=ContentType.objects.get_for_model(obj), object_id=str(obj.pk), defaults={"seed": self.seed}
        )

    def get_or_create(self, model: type[models.Model], defaults: dict | None = None, **lookup):
        obj, created = model.objects.get_or_create(defaults=defaults or {}, **lookup)
        if created:
            self.register(obj)
            self.created += 1
        else:
            self.existing += 1
        return obj, created


def seeded_ids(seed: str, model: type[models.Model]) -> list[int]:
    """Primary keys of the `model` rows registered by demo set `seed`."""
    ct = ContentType.objects.get_for_model(model)
    return [int(pk) for pk in SeedRecord.objects.filter(seed=seed, content_type=ct).values_list("object_id", flat=True)]


def is_demo(obj: models.Model) -> bool:
    return SeedRecord.objects.filter(content_type=ContentType.objects.get_for_model(obj), object_id=str(obj.pk)).exists()


def flush(seed: str | list[str], model_order: list[type[models.Model]]) -> dict[str, int]:
    """Delete demo rows of `seed` (or several seeds together), model by model in dependency-safe order."""
    seeds = [seed] if isinstance(seed, str) else list(seed)
    removed: dict[str, int] = {}
    for model in model_order:
        ct = ContentType.objects.get_for_model(model)
        records = SeedRecord.objects.filter(seed__in=seeds, content_type=ct)
        ids = list(records.values_list("object_id", flat=True))
        if not ids:
            continue
        rows = model.objects.filter(pk__in=ids)
        _remove_derived(model, rows)
        file_fields = [f.name for f in model._meta.fields if isinstance(f, models.FileField)]
        for row in rows if file_fields else ():
            for name in file_fields:
                stored = getattr(row, name)
                if stored:
                    stored.delete(save=False)  # demo files go with their rows
        if any(f.is_relation and f.related_model is model for f in model._meta.fields):
            # Self-referencing rows (e.g. subcategories): delete children before parents.
            count = sum(row.delete()[0] for row in rows.order_by("-pk"))
        else:
            count, _ = rows.delete()
        records.delete()
        removed[model.__name__] = removed.get(model.__name__, 0) + count
    return removed


def _remove_derived(model, rows):
    """
    Records the platform derives from demo orders (vendor ledger rows, pickup tasks, order
    adjustments) are demo data too. Real ledger rows are never deleted: this runs only for rows
    registered as demo data, from `seed_demo_data --flush`.
    """
    from apps.orders.models import OrderAdjustment

    if model._meta.label == "returns.ReturnRequest":
        OrderAdjustment.objects.filter(return_request__in=rows).delete()  # a demo return's refund adjustment
        return
    if model._meta.label != "orders.Order":
        return
    from apps.deliveries.models import PickupTask
    from apps.marketplace.models import VendorLedgerEntry

    VendorLedgerEntry.objects.filter(fulfillment__order__in=rows).delete()  # queryset delete: demo only
    PickupTask.objects.filter(order__in=rows).delete()
    OrderAdjustment.objects.filter(order__in=rows).delete()
