import pytest
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.constants import StaffLevel
from apps.accounts.models import AuditLog
from conftest import PASSWORD

pytestmark = pytest.mark.django_db

LOGIN = "/api/auth/login/"


def login(api, email, password=PASSWORD):
    return api.post(LOGIN, {"email": email, "password": password}, format="json")


def test_login_returns_tokens_user_and_permissions(api, make_user):
    user = make_user(StaffLevel.SALES)
    res = login(api, user.email.upper())  # email is case-insensitive
    assert res.status_code == 200
    body = res.json()
    assert body["access"] and body["refresh"]
    assert body["user"]["email"] == user.email
    assert body["user"]["permissions"]["orders"] == "edit"
    assert body["user"]["permissions"]["audit_logs"] == "none"
    assert AuditLog.objects.filter(action="login", actor=user).exists()


def test_wrong_password_is_rejected_and_audited(api, make_user):
    user = make_user()
    res = login(api, user.email, "nope-nope-nope")
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "invalid_credentials"
    assert AuditLog.objects.filter(action="login_failed", object_repr=user.email).exists()


def test_inactive_user_cannot_log_in(api, make_user):
    user = make_user(is_active=False)
    assert login(api, user.email).status_code == 401


def test_login_is_rate_limited(api, make_user):
    user = make_user()
    codes = [login(api, user.email, "wrong-password-x").status_code for _ in range(6)]
    assert codes[:5] == [401] * 5
    assert codes[5] == 429


def test_refresh_rotates_and_blacklists_old_token(api, make_user):
    user = make_user()
    refresh = login(api, user.email).json()["refresh"]
    res = api.post("/api/auth/refresh/", {"refresh": refresh}, format="json")
    assert res.status_code == 200
    assert res.json()["refresh"] != refresh
    again = api.post("/api/auth/refresh/", {"refresh": refresh}, format="json")
    assert again.status_code == 401


def test_logout_blacklists_refresh_token(api, make_user):
    user = make_user()
    tokens = login(api, user.email).json()
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
    assert api.post("/api/auth/logout/", {"refresh": tokens["refresh"]}, format="json").status_code == 204
    api.credentials()
    assert api.post("/api/auth/refresh/", {"refresh": tokens["refresh"]}, format="json").status_code == 401
    assert AuditLog.objects.filter(action="logout", actor=user).exists()


def test_me_requires_authentication(api):
    res = api.get("/api/auth/me/")
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "not_authenticated"


def test_me_returns_top_admin_full_access(client_for):
    client = client_for(StaffLevel.TOP_ADMIN)
    body = client.get("/api/auth/me/").json()
    assert body["is_top_admin"] is True
    assert set(body["permissions"].values()) == {"manage"}


def test_change_password_revokes_existing_refresh_tokens(api, make_user):
    user = make_user()
    tokens = login(api, user.email).json()
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
    weak = api.post(
        "/api/auth/change-password/", {"current_password": PASSWORD, "new_password": "123"}, format="json"
    )
    assert weak.status_code == 400
    ok = api.post(
        "/api/auth/change-password/",
        {"current_password": PASSWORD, "new_password": "An0ther-Str0ng-Pass"},
        format="json",
    )
    assert ok.status_code == 204
    api.credentials()
    assert api.post("/api/auth/refresh/", {"refresh": tokens["refresh"]}, format="json").status_code == 401
    assert login(api, user.email, "An0ther-Str0ng-Pass").status_code == 200


def test_logout_rejects_someone_elses_token(api, make_user):
    alice, bob = make_user(), make_user()
    bob_refresh = str(RefreshToken.for_user(bob))
    api.force_authenticate(alice)
    res = api.post("/api/auth/logout/", {"refresh": bob_refresh}, format="json")
    assert res.status_code == 401
