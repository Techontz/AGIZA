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


def is_demo(obj: models.Model) -> bool:
    return SeedRecord.objects.filter(content_type=ContentType.objects.get_for_model(obj), object_id=str(obj.pk)).exists()


def flush(seed: str, model_order: list[type[models.Model]]) -> dict[str, int]:
    """Delete demo rows of `seed`, model by model in dependency-safe order."""
    removed: dict[str, int] = {}
    for model in model_order:
        ct = ContentType.objects.get_for_model(model)
        ids = list(SeedRecord.objects.filter(seed=seed, content_type=ct).values_list("object_id", flat=True))
        if not ids:
            continue
        count, _ = model.objects.filter(pk__in=ids).delete()
        SeedRecord.objects.filter(seed=seed, content_type=ct).delete()
        removed[model.__name__] = count
    return removed
