"""Create in-app notifications for staff."""
from __future__ import annotations

from collections.abc import Iterable

from apps.accounts.constants import ACCESS_RANK, Access, StaffLevel
from apps.accounts.models import RolePermission, User

from .models import Notification


def notify(users: Iterable[User] | User | None, *, kind: str, title: str, body: str = "", link: str = "",
           exclude: User | None = None) -> int:
    if users is None:
        return 0
    if isinstance(users, User):
        users = [users]
    rows = [Notification(recipient=u, kind=kind, title=title[:150], body=body[:500], link=link[:255])
            for u in {u.pk: u for u in users if u and u.is_active}.values()
            if not (exclude and u.pk == exclude.pk)]
    Notification.objects.bulk_create(rows)
    return len(rows)


def users_with(module: str, level: str = Access.EDIT):
    """Active staff whose role grants at least `level` on `module` (Top Admins included)."""
    levels = [lv for lv, acc in RolePermission.objects.filter(module=module).values_list("staff_level", "access")
              if ACCESS_RANK[Access(acc)] >= ACCESS_RANK[Access(level)]]
    return User.objects.filter(is_active=True).filter(staff_level__in=[*levels, StaffLevel.TOP_ADMIN]) \
        | User.objects.filter(is_active=True, is_superuser=True)
