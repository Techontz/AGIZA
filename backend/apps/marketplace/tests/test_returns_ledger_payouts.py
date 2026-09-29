"""
Returns and refunds with marketplace accounting: the customer asks, AGIZA decides and records the
refund, and the seller's earnings are reconciled through the append-only ledger — before or after
a payout. Payouts go processing → paid / failed / reversed and can never pay the same money twice.
"""
from decimal import Decimal as D

import pytest
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.accounts.constants import StaffLevel
from apps.catalog.tests.test_catalog import PNG
from apps.inventory.models import StockItem
from apps.marketplace import ledger
from apps.marketplace.models import VendorFulfillment, VendorLedgerEntry, VendorPayout
from apps.orders import services as order_services
from apps.returns.models import ReturnRequest

from .conftest import APP, SELLER
from .test_checkout import _deliver, checkout, collect_pickups

pytestmark = pytest.mark.django_db


def delivered_paid_order(app, home, shop, staff, lines, key="rt-order-0001", vendors=()):
    order = checkout(app, home, shop, lines, key=key)
    order_services.transition(order, "processing", staff.user)
    for seller in vendors:
        part = VendorFulfillment.objects.get(order=order, vendor=seller.vendor)
        seller.client.post(f"{SELLER}/orders/{part.pk}/accept/")
        seller.client.post(f"{SELLER}/orders/{part.pk}/ready/")
    collect_pickups(order, staff)
    assert staff.post(f"/api/orders/shop/{order.pk}/ship/", {}, format="json").status_code == 200
    order.refresh_from_db()
    _deliver(order, staff.user)
    order_services.record_payment(order, amount=order.total_amount, method="cash", user=staff.user)
    order.refresh_from_db()
    return order


def ask_return(app, order, item, qty=1, reason="defective"):
    return app.post(f"{APP}/orders/{order.reference}/returns/", {
        "lines": [{"item": item.pk, "quantity": qty}], "reason_code": reason,
        "explanation": "The screen flickers after an hour."}, format="json")


def refund(staff, ret, amount=None, reference="MPESA-RF1"):
    """Staff: item received → inspected → approved with a refund → refund recorded (closed)."""
    assert staff.post(f"/api/returns/{ret.pk}/transition/", {"status": "received"}, format="json").status_code == 200
    assert staff.post(f"/api/returns/{ret.pk}/inspect/", {"item_condition": "damaged", "notes": "Confirmed fault",
                                                           "restock": False}, format="json").status_code == 200
    body = {"approve": True, "notes": "Faulty on arrival"}
    if amount is not None:
        body["refund_amount"] = amount
    assert staff.post(f"/api/returns/{ret.pk}/decide/", body, format="json").status_code == 200
    res = staff.post(f"/api/returns/{ret.pk}/close/", {"refund_method": "mobile_money",
                                                        "refund_reference": reference}, format="json")
    assert res.status_code == 200, res.json()
    return res.json()


def test_customer_return_request_rules(app, other_app, home, shop, staff, vendor_a):
    order = checkout(app, home, shop, [(vendor_a.variant, 2)], key="rt-order-early")
    item = order.items.get()
    assert ask_return(app, order, item).status_code == 409  # not delivered yet
    order = delivered_paid_order(app, home, shop, staff, [(vendor_a.variant, 2)], vendors=[vendor_a])
    item = order.items.get()
    info = app.get(f"{APP}/orders/{order.reference}/returns/").json()
    assert info["can_return"] and info["items"][0]["returnable"] == 2 and info["window_days"] == 7
    assert ask_return(app, order, item, qty=3).status_code == 400  # more than bought
    assert ask_return(app, order, item, reason="nonsense").status_code == 400
    assert ask_return(other_app, order, item).status_code == 404  # not their order
    res = ask_return(app, order, item, qty=1)
    assert res.status_code == 201, res.json()
    body = res.json()
    assert body["status_display"] == "Requested" and body["refund_status"] == "not_decided"
    assert body["lines"][0]["quantity"] == 1 and body["value"] == "320000.00"
    assert app.get(f"{APP}/orders/{order.reference}/returns/").json()["items"][0]["returnable"] == 1
    # Evidence: images only, the customer's own return only.
    ref = body["reference"]
    photo = SimpleUploadedFile("p.png", PNG, content_type="image/png")
    assert app.post(f"{APP}/returns/{ref}/evidence/", {"file": photo}, format="multipart").status_code == 201
    script = SimpleUploadedFile("x.png", b"<script>alert(1)</script>", content_type="image/png")
    assert app.post(f"{APP}/returns/{ref}/evidence/", {"file": script}, format="multipart").status_code == 400
    assert other_app.get(f"{APP}/returns/{ref}/").status_code == 404
    evidence = app.get(f"{APP}/returns/{ref}/").json()["evidence"]
    assert len(evidence) == 1
    stored = ReturnRequest.objects.get(reference=ref).attachments.get().file.name
    assert stored.startswith("private/returns/") and "p.png" not in stored  # random name, never the upload's


def test_refund_before_payout_reduces_the_vendors_payable_balance(app, home, shop, staff, vendor_a):
    order = delivered_paid_order(app, home, shop, staff, [(vendor_a.variant, 2)], vendors=[vendor_a])
    assert ledger.balance(vendor_a.vendor).payable == D("576000")  # 2 × 320,000 − 10%
    ret = ReturnRequest.objects.get(reference=ask_return(app, order, order.items.get()).json()["reference"])
    body = refund(staff, ret)
    assert body["refund_status"] == "refunded" and body["customer_status_display"] == "Refunded"
    ret.refresh_from_db()
    assert ret.refund_amount == D("320000") and ret.reconciled_at is not None
    entry = VendorLedgerEntry.objects.get(kind="refund")
    assert (entry.amount, entry.gross_amount, entry.commission_amount) == (D("-288000"), D("-320000"), D("-32000"))
    assert ledger.balance(vendor_a.vendor).payable == D("288000")
    # The customer sees it; the vendor sees the return and its effect, but can't touch the refund.
    assert app.get(f"{APP}/returns/{ret.reference}/").json()["status_display"] == "Refunded"
    seller_view = vendor_a.client.get(f"{SELLER}/returns/{ret.reference}/").json()
    assert seller_view["refund_status"] == "refunded" and seller_view["items"][0]["quantity"] == 1
    assert vendor_a.client.get(f"{SELLER}/earnings/").json()["summary"]["refunds"] == "288000.00"
    # Reconciling twice is impossible (idempotent keys).
    from apps.returns.services import reconcile

    reconcile(ret, user=staff.user)
    assert VendorLedgerEntry.objects.filter(kind="refund").count() == 1


def test_refund_after_payout_is_an_explicit_debit_never_a_rewrite(app, home, shop, staff, vendor_a):
    order = delivered_paid_order(app, home, shop, staff, [(vendor_a.variant, 1)], vendors=[vendor_a])
    payout = ledger.record_payout(vendor_a.vendor, user=staff.user, method="mobile_money",
                                  transaction_reference="MPESA-P1")
    assert payout.amount == D("288000") and ledger.balance(vendor_a.vendor).payable == 0
    ret = ReturnRequest.objects.get(reference=ask_return(app, order, order.items.get()).json()["reference"])
    refund(staff, ret)
    payout.refresh_from_db()
    assert payout.amount == D("288000") and payout.status == "paid"  # history untouched
    assert ledger.balance(vendor_a.vendor).payable == D("-288000")  # the vendor owes it back
    with pytest.raises(Exception):
        ledger.create_payout(vendor_a.vendor, user=staff.user)  # nothing to pay while in debt
    # A new sale nets against the debit.
    delivered_paid_order(app, home, shop, staff, [(vendor_a.variant, 2)], key="rt-order-0002", vendors=[vendor_a])
    assert ledger.balance(vendor_a.vendor).payable == D("288000")


def test_partial_refund_is_shared_by_value_and_extra_is_agizas(app, home, shop, staff, vendor_a, vendor_b):
    order = delivered_paid_order(app, home, shop, staff, [(vendor_a.variant, 1), (vendor_b.variant, 1)],
                                 vendors=[vendor_a, vendor_b])
    item = order.items.get(variant=vendor_b.variant)
    ret = ReturnRequest.objects.get(reference=ask_return(app, order, item).json()["reference"])
    refund(staff, ret, amount="30000")  # partial (damaged, customer keeps it)
    entry = VendorLedgerEntry.objects.get(kind="refund")
    assert entry.vendor == vendor_b.vendor
    assert (entry.gross_amount, entry.commission_amount, entry.amount) == (D("-30000"), D("-3000"), D("-27000"))
    assert not VendorLedgerEntry.objects.filter(kind="refund", vendor=vendor_a.vendor).exists()


def test_resellable_returns_go_back_to_the_sellers_stock(app, home, shop, staff, vendor_a):
    order = delivered_paid_order(app, home, shop, staff, [(vendor_a.variant, 2)], vendors=[vendor_a])
    assert StockItem.objects.get(variant=vendor_a.variant).quantity == 8
    ret = ReturnRequest.objects.get(reference=ask_return(app, order, order.items.get(), reason="customer_changed_mind")
                                    .json()["reference"])
    staff.post(f"/api/returns/{ret.pk}/transition/", {"status": "received"}, format="json")
    staff.post(f"/api/returns/{ret.pk}/inspect/", {"item_condition": "as_described", "notes": "Sealed box"},
               format="json")
    assert StockItem.objects.get(variant=vendor_a.variant).quantity == 9
    ret.refresh_from_db()
    assert ret.restocked


def test_only_finance_can_record_a_refund(app, home, shop, staff, vendor_a, client_for):
    order = delivered_paid_order(app, home, shop, staff, [(vendor_a.variant, 1)], vendors=[vendor_a])
    ret = ReturnRequest.objects.get(reference=ask_return(app, order, order.items.get()).json()["reference"])
    staff.post(f"/api/returns/{ret.pk}/transition/", {"status": "received"}, format="json")
    staff.post(f"/api/returns/{ret.pk}/inspect/", {"item_condition": "damaged", "notes": "x"}, format="json")
    staff.post(f"/api/returns/{ret.pk}/decide/", {"approve": True, "notes": "ok"}, format="json")
    sales = client_for(StaffLevel.SALES)
    assert sales.post(f"/api/returns/{ret.pk}/close/", {"refund_method": "cash"}, format="json").status_code == 403
    # Vendors and customers can't reach staff returns at all.
    assert vendor_a.client.post(f"/api/returns/{ret.pk}/close/", {}, format="json").status_code == 401
    assert app.post(f"/api/returns/{ret.pk}/close/", {}, format="json").status_code == 401


def test_vendor_can_respond_but_not_decide(app, home, shop, staff, vendor_a, vendor_b):
    order = delivered_paid_order(app, home, shop, staff, [(vendor_a.variant, 1)], vendors=[vendor_a])
    ref = ask_return(app, order, order.items.get()).json()["reference"]
    res = vendor_a.client.post(f"{SELLER}/returns/{ref}/", {"message": "The unit was tested before dispatch."},
                               format="json")
    assert res.status_code == 200 and res.json()["responses"][0]["message"].startswith("The unit")
    assert vendor_b.client.get(f"{SELLER}/returns/{ref}/").status_code == 404  # not B's item
    assert vendor_b.client.post(f"{SELLER}/returns/{ref}/", {"message": "hi"}, format="json").status_code == 404
    staff_view = staff.get(f"/api/returns/{ReturnRequest.objects.get(reference=ref).pk}/").json()
    assert staff_view["vendor_responses"][0]["vendor"] == "Vendor A Electronics"


# --------------------------------------------------------------------------- #
# Payouts
# --------------------------------------------------------------------------- #
def test_payout_lifecycle_and_no_double_payment(app, home, shop, staff, vendor_a, vendor_b):
    delivered_paid_order(app, home, shop, staff, [(vendor_a.variant, 1), (vendor_b.variant, 1)],
                         vendors=[vendor_a, vendor_b])
    res = staff.post("/api/marketplace/payout-batches/", {"notes": "Week 40"}, format="json")
    assert res.status_code == 201, res.json()
    payouts = {p["vendor"]["name"]: p for p in res.json()["payouts"]}
    assert payouts["Vendor A Electronics"]["amount"] == "288000.00"
    assert payouts["Vendor B Fashion"]["amount"] == "40500.00"
    assert all(p["status"] == "processing" for p in payouts.values())
    assert payouts["Vendor A Electronics"]["destination"].startswith("Mobile money · M-Pesa")
    # While processing, the balance is 0: nothing can be paid twice.
    assert ledger.balance(vendor_a.vendor).payable == 0
    assert staff.post("/api/marketplace/payout-batches/", {}, format="json").status_code == 409
    pa = VendorPayout.objects.get(vendor=vendor_a.vendor)
    assert staff.post(f"/api/marketplace/payouts/{pa.pk}/paid/", {}, format="json").status_code == 400  # proof needed
    res = staff.post(f"/api/marketplace/payouts/{pa.pk}/paid/", {"transaction_reference": "MPESA-QQ1"}, format="json")
    assert res.json()["status"] == "paid"
    assert staff.post(f"/api/marketplace/payouts/{pa.pk}/paid/", {"transaction_reference": "again"},
                      format="json").status_code == 409
    # B's transfer bounced: its money returns to the balance with a new entry.
    pb = VendorPayout.objects.get(vendor=vendor_b.vendor)
    res = staff.post(f"/api/marketplace/payouts/{pb.pk}/failed/", {"reason": "Wrong M-Pesa number"}, format="json")
    assert res.json()["status"] == "failed"
    assert ledger.balance(vendor_b.vendor).payable == D("40500")
    kinds = list(VendorLedgerEntry.objects.filter(vendor=vendor_b.vendor).order_by("id").values_list("kind", flat=True))
    assert kinds == ["earning", "payout", "payout_reversal"]
    earnings = vendor_b.client.get(f"{SELLER}/earnings/").json()
    assert earnings["payouts"][0]["status"] == "failed" and earnings["summary"]["payable"] == "40500.00"


def test_concurrent_payouts_for_one_vendor_cannot_both_succeed(app, home, shop, staff, vendor_a):
    delivered_paid_order(app, home, shop, staff, [(vendor_a.variant, 1)], vendors=[vendor_a])
    ledger.create_payout(vendor_a.vendor, user=staff.user)
    with pytest.raises(Exception):
        ledger.create_payout(vendor_a.vendor, user=staff.user)
    assert VendorPayout.objects.filter(vendor=vendor_a.vendor).count() == 1


def test_adjustments_need_a_reason_and_finance_manage(vendor_a, staff, client_for):
    finance = client_for(StaffLevel.FINANCE)
    res = finance.post("/api/marketplace/adjustments/", {"vendor": vendor_a.vendor.pk, "amount": "5000",
                                                         "reason": "Packaging reimbursed"}, format="json")
    assert res.status_code == 201 and res.json()["balance"]["payable"] == "5000.00"
    assert finance.post("/api/marketplace/adjustments/", {"vendor": vendor_a.vendor.pk, "amount": "5000",
                                                          "reason": " "}, format="json").status_code == 400
    assert client_for(StaffLevel.SALES).post("/api/marketplace/adjustments/", {
        "vendor": vendor_a.vendor.pk, "amount": "1", "reason": "x"}, format="json").status_code == 403
    assert vendor_a.client.post("/api/marketplace/adjustments/", {}, format="json").status_code == 401


def test_ledger_rows_are_immutable(vendor_a, staff):
    entry = ledger.post_adjustment(vendor_a.vendor, amount=D("100"), reason="test", user=staff.user)
    entry.amount = D("999")
    with pytest.raises(ValidationError):
        entry.save()
    with pytest.raises(ValidationError):
        entry.delete()


def test_marketplace_money_reconciles(app, home, shop, staff, vendor_a, vendor_b):
    """Customer paid = goods + delivery; goods = AGIZA commission + vendor earnings (+ AGIZA's own sales)."""
    order = delivered_paid_order(app, home, shop, staff,
                                 [(shop.cable_variant, 1), (vendor_a.variant, 1), (vendor_b.variant, 2)],
                                 vendors=[vendor_a, vendor_b])
    parts = list(VendorFulfillment.objects.filter(order=order))
    goods = sum(p.subtotal for p in parts)
    shipping = sum(p.shipping_fee for p in parts)
    paid = order_services.net_paid(order)
    assert paid == goods + shipping == order.total_amount
    vendor_parts = [p for p in parts if p.vendor_id]
    agiza_own = sum(p.subtotal for p in parts if not p.vendor_id)
    assert goods == agiza_own + sum(p.commission + p.vendor_net for p in vendor_parts)
    earned = sum(e.amount for e in VendorLedgerEntry.objects.filter(kind="earning"))
    assert earned == sum(p.vendor_net for p in vendor_parts)
    summary = staff.get("/api/marketplace/earnings/").json()["marketplace"]
    assert D(summary["payable_to_vendors"]) == earned
