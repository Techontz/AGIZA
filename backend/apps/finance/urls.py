from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    FinanceStatsView,
    InstallmentPlanViewSet,
    InvoiceViewSet,
    OrderPaymentViewSet,
    PaymentViewSet,
    WalletViewSet,
)

router = DefaultRouter()
router.register("finance/order-payments", OrderPaymentViewSet, basename="order-payment")
router.register("finance/payments", PaymentViewSet, basename="finance-payment")
router.register("finance/invoices", InvoiceViewSet, basename="invoice")
router.register("finance/wallets", WalletViewSet, basename="wallet")
router.register("finance/installment-plans", InstallmentPlanViewSet, basename="installment-plan")

urlpatterns = [
    path("finance/stats/", FinanceStatsView.as_view(), name="finance-stats"),
    *router.urls,
]
