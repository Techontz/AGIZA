"""
Sellers use their own app: store-owner notifications go to the seller app's inbox and its devices,
never to the customer app (and customer notifications never reach the seller app).
"""
from unittest import mock

import pytest

from apps.storefront import push
from apps.storefront.models import CustomerNotification, PushDevice

from .conftest import APP, SELLER
from .test_checkout import checkout

pytestmark = pytest.mark.django_db

CUSTOMER_TOKEN = "ExponentPushToken[customer-device]"
SELLER_TOKEN = "ExponentPushToken[seller-device]"


def test_seller_notifications_live_in_the_seller_app(app, home, shop, vendor_a):
    owner = vendor_a.client
    # Approval already notified the owner: it is in the seller inbox only.
    seller_inbox = owner.get(f"{SELLER}/notifications/").json()
    assert seller_inbox["count"] >= 1 and seller_inbox["unread"] >= 1
    assert all(n["data"].get("type") == "seller" for n in seller_inbox["results"])
    assert owner.get(f"{APP}/notifications/").json()["count"] == 0

    # A new order for the store is a seller notification too; the buyer's notification stays in the customer app.
    checkout(app, home, shop, [(vendor_a.variant, 1)], key="seller-app-0001")
    titles = [n["title"] for n in owner.get(f"{SELLER}/notifications/").json()["results"]]
    assert any(t.startswith("New order") for t in titles)
    assert all(n.audience == "customer" for n in CustomerNotification.objects.filter(customer=home.customer))

    # Marking read is per app.
    assert owner.post(f"{SELLER}/notifications/read/", {}, format="json").json() == {"unread": 0}


def test_pushes_go_to_the_matching_app_only(vendor_a):
    owner = vendor_a.client
    assert owner.post(f"{APP}/devices/", {"token": CUSTOMER_TOKEN, "platform": "android"}, format="json").status_code == 204
    assert owner.post(f"{APP}/devices/", {"token": SELLER_TOKEN, "platform": "android", "app": "seller"},
                      format="json").status_code == 204
    assert PushDevice.objects.get(token=SELLER_TOKEN).app == "seller"
    customer = vendor_a.vendor.owner.customer
    with mock.patch.object(push.transaction, "on_commit", side_effect=lambda fn: fn()), \
            mock.patch.object(push.threading, "Thread") as thread, \
            mock.patch.object(push.settings, "EXPO_PUSH_ENABLED", True):
        push.notify_customer(customer, title="New order", body="x", audience="seller")
        assert thread.call_args.kwargs["args"][0] == [SELLER_TOKEN]
        push.notify_customer(customer, title="Your order", body="y")
        assert thread.call_args.kwargs["args"][0] == [CUSTOMER_TOKEN]
