"""Beem Africa SMS provider: the request AGIZA's previous server sent, with stricter error handling."""
import base64
import io
import json
import logging
import urllib.error

import pytest
from django.test import override_settings

from apps.notifications import providers
from apps.notifications.providers import NotConfigured, SendError, SmsProvider

pytestmark = pytest.mark.django_db

BEEM = {"BEEM_API_KEY": "test-key", "BEEM_SECRET_KEY": "test-secret-value", "BEEM_SENDER_ID": "AGIZA"}
APP = "/api/app"


class FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


@pytest.fixture
def beem(monkeypatch):
    calls = []
    reply = {"body": {"successful": True, "request_id": 4471, "code": 100, "message": "Message Submitted Successfully",
                      "valid": 1, "invalid": 0, "duplicates": 0}}

    def urlopen(req, timeout):
        calls.append(req)
        if "error" in reply:
            raise reply["error"]
        return FakeResponse(json.dumps(reply["body"]).encode())

    monkeypatch.setattr(providers.urllib.request, "urlopen", urlopen)
    return calls, reply


@override_settings(**BEEM)
def test_send_matches_beems_api(beem):
    calls, _ = beem
    assert SmsProvider().send("+255 712-345 678", "Your AGIZA code is 123456.") == "4471"
    req = calls[0]
    assert req.full_url == "https://apisms.beem.africa/v1/send" and req.get_method() == "POST"
    assert req.headers["Authorization"] == "Basic " + base64.b64encode(b"test-key:test-secret-value").decode()
    body = json.loads(req.data)
    assert body["source_addr"] == "AGIZA" and body["encoding"] == 0
    assert body["recipients"] == [{"recipient_id": 1, "dest_addr": "255712345678"}]
    assert body["message"] == "Your AGIZA code is 123456."


@pytest.mark.parametrize(("number", "expected"), [("0712345678", "255712345678"), ("+255712345678", "255712345678"),
                                                   ("254 712 345 678", "254712345678")])
def test_recipient_numbers_are_digits_with_country_code(number, expected):
    assert SmsProvider.recipient(number) == expected


def test_invalid_numbers_are_refused():
    with pytest.raises(SendError):
        SmsProvider.recipient("12345")


def test_not_configured_without_all_three_settings():
    assert SmsProvider.configured() is False
    with override_settings(BEEM_API_KEY="k", BEEM_SECRET_KEY="s"), pytest.raises(NotConfigured):
        SmsProvider().send("0712345678", "hi")


@override_settings(**BEEM)
def test_refusals_and_http_errors_raise_without_leaking_credentials(beem, caplog):
    _, reply = beem
    reply["body"] = {"successful": False, "code": 111, "message": "Invalid Sender Id"}
    with pytest.raises(SendError, match="Invalid Sender Id") as refused:
        SmsProvider().send("0712345678", "hi")
    reply["body"] = {"successful": True, "valid": 0, "invalid": 1, "message": "Invalid phone number"}
    with pytest.raises(SendError):
        SmsProvider().send("0712345678", "hi")
    reply["error"] = urllib.error.HTTPError("u", 401, "Unauthorized", {}, io.BytesIO(b'{"message": "Invalid api_key"}'))
    with caplog.at_level(logging.DEBUG), pytest.raises(SendError, match="HTTP 401: Invalid api_key") as http:
        SmsProvider().send("0712345678", "hi")
    reply["error"] = urllib.error.URLError("timed out")
    with pytest.raises(SendError, match="unreachable"):
        SmsProvider().send("0712345678", "hi")
    for text in (str(refused.value), str(http.value), caplog.text):
        assert "test-secret-value" not in text and "test-key" not in text


@override_settings(**BEEM)
def test_registration_code_goes_out_through_beem(api, beem):
    calls, _ = beem
    res = api.post(f"{APP}/auth/request-code/", {"phone": "0754 111 222", "purpose": "register"})
    assert res.status_code == 200 and res.json()["sms_configured"] is True
    body = json.loads(calls[0].data)
    assert body["recipients"][0]["dest_addr"] == "255754111222"
    code = body["message"].split("code is ")[1][:6]
    assert code.isdigit()
    assert api.get(f"{APP}/config/").json()["phone_verification"] is True


@override_settings(**BEEM)
def test_failed_sms_does_not_leave_a_usable_code(api, beem):
    from apps.storefront.models import PhoneVerification

    _, reply = beem
    reply["body"] = {"successful": False, "message": "Insufficient balance"}
    res = api.post(f"{APP}/auth/request-code/", {"phone": "0754111222", "purpose": "register"})
    assert res.status_code == 400 and "couldn't send the code" in res.json()["error"]["message"]
    assert not PhoneVerification.objects.exists()
