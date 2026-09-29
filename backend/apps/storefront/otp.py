"""
One-time codes sent by SMS for registration and password reset.

Codes are stored hashed, expire after OTP_TTL, allow MAX_ATTEMPTS guesses and can
be requested again only after RESEND_AFTER. When SMS isn't configured and DEBUG is
on, the code is written to the log so the app can be tested locally; in any other
environment an unconfigured SMS provider is an error, never a silent success.
"""
from __future__ import annotations

import logging
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.db import transaction
from django.utils import timezone

from apps.core.workflow import WorkflowError
from apps.notifications.providers import NotConfigured, SendError, SmsProvider

from .models import PhoneVerification

logger = logging.getLogger("apps.storefront")


def mask_phone(phone: str) -> str:
    """For logs: +2557•••••678 (enough to recognise, not enough to use)."""
    digits = "".join(ch for ch in str(phone) if ch.isdigit())
    return f"+{digits[:4]}•••••{digits[-3:]}" if len(digits) > 7 else "+•••"

OTP_TTL = timedelta(minutes=10)
RESEND_AFTER = timedelta(seconds=60)
CODE_LENGTH = 6


def sms_configured() -> bool:
    return SmsProvider.configured()


def _message(code: str, purpose: str) -> str:
    action = "reset your password" if purpose == PhoneVerification.Purpose.RESET_PASSWORD else "verify your phone"
    return f"Your AGIZA code is {code}. Use it to {action}. It expires in {int(OTP_TTL.total_seconds() // 60)} minutes."


def issue(phone: str, purpose: str) -> PhoneVerification:
    """Create and send a code. Raises WorkflowError when asked again too soon or when sending fails."""
    latest = PhoneVerification.objects.filter(phone=phone, purpose=purpose).first()
    if latest and latest.created_at > timezone.now() - RESEND_AFTER:
        wait = int((latest.created_at + RESEND_AFTER - timezone.now()).total_seconds()) + 1
        raise WorkflowError(f"A code was just sent. You can ask for a new one in {wait} seconds.", conflict=True)
    code = "".join(secrets.choice("0123456789") for _ in range(CODE_LENGTH))
    verification = PhoneVerification.objects.create(
        phone=phone, purpose=purpose, code_hash=make_password(code), expires_at=timezone.now() + OTP_TTL
    )
    try:
        SmsProvider().send(f"+{phone}", _message(code, purpose))
    except NotConfigured:
        if not (settings.DEBUG and getattr(settings, "OTP_LOG_CODES", False)):
            verification.delete()
            logger.error("Verification SMS not sent: the SMS provider (Beem) isn't configured")
            raise WorkflowError("Phone verification is unavailable right now. Please try again later.", conflict=True)
        logger.warning("SMS not configured (development): verification code for +%s (%s) is %s", phone, purpose, code)
    except SendError as exc:
        verification.delete()
        logger.error("Sending the verification SMS to %s failed: %s", mask_phone(phone), exc)
        raise WorkflowError("We couldn't send the code by SMS. Check the number and try again.")
    return verification


def consume(phone: str, purpose: str, code: str) -> None:
    """
    Check a code and mark it used. Raises WorkflowError(field="code") when it's wrong or expired.
    Call it outside any enclosing transaction: a wrong guess must stay counted when the error is raised.
    """
    with transaction.atomic():
        verification = (PhoneVerification.objects.select_for_update()
                        .filter(phone=phone, purpose=purpose, consumed_at__isnull=True).first())
        if verification is None or not verification.usable:
            error = "This code has expired. Ask for a new one."
        elif not check_password((code or "").strip(), verification.code_hash):
            verification.attempts += 1
            verification.save(update_fields=["attempts"])
            left = PhoneVerification.MAX_ATTEMPTS - verification.attempts
            error = (f"The code is incorrect. {left} attempt{'s' if left != 1 else ''} left." if left
                     else "Too many wrong attempts. Ask for a new code.")
        else:
            verification.consumed_at = timezone.now()
            verification.save(update_fields=["consumed_at"])
            return
    raise WorkflowError(error, field="code")
