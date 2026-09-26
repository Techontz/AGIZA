from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import CampaignViewSet, CustomerInterestsView, CustomerTagsView, TagRuleViewSet, TagViewSet

router = DefaultRouter()
router.register("crm/tags", TagViewSet, basename="tag")
router.register("crm/tag-rules", TagRuleViewSet, basename="tag-rule")
router.register("crm/campaigns", CampaignViewSet, basename="campaign")

urlpatterns = [
    path("customers/<int:pk>/tags/", CustomerTagsView.as_view(), name="customer-tags"),
    path("customers/<int:pk>/interests/", CustomerInterestsView.as_view(), name="customer-interests"),
    *router.urls,
]
