import hmac

from django.conf import settings
from rest_framework.permissions import AllowAny
from rest_framework.throttling import AnonRateThrottle, ScopedRateThrottle
from rest_framework.views import APIView

from ..auth import CustomerJWTAuthentication, CustomerRateThrottle, IsCustomer, OptionalCustomerAuthentication


class CustomerAPIView(APIView):
    """Signed-in customer only. Staff tokens are rejected (different token type)."""

    authentication_classes = [CustomerJWTAuthentication]
    permission_classes = [IsCustomer]
    throttle_classes = [ScopedRateThrottle, CustomerRateThrottle]

    @property
    def customer(self):
        return self.request.user.customer


def from_storefront_server(request) -> bool:
    """A read by the AGIZA website's own server (shared secret), not by a visitor's browser."""
    key = settings.STOREFRONT_SERVER_KEY
    sent = request.headers.get("X-Storefront-Key", "")
    return bool(key) and request.method == "GET" and hmac.compare_digest(sent.encode(), key.encode())


class PublicAnonThrottle(AnonRateThrottle):
    """The per-IP anonymous limit, except for the website server's public catalogue reads."""

    def allow_request(self, request, view):
        return from_storefront_server(request) or super().allow_request(request, view)


class PublicAPIView(APIView):
    """Anyone (catalogue browsing, sign-in). A valid customer token is still recognised."""

    authentication_classes = [OptionalCustomerAuthentication]
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle, PublicAnonThrottle]
