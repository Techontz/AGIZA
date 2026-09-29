"""
Outbound messaging providers (campaigns and chat replies).

A provider is enabled only when its credentials are present in the
environment. Nothing is simulated: when a channel isn't configured, callers
record the message as not sent with the reason.

  Email      Django's email backend (EMAIL_HOST / EMAIL_BACKEND)
  SMS        Beem Africa           BEEM_API_KEY, BEEM_SECRET_KEY, BEEM_SENDER_ID
  WhatsApp   WhatsApp Cloud API    WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID
  Facebook   Messenger Send API    FACEBOOK_PAGE_TOKEN
  TikTok     not available for outbound messages (inbound webhook only)
"""
from __future__ import annotations

import base64
import json
import logging
import re
import urllib.error
import urllib.parse
import urllib.request

from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger("apps.notifications")
TIMEOUT = 10


class NotConfigured(Exception):
    pass


class SendError(Exception):
    pass


def _env(name: str) -> str:
    return getattr(settings, name, "") or ""


def _post(url: str, *, data: bytes, headers: dict) -> dict:
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")  # noqa: S310 - fixed https URLs
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as res:  # noqa: S310 - fixed https endpoints
            return json.loads(res.read().decode() or "{}")
    except Exception as exc:  # network errors, HTTP errors
        raise SendError(str(exc)[:250]) from exc


class EmailProvider:
    channel = "email"

    @staticmethod
    def configured() -> bool:
        backend = settings.EMAIL_BACKEND
        return (bool(_env("EMAIL_HOST")) and "smtp" in backend) or "console" in backend or "locmem" in backend

    def send(self, to: str, body: str, subject: str = "") -> str:
        if not self.configured():
            raise NotConfigured("Email is not configured (set EMAIL_HOST).")
        send_mail(subject or "Agiza", body, settings.DEFAULT_FROM_EMAIL, [to], fail_silently=False)
        return ""


class SmsProvider:
    """
    Beem Africa SMS (the provider AGIZA already used): POST /v1/send with HTTP Basic auth
    (API key : secret key), the registered sender ID as `source_addr`, digits-only numbers.
    Credentials never reach the logs; only Beem's own error message is kept.
    """

    channel = "sms"
    url = "https://apisms.beem.africa/v1/send"

    @staticmethod
    def configured() -> bool:
        return bool(_env("BEEM_API_KEY") and _env("BEEM_SECRET_KEY") and _env("BEEM_SENDER_ID"))

    @staticmethod
    def recipient(to: str) -> str:
        """"+255 712-345 678" and "0712345678" both become "255712345678" (Beem wants digits with country code)."""
        digits = re.sub(r"\D", "", to or "")
        if len(digits) == 10 and digits.startswith("0"):
            digits = "255" + digits[1:]
        if not 10 <= len(digits) <= 15:
            raise SendError("Not a valid phone number for SMS.")
        return digits

    def send(self, to: str, body: str, subject: str = "") -> str:
        if not self.configured():
            raise NotConfigured("SMS is not configured (set BEEM_API_KEY, BEEM_SECRET_KEY and BEEM_SENDER_ID).")
        payload = {
            "source_addr": _env("BEEM_SENDER_ID"),
            "schedule_time": "",
            "encoding": 0,
            "message": body,
            "recipients": [{"recipient_id": 1, "dest_addr": self.recipient(to)}],
        }
        token = base64.b64encode(f"{_env('BEEM_API_KEY')}:{_env('BEEM_SECRET_KEY')}".encode()).decode()
        req = urllib.request.Request(self.url, data=json.dumps(payload).encode(), method="POST", headers={  # noqa: S310 - fixed https URL
            "Authorization": f"Basic {token}", "Content-Type": "application/json", "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as res:  # noqa: S310 - fixed https endpoint
                data = json.loads(res.read().decode() or "{}")
        except urllib.error.HTTPError as exc:
            raise SendError(f"Beem HTTP {exc.code}: {_beem_error(exc)}") from exc
        except Exception as exc:  # network errors, timeouts, invalid JSON
            raise SendError(f"Beem unreachable: {str(exc)[:200]}") from exc
        if not data.get("successful") or data.get("valid", 1) < 1:
            raise SendError(f"Beem refused the message: {str(data.get('message') or data)[:200]}")
        return str(data.get("request_id") or "")


def _beem_error(exc) -> str:
    try:
        body = json.loads(exc.read().decode() or "{}")
    except Exception:  # noqa: BLE001 - the status code is enough
        return exc.reason or ""
    return str(body.get("message") or body.get("error") or body)[:200]


class WhatsAppProvider:
    channel = "whatsapp"

    @staticmethod
    def configured() -> bool:
        return bool(_env("WHATSAPP_TOKEN") and _env("WHATSAPP_PHONE_NUMBER_ID"))

    def send(self, to: str, body: str, subject: str = "") -> str:
        if not self.configured():
            raise NotConfigured("WhatsApp is not connected (set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID).")
        url = f"https://graph.facebook.com/v20.0/{_env('WHATSAPP_PHONE_NUMBER_ID')}/messages"
        payload = {"messaging_product": "whatsapp", "to": to.lstrip("+"), "type": "text", "text": {"body": body}}
        res = _post(url, data=json.dumps(payload).encode(),
                    headers={"Authorization": f"Bearer {_env('WHATSAPP_TOKEN')}", "Content-Type": "application/json"})
        return (res.get("messages") or [{}])[0].get("id", "")


class FacebookProvider:
    channel = "facebook"

    @staticmethod
    def configured() -> bool:
        return bool(_env("FACEBOOK_PAGE_TOKEN"))

    def send(self, to: str, body: str, subject: str = "") -> str:
        if not self.configured():
            raise NotConfigured("Facebook Messenger is not connected (set FACEBOOK_PAGE_TOKEN).")
        url = f"https://graph.facebook.com/v20.0/me/messages?access_token={urllib.parse.quote(_env('FACEBOOK_PAGE_TOKEN'))}"
        payload = {"recipient": {"id": to}, "messaging_type": "RESPONSE", "message": {"text": body}}
        res = _post(url, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
        return res.get("message_id", "")


class UnavailableProvider:
    def __init__(self, channel: str, reason: str):
        self.channel = channel
        self.reason = reason

    @staticmethod
    def configured() -> bool:
        return False

    def send(self, to: str, body: str, subject: str = "") -> str:
        raise NotConfigured(self.reason)


PROVIDERS = {
    "email": EmailProvider,
    "sms": SmsProvider,
    "whatsapp": WhatsAppProvider,
    "facebook": FacebookProvider,
}


def get_provider(channel: str):
    if channel == "tiktok":
        return UnavailableProvider("tiktok", "TikTok doesn't offer outbound messaging for this account; "
                                             "reply in the TikTok app.")
    if channel == "web":
        return UnavailableProvider("web", "Web chat messages are delivered when the customer opens the chat.")
    cls = PROVIDERS.get(channel)
    return cls() if cls else UnavailableProvider(channel, f"No provider for {channel}.")


def status() -> dict[str, bool]:
    """Which channels are connected (for the UI)."""
    return {name: cls.configured() for name, cls in PROVIDERS.items()} | {"tiktok": False, "web": True}
