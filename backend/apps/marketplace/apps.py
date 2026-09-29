from django.apps import AppConfig


class MarketplaceConfig(AppConfig):
    name = "apps.marketplace"
    label = "marketplace"
    verbose_name = "Marketplace"

    def ready(self):
        from . import signals  # noqa: F401  (search text kept in step with renamed brands, categories, vendors)
