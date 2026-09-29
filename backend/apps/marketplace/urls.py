from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    AdjustmentView,
    CategoryCommissionViewSet,
    EarningsView,
    FulfillmentViewSet,
    LedgerView,
    PayoutBatchView,
    PayoutViewSet,
    ReviewViewSet,
    SettingsView,
    VendorDocumentsView,
)

router = DefaultRouter()
router.register("marketplace/category-commissions", CategoryCommissionViewSet, basename="category-commission")
router.register("marketplace/fulfillments", FulfillmentViewSet, basename="vendor-fulfillment")
router.register("marketplace/payouts", PayoutViewSet, basename="vendor-payout")
router.register("marketplace/reviews", ReviewViewSet, basename="product-review")

urlpatterns = [
    path("marketplace/settings/", SettingsView.as_view(), name="marketplace-settings"),
    path("marketplace/earnings/", EarningsView.as_view(), name="marketplace-earnings"),
    path("marketplace/payout-batches/", PayoutBatchView.as_view(), name="payout-batches"),
    path("marketplace/ledger/", LedgerView.as_view(), name="vendor-ledger"),
    path("marketplace/adjustments/", AdjustmentView.as_view(), name="vendor-adjustments"),
    path("marketplace/vendors/<int:vendor_id>/documents/", VendorDocumentsView.as_view(), name="vendor-documents"),
    path("marketplace/vendors/<int:vendor_id>/documents/<int:document_id>/file/", VendorDocumentsView.as_view(),
         name="vendor-document-file"),
    *router.urls,
]
