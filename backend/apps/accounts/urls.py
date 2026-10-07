from django.urls import path
from rest_framework.routers import DefaultRouter

from .reports import ReportsDashboardView
from .views import (
    AuditLogViewSet,
    ChangePasswordView,
    LoginView,
    LogoutView,
    MeView,
    RefreshView,
    RolePermissionViewSet,
    StaffViewSet,
)

router = DefaultRouter()
router.register("staff", StaffViewSet, basename="staff")
router.register("role-permissions", RolePermissionViewSet, basename="role-permission")
router.register("audit-logs", AuditLogViewSet, basename="audit-log")

urlpatterns = [
    path("auth/login/", LoginView.as_view(), name="auth-login"),
    path("auth/refresh/", RefreshView.as_view(), name="auth-refresh"),
    path("auth/logout/", LogoutView.as_view(), name="auth-logout"),
    path("auth/me/", MeView.as_view(), name="auth-me"),
    path("auth/change-password/", ChangePasswordView.as_view(), name="auth-change-password"),
    path("reports/dashboard/", ReportsDashboardView.as_view(), name="reports-dashboard"),
    *router.urls,
]
