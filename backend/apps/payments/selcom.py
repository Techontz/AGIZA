"""
Selcom Checkout API client (the gateway AGIZA already used for mobile-money payments).

Requests are signed as Selcom requires: `Authorization: SELCOM base64(api key)` and
an HS256 `Digest` over "timestamp=...&<field>=<value>..." for the `Signed-Fields`.

Settings: SELCOM_VENDOR_CODE, SELCOM_API_KEY, SELCOM_SECRET_KEY, SELCOM_BASE_PAYMENT_URL
(e.g. https://apigw.selcommobile.com/v1) and SELCOM_CALLBACK_BASE_URL (this API's public URL).
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import urllib.error
import urllib.parse
import urllib.request

from django.conf import settings
from django.utils import timezone

logger = logging.getLogger("apps.payments")
TIMEOUT = 30


class SelcomError(Exception):
    pass


def configured() -> bool:
    return all(getattr(settings, name, "") for name in
               ("SELCOM_VENDOR_CODE", "SELCOM_API_KEY", "SELCOM_SECRET_KEY", "SELCOM_BASE_PAYMENT_URL"))


def _timestamp() -> str:
    return timezone.localtime().isoformat(timespec="seconds")


def digest(secret: str, timestamp: str, payload: dict, signed_fields: list[str]) -> str:
    parts = [f"timestamp={timestamp}", *(f"{name}={payload.get(name, '')}" for name in signed_fields)]
    mac = hmac.new(secret.encode(), "&".join(parts).encode(), hashlib.sha256).digest()
    return base64.b64encode(mac).decode()


def _headers(payload: dict, signed_fields: list[str]) -> dict:
    timestamp = _timestamp()
    return {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": f"SELCOM {base64.b64encode(settings.SELCOM_API_KEY.encode()).decode()}",
        "Digest-Method": "HS256",
        "Digest": digest(settings.SELCOM_SECRET_KEY, timestamp, payload, signed_fields),
        "Timestamp": timestamp,
        "Signed-Fields": ",".join(signed_fields),
    }


def _call(method: str, path: str, payload: dict, signed_fields: list[str]) -> dict:
    url = f"{settings.SELCOM_BASE_PAYMENT_URL.rstrip('/')}/{path}"
    data = None
    if method == "GET":
        url = f"{url}?{urllib.parse.urlencode(payload)}"
    else:
        data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers=_headers(payload, signed_fields), method=method)  # noqa: S310
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as res:  # noqa: S310 - configured https endpoint
            return json.loads(res.read().decode() or "{}")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode(errors="replace")[:500]
        logger.error("Selcom %s %s failed: HTTP %s %s", method, path, exc.code, body)
        try:
            return json.loads(body)
        except ValueError:
            raise SelcomError(f"HTTP {exc.code}") from exc
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        logger.error("Selcom %s %s failed: %s", method, path, exc)
        raise SelcomError(str(exc)[:200]) from exc


def webhook_url() -> str:
    base = (getattr(settings, "SELCOM_CALLBACK_BASE_URL", "") or "").rstrip("/")
    return f"{base}/api/payments/selcom/webhook/"


def create_order(*, order_id: str, amount: str, currency: str, buyer_name: str, buyer_email: str,
                 buyer_phone: str, remarks: str, items: int) -> tuple[dict, dict]:
    """Returns (request payload, response). Success: response["result"] == "SUCCESS"."""
    payload = {
        "vendor": settings.SELCOM_VENDOR_CODE,
        "order_id": order_id,
        "buyer_name": buyer_name,
        "buyer_email": buyer_email,
        "buyer_phone": buyer_phone,
        "amount": amount,
        "currency": currency,
        "merchant_remarks": remarks,
        "no_of_items": items,
        "webhook": base64.b64encode(webhook_url().encode()).decode(),
    }
    return payload, _call("POST", "checkout/create-order-minimal", payload,
                          ["vendor", "order_id", "amount", "currency", "webhook"])


def gateway_url(response: dict) -> str:
    rows = response.get("data") or [{}]
    encoded = (rows[0] if isinstance(rows, list) and rows else {}).get("payment_gateway_url", "")
    try:
        return base64.b64decode(encoded).decode() if encoded else ""
    except (ValueError, UnicodeDecodeError):
        return encoded


def order_status(order_id: str) -> dict:
    """The gateway's own record of the order: {"payment_status": "COMPLETED"|"PENDING"|..., "amount", "transid"}."""
    response = _call("GET", "checkout/order-status", {"order_id": order_id}, ["order_id"])
    rows = response.get("data") or []
    row = rows[0] if isinstance(rows, list) and rows else {}
    return {"result": response.get("result"), "raw": response, **row}
