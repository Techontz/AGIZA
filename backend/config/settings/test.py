from .base import *  # noqa: F401,F403

DEBUG = False
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
REST_FRAMEWORK = {**REST_FRAMEWORK, "DEFAULT_THROTTLE_RATES": {  # noqa: F405
    "login": "5/min", "anon": "1000/min", "user": "100000/min",
    "customer": "100000/min", "customer_login": "1000/min", "otp": "1000/min", "checkout": "1000/min"}}
EXPO_PUSH_ENABLED = False
SELCOM_VENDOR_CODE = SELCOM_API_KEY = SELCOM_SECRET_KEY = SELCOM_BASE_PAYMENT_URL = ""
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}

# Uploaded files written by tests go to a throwaway directory, never backend/media.
import tempfile  # noqa: E402

MEDIA_ROOT = Path(tempfile.mkdtemp(prefix="agiza-test-media-"))  # noqa: F405
