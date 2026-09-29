from django.contrib import admin

from .models import CustomerAccount, PushDevice


@admin.register(CustomerAccount)
class CustomerAccountAdmin(admin.ModelAdmin):
    list_display = ("phone", "customer", "is_active", "phone_verified_at", "last_login", "created_at")
    list_filter = ("is_active",)
    search_fields = ("phone", "customer__full_name", "customer__reference")
    exclude = ("password",)
    readonly_fields = ("customer", "phone", "phone_verified_at", "last_login", "session_version")


@admin.register(PushDevice)
class PushDeviceAdmin(admin.ModelAdmin):
    list_display = ("account", "platform", "is_active", "last_seen_at")
    list_filter = ("platform", "is_active")
    readonly_fields = ("account", "token", "platform", "last_seen_at")
