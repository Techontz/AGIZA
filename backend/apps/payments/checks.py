"""Deploy-time checks for the Selcom configuration (python manage.py check --deploy)."""
from urllib.parse import urlparse

from django.conf import settings
from django.core.checks import Warning, register

from .selcom import REQUIRED


@register(deploy=True)
def selcom_configuration(app_configs, **kwargs):
    present = [name for name in REQUIRED if getattr(settings, name, "")]
    if not present:
        return []  # mobile money simply isn't offered
    problems = []
    missing = [name for name in REQUIRED if name not in present]
    if missing:
        problems.append(Warning(f"Selcom is partly configured; missing {', '.join(missing)}. Mobile money stays off.",
                                id="payments.W001"))
    for name in ("SELCOM_BASE_PAYMENT_URL", "SELCOM_CALLBACK_BASE_URL"):
        value = getattr(settings, name, "")
        if value and urlparse(value).scheme != "https":
            problems.append(Warning(f"{name} must be an https:// URL.", id="payments.W002"))
    base = getattr(settings, "SELCOM_CALLBACK_BASE_URL", "")
    if base and ("callback" in base or "/cargo/" in base):
        problems.append(Warning(
            "SELCOM_CALLBACK_BASE_URL looks like a full callback URL from the previous server. Set it to this API's "
            "public base URL only (e.g. https://api.agiza.co.tz); /api/payments/selcom/webhook/ is appended.",
            id="payments.W003"))
    return problems
