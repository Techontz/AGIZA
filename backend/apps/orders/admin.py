from django.contrib import admin

from .models import EquipmentDetails, ExpressDetails, InternationalDetails, Order, OrderStatusHistory, Payment


class HistoryInline(admin.TabularInline):
    model = OrderStatusHistory
    extra = 0
    readonly_fields = ["from_status", "to_status", "changed_by", "note", "created_at"]
    can_delete = False


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ["reference", "order_type", "customer", "status", "total_amount", "created_at"]
    list_filter = ["order_type", "status", "department"]
    search_fields = ["reference", "item_details", "customer__full_name"]
    readonly_fields = ["reference", "status"]  # status changes only through the workflow
    inlines = [HistoryInline]


admin.site.register([Payment, ExpressDetails, InternationalDetails, EquipmentDetails])
