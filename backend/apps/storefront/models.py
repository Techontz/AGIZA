"""
Customer app data. A customer's identity stays the CRM `parties.Customer`; these
models add what self-service needs: a login, phone verification, a cart, the
checkout idempotency record and push-notification devices.
"""
from django.contrib.auth.hashers import check_password, make_password
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q
from django.utils import timezone

from apps.core.models import TimeStampedModel

MAX_LINE_QUANTITY = 100


class CustomerAccount(TimeStampedModel):
    """Login for the customer app (phone + password), one per customer. Never a staff `User`."""

    customer = models.OneToOneField("parties.Customer", on_delete=models.CASCADE, related_name="account")
    phone = models.CharField(max_length=15, unique=True, help_text="Digits with country code, e.g. 255712345678")
    password = models.CharField(max_length=128)
    is_active = models.BooleanField(default=True)
    phone_verified_at = models.DateTimeField(null=True, blank=True)
    last_login = models.DateTimeField(null=True, blank=True)
    session_version = models.PositiveIntegerField(default=1, help_text="Raised to sign out every session")

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"+{self.phone} · {self.customer.full_name}"

    # DRF treats the authenticated principal like a user.
    is_authenticated = True
    is_anonymous = False

    def set_password(self, raw: str):
        self.password = make_password(raw)

    def check_password(self, raw: str) -> bool:
        def upgrade(new_raw):
            self.set_password(new_raw)
            self.save(update_fields=["password"])

        return check_password(raw, self.password, upgrade)

    def token_is_current(self, session_version) -> bool:
        return session_version == self.session_version


class PhoneVerification(models.Model):
    """A one-time code sent by SMS to prove the customer owns a phone number."""

    class Purpose(models.TextChoices):
        REGISTER = "register", "Registration"
        RESET_PASSWORD = "reset_password", "Password reset"

    MAX_ATTEMPTS = 5

    phone = models.CharField(max_length=15, db_index=True)
    purpose = models.CharField(max_length=16, choices=Purpose.choices)
    code_hash = models.CharField(max_length=128)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    consumed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["phone", "purpose", "-created_at"])]

    def __str__(self) -> str:
        return f"+{self.phone} · {self.purpose}"

    @property
    def usable(self) -> bool:
        return self.consumed_at is None and self.attempts < self.MAX_ATTEMPTS and self.expires_at > timezone.now()


class Cart(TimeStampedModel):
    customer = models.OneToOneField("parties.Customer", on_delete=models.CASCADE, related_name="cart")

    def __str__(self) -> str:
        return f"Cart of {self.customer.full_name}"


class CartItem(TimeStampedModel):
    """A variant and quantity. Prices are never stored here: they are read live from the catalogue."""

    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name="items")
    variant = models.ForeignKey("catalog.ProductVariant", on_delete=models.CASCADE, related_name="+")
    quantity = models.PositiveIntegerField(validators=[MinValueValidator(1), MaxValueValidator(MAX_LINE_QUANTITY)])

    class Meta:
        ordering = ["created_at", "id"]
        constraints = [
            models.UniqueConstraint(fields=["cart", "variant"], name="uniq_cart_variant"),
            models.CheckConstraint(name="cart_item_quantity_range",
                                   condition=Q(quantity__gte=1) & Q(quantity__lte=MAX_LINE_QUANTITY)),
        ]

    def __str__(self) -> str:
        return f"{self.quantity}× {self.variant}"


class CheckoutRequest(models.Model):
    """One per idempotency key: repeating a place-order request returns the order it already created."""

    customer = models.ForeignKey("parties.Customer", on_delete=models.CASCADE, related_name="+")
    key = models.CharField(max_length=64)
    order = models.OneToOneField("orders.Order", on_delete=models.CASCADE, related_name="checkout_request")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["customer", "key"], name="uniq_checkout_key_per_customer")]

    def __str__(self) -> str:
        return f"{self.key} → {self.order_id}"


class AppKind(models.TextChoices):
    """Which AGIZA app a device or notification belongs to: sellers use their own app."""

    CUSTOMER = "customer", "Customer app"
    SELLER = "seller", "Seller app"


class PushDevice(TimeStampedModel):
    """An Expo push token of a device the customer signed in on (in the customer or the seller app)."""

    class Platform(models.TextChoices):
        ANDROID = "android", "Android"
        IOS = "ios", "iOS"
        UNKNOWN = "unknown", "Unknown"

    account = models.ForeignKey(CustomerAccount, on_delete=models.CASCADE, related_name="devices")
    token = models.CharField(max_length=255, unique=True)
    platform = models.CharField(max_length=8, choices=Platform.choices, default=Platform.UNKNOWN)
    app = models.CharField(max_length=10, choices=AppKind.choices, default=AppKind.CUSTOMER)
    is_active = models.BooleanField(default=True)
    last_seen_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-last_seen_at"]

    def __str__(self) -> str:
        return f"{self.platform} · {self.account_id}"


class WishlistItem(models.Model):
    """A product the customer saved for later."""

    customer = models.ForeignKey("parties.Customer", on_delete=models.CASCADE, related_name="wishlist")
    product = models.ForeignKey("catalog.Product", on_delete=models.CASCADE, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [models.UniqueConstraint(fields=["customer", "product"], name="uniq_wishlist_product")]

    def __str__(self) -> str:
        return f"{self.customer_id} ♡ {self.product_id}"


class CustomerNotification(models.Model):
    """In-app inbox: every notification is kept here (push is just a way to deliver it). `audience`
    says which app shows it: the customer app, or the seller app for a store owner's notifications."""

    customer = models.ForeignKey("parties.Customer", on_delete=models.CASCADE, related_name="app_notifications")
    audience = models.CharField(max_length=10, choices=AppKind.choices, default=AppKind.CUSTOMER)
    title = models.CharField(max_length=150)
    body = models.CharField(max_length=500, blank=True)
    data = models.JSONField(default=dict, blank=True, help_text="Where it leads: screen, order, return…")
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["customer", "audience", "read_at"])]

    def __str__(self) -> str:
        return f"{self.customer_id}: {self.title}"
