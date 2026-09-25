from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import AuditLog, RolePermission, User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    ordering = ["full_name"]
    list_display = ["employee_id", "full_name", "email", "staff_level", "department", "is_active"]
    list_filter = ["staff_level", "department", "is_active", "is_staff"]
    search_fields = ["full_name", "email", "employee_id", "phone"]
    readonly_fields = ["employee_id", "last_login", "date_joined"]
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Profile", {"fields": ("employee_id", "full_name", "phone", "staff_level", "department")}),
        ("Access", {"fields": ("is_active", "is_staff", "is_superuser")}),
        ("Dates", {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = (
        (None, {"classes": ("wide",), "fields": ("email", "full_name", "staff_level", "department", "password1", "password2")}),
    )
    filter_horizontal = ()


@admin.register(RolePermission)
class RolePermissionAdmin(admin.ModelAdmin):
    list_display = ["staff_level", "module", "access", "updated_at"]
    list_filter = ["staff_level", "module", "access"]


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ["created_at", "actor", "action", "content_type", "object_repr", "ip_address"]
    list_filter = ["action", "content_type"]
    search_fields = ["object_repr", "actor__email", "actor__full_name"]
    list_select_related = ["actor", "content_type"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
