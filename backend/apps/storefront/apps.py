from django.apps import AppConfig


class StorefrontConfig(AppConfig):
    name = "apps.storefront"
    label = "storefront"
    verbose_name = "Customer App"

    def ready(self):
        from . import signals  # noqa: F401  (push notifications for customer-facing events)
