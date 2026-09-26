from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    ConversationViewSet,
    FacebookWebhookView,
    QuickReplyViewSet,
    TikTokWebhookView,
    WhatsAppWebhookView,
)

router = DefaultRouter()
router.register("chat/conversations", ConversationViewSet, basename="conversation")
router.register("chat/quick-replies", QuickReplyViewSet, basename="quick-reply")

urlpatterns = [
    # Public endpoints for the channel providers (signature-verified; 503 until configured).
    path("chat/webhooks/whatsapp/", WhatsAppWebhookView.as_view(), name="webhook-whatsapp"),
    path("chat/webhooks/facebook/", FacebookWebhookView.as_view(), name="webhook-facebook"),
    path("chat/webhooks/tiktok/", TikTokWebhookView.as_view(), name="webhook-tiktok"),
    *router.urls,
]
