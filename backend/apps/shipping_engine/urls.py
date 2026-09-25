from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    CalculateView,
    CarrierViewSet,
    EngineSettingsView,
    ExchangeRateViewSet,
    OverviewView,
    RouteViewSet,
    RuleOverrideViewSet,
    ShippingMethodViewSet,
    ShippingProfileViewSet,
    ShippingRuleViewSet,
    ZoneViewSet,
)

router = DefaultRouter()
router.register("zones", ZoneViewSet, basename="se-zone")
router.register("routes", RouteViewSet, basename="se-route")
router.register("methods", ShippingMethodViewSet, basename="se-method")
router.register("profiles", ShippingProfileViewSet, basename="se-profile")
router.register("rules", ShippingRuleViewSet, basename="se-rule")
router.register("carriers", CarrierViewSet, basename="se-carrier")
router.register("overrides", RuleOverrideViewSet, basename="se-override")
router.register("exchange-rates", ExchangeRateViewSet, basename="se-exchange-rate")

urlpatterns = [
    path("overview/", OverviewView.as_view(), name="se-overview"),
    path("settings/", EngineSettingsView.as_view(), name="se-settings"),
    path("calculate/", CalculateView.as_view(), name="se-calculate"),
    *router.urls,
]
