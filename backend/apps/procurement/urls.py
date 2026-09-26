from rest_framework.routers import DefaultRouter

from .views import ProcurementViewSet, SupplierViewSet

router = DefaultRouter()
router.register("procurement/suppliers", SupplierViewSet, basename="supplier")
router.register("procurement/orders", ProcurementViewSet, basename="procurement-order")

urlpatterns = router.urls
