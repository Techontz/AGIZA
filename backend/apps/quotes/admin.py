from django.contrib import admin

from .models import QuoteRequest


@admin.register(QuoteRequest)
class QuoteRequestAdmin(admin.ModelAdmin):
    list_display = ["reference", "customer", "service_type", "status", "quoted_amount", "requested_at"]
    list_filter = ["status", "service_type"]
    search_fields = ["reference", "description", "customer__full_name"]
    readonly_fields = ["reference", "status"]
