from datetime import date, datetime, time, timedelta

from django.utils import timezone


def local_day_bounds(day: date) -> tuple[datetime, datetime]:
    """[start, end) of `day` in the current time zone.

    Equivalent to a `__date=day` lookup, but a plain range comparison: it needs no
    time-zone tables in the database (MySQL's CONVERT_TZ does) and can use indexes.
    """
    start = timezone.make_aware(datetime.combine(day, time.min))
    return start, timezone.make_aware(datetime.combine(day + timedelta(days=1), time.min))
