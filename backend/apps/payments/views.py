from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from . import services


@extend_schema(tags=["payments"], request=None, responses=None)
class SelcomWebhookView(APIView):
    """
    Selcom's payment notification. Its body only says *which* payment to check:
    the status and amount are read back from Selcom before anything is recorded.
    """

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [AnonRateThrottle]

    def post(self, request):
        payload = request.data if isinstance(request.data, dict) else {}
        services.handle_webhook(payload)
        # Always acknowledge: the provider retries on errors, and unknown ids are logged.
        return Response({"result": "SUCCESS", "resultcode": "000"}, status=status.HTTP_200_OK)
