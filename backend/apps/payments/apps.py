from django.apps import AppConfig


class PaymentsConfig(AppConfig):
    name = "apps.payments"
    label = "payments"
    verbose_name = "Online Payments"

    def ready(self):
        from . import checks  # noqa: F401  (deploy checks for the Selcom settings)
