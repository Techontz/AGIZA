from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    kind_display = serializers.CharField(source="get_kind_display", read_only=True)

    class Meta:
        model = Notification
        fields = ["id", "kind", "kind_display", "title", "body", "link", "read_at", "created_at"]


@extend_schema(tags=["notifications"])
class NotificationViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """The signed-in user's own notifications (never anyone else's)."""

    permission_classes = [IsAuthenticated]
    serializer_class = NotificationSerializer
    filterset_fields = {"read_at": ["isnull"], "kind": ["exact"]}

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Notification.objects.none()
        return Notification.objects.filter(recipient=self.request.user).order_by("-created_at", "-id")

    @action(detail=False, url_path="unread-count")
    def unread_count(self, request):
        return Response({"unread": self.get_queryset().filter(read_at__isnull=True).count()})

    @action(detail=True, methods=["post"])
    def read(self, request, pk=None):
        self.get_queryset().filter(pk=pk, read_at__isnull=True).update(read_at=timezone.now())
        return Response({"unread": self.get_queryset().filter(read_at__isnull=True).count()})

    @action(detail=False, methods=["post"], url_path="read-all")
    def read_all(self, request):
        self.get_queryset().filter(read_at__isnull=True).update(read_at=timezone.now())
        return Response({"unread": 0})
