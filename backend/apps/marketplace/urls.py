from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import CategoryCommissionViewSet, EarningsView, FulfillmentViewSet, PayoutViewSet, SettingsView

router = DefaultRouter()
router.register("marketplace/category-commissions", CategoryCommissionViewSet, basename="category-commission")
router.register("marketplace/fulfillments", FulfillmentViewSet, basename="vendor-fulfillment")
router.register("marketplace/payouts", PayoutViewSet, basename="vendor-payout")

urlpatterns = [
    path("marketplace/settings/", SettingsView.as_view(), name="marketplace-settings"),
    path("marketplace/earnings/", EarningsView.as_view(), name="marketplace-earnings"),
    *router.urls,
]
