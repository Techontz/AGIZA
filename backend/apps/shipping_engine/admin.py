from django.contrib import admin

from .models import (
    Carrier,
    EngineSettings,
    ExchangeRate,
    Route,
    RuleOverride,
    ShippingMethod,
    ShippingProfile,
    ShippingRule,
    Zone,
    ZoneDestination,
)


class ZoneDestinationInline(admin.TabularInline):
    model = ZoneDestination
    extra = 0
    autocomplete_fields = ["city", "region", "country"]


@admin.register(Zone)
class ZoneAdmin(admin.ModelAdmin):
    list_display = ["name", "type", "status"]
    list_filter = ["type", "status"]
    search_fields = ["name"]
    inlines = [ZoneDestinationInline]


@admin.register(Route)
class RouteAdmin(admin.ModelAdmin):
    list_display = ["__str__", "type", "status"]
    list_filter = ["type", "status"]
    filter_horizontal = ["methods"]


@admin.register(ShippingRule)
class ShippingRuleAdmin(admin.ModelAdmin):
    list_display = ["code", "route", "method", "applies_to", "pricing_model", "rate", "currency", "status"]
    list_filter = ["status", "pricing_model", "applies_to", "currency"]
    search_fields = ["code", "name", "product_sku"]
    readonly_fields = ["code"]


@admin.register(RuleOverride)
class RuleOverrideAdmin(admin.ModelAdmin):
    list_display = ["code", "route", "pricing_model", "rate", "currency", "start_date", "end_date", "status"]
    list_filter = ["status"]
    readonly_fields = ["code"]


admin.site.register([Carrier, ShippingMethod, ShippingProfile, EngineSettings, ExchangeRate])
