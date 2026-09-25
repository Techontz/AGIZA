from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import AttachmentFileView, EquipmentOrderViewSet, ExpressOrderViewSet, InternationalOrderViewSet

router = DefaultRouter()
router.register("orders/express", ExpressOrderViewSet, basename="express-order")
router.register("orders/international", InternationalOrderViewSet, basename="international-order")
router.register("orders/equipment", EquipmentOrderViewSet, basename="equipment-order")

urlpatterns = [
    path("orders/attachments/<int:pk>/file/", AttachmentFileView.as_view(), name="order-attachment-file"),
    *router.urls,
]
