"""Vendor fulfilment problems, pickup tasks per vendor location, verified reviews, wishlist and the inbox."""
from decimal import Decimal as D

import pytest

from apps.accounts.constants import StaffLevel
from apps.deliveries.models import PickupTask
from apps.inventory.models import StockItem
from apps.marketplace.models import ProductReview, VendorFulfillment
from apps.orders import services as order_services
from apps.orders.models import OrderAdjustment
from apps.returns.models import ReturnRequest
from apps.storefront.models import CustomerNotification

from .conftest import APP, SELLER
from .test_checkout import checkout, collect_pickups
from .test_returns_ledger_payouts import delivered_paid_order

pytestmark = pytest.mark.django_db


# --------------------------------------------------------------------------- #
# Fulfilment problems
# --------------------------------------------------------------------------- #
def report(seller, part, issue="item_unavailable", note="Last unit was sold in the shop this morning."):
    return seller.client.post(f"{SELLER}/orders/{part.pk}/issue/", {"issue_type": issue, "note": note}, format="json")


def test_vendor_reports_a_problem_and_agiza_cancels_only_that_part(app, home, shop, staff, vendor_a, vendor_b):
    order = checkout(app, home, shop, [(shop.cable_variant, 1), (vendor_a.variant, 1), (vendor_b.variant, 1)],
                     key="issue-order-0001")
    part_a = VendorFulfillment.objects.get(order=order, vendor=vendor_a.vendor)
    assert report(vendor_a, part_a, note="x").status_code == 400  # needs an explanation
    assert report(vendor_b, part_a).status_code == 404  # not B's order
    res = report(vendor_a, part_a)
    assert res.status_code == 200 and res.json()["issue"]["type"] == "item_unavailable"
    assert res.json()["can_accept"] is False  # frozen until AGIZA decides
    assert report(vendor_a, part_a).status_code == 409  # already reported
    assert CustomerNotification.objects.filter(customer=order.customer, title__contains=order.reference).exists()
    rows = staff.get("/api/marketplace/fulfillments/", {"issue_open": "true"}).json()["results"]
    assert [r["id"] for r in rows] == [part_a.pk]
    # AGIZA cancels only A's part; B and AGIZA's own items carry on.
    res = staff.post(f"/api/marketplace/fulfillments/{part_a.pk}/resolve/", {"action": "cancel_part",
                                                                            "note": "Seller out of stock"},
                     format="json")
    assert res.status_code == 200, res.json()
    part_a.refresh_from_db()
    assert part_a.status == "cancelled" and part_a.settlement_status == "void"
    assert StockItem.objects.get(variant=vendor_a.variant).reserved == 0
    order.refresh_from_db()
    assert order.status == "pending"
    assert order.total_amount == D("15000") + D("45000") + D("6000")  # 386,000 − 320,000 − 3,000
    adj = OrderAdjustment.objects.get(order=order)
    assert (adj.total_before, adj.total_after, adj.amount) == (D("389000"), D("66000"), D("-323000"))
    body = app.get(f"{APP}/orders/{order.reference}/").json()
    assert body["amounts"]["subtotal"] == "60000" or body["amounts"]["subtotal"] == "60000.00"
    assert body["adjustments"][0]["amount"] == "-323000.00"
    assert [s["status"] for s in body["sellers"] if s["vendor"]["name"] == "Vendor A Electronics"] == ["cancelled"]
    # The rest can still be fulfilled and shipped (no pickup is owed for A anymore).
    part_b = VendorFulfillment.objects.get(order=order, vendor=vendor_b.vendor)
    vendor_b.client.post(f"{SELLER}/orders/{part_b.pk}/accept/")
    vendor_b.client.post(f"{SELLER}/orders/{part_b.pk}/ready/")
    order_services.transition(order, "processing", staff.user)
    collect_pickups(order, staff)
    assert staff.post(f"/api/orders/shop/{order.pk}/ship/", {}, format="json").status_code == 200
    assert StockItem.objects.get(variant=vendor_a.variant).quantity == 10  # A's stock never left


def test_cancelling_a_paid_part_opens_a_refund_the_customer_is_owed(app, home, shop, staff, vendor_a, vendor_b):
    order = checkout(app, home, shop, [(vendor_a.variant, 1), (vendor_b.variant, 1)], key="issue-order-0002")
    order_services.record_payment(order, amount=order.total_amount, method="cash", user=staff.user)
    part_b = VendorFulfillment.objects.get(order=order, vendor=vendor_b.vendor)
    report(vendor_b, part_b, issue="damaged_item", note="The dress got stained in storage.")
    staff.post(f"/api/marketplace/fulfillments/{part_b.pk}/resolve/", {"action": "cancel_part", "note": "Damaged"},
               format="json")
    ret = ReturnRequest.objects.get(order=order)
    assert ret.return_type == "seller_cannot_fulfill" and ret.status == "approved"
    assert ret.refund_amount == D("48000")  # dress 45,000 + its 3,000 delivery share
    assert app.get(f"{APP}/returns/{ret.reference}/").json()["refund_status"] == "pending"
    # Recording the refund doesn't debit vendor B: it never earned the cancelled part.
    staff.post(f"/api/returns/{ret.pk}/close/", {"refund_method": "mobile_money", "refund_reference": "RF-9"},
               format="json")
    from apps.marketplace.models import VendorLedgerEntry

    assert not VendorLedgerEntry.objects.filter(kind="refund").exists()


def test_continue_clears_the_problem(app, home, shop, staff, vendor_a):
    order = checkout(app, home, shop, [(vendor_a.variant, 1)], key="issue-order-0003")
    part = VendorFulfillment.objects.get(order=order)
    report(vendor_a, part, issue="stock_discrepancy", note="Count was off by one, found another unit.")
    staff.post(f"/api/marketplace/fulfillments/{part.pk}/resolve/", {"action": "continue", "note": "Go ahead"},
               format="json")
    assert vendor_a.client.post(f"{SELLER}/orders/{part.pk}/accept/").status_code == 200


def test_only_staff_resolve_problems(app, home, shop, vendor_a, client_for):
    order = checkout(app, home, shop, [(vendor_a.variant, 1)], key="issue-order-0004")
    part = VendorFulfillment.objects.get(order=order)
    report(vendor_a, part)
    assert vendor_a.client.post(f"/api/marketplace/fulfillments/{part.pk}/resolve/", {}, format="json").status_code == 401
    assert client_for(StaffLevel.SALES).post(f"/api/marketplace/fulfillments/{part.pk}/resolve/",
                                             {"action": "continue", "note": "x"}, format="json").status_code == 403


# --------------------------------------------------------------------------- #
# Pickup tasks
# --------------------------------------------------------------------------- #
def test_pickups_follow_where_items_are(app, home, shop, staff, vendor_a, vendor_b):
    # AGIZA-only order: shipped as before, no pickups.
    only_agiza = checkout(app, home, shop, [(shop.cable_variant, 1)], key="pickup-order-0001")
    assert not PickupTask.objects.filter(order=only_agiza).exists()
    # A single vendor's order: delivered straight from the vendor, no pickups.
    only_a = checkout(app, home, shop, [(vendor_a.variant, 1)], key="pickup-order-0002")
    assert not PickupTask.objects.filter(order=only_a).exists()
    # AGIZA + two vendors: one pickup per vendor location to AGIZA's warehouse (the hub).
    mixed = checkout(app, home, shop, [(shop.cable_variant, 1), (vendor_a.variant, 1), (vendor_b.variant, 1)],
                     key="pickup-order-0003")
    tasks = {t.vendor.name: t for t in PickupTask.objects.filter(order=mixed)}
    assert set(tasks) == {"Vendor A Electronics", "Vendor B Fashion"}
    assert {t.destination for t in tasks.values()} == {shop.warehouse}
    assert tasks["Vendor A Electronics"].origin == vendor_a.vendor.warehouse
    assert {t.status for t in tasks.values()} == {"pending"}
    part_a = VendorFulfillment.objects.get(order=mixed, vendor=vendor_a.vendor)
    vendor_a.client.post(f"{SELLER}/orders/{part_a.pk}/accept/")
    vendor_a.client.post(f"{SELLER}/orders/{part_a.pk}/ready/")
    assert PickupTask.objects.get(fulfillment=part_a).status == "ready"
    # A single-vendor order ships from the vendor's location.
    order_services.transition(only_a, "processing", staff.user)
    part = VendorFulfillment.objects.get(order=only_a)
    vendor_a.client.post(f"{SELLER}/orders/{part.pk}/accept/")
    vendor_a.client.post(f"{SELLER}/orders/{part.pk}/ready/")
    staff.post(f"/api/orders/shop/{only_a.pk}/ship/", {}, format="json")
    assert only_a.deliveries.get().pickup_warehouse == vendor_a.vendor.warehouse


def test_pickup_steps_need_proof_and_riders_see_only_theirs(app, home, shop, staff, vendor_a, vendor_b,
                                                            make_user, client_for):
    mixed = checkout(app, home, shop, [(shop.cable_variant, 1), (vendor_a.variant, 1), (vendor_b.variant, 1)],
                     key="pickup-order-0004")
    task = PickupTask.objects.get(order=mixed, vendor=vendor_a.vendor)
    assert staff.post(f"/api/deliveries/pickups/{task.pk}/assign/", {"driver": 999999},
                      format="json").status_code == 409  # not ready yet
    part = VendorFulfillment.objects.get(order=mixed, vendor=vendor_a.vendor)
    vendor_a.client.post(f"{SELLER}/orders/{part.pk}/accept/")
    vendor_a.client.post(f"{SELLER}/orders/{part.pk}/ready/")
    rider = make_user(StaffLevel.DRIVER)
    assert staff.post(f"/api/deliveries/pickups/{task.pk}/assign/", {"driver": rider.pk}, format="json").status_code == 200
    assert staff.post(f"/api/deliveries/pickups/{task.pk}/advance/", {"status": "collected"},
                      format="json").status_code == 400  # who handed it over?
    rider_client = client_for(StaffLevel.DRIVER)
    assert rider_client.get("/api/deliveries/pickups/").json()["results"] == []  # another rider's task
    from rest_framework.test import APIClient

    own = APIClient()
    own.force_authenticate(rider)
    assert [r["reference"] for r in own.get("/api/deliveries/pickups/").json()["results"]] == [task.reference]
    assert vendor_a.client.get("/api/deliveries/pickups/").status_code == 401


# --------------------------------------------------------------------------- #
# Reviews
# --------------------------------------------------------------------------- #
def test_only_buyers_review_once_and_ratings_are_computed(app, other_app, anon, home, shop, staff, vendor_a):
    url = f"{APP}/products/{vendor_a.product.pk}/reviews/"
    assert app.post(url, {"rating": 5, "body": "Great"}, format="json").status_code == 409  # not bought
    assert anon.post(url, {"rating": 5}, format="json").status_code == 401
    delivered_paid_order(app, home, shop, staff, [(vendor_a.variant, 1)], key="review-order-001", vendors=[vendor_a])
    assert app.post(url, {"rating": 9}, format="json").status_code == 400
    res = app.post(url, {"rating": 4, "title": "Solid phone", "body": "Battery lasts two days."}, format="json")
    assert res.status_code == 201 and res.json()["status"] == "published"
    res = app.post(url, {"rating": 5, "title": "Even better after update"}, format="json")  # edit, not a second one
    assert res.status_code == 200 and ProductReview.objects.count() == 1
    assert other_app.post(url, {"rating": 1}, format="json").status_code == 409  # never bought it
    # The store's owner can't review its own products.
    assert vendor_a.client.post(url, {"rating": 5}, format="json").status_code in (409, 403)
    public = anon.get(url).json()
    assert public["rating"] == "5.0" and public["rating_count"] == 1 and public["distribution"]["5"] == 1
    assert public["results"][0]["author"] == "Neema J." and public["results"][0]["verified_purchase"]
    assert anon.get(f"{APP}/products/{vendor_a.product.pk}/").json()["rating"] == "5.0"
    assert anon.get(f"{APP}/stores/{vendor_a.vendor.slug}/").json()["rating"] == "5.0"
    # The vendor replies or flags; it can't edit or delete the review.
    review = ProductReview.objects.get()
    assert vendor_a.client.post(f"{SELLER}/reviews/{review.pk}/reply/", {"text": "Thank you!"},
                                format="json").status_code == 200
    assert vendor_a.client.post(f"{SELLER}/reviews/{review.pk}/flag/", {"reason": "?"},
                                format="json").status_code == 400
    assert anon.get(url).json()["results"][0]["vendor_reply"] == "Thank you!"
    # Staff hide abusive reviews; hidden reviews leave the rating.
    assert staff.post(f"/api/marketplace/reviews/{review.pk}/moderate/", {"action": "hide"},
                      format="json").status_code == 400  # reason needed
    staff.post(f"/api/marketplace/reviews/{review.pk}/moderate/", {"action": "hide", "note": "Off-topic"},
               format="json")
    assert anon.get(url).json()["rating_count"] == 0
    assert app.post(url, {"rating": 1}, format="json").status_code == 409  # hidden reviews can't be edited


def test_reviews_wait_for_approval_when_configured(app, anon, home, shop, staff, vendor_a):
    from apps.marketplace.models import MarketplaceSettings

    settings = MarketplaceSettings.load()
    settings.auto_publish_reviews = False
    settings.save()
    delivered_paid_order(app, home, shop, staff, [(vendor_a.variant, 1)], key="review-order-002", vendors=[vendor_a])
    url = f"{APP}/products/{vendor_a.product.pk}/reviews/"
    assert app.post(url, {"rating": 3}, format="json").json()["status"] == "pending"
    assert anon.get(url).json()["rating_count"] == 0
    review = ProductReview.objects.get()
    staff.post(f"/api/marketplace/reviews/{review.pk}/moderate/", {"action": "publish"}, format="json")
    assert anon.get(url).json()["rating_count"] == 1


# --------------------------------------------------------------------------- #
# Wishlist and inbox
# --------------------------------------------------------------------------- #
def test_wishlist(app, other_app, anon, shop, vendor_a):
    assert anon.get(f"{APP}/wishlist/").status_code == 401
    assert app.post(f"{APP}/wishlist/", {"product": vendor_a.product.pk}, format="json").status_code == 201
    assert app.post(f"{APP}/wishlist/", {"product": vendor_a.product.pk}, format="json").status_code == 200  # twice ok
    assert app.post(f"{APP}/wishlist/", {"product": shop.draft.pk}, format="json").status_code == 400  # hidden
    body = app.post(f"{APP}/wishlist/merge/", {"products": [shop.product.pk, shop.draft.pk, vendor_a.product.pk]},
                    format="json").json()
    assert set(body["product_ids"]) == {vendor_a.product.pk, shop.product.pk}
    assert body["products"][0]["vendor"]["slug"]
    assert other_app.get(f"{APP}/wishlist/").json()["product_ids"] == []
    assert app.delete(f"{APP}/wishlist/{shop.product.pk}/").json()["product_ids"] == [vendor_a.product.pk]


def test_notification_inbox_is_private(app, other_app, home, shop, staff, vendor_a):
    delivered_paid_order(app, home, shop, staff, [(vendor_a.variant, 1)], key="inbox-order-0001", vendors=[vendor_a])
    inbox = app.get(f"{APP}/notifications/").json()
    assert inbox["unread"] >= 2 and any("Payment received" in n["title"] for n in inbox["results"])
    assert other_app.get(f"{APP}/notifications/").json()["results"] == []
    ids = [n["id"] for n in inbox["results"]]
    assert other_app.post(f"{APP}/notifications/read/", {"ids": ids}, format="json").json()["unread"] == 0
    assert app.get(f"{APP}/notifications/").json()["unread"] == inbox["unread"]  # untouched by the other customer
    assert app.post(f"{APP}/notifications/read/", {}, format="json").json()["unread"] == 0
