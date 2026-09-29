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


class PublicAPIView(APIView):
    """Anyone (catalogue browsing, sign-in). A valid customer token is still recognised."""

    authentication_classes = [OptionalCustomerAuthentication]
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle, AnonRateThrottle]
