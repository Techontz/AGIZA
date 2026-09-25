from rest_framework.routers import DefaultRouter

from .views import CityViewSet, CountryViewSet, RegionViewSet, WarehouseViewSet

router = DefaultRouter()
router.register("countries", CountryViewSet, basename="country")
router.register("regions", RegionViewSet, basename="region")
router.register("cities", CityViewSet, basename="city")
router.register("warehouses", WarehouseViewSet, basename="warehouse")

urlpatterns = router.urls
