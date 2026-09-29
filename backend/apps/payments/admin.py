from django.contrib import admin

from .models import GatewayPayment


@admin.register(GatewayPayment)
class GatewayPaymentAdmin(admin.ModelAdmin):
    list_display = ("provider_order_id", "order", "amount", "currency", "status", "needs_attention", "created_at")
    list_filter = ("provider", "status", "needs_attention")
    search_fields = ("provider_order_id", "provider_reference", "order__reference", "phone")
    readonly_fields = [f.name for f in GatewayPayment._meta.fields]
