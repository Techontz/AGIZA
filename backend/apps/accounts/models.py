from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.contrib.contenttypes.models import ContentType
from django.db import models
from django.utils import timezone

from apps.core.models import TimeStampedModel
from apps.core.references import next_reference

from .constants import Access, Department, Module, StaffLevel


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email, password, **extra):
        if not email:
            raise ValueError("Users must have an email address")
        email = self.normalize_email(email).lower()
        user = self.model(email=email, **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra):
        extra.setdefault("is_staff", False)
        extra.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra)

    def create_superuser(self, email, password=None, **extra):
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        extra.setdefault("staff_level", StaffLevel.TOP_ADMIN)
        extra.setdefault("department", Department.MANAGEMENT)
        return self._create_user(email, password, **extra)


class User(AbstractBaseUser, PermissionsMixin):
    """Platform staff account (admins, operations staff and drivers)."""

    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=150)
    phone = models.CharField(max_length=32, blank=True)
    employee_id = models.CharField(max_length=20, unique=True, editable=False)
    staff_level = models.CharField(max_length=20, choices=StaffLevel.choices, default=StaffLevel.DATA_ENTRY)
    department = models.CharField(max_length=20, choices=Department.choices, default=Department.SUPPORT)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False, help_text="Can log into the Django admin site.")
    date_joined = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS = ["full_name"]

    class Meta:
        ordering = ["full_name"]
        indexes = [
            models.Index(fields=["staff_level"]),
            models.Index(fields=["department"]),
            models.Index(fields=["is_active"]),
        ]

    def __str__(self) -> str:
        return f"{self.full_name} <{self.email}>"

    def save(self, *args, **kwargs):
        if not self.employee_id:
            self.employee_id = next_reference("STF", width=3)
        self.email = (self.email or "").lower()
        super().save(*args, **kwargs)

    @property
    def is_top_admin(self) -> bool:
        return self.is_superuser or self.staff_level == StaffLevel.TOP_ADMIN

    @property
    def initials(self) -> str:
        return (self.full_name or self.email)[:1].upper()


class RolePermission(TimeStampedModel):
    """Access level a staff level has on a platform module. Editable by Top Admin."""

    staff_level = models.CharField(max_length=20, choices=StaffLevel.choices)
    module = models.CharField(max_length=32, choices=Module.choices)
    access = models.CharField(max_length=10, choices=Access.choices, default=Access.NONE)

    class Meta:
        ordering = ["staff_level", "module"]
        constraints = [
            models.UniqueConstraint(fields=["staff_level", "module"], name="uniq_role_permission"),
        ]

    def __str__(self) -> str:
        return f"{self.staff_level}:{self.module}={self.access}"


class AuditLog(models.Model):
    """Immutable record of a significant action on the platform."""

    class Action(models.TextChoices):
        CREATE = "create", "Created"
        UPDATE = "update", "Updated"
        DELETE = "delete", "Deleted"
        STATUS_CHANGE = "status_change", "Status changed"
        LOGIN = "login", "Logged in"
        LOGOUT = "logout", "Logged out"
        LOGIN_FAILED = "login_failed", "Failed login"
        PASSWORD_CHANGE = "password_change", "Password changed"
        PERMISSION_CHANGE = "permission_change", "Permission changed"

    actor = models.ForeignKey(
        "accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="audit_logs"
    )
    action = models.CharField(max_length=32, choices=Action.choices)
    content_type = models.ForeignKey(ContentType, null=True, blank=True, on_delete=models.SET_NULL)
    object_id = models.CharField(max_length=64, blank=True)
    object_repr = models.CharField(max_length=255, blank=True)
    changes = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["content_type", "object_id"]),
            models.Index(fields=["action"]),
            models.Index(fields=["-created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.get_action_display()} {self.object_repr}".strip()
