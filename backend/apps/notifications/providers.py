"""
Outbound messaging providers (campaigns and chat replies).

A provider is enabled only when its credentials are present in the
environment. Nothing is simulated: when a channel isn't configured, callers
record the message as not sent with the reason.

  Email      Django's email backend (EMAIL_HOST / EMAIL_BACKEND)
  SMS        Africa's Talking      SMS_AT_USERNAME, SMS_AT_API_KEY, SMS_SENDER_ID (optional)
  WhatsApp   WhatsApp Cloud API    WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID
  Facebook   Messenger Send API    FACEBOOK_PAGE_TOKEN
  TikTok     not available for outbound messages (inbound webhook only)
"""
from __future__ import annotations

import json
import logging
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
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
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
    channel = "sms"
    url = "https://api.africastalking.com/version1/messaging"

    @staticmethod
    def configured() -> bool:
        return bool(_env("SMS_AT_USERNAME") and _env("SMS_AT_API_KEY"))

    def send(self, to: str, body: str, subject: str = "") -> str:
        if not self.configured():
            raise NotConfigured("SMS is not configured (set SMS_AT_USERNAME and SMS_AT_API_KEY).")
        fields = {"username": _env("SMS_AT_USERNAME"), "to": to, "message": body}
        if _env("SMS_SENDER_ID"):
            fields["from"] = _env("SMS_SENDER_ID")
        res = _post(self.url, data=urllib.parse.urlencode(fields).encode(),
                    headers={"apiKey": _env("SMS_AT_API_KEY"), "Accept": "application/json",
                             "Content-Type": "application/x-www-form-urlencoded"})
        recipients = res.get("SMSMessageData", {}).get("Recipients", [])
        if not recipients or recipients[0].get("status") not in ("Success", "Sent"):
            raise SendError(json.dumps(res)[:250])
        return recipients[0].get("messageId", "")


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
