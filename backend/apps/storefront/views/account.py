from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import AuthenticationFailed, ValidationError
from rest_framework.response import Response
from rest_framework_simplejwt.exceptions import TokenError

from apps.core.workflow import run

from .. import accounts, otp
from ..auth import ACCOUNT_CLAIM, SESSION_CLAIM, CustomerRefreshToken
from ..models import CustomerAccount, PushDevice
from ..push import is_expo_token
from ..serializers import (
    ChangePasswordSerializer,
    DeleteAccountSerializer,
    DeviceSerializer,
    LoginSerializer,
    ProfileSerializer,
    RefreshSerializer,
    RegisterSerializer,
    RequestCodeSerializer,
    ResetPasswordSerializer,
)
from .base import CustomerAPIView, PublicAPIView


def _session(result: dict, request) -> dict:
    return {"access": result["access"], "refresh": result["refresh"],
            "customer": ProfileSerializer(result["account"].customer, context={"request": request}).data}


@extend_schema(tags=["app: account"], request=RequestCodeSerializer, responses=OpenApiTypes.OBJECT)
class RequestCodeView(PublicAPIView):
    """Send a verification code by SMS (registration or password reset)."""

    throttle_scope = "otp"

    def post(self, request):
        s = RequestCodeSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        run(accounts.request_code, s.validated_data["phone"], s.validated_data["purpose"])
        return Response({"detail": "If the number can receive it, a code is on its way.",
                         "sms_configured": otp.sms_configured()})


@extend_schema(tags=["app: account"], request=RegisterSerializer, responses=OpenApiTypes.OBJECT)
class RegisterView(PublicAPIView):
    throttle_scope = "customer_login"

    def post(self, request):
        s = RegisterSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        result = run(accounts.register, request=request, **s.validated_data)
        return Response(_session(result, request), status=status.HTTP_201_CREATED)


@extend_schema(tags=["app: account"], request=LoginSerializer, responses=OpenApiTypes.OBJECT)
class LoginView(PublicAPIView):
    throttle_scope = "customer_login"

    def post(self, request):
        s = LoginSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        return Response(_session(run(accounts.login, **s.validated_data), request))


@extend_schema(tags=["app: account"], request=RefreshSerializer, responses=OpenApiTypes.OBJECT)
class RefreshView(PublicAPIView):
    """Rotate the refresh token (the old one is blacklisted) and issue a new access token."""

    throttle_scope = "customer_login"

    def post(self, request):
        s = RefreshSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        try:
            old = CustomerRefreshToken(s.validated_data["refresh"])
        except TokenError as exc:
            raise AuthenticationFailed(str(exc), code="token_not_valid")
        account = CustomerAccount.objects.filter(pk=old.get(ACCOUNT_CLAIM), is_active=True,
                                                 customer__status="active").first()
        if account is None or not account.token_is_current(old.get(SESSION_CLAIM)):
            raise AuthenticationFailed("Your session has ended. Sign in again.", code="token_not_valid")
        old.blacklist()
        new = CustomerRefreshToken.for_account(account)
        return Response({"access": str(new.access_token), "refresh": str(new)})


@extend_schema(tags=["app: account"], request=ResetPasswordSerializer, responses=OpenApiTypes.OBJECT)
class ResetPasswordView(PublicAPIView):
    throttle_scope = "customer_login"

    def post(self, request):
        s = ResetPasswordSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        run(accounts.reset_password, **s.validated_data)
        return Response({"detail": "Password changed. Sign in with your new password."})


@extend_schema(tags=["app: account"], request=RefreshSerializer, responses=None)
class LogoutView(CustomerAPIView):
    def post(self, request):
        try:
            token = CustomerRefreshToken(request.data.get("refresh", ""))
            if token.get(ACCOUNT_CLAIM) == request.user.pk:
                token.blacklist()
        except TokenError:
            pass  # already expired or invalid: nothing to revoke
        device = (request.data.get("device_token") or "").strip()
        if device:
            PushDevice.objects.filter(account=request.user, token=device).update(is_active=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(tags=["app: account"], request=ProfileSerializer, responses=ProfileSerializer)
class ProfileView(CustomerAPIView):
    def get(self, request):
        return Response(ProfileSerializer(self.customer).data)

    def patch(self, request):
        s = ProfileSerializer(self.customer, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        s.save()
        return Response(s.data)


@extend_schema(tags=["app: account"], request=ChangePasswordSerializer, responses=OpenApiTypes.OBJECT)
class ChangePasswordView(CustomerAPIView):
    throttle_scope = "customer_login"

    def post(self, request):
        s = ChangePasswordSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        tokens = run(accounts.change_password, request.user, current=s.validated_data["current_password"],
                     new=s.validated_data["new_password"])
        return Response(tokens)


@extend_schema(tags=["app: account"], request=DeleteAccountSerializer, responses=None)
class DeleteAccountView(CustomerAPIView):
    throttle_scope = "customer_login"

    def post(self, request):
        s = DeleteAccountSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        run(accounts.delete_account, request.user, password=s.validated_data["password"], request=request)
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(tags=["app: account"], request=DeviceSerializer, responses=None)
class DeviceView(CustomerAPIView):
    """Register this device's Expo push token (moves it to this account if another had it)."""

    def post(self, request):
        s = DeviceSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        token = s.validated_data["token"].strip()
        if not is_expo_token(token):
            raise ValidationError({"token": ["Not an Expo push token."]})
        PushDevice.objects.update_or_create(token=token, defaults={
            "account": request.user, "platform": s.validated_data["platform"], "app": s.validated_data["app"],
            "is_active": True,
            "last_seen_at": timezone.now()})
        return Response(status=status.HTTP_204_NO_CONTENT)
