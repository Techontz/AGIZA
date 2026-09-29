"""
Customer app authentication.

Customer tokens have their own token types ("customer_access" / "customer_refresh")
and carry an `account_id` claim instead of `user_id`. Staff authentication only
accepts "access" tokens, and this class only accepts "customer_access" ones, so a
token issued to one side is rejected by the other.
"""
from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.utils.translation import gettext_lazy as _
from rest_framework.permissions import BasePermission
from rest_framework.throttling import SimpleRateThrottle
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed, InvalidToken, TokenError
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from .models import CustomerAccount

ACCOUNT_CLAIM = "account_id"
SESSION_CLAIM = "sv"


class CustomerAccessToken(AccessToken):
    token_type = "customer_access"
    lifetime = timedelta(minutes=settings.CUSTOMER_JWT_ACCESS_MINUTES)


class CustomerRefreshToken(RefreshToken):
    token_type = "customer_refresh"
    lifetime = timedelta(days=settings.CUSTOMER_JWT_REFRESH_DAYS)
    access_token_class = CustomerAccessToken

    @classmethod
    def for_account(cls, account: CustomerAccount) -> CustomerRefreshToken:
        token = cls()
        token[ACCOUNT_CLAIM] = account.pk
        token[SESSION_CLAIM] = account.session_version
        token.outstand()  # tracked so logout / rotation can blacklist it
        return token


def issue_tokens(account: CustomerAccount) -> dict:
    refresh = CustomerRefreshToken.for_account(account)
    return {"refresh": str(refresh), "access": str(refresh.access_token)}


class CustomerJWTAuthentication(JWTAuthentication):
    def get_validated_token(self, raw_token):
        try:
            return CustomerAccessToken(raw_token)
        except TokenError as exc:
            raise InvalidToken({"detail": _("Given token not valid for any token type"), "messages": [str(exc)]})

    def get_user(self, validated_token):
        account_id = validated_token.get(ACCOUNT_CLAIM)
        if account_id is None:
            raise InvalidToken(_("Token contained no recognizable account identification"))
        account = (CustomerAccount.objects.select_related("customer")
                   .filter(pk=account_id, is_active=True, customer__status="active").first())
        if account is None:
            raise AuthenticationFailed(_("Account not found or disabled"), code="account_disabled")
        if not account.token_is_current(validated_token.get(SESSION_CLAIM)):
            raise InvalidToken(_("Token has been revoked"))
        return account


class OptionalCustomerAuthentication(CustomerJWTAuthentication):
    """For public endpoints: a bad or expired token is ignored instead of refused."""

    def authenticate(self, request):
        try:
            return super().authenticate(request)
        except (InvalidToken, AuthenticationFailed):
            return None


class IsCustomer(BasePermission):
    message = "Sign in to your AGIZA account."

    def has_permission(self, request, view) -> bool:
        return isinstance(request.user, CustomerAccount)


def current_customer(request):
    return request.user.customer


class CustomerRateThrottle(SimpleRateThrottle):
    """Per-account limit (kept apart from the staff `user` bucket, whose ids overlap)."""

    scope = "customer"

    def get_cache_key(self, request, view):
        if isinstance(request.user, CustomerAccount):
            ident = f"account_{request.user.pk}"
        else:
            ident = self.get_ident(request)
        return self.cache_format % {"scope": self.scope, "ident": ident}
