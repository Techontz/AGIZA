from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import DocumentFileView, ParcelViewSet, ShipmentViewSet

router = DefaultRouter()
router.register("shipping/parcels", ParcelViewSet, basename="cargo-parcel")
router.register("shipping/shipments", ShipmentViewSet, basename="shipment")

urlpatterns = [
    path("shipping/documents/<int:pk>/file/", DocumentFileView.as_view(), name="shipment-document-file"),
    *router.urls,
]
