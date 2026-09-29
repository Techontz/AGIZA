"""
Expo push notifications to customers' devices (as the previous AGIZA app used).

Messages go out after the transaction commits, on a background thread, so a slow
or failing push service never delays or breaks the request that caused it.
Tokens Expo reports as DeviceNotRegistered are deactivated.
"""
from __future__ import annotations

import json
import logging
import threading
import urllib.request

from django.conf import settings
from django.db import transaction

from .models import PushDevice

logger = logging.getLogger("apps.storefront")
EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
CHUNK = 100
ANDROID_CHANNEL = "messages"


def is_expo_token(token: str) -> bool:
    return token.startswith(("ExponentPushToken[", "ExpoPushToken[")) and token.endswith("]")


def _send(tokens: list[str], title: str, body: str, data: dict):
    for start in range(0, len(tokens), CHUNK):
        batch = tokens[start:start + CHUNK]
        messages = [{"to": t, "title": title, "body": body, "data": data, "sound": "default",
                     "priority": "high", "channelId": ANDROID_CHANNEL} for t in batch]
        req = urllib.request.Request(EXPO_PUSH_URL, data=json.dumps(messages).encode(), method="POST", headers={
            "Accept": "application/json", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=10) as res:  # noqa: S310 - fixed https endpoint
                tickets = json.loads(res.read().decode() or "{}").get("data") or []
        except Exception as exc:  # noqa: BLE001 - push is best effort
            logger.warning("Expo push failed: %s", exc)
            continue
        dead = [batch[i] for i, t in enumerate(tickets) if i < len(batch) and isinstance(t, dict)
                and t.get("status") == "error" and (t.get("details") or {}).get("error") == "DeviceNotRegistered"]
        if dead:
            PushDevice.objects.filter(token__in=dead).update(is_active=False)


def notify_customer(customer, *, title: str, body: str, data: dict | None = None):
    """
    Keep the notification in the customer's in-app inbox, then queue a push to every active device
    of their app account (push is skipped when disabled or without devices).
    """
    if customer is None:
        return
    from .models import CustomerNotification

    CustomerNotification.objects.create(customer=customer, title=title[:150], body=(body or "")[:500],
                                        data=data or {})
    if not settings.EXPO_PUSH_ENABLED:
        return
    account = getattr(customer, "account", None) if customer is not None else None
    if account is None or not account.is_active:
        return
    tokens = list(account.devices.filter(is_active=True).values_list("token", flat=True))
    if not tokens:
        return
    payload = data or {}
    transaction.on_commit(lambda: threading.Thread(target=_send, args=(tokens, title, body, payload),
                                                   daemon=True).start())
