import os  # noqa: E402

from .base import *  # noqa: F401,F403

if os.environ.get("DJANGO_ENV", "").lower() == "production":
    raise RuntimeError("config.settings.dev must not be used in production: set DJANGO_SETTINGS_MODULE="
                       "config.settings.prod")

DEBUG = env.bool("DJANGO_DEBUG", default=True)  # noqa: F405
OTP_LOG_CODES = DEBUG

# Development prints emails (e.g. email campaigns) to the console instead of sending them.
EMAIL_BACKEND = env("EMAIL_BACKEND", default="django.core.mail.backends.console.EmailBackend")  # noqa: F405
