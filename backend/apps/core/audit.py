"""
Audit trail helpers.

`record_audit()` writes an AuditLog row; `AuditedViewSetMixin` does it
automatically for create / update / delete in DRF viewsets, storing a
field-level diff of what changed.
"""
from __future__ import annotations

import datetime
import decimal
import uuid
from typing import Any

from django.conf import settings
from django.contrib.contenttypes.models import ContentType
from django.db import models, transaction
from django.db.models import ProtectedError

SENSITIVE_FIELDS = {"password"}


def _json_safe(value: Any) -> Any:
    if isinstance(value, (datetime.datetime, datetime.date, datetime.time)):
        return value.isoformat()
    if isinstance(value, (decimal.Decimal, uuid.UUID)):
        return str(value)
    if isinstance(value, models.Model):
        return value.pk
    if hasattr(value, "name") and hasattr(value, "url"):  # FieldFile
        return value.name or None
    return value


def snapshot(instance: models.Model) -> dict[str, Any]:
    """Concrete field values of `instance` (FKs as ids), JSON-serializable."""
    data: dict[str, Any] = {}
    for field in instance._meta.concrete_fields:
        if field.name in SENSITIVE_FIELDS:
            continue
        data[field.name] = _json_safe(getattr(instance, field.attname))
    if instance.pk is not None:
        for field in instance._meta.many_to_many:
            data[field.name] = sorted(getattr(instance, field.name).values_list("pk", flat=True))
    return data


def diff(before: dict[str, Any], after: dict[str, Any]) -> dict[str, list[Any]]:
    ignored = {"updated_at"}
    return {
        key: [before.get(key), after.get(key)]
        for key in after
        if key not in ignored and before.get(key) != after.get(key)
    }


def client_ip(request) -> str | None:
    """
    Client IP, resolved like DRF's throttling: with NUM_PROXIES set, only the
    addresses appended by our own proxies are trusted (so a client can't spoof
    the value by sending its own X-Forwarded-For header).
    """
    if request is None:
        return None
    remote = request.META.get("REMOTE_ADDR")
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    num_proxies = settings.REST_FRAMEWORK.get("NUM_PROXIES")
    if not forwarded or num_proxies == 0:
        return remote
    addrs = [a.strip() for a in forwarded.split(",") if a.strip()]
    if num_proxies is None:
        return addrs[0] if addrs else remote
    return addrs[-min(num_proxies, len(addrs))] if addrs else remote


def record_audit(
    *,
    action: str,
    request=None,
    actor=None,
    instance: models.Model | None = None,
    changes: dict | None = None,
    object_repr: str | None = None,
):
    from apps.accounts.models import AuditLog

    if actor is None and request is not None and getattr(request, "user", None) and request.user.is_authenticated:
        actor = request.user

    return AuditLog.objects.create(
        actor=actor,
        action=action,
        content_type=ContentType.objects.get_for_model(instance) if instance is not None else None,
        object_id=str(instance.pk) if instance is not None and instance.pk is not None else "",
        object_repr=(object_repr or (str(instance) if instance is not None else ""))[:255],
        changes=changes or {},
        ip_address=client_ip(request),
        user_agent=(request.META.get("HTTP_USER_AGENT", "")[:500] if request is not None else ""),
    )


class AuditedViewSetMixin:
    """Mixin for ModelViewSets: audits create / update / destroy."""

    def perform_create(self, serializer):
        instance = serializer.save(**self.get_create_kwargs())
        after = snapshot(instance)
        record_audit(
            action="create",
            request=self.request,
            instance=instance,
            changes={k: [None, v] for k, v in after.items() if v not in (None, "")},
        )

    def get_create_kwargs(self) -> dict:
        return {}

    def perform_update(self, serializer):
        before = snapshot(serializer.instance)
        instance = serializer.save()
        changes = diff(before, snapshot(instance))
        if changes:
            record_audit(action="update", request=self.request, instance=instance, changes=changes)

    def perform_destroy(self, instance):
        from .exceptions import ConflictError

        try:
            with transaction.atomic():
                record_audit(action="delete", request=self.request, instance=instance, changes={})
                instance.delete()
        except ProtectedError as exc:
            count = len(exc.protected_objects)
            label = instance._meta.verbose_name
            raise ConflictError(
                f"This {label} is used by {count} other record{'s' if count != 1 else ''}. "
                "Deactivate it instead of deleting it."
            ) from exc
