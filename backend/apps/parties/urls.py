from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import CustomerAddressViewSet, CustomerViewSet, PeopleStatsView, ServiceProviderViewSet

router = DefaultRouter()
router.register("customers", CustomerViewSet, basename="customer")
router.register("service-providers", ServiceProviderViewSet, basename="service-provider")

address_list = CustomerAddressViewSet.as_view({"get": "list", "post": "create"})
address_detail = CustomerAddressViewSet.as_view(
    {"get": "retrieve", "patch": "partial_update", "put": "update", "delete": "destroy"}
)

urlpatterns = [
    path("people/stats/", PeopleStatsView.as_view(), name="people-stats"),
    *router.urls,
    path("customers/<int:customer_pk>/addresses/", address_list, name="customer-address-list"),
    path("customers/<int:customer_pk>/addresses/<int:pk>/", address_detail, name="customer-address-detail"),
]
