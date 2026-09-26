from django.test import RequestFactory, override_settings

from apps.core.audit import client_ip


def _req(xff=None, remote="10.0.0.9"):
    meta = {"REMOTE_ADDR": remote}
    if xff:
        meta["HTTP_X_FORWARDED_FOR"] = xff
    return RequestFactory().get("/", **meta)


def test_client_ip_without_proxy_header_uses_remote_addr():
    assert client_ip(_req()) == "10.0.0.9"


def test_client_ip_trusts_only_proxy_appended_entries():
    from django.conf import settings

    spoofed = "6.6.6.6, 41.59.1.20, 172.18.0.2"  # client-sent, nginx-added, next-added
    with override_settings(REST_FRAMEWORK={**settings.REST_FRAMEWORK, "NUM_PROXIES": 2}):
        assert client_ip(_req(spoofed)) == "41.59.1.20"
    with override_settings(REST_FRAMEWORK={**settings.REST_FRAMEWORK, "NUM_PROXIES": 0}):
        assert client_ip(_req(spoofed)) == "10.0.0.9"
