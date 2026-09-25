from django.contrib import admin

from .models import City, Country, Region, Warehouse


@admin.register(Country)
class CountryAdmin(admin.ModelAdmin):
    list_display = ["iso2", "name", "display_name", "currency", "is_sourcing_origin", "is_active"]
    list_filter = ["is_sourcing_origin", "is_active"]
    search_fields = ["name", "iso2"]


@admin.register(Region)
class RegionAdmin(admin.ModelAdmin):
    list_display = ["name", "country"]
    list_filter = ["country"]
    search_fields = ["name"]


@admin.register(City)
class CityAdmin(admin.ModelAdmin):
    list_display = ["name", "region", "country", "is_active"]
    list_filter = ["country", "is_active"]
    search_fields = ["name", "region__name"]
    list_select_related = ["region", "country"]


@admin.register(Warehouse)
class WarehouseAdmin(admin.ModelAdmin):
    list_display = ["code", "name", "type", "city", "status", "capacity_percent"]
    list_filter = ["type", "status", "country"]
    search_fields = ["code", "name"]
    readonly_fields = ["code"]
    list_select_related = ["city"]
