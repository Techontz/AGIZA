from .base import *  # noqa: F401,F403

DEBUG = False
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
REST_FRAMEWORK = {**REST_FRAMEWORK, "DEFAULT_THROTTLE_RATES": {"login": "5/min"}}  # noqa: F405
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}

# Uploaded files written by tests go to a throwaway directory, never backend/media.
import tempfile  # noqa: E402

MEDIA_ROOT = Path(tempfile.mkdtemp(prefix="agiza-test-media-"))  # noqa: F405
