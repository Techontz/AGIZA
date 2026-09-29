import logging

from django.db import connection
from drf_spectacular.utils import extend_schema
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

logger = logging.getLogger("apps.core")


@extend_schema(tags=["system"], responses={200: dict})
@api_view(["GET"])
@permission_classes([AllowAny])
@throttle_classes([])
def health(request):
    """Readiness: the app can serve requests (database reachable). 503 otherwise, with no details."""
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
    except Exception:  # noqa: BLE001 - reported as not ready; the cause goes to the log only
        logger.exception("Readiness check failed: database unreachable")
        return Response({"status": "unavailable", "database": "unreachable"}, status=503)
    return Response({"status": "ok", "database": "ok"})


@extend_schema(tags=["system"], responses={200: dict})
@api_view(["GET"])
@permission_classes([AllowAny])
@throttle_classes([])
def liveness(request):
    """Liveness: the process answers (no database or external calls)."""
    return Response({"status": "ok"})
