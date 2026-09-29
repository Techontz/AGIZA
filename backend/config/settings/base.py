"""
Base settings shared by every environment.

All secrets and host-specific values come from environment variables
(optionally loaded from backend/.env). Nothing sensitive lives in source.
"""
from datetime import timedelta
from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env()
environ.Env.read_env(BASE_DIR / ".env", overwrite=False)

SECRET_KEY = env("DJANGO_SECRET_KEY")
DEBUG = env.bool("DJANGO_DEBUG", default=False)
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third party
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "django_filters",
    "drf_spectacular",
    # AGIZA
    "apps.core",
    "apps.accounts",
    "apps.locations",
    "apps.parties",
    "apps.shipping_engine",
    "apps.quotes",
    "apps.orders",
    "apps.procurement",
    "apps.shipping",
    "apps.deliveries",
    "apps.returns",
    "apps.tasks",
    "apps.catalog",
    "apps.inventory",
    "apps.finance",
    "apps.crm",
    "apps.chat",
    "apps.notifications",
    "apps.payments",
    "apps.storefront",
    "apps.marketplace",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

DATABASES = {"default": env.db("DATABASE_URL")}
DATABASES["default"]["ATOMIC_REQUESTS"] = False
DATABASES["default"]["CONN_MAX_AGE"] = env.int("DB_CONN_MAX_AGE", default=60)
if DATABASES["default"]["ENGINE"] == "django.db.backends.mysql":
    # MySQL 8: full Unicode, reject invalid data instead of truncating it, and the isolation
    # level Django is designed for (row locks in select_for_update behave as on PostgreSQL).
    DATABASES["default"].setdefault("OPTIONS", {}).update({
        "charset": "utf8mb4",
        "init_command": "SET sql_mode='STRICT_TRANS_TABLES'",
        "isolation_level": "read committed",
    })
    DATABASES["default"]["TEST"] = {"CHARSET": "utf8mb4", "COLLATION": "utf8mb4_0900_ai_ci"}

AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 10}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Africa/Dar_es_Salaam"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "media/"
MEDIA_ROOT = Path(env("MEDIA_ROOT", default=str(BASE_DIR / "media")))

# Uploaded files (photos, signatures, documents, product images). Local disk by
# default; set DJANGO_FILE_STORAGE=storages.backends.s3.S3Storage (install
# django-storages[s3]) with AWS_* variables for S3-compatible storage. Files are
# always served through authenticated API views, never public URLs.
STORAGES = {
    "default": {"BACKEND": env("DJANGO_FILE_STORAGE", default="django.core.files.storage.FileSystemStorage")},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}
AWS_STORAGE_BUCKET_NAME = env("AWS_STORAGE_BUCKET_NAME", default="")
AWS_S3_ENDPOINT_URL = env("AWS_S3_ENDPOINT_URL", default=None)
AWS_S3_REGION_NAME = env("AWS_S3_REGION_NAME", default=None)
AWS_DEFAULT_ACL = None
AWS_QUERYSTRING_AUTH = True
AWS_S3_FILE_OVERWRITE = False

# Request size limits (file bodies are limited per endpoint: 8 MB per file).
DATA_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024
DATA_UPLOAD_MAX_NUMBER_FIELDS = 2000

# Security headers that are safe in every environment (HTTPS-only ones are in prod.py).
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"
ADMIN_URL = env("DJANGO_ADMIN_URL", default="admin/")

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --------------------------------------------------------------------------- #
# Django REST Framework
# --------------------------------------------------------------------------- #
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_PAGINATION_CLASS": "apps.core.pagination.StandardPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "apps.core.exceptions.api_exception_handler",
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.ScopedRateThrottle",
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "login": env("THROTTLE_LOGIN_RATE", default="10/min"),
        "anon": env("THROTTLE_ANON_RATE", default="60/min"),
        "user": env("THROTTLE_USER_RATE", default="1200/min"),
        # Customer app
        "customer": env("THROTTLE_CUSTOMER_RATE", default="600/min"),
        "customer_login": env("THROTTLE_CUSTOMER_LOGIN_RATE", default="10/min"),
        "otp": env("THROTTLE_OTP_RATE", default="5/min"),
        "checkout": env("THROTTLE_CHECKOUT_RATE", default="20/min"),
    },
    # Number of trusted reverse proxies in front of Django (Next.js BFF, nginx...).
    # DRF uses it to pick the real client IP from X-Forwarded-For for throttling.
    "NUM_PROXIES": env.int("DJANGO_NUM_PROXIES", default=None),
    "DATETIME_FORMAT": "iso-8601",
    "COERCE_DECIMAL_TO_STRING": True,
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=env.int("JWT_ACCESS_MINUTES", default=15)),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=env.int("JWT_REFRESH_DAYS", default=7)),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
}

# Customer app sessions (separate token types from staff; see apps.storefront.auth).
CUSTOMER_JWT_ACCESS_MINUTES = env.int("CUSTOMER_JWT_ACCESS_MINUTES", default=30)
CUSTOMER_JWT_REFRESH_DAYS = env.int("CUSTOMER_JWT_REFRESH_DAYS", default=60)

SPECTACULAR_SETTINGS = {
    "TITLE": "AGIZA Platform API",
    "DESCRIPTION": "Backend API for the AGIZA logistics & commerce admin platform.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    "SCHEMA_PATH_PREFIX": r"/api/",
    "ENUM_NAME_OVERRIDES": {
        "CurrencyEnum": "apps.shipping_engine.constants.Currency",
        "ActiveStatusEnum": "apps.shipping_engine.constants.Status",
        "ZoneStatusEnum": "apps.shipping_engine.constants.ZoneStatus",
        "ExchangeRateSourceEnum": "apps.shipping_engine.constants.ExchangeRateSource",
        "VolumetricDivisorEnum": "apps.shipping_engine.constants.VolumetricDivisor",
        "ScopeEnum": "apps.shipping_engine.constants.Scope",
        "WarehouseTypeEnum": "apps.locations.models.Warehouse.Type",
        "WarehouseStatusEnum": "apps.locations.models.Warehouse.Status",
        "OrderDepartmentEnum": "apps.orders.models.Department",
        "StaffDepartmentEnum": "apps.accounts.constants.Department",
        "ExpressPriorityEnum": "apps.orders.models.Priority",
        "EquipmentPriorityEnum": [("high", "High"), ("medium", "Medium"), ("low", "Low")],
        "QuoteServiceTypeEnum": "apps.quotes.models.ServiceType",
        "InternationalServiceTypeEnum": "apps.orders.models.InternationalDetails.ServiceType",
        "EquipmentServiceTypeEnum": "apps.orders.models.EquipmentDetails.ServiceType",
        "ClassificationEnum": "apps.orders.models.Classification",
        "PaymentMethodEnum": "apps.orders.models.Payment.Method",
        "ProcurementStatusEnum": "apps.procurement.models.ProcurementStatus",
        "ProcurementExceptionEnum": "apps.procurement.models.ExceptionFlag",
        "ShipmentStatusEnum": "apps.shipping.models.ShipmentStatus",
        "ShipmentAlertEnum": "apps.shipping.models.ShipmentAlert",
        "ParcelStageEnum": "apps.shipping.models.ParcelStage",
        "DeliveryStatusEnum": "apps.deliveries.models.DeliveryStatus",
        "DeliveryExceptionEnum": "apps.deliveries.models.ExceptionFlag",
        "ReturnStatusEnum": "apps.returns.models.ReturnStatus",
        "ReturnExceptionEnum": "apps.returns.models.ExceptionFlag",
        "TaskStatusEnum": "apps.tasks.models.TaskStatus",
        "TaskDepartmentEnum": "apps.tasks.models.TaskDepartment",
        "PaymentKindEnum": "apps.orders.models.Payment.Kind",
        "WalletTransactionKindEnum": "apps.finance.models.WalletTransaction.Kind",
        "WalletTransactionSourceEnum": "apps.finance.models.WalletTransaction.Source",
        "StockMovementKindEnum": "apps.inventory.models.StockMovement.Kind",
        "ShipmentEventKindEnum": "apps.shipping.models.ShipmentEvent.Kind",
        "TaskActivityKindEnum": "apps.tasks.models.TaskActivity.Kind",
        "InvoiceStatusEnum": "apps.finance.models.InvoiceStatus",
        "InvoiceSourceEnum": "apps.finance.models.Invoice.Source",
        "InstallmentPlanStatusEnum": "apps.finance.models.PlanStatus",
        "InstallmentStatusEnum": "apps.finance.models.Installment.Status",
        "ProductStatusEnum": "apps.catalog.models.ProductStatus",
        "VariantStatusEnum": "apps.catalog.models.VariantStatus",
        "ParcelSourceEnum": "apps.shipping.models.ParcelSource",
        "OriginEstimateMethodEnum": "apps.catalog.models.OriginEstimate.Method",
        "VendorProfitTypeEnum": "apps.catalog.models.Vendor.ProfitType",
        "ChatChannelEnum": "apps.chat.models.Channel",
        "CampaignChannelEnum": "apps.crm.models.Campaign.Channel",
        "ConversationDepartmentEnum": "apps.chat.models.Conversation.Department",
        "EscalationTargetEnum": [("management", "management"), ("procurement", "procurement"),
                                 ("finance", "finance"), ("sales", "sales"), ("support", "support"),
                                 ("delivery", "delivery")],
        # Input subsets: refunds and wallet payments have their own endpoints.
        "PaymentKindInputEnum": [("advance", "Advance"), ("installment", "Installment"), ("balance", "Balance / Full")],
        "PaymentMethodInputEnum": [("cash", "Cash"), ("mobile_money", "Mobile Money"),
                                   ("bank_transfer", "Bank Transfer"), ("card", "Card"), ("other", "Other")],
    },
}

# Browsers never call Django directly (the Next.js server proxies requests and the
# customer app is native), so CORS stays closed.

# --------------------------------------------------------------------------- #
# Logging
# --------------------------------------------------------------------------- #
LOG_LEVEL = env("LOG_LEVEL", default="INFO")
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "standard": {"format": "%(asctime)s %(levelname)s %(name)s %(message)s"},
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "standard"},
    },
    "root": {"handlers": ["console"], "level": LOG_LEVEL},
    "loggers": {
        "django.db.backends": {"level": "WARNING"},
        "apps": {"level": LOG_LEVEL, "propagate": True},
    },
}

# Bootstrap admin (used by `manage.py bootstrap_admin`)
BOOTSTRAP_ADMIN_EMAIL = env("BOOTSTRAP_ADMIN_EMAIL", default="")
BOOTSTRAP_ADMIN_PASSWORD = env("BOOTSTRAP_ADMIN_PASSWORD", default="")
BOOTSTRAP_ADMIN_NAME = env("BOOTSTRAP_ADMIN_NAME", default="Agiza Admin")


# --------------------------------------------------------------------------- #
# Messaging channels (all optional: a channel is disabled until configured)
# --------------------------------------------------------------------------- #
EMAIL_BACKEND = env("EMAIL_BACKEND", default="django.core.mail.backends.smtp.EmailBackend")
EMAIL_HOST = env("EMAIL_HOST", default="")
EMAIL_PORT = env.int("EMAIL_PORT", default=587)
EMAIL_HOST_USER = env("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default="")
EMAIL_USE_TLS = env.bool("EMAIL_USE_TLS", default=True)
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="Agiza <no-reply@agiza.co.tz>")

# Beem Africa SMS (campaigns and the customer app's verification codes)
BEEM_API_KEY = env("BEEM_API_KEY", default="")
BEEM_SECRET_KEY = env("BEEM_SECRET_KEY", default="")
BEEM_SENDER_ID = env("BEEM_SENDER_ID", default="")

WHATSAPP_TOKEN = env("WHATSAPP_TOKEN", default="")
WHATSAPP_PHONE_NUMBER_ID = env("WHATSAPP_PHONE_NUMBER_ID", default="")
WHATSAPP_VERIFY_TOKEN = env("WHATSAPP_VERIFY_TOKEN", default="")
WHATSAPP_APP_SECRET = env("WHATSAPP_APP_SECRET", default="")

FACEBOOK_PAGE_TOKEN = env("FACEBOOK_PAGE_TOKEN", default="")
FACEBOOK_VERIFY_TOKEN = env("FACEBOOK_VERIFY_TOKEN", default="")
FACEBOOK_APP_SECRET = env("FACEBOOK_APP_SECRET", default="")

TIKTOK_CLIENT_SECRET = env("TIKTOK_CLIENT_SECRET", default="")


# --------------------------------------------------------------------------- #
# Customer app: online payments and push notifications (optional)
# --------------------------------------------------------------------------- #
# Selcom Checkout (mobile money / card). Mobile-money payment is offered only when all four are set.
SELCOM_VENDOR_CODE = env("SELCOM_VENDOR_CODE", default="")
SELCOM_API_KEY = env("SELCOM_API_KEY", default="")
SELCOM_SECRET_KEY = env("SELCOM_SECRET_KEY", default="")
SELCOM_BASE_PAYMENT_URL = env("SELCOM_BASE_PAYMENT_URL", default="")
# Public base URL of this API, for Selcom's payment notifications (e.g. https://api.agiza.co.tz).
SELCOM_CALLBACK_BASE_URL = env("SELCOM_CALLBACK_BASE_URL", default="")
SELCOM_FALLBACK_BUYER_EMAIL = env("SELCOM_FALLBACK_BUYER_EMAIL", default="payments@agiza.co.tz")

# Public website (agiza_web). Its server renders catalogue pages by calling this API from one
# address; with this shared secret (header X-Storefront-Key) those public GET reads skip the
# per-IP anonymous limit. Empty = disabled. Never give it to browsers or apps.
STOREFRONT_SERVER_KEY = env("STOREFRONT_SERVER_KEY", default="")

# Expo push notifications to the customer app.
EXPO_PUSH_ENABLED = env.bool("EXPO_PUSH_ENABLED", default=True)
