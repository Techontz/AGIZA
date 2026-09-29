"""Customer accounts: phone verification, sign-in, sessions, and separation from staff accounts."""
import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from apps.parties.models import Customer
from apps.storefront.models import CustomerAccount, PhoneVerification

from .conftest import APP, PASSWORD, client_for_account, make_account

pytestmark = pytest.mark.django_db


def register(api, sms, phone="0754 111 222", **extra):
    assert api.post(f"{APP}/auth/request-code/", {"phone": phone, "purpose": "register"}).status_code == 200
    payload = {"phone": phone, "code": sms.last_code(), "full_name": "Asha Said", "password": PASSWORD, **extra}
    return api.post(f"{APP}/auth/register/", payload, format="json")


def test_register_with_verified_phone_creates_customer_visible_to_staff(api, sms, client_for):
    res = register(api, sms, email="Asha@Example.com")
    assert res.status_code == 201, res.json()
    body = res.json()
    assert body["access"] and body["refresh"]
    assert body["customer"]["phone"] == "+255754111222"
    assert sms.sent[-1][0] == "+255754111222"

    customer = Customer.objects.get(reference=body["customer"]["reference"])
    assert customer.preferred_channel == "app" and customer.email == "asha@example.com"
    staff = client_for("admin_l2")
    rows = staff.get("/api/customers/", {"search": "Asha"}).json()["results"]
    assert [r["reference"] for r in rows] == [customer.reference]


def test_registration_claims_existing_crm_customer_with_same_phone(api, sms):
    crm = Customer.objects.create(full_name="Asha S.", phone="+255 754-111-222")
    res = register(api, sms)
    assert res.status_code == 201
    assert CustomerAccount.objects.get().customer_id == crm.pk
    assert Customer.objects.count() == 1


def test_wrong_codes_are_counted_and_lock_the_code(api, sms):
    api.post(f"{APP}/auth/request-code/", {"phone": "0754111222", "purpose": "register"})
    payload = {"phone": "0754111222", "full_name": "Asha", "password": PASSWORD}
    for left in (4, 3, 2, 1):
        res = api.post(f"{APP}/auth/register/", {**payload, "code": "000000"}, format="json")
        assert res.status_code == 400 and f"{left} attempt" in res.json()["error"]["message"]
    api.post(f"{APP}/auth/register/", {**payload, "code": "000000"}, format="json")
    res = api.post(f"{APP}/auth/register/", {**payload, "code": sms.last_code()}, format="json")
    assert res.status_code == 400 and "expired" in res.json()["error"]["message"]
    assert not CustomerAccount.objects.exists()


def test_code_resend_is_rate_limited_and_existing_phone_refused(api, sms, account):
    api.post(f"{APP}/auth/request-code/", {"phone": "0754111222", "purpose": "register"})
    assert api.post(f"{APP}/auth/request-code/", {"phone": "0754111222", "purpose": "register"}).status_code == 409
    res = api.post(f"{APP}/auth/request-code/", {"phone": "+255712345678", "purpose": "register"})
    assert res.status_code == 400 and "already has an AGIZA account" in res.json()["error"]["message"]


def test_codes_are_not_sent_without_sms_outside_debug(api):
    res = api.post(f"{APP}/auth/request-code/", {"phone": "0754111222", "purpose": "register"})
    assert res.status_code == 409
    assert not PhoneVerification.objects.exists()


@override_settings(DEBUG=True)
def test_debug_without_sms_logs_the_code_instead(api, caplog):
    res = api.post(f"{APP}/auth/request-code/", {"phone": "0754111222", "purpose": "register"})
    assert res.status_code == 200 and res.json()["sms_configured"] is False
    assert "verification code for +255754111222" in caplog.text


def test_login_refresh_rotation_and_logout(api, account):
    assert api.post(f"{APP}/auth/login/", {"phone": "0712345678", "password": "wrong-password"}).status_code == 400
    res = api.post(f"{APP}/auth/login/", {"phone": "+255 712 345 678", "password": PASSWORD})
    assert res.status_code == 200
    tokens = res.json()

    rotated = api.post(f"{APP}/auth/refresh/", {"refresh": tokens["refresh"]})
    assert rotated.status_code == 200
    assert api.post(f"{APP}/auth/refresh/", {"refresh": tokens["refresh"]}).status_code == 401  # used once only

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {rotated.json()['access']}")
    assert client.get(f"{APP}/me/").status_code == 200
    assert client.post(f"{APP}/auth/logout/", {"refresh": rotated.json()["refresh"]}).status_code == 204
    assert api.post(f"{APP}/auth/refresh/", {"refresh": rotated.json()["refresh"]}).status_code == 401


def test_customer_and_staff_tokens_are_not_interchangeable(api, account, make_user):
    customer_tokens = api.post(f"{APP}/auth/login/", {"phone": "0712345678", "password": PASSWORD}).json()
    staff = APIClient()
    staff.credentials(HTTP_AUTHORIZATION=f"Bearer {customer_tokens['access']}")
    assert staff.get("/api/customers/").status_code == 401
    assert staff.get("/api/auth/me/").status_code == 401
    assert api.post("/api/auth/refresh/", {"refresh": customer_tokens["refresh"]}).status_code == 401

    make_user("top_admin", email="boss@agiza.test")
    staff_tokens = api.post("/api/auth/login/", {"email": "boss@agiza.test", "password": "Str0ng-Passw0rd!"}).json()
    impostor = APIClient()
    impostor.credentials(HTTP_AUTHORIZATION=f"Bearer {staff_tokens['access']}")
    assert impostor.get(f"{APP}/me/").status_code == 401
    assert api.post(f"{APP}/auth/refresh/", {"refresh": staff_tokens["refresh"]}).status_code == 401


def test_customer_accounts_cannot_sign_in_to_the_admin(api, account):
    res = api.post("/api/auth/login/", {"email": "+255712345678", "password": PASSWORD})
    assert res.status_code in (400, 401)


def test_change_password_signs_out_other_sessions(app, account):
    res = app.post(f"{APP}/auth/change-password/", {"current_password": PASSWORD, "new_password": "Kilimanjaro-5895m"})
    assert res.status_code == 200
    assert app.get(f"{APP}/me/").status_code == 401  # the old access token is revoked
    fresh = APIClient()
    fresh.credentials(HTTP_AUTHORIZATION=f"Bearer {res.json()['access']}")
    assert fresh.get(f"{APP}/me/").status_code == 200


def test_reset_password_with_code(api, sms, account):
    assert api.post(f"{APP}/auth/request-code/", {"phone": "0712345678", "purpose": "reset_password"}).status_code == 200
    res = api.post(f"{APP}/auth/reset-password/", {"phone": "0712345678", "code": sms.last_code(),
                                                   "password": "New-Strong-Pass-2026"})
    assert res.status_code == 200
    assert api.post(f"{APP}/auth/login/", {"phone": "0712345678", "password": "New-Strong-Pass-2026"}).status_code == 200


def test_reset_request_does_not_reveal_unknown_numbers(api, sms):
    res = api.post(f"{APP}/auth/request-code/", {"phone": "0799999999", "purpose": "reset_password"})
    assert res.status_code == 200 and sms.sent == []


def test_weak_passwords_are_refused(api, sms):
    res = register(api, sms, password="12345678")
    assert res.status_code == 400 and res.json()["error"]["details"]["password"]


def test_profile_update_and_email_uniqueness(app, other_app):
    other_app.patch(f"{APP}/me/", {"email": "taken@example.com"}, format="json")
    assert app.patch(f"{APP}/me/", {"email": "Taken@example.com"}, format="json").status_code == 400
    res = app.patch(f"{APP}/me/", {"full_name": "Neema J. Mollel", "phone": "+255700000000"}, format="json")
    assert res.status_code == 200
    assert res.json()["full_name"] == "Neema J. Mollel" and res.json()["phone"] == "+255712345678"


def test_disabled_customer_is_signed_out(app, account):
    Customer.objects.filter(pk=account.customer_id).update(status="inactive")
    assert app.get(f"{APP}/me/").status_code == 401


def test_delete_account_keeps_orders_but_removes_login(app, account):
    assert app.post(f"{APP}/auth/delete-account/", {"password": "nope"}).status_code == 400
    assert app.post(f"{APP}/auth/delete-account/", {"password": PASSWORD}).status_code == 204
    assert not CustomerAccount.objects.exists()
    assert Customer.objects.filter(pk=account.customer_id).exists()
    assert app.get(f"{APP}/me/").status_code == 401


def test_push_device_registration(app, other_app):
    assert app.post(f"{APP}/devices/", {"token": "not-a-token"}).status_code == 400
    token = "ExponentPushToken[abc123]"
    assert app.post(f"{APP}/devices/", {"token": token, "platform": "android"}).status_code == 204
    assert other_app.post(f"{APP}/devices/", {"token": token, "platform": "android"}).status_code == 204
    assert list(other_app.account.devices.values_list("token", flat=True)) == [token]
    assert not app.account.devices.exists()


def test_every_customer_endpoint_requires_sign_in(api, db):
    for path in ("me/", "cart/", "addresses/", "orders/", "requests/", "support/messages/"):
        assert api.get(f"{APP}/{path}").status_code == 401, path


def test_second_account_helper_is_isolated(db):
    first, second = make_account(), make_account(phone="255765000999", name="Other")
    assert client_for_account(first).get(f"{APP}/me/").json()["reference"] != \
        client_for_account(second).get(f"{APP}/me/").json()["reference"]
