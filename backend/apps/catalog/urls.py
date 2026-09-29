from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    BrandLogoView,
    BrandViewSet,
    CategoryViewSet,
    DeliveryEstimateView,
    EstimateRouteViewSet,
    ImageFileView,
    LabelViewSet,
    OptionViewSet,
    OriginEstimateViewSet,
    ProductViewSet,
    StoreSettingsView,
    VendorMediaFileView,
    VendorViewSet,
)

router = DefaultRouter()
router.register("catalog/categories", CategoryViewSet, basename="category")
router.register("catalog/brands", BrandViewSet, basename="brand")
router.register("catalog/labels", LabelViewSet, basename="label")
router.register("catalog/options", OptionViewSet, basename="product-option")
router.register("catalog/vendors", VendorViewSet, basename="vendor")
router.register("catalog/products", ProductViewSet, basename="product")
router.register("catalog/estimate-routes", EstimateRouteViewSet, basename="estimate-route")
router.register("catalog/origin-estimates", OriginEstimateViewSet, basename="origin-estimate")

urlpatterns = [
    path("catalog/images/<int:pk>/file/", ImageFileView.as_view(), name="product-image-file"),
    path("catalog/brands/<int:pk>/logo/file/", BrandLogoView.as_view(), name="brand-logo"),
    path("catalog/vendors/<int:pk>/<str:kind>/file/", VendorMediaFileView.as_view(), name="vendor-media-file"),
    path("catalog/settings/", StoreSettingsView.as_view(), name="store-settings"),
    path("catalog/delivery-estimate/", DeliveryEstimateView.as_view(), name="delivery-estimate"),
    *router.urls,
]
