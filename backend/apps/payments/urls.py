from django.urls import path

from .views import SelcomWebhookView

app_name = "payments"

urlpatterns = [
    path("payments/selcom/webhook/", SelcomWebhookView.as_view(), name="selcom-webhook"),
]
