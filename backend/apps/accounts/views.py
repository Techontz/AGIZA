import logging

import django_filters
from django.db import transaction
from django.db.models import Count
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import AuthenticationFailed, ValidationError
from rest_framework.generics import GenericAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView

from apps.core.audit import AuditedViewSetMixin, diff, record_audit, snapshot

from .constants import Module, StaffLevel
from .models import AuditLog, RolePermission, User
from .permissions import HasModulePermission, IsTopAdmin
from .serializers import (
    AuditLogSerializer,
    ChangePasswordSerializer,
    LoginSerializer,
    LogoutSerializer,
    MeSerializer,
    RolePermissionSerializer,
    StaffSerializer,
)

logger = logging.getLogger("apps.accounts")


# --------------------------------------------------------------------------- #
# Authentication
# --------------------------------------------------------------------------- #
class LoginView(GenericAPIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = LoginSerializer
    throttle_scope = "login"

    def get_authenticate_header(self, request):
        # No authenticators run on this view; still answer failed logins with 401, not 403.
        return 'Bearer realm="api"'

    @extend_schema(tags=["auth"], summary="Log in with email and password")
    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
        except (AuthenticationFailed, ValidationError, TokenError) as exc:
            email = str(request.data.get("email", ""))[:150]
            record_audit(action=AuditLog.Action.LOGIN_FAILED, request=request, object_repr=email)
            if isinstance(exc, ValidationError):
                raise
            raise AuthenticationFailed("Invalid email or password.", code="invalid_credentials") from exc
        user = serializer.user
        record_audit(action=AuditLog.Action.LOGIN, request=request, actor=user, instance=user)
        return Response(serializer.validated_data, status=status.HTTP_200_OK)


class RefreshView(TokenRefreshView):
    @extend_schema(tags=["auth"], summary="Rotate a refresh token")
    def post(self, request, *args, **kwargs):
        return super().post(request, *args, **kwargs)


class LogoutView(GenericAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = LogoutSerializer

    @extend_schema(tags=["auth"], summary="Log out (blacklists the refresh token)", responses={204: None})
    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            token = RefreshToken(serializer.validated_data["refresh"])
            if str(token.get("user_id")) != str(request.user.id):
                raise InvalidToken("Token does not belong to this user.")
            token.blacklist()
        except TokenError:
            pass  # Already expired / blacklisted: logging out is still successful.
        record_audit(action=AuditLog.Action.LOGOUT, request=request, instance=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(GenericAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = MeSerializer

    @extend_schema(tags=["auth"], summary="Current user and module permissions")
    def get(self, request):
        return Response(self.get_serializer(request.user).data)


class ChangePasswordView(GenericAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ChangePasswordSerializer

    @extend_schema(tags=["auth"], summary="Change own password (logs out all sessions)", responses={204: None})
    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user
        with transaction.atomic():
            user.set_password(serializer.validated_data["new_password"])
            user.save(update_fields=["password", "updated_at"])
            for token in OutstandingToken.objects.filter(user=user):
                BlacklistedToken.objects.get_or_create(token=token)
        record_audit(action=AuditLog.Action.PASSWORD_CHANGE, request=request, instance=user)
        return Response(status=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------- #
# Staff management
# --------------------------------------------------------------------------- #
class StaffFilter(django_filters.FilterSet):
    role = django_filters.ChoiceFilter(choices=[("staff", "Staff"), ("driver", "Drivers")], method="filter_role")

    class Meta:
        model = User
        fields = ["staff_level", "department", "is_active", "role"]

    def filter_role(self, qs, name, value):
        return qs.filter(staff_level=StaffLevel.DRIVER) if value == "driver" else qs.exclude(
            staff_level=StaffLevel.DRIVER)


@extend_schema(tags=["staff"])
class StaffViewSet(
    AuditedViewSetMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Staff accounts. Deactivate instead of deleting to preserve history."""

    module = Module.PEOPLE
    permission_classes = [HasModulePermission]
    required_access = {"create": "manage", "update": "manage", "partial_update": "manage"}
    serializer_class = StaffSerializer
    queryset = User.objects.annotate(total_orders=Count("deliveries", distinct=True)).order_by("full_name", "id")
    filterset_class = StaffFilter
    search_fields = ["full_name", "email", "phone", "employee_id"]
    ordering_fields = ["full_name", "date_joined", "last_login", "staff_level"]


# --------------------------------------------------------------------------- #
# Role permissions
# --------------------------------------------------------------------------- #
@extend_schema(tags=["staff"])
class RolePermissionViewSet(
    mixins.ListModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    module = Module.SETTINGS
    serializer_class = RolePermissionSerializer
    queryset = RolePermission.objects.all()
    filterset_fields = ["staff_level", "module"]
    pagination_class = None
    http_method_names = ["get", "patch", "head", "options"]

    def get_permissions(self):
        if self.action in ("update", "partial_update"):
            return [IsTopAdmin()]
        return [HasModulePermission()]

    def perform_update(self, serializer):
        before = snapshot(serializer.instance)
        instance = serializer.save()
        changes = diff(before, snapshot(instance))
        if changes:
            record_audit(
                action=AuditLog.Action.PERMISSION_CHANGE, request=self.request, instance=instance, changes=changes
            )


# --------------------------------------------------------------------------- #
# Audit logs
# --------------------------------------------------------------------------- #
class AuditLogFilter(django_filters.FilterSet):
    actor = django_filters.NumberFilter(field_name="actor_id")
    action = django_filters.MultipleChoiceFilter(choices=AuditLog.Action.choices)
    entity = django_filters.CharFilter(field_name="content_type__model", lookup_expr="iexact")
    object_id = django_filters.CharFilter()
    date_from = django_filters.DateFilter(field_name="created_at", lookup_expr="date__gte")
    date_to = django_filters.DateFilter(field_name="created_at", lookup_expr="date__lte")

    class Meta:
        model = AuditLog
        fields = ["actor", "action", "entity", "object_id", "date_from", "date_to"]


@extend_schema(tags=["audit"])
class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    module = Module.AUDIT_LOGS
    permission_classes = [HasModulePermission]
    serializer_class = AuditLogSerializer
    queryset = AuditLog.objects.select_related("actor", "content_type")
    filterset_class = AuditLogFilter
    search_fields = ["object_repr", "actor__full_name", "actor__email"]
    ordering_fields = ["created_at", "action"]

    @action(detail=False, pagination_class=None, filterset_class=None)
    def entities(self, request):
        """Entity types that appear in the audit trail (for the filter dropdown)."""
        from django.contrib.contenttypes.models import ContentType

        ids = AuditLog.objects.exclude(content_type=None).values_list("content_type", flat=True).distinct()
        types = ContentType.objects.filter(id__in=ids)
        data = sorted(
            ({"value": ct.model, "label": str(ct.model_class()._meta.verbose_name).title()} for ct in types if ct.model_class()),
            key=lambda item: item["label"],
        )
        return Response(data)
