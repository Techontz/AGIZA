from django.db import IntegrityError, transaction

from .models import ReferenceSequence


def next_reference(prefix: str, width: int = 6) -> str:
    """Return the next reference for `prefix`, e.g. next_reference("EXP") -> "EXP-000001"."""
    for _ in range(3):
        try:
            with transaction.atomic():
                seq, _ = ReferenceSequence.objects.select_for_update().get_or_create(prefix=prefix)
                seq.last_value += 1
                seq.save(update_fields=["last_value"])
                return f"{prefix}-{seq.last_value:0{width}d}"
        except IntegrityError:
            # Another transaction created the row first; retry and lock it.
            continue
    raise RuntimeError(f"Could not allocate reference for prefix {prefix!r}")
