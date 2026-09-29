from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import DeliveryViewSet, PhotoFileView, PickupTaskViewSet, SignatureFileView

router = DefaultRouter()
router.register("deliveries/pickups", PickupTaskViewSet, basename="pickup-task")
router.register("deliveries", DeliveryViewSet, basename="delivery")

urlpatterns = [
    path("deliveries/<int:pk>/signature/file/", SignatureFileView.as_view(), name="delivery-signature-file"),
    path("deliveries/photos/<int:pk>/file/", PhotoFileView.as_view(), name="delivery-photo-file"),
    *router.urls,
]
