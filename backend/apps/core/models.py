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
