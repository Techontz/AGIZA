from django.contrib import admin

from .models import Address, Customer


class AddressInline(admin.TabularInline):
    model = Address
    extra = 0
    fields = ["label", "line1", "area", "city", "is_default"]
    autocomplete_fields = ["city"]


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ["reference", "full_name", "email", "phone", "status", "created_at"]
    list_filter = ["status", "preferred_channel"]
    search_fields = ["reference", "full_name", "email", "phone"]
    readonly_fields = ["reference", "created_by"]
    inlines = [AddressInline]
