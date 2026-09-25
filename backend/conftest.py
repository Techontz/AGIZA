import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.accounts.constants import Department, StaffLevel
from apps.accounts.models import User

PASSWORD = "Str0ng-Passw0rd!"


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()  # throttle counters live in the cache
    yield
    cache.clear()


@pytest.fixture
def api():
    return APIClient()


@pytest.fixture
def make_user(db):
    counter = {"n": 0}

    def _make(level=StaffLevel.SALES, **extra):
        counter["n"] += 1
        defaults = {
            "email": f"{level}{counter['n']}@agiza.test",
            "full_name": f"{level.title()} User {counter['n']}",
            "staff_level": level,
            "department": Department.SALES,
        }
        defaults.update(extra)
        if level == StaffLevel.TOP_ADMIN:
            return User.objects.create_superuser(password=PASSWORD, **defaults)
        return User.objects.create_user(password=PASSWORD, **defaults)

    return _make


@pytest.fixture
def client_for(api, make_user):
    """Return an APIClient authenticated as a fresh user of the given staff level."""

    def _client(level=StaffLevel.SALES, **extra):
        user = make_user(level, **extra)
        client = APIClient()
        client.force_authenticate(user=user)
        client.user = user
        return client

    return _client
