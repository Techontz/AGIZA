from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from apps.core.views import health

api_patterns = [
    path("health/", health, name="health"),
    path("", include("apps.accounts.urls")),
    path("", include("apps.locations.urls")),
    path("", include("apps.parties.urls")),
    path("shipping-engine/", include("apps.shipping_engine.urls")),
    path("", include("apps.quotes.urls")),
    path("", include("apps.orders.urls")),
    path("", include("apps.procurement.urls")),
    path("", include("apps.shipping.urls")),
    path("", include("apps.deliveries.urls")),
    path("", include("apps.returns.urls")),
    path("", include("apps.tasks.urls")),
    path("", include("apps.catalog.urls")),
    path("", include("apps.inventory.urls")),
    path("", include("apps.finance.urls")),
    path("", include("apps.crm.urls")),
    path("", include("apps.chat.urls")),
    path("", include("apps.notifications.urls")),
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
    path("docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
]

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include(api_patterns)),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

admin.site.site_header = "AGIZA Platform Administration"
admin.site.site_title = "AGIZA Admin"
