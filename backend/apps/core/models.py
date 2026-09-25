from django.db import models


class TimeStampedModel(models.Model):
    """Abstract base adding creation/modification timestamps."""

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class ReferenceSequence(models.Model):
    """
    Per-prefix counter used to generate human-readable references
    (EXP-000001, CUST-000001, WH-TZ-001 ...). Rows are locked with
    SELECT ... FOR UPDATE so concurrent requests never collide.
    """

    prefix = models.CharField(max_length=32, unique=True)
    last_value = models.PositiveBigIntegerField(default=0)

    class Meta:
        verbose_name = "reference sequence"

    def __str__(self) -> str:
        return f"{self.prefix}: {self.last_value}"


class SeedRecord(models.Model):
    """
    Registry of rows created by `manage.py seed_demo_data`. Demo data is
    identified here (not by name), so `seed_demo_data --flush` removes exactly
    what the seeder created and never touches real records.
    """

    content_type = models.ForeignKey("contenttypes.ContentType", on_delete=models.CASCADE)
    object_id = models.CharField(max_length=64)
    seed = models.CharField(max_length=40, help_text="Seed set that created the row, e.g. 'shipping'")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["content_type", "object_id"], name="uniq_seed_record")]
        indexes = [models.Index(fields=["seed"])]

    def __str__(self) -> str:
        return f"{self.seed}: {self.content_type.model} #{self.object_id}"
