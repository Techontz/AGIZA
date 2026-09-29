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


@pytest.fixture(scope="session", autouse=True)
def _restore_migration_data_after_transactional_tests(django_db_setup, django_db_blocker):
    """
    Transactional tests (real commits, e.g. the concurrency tests) end by flushing every table,
    including rows data migrations created (countries, cities, role permissions…). pytest-django
    runs them last; restore that data at the end so a reused test database (--reuse-db) stays whole.
    """
    yield
    from django.db import connection

    from apps.locations.models import Country

    with django_db_blocker.unblock():
        contents = getattr(connection, "_test_serialized_contents", None)
        if contents and not Country.objects.exists():
            connection.creation.deserialize_db_from_string(contents)
