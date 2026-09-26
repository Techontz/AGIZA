from .base import *  # noqa: F401,F403

DEBUG = env.bool("DJANGO_DEBUG", default=True)  # noqa: F405

# Development prints emails (e.g. email campaigns) to the console instead of sending them.
EMAIL_BACKEND = env("EMAIL_BACKEND", default="django.core.mail.backends.console.EmailBackend")  # noqa: F405
