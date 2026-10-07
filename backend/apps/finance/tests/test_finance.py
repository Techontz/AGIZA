"""Finance: order payments & profit, receipts, invoices, wallets, installments, permissions."""
from datetime import timedelta
from decimal import Decimal as D

import pytest
from django.utils import timezone

from apps.accounts.constants import StaffLevel
from apps.finance.models import Wallet
from apps.quotes.models import QuoteRequest

pytestmark = pytest.mark.django_db

F = "/api/finance"


def future(days=10):
    return (timezone.localdate() + timedelta(days=days)).isoformat()


def test_order_payments_figures_costs_and_receipt(ops, make_intl, client_for):
    order = make_intl(total="2500000", paid="1000000", item_cost=D("1800000"), shipping_cost=D("200000"))
    row = ops.get(f"{F}/order-payments/?search={order.reference}").json()["results"][0]
    assert row["figures"] == {"total": "2500000.00", "paid": "1000000.00", "due": "1500000.00",
                              "purchase_cost": "1800000.00", "shipping_cost": "200000.00", "profit": "500000.00",
                              "margin": "20.0", "purchase_cost_set": False, "shipping_cost_set": False}
    res = ops.patch(f"{F}/order-payments/{order.id}/", {"purchase_cost": "1700000"}, format="json").json()
    assert res["figures"]["profit"] == "600000.00" and res["figures"]["purchase_cost_set"] is True
    receipt = ops.get(f"{F}/order-payments/{order.id}/receipt/").json()
    assert receipt["order"]["figures"]["due"] == "1500000.00" and len(receipt["payments"]) == 1
    stats = ops.get(f"{F}/stats/").json()
    assert stats["revenue"] == "2500000.00" and stats["paid"] == "1000000.00" and stats["due"] == "1500000.00"
    assert stats["profit"] == "600000.00"
    assert ops.get(f"{F}/order-payments/?payment=due").json()["count"] == 1
    assert client_for(StaffLevel.DATA_ENTRY).get(f"{F}/stats/").status_code == 403  # finance: none
    assert client_for(StaffLevel.SALES).patch(f"{F}/order-payments/{order.id}/", {"purchase_cost": "1"},
                                              format="json").status_code == 403  # finance: view


def test_payments_ledger_never_exceeds_balance(ops, make_intl):
    order = make_intl(total="500000")
    over = ops.post(f"{F}/payments/", {"order": order.id, "amount": "600000", "method": "cash"}, format="json")
    assert over.status_code == 400 and "outstanding balance" in over.json()["error"]["message"]
    ok = ops.post(f"{F}/payments/", {"order": order.id, "amount": "500000", "method": "mobile_money",
                                     "reference": "MP-1"}, format="json")
    assert ok.status_code == 201 and ok.json()["order"]["reference"] == order.reference
    assert ops.get(f"{F}/payments/?method=mobile_money").json()["count"] == 1


def test_invoices_from_quote_order_and_manual(ops, make_intl, buyer):
    quote = QuoteRequest.objects.create(customer=buyer, service_type="express", description="Docs to Arusha",
                                        quoted_amount=D("45000"))
    unpriced = QuoteRequest.objects.create(customer=buyer, service_type="express", description="x")
    assert ops.post(f"{F}/invoices/", {"source": "quote", "quote": unpriced.id}, format="json").status_code == 400
    inv = ops.post(f"{F}/invoices/", {"source": "quote", "quote": quote.id, "due_date": future(), "tax_rate": "18"},
                   format="json").json()
    assert inv["reference"].startswith(f"INV-{timezone.localdate().year}-")
    assert inv["totals"] == {"subtotal": "45000.00", "tax": "8100.00", "total": "53100.00", "paid": "0.00",
                             "balance": "53100.00"}
    assert ops.post(f"{F}/invoices/{inv['id']}/send/").json()["status"] == "sent"
    assert ops.post(f"{F}/invoices/{inv['id']}/send/").status_code == 409
    paid = ops.post(f"{F}/invoices/{inv['id']}/mark-paid/", {"method": "cash"}, format="json").json()
    assert paid["status"] == "paid" and paid["totals"]["balance"] == "0.00"
    assert ops.post(f"{F}/invoices/{inv['id']}/void/").status_code == 409
    pdf = ops.get(f"{F}/invoices/{inv['id']}/pdf/")
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF") and pdf["Content-Type"] == "application/pdf"

    order = make_intl(total="900000")
    oinv = ops.post(f"{F}/invoices/", {"source": "order", "order": order.id}, format="json").json()
    assert oinv["linked"]["reference"] == order.reference and oinv["totals"]["total"] == "900000.00"
    assert ops.post(f"{F}/invoices/{oinv['id']}/mark-paid/", {"method": "cash"}, format="json").status_code == 409
    ops.post(f"{F}/payments/", {"order": order.id, "amount": "900000", "method": "cash"}, format="json")
    assert ops.get(f"{F}/invoices/{oinv['id']}/").json()["status"] == "paid"  # follows the order's payments

    assert ops.post(f"{F}/invoices/", {"source": "manual", "customer": buyer.id}, format="json").status_code == 400
    manual = ops.post(f"{F}/invoices/", {"source": "manual", "customer": buyer.id, "items": [
        {"description": "Consulting", "quantity": "2", "unit_price": "50000"}]}, format="json").json()
    assert manual["totals"]["total"] == "100000.00"
    assert ops.post(f"{F}/invoices/{manual['id']}/void/").json()["status"] == "void"
    assert ops.get(f"{F}/invoices/?source=order").json()["count"] == 1


def test_wallet_top_up_pay_and_adjust(ops, make_intl, buyer, client_for):
    order = make_intl(total="300000")
    url = f"{F}/wallets/{buyer.id}"
    body = ops.post(f"{url}/top-up/", {"amount": "200000", "method": "mobile_money", "reference": "MP-9"},
                    format="json").json()
    assert body["wallet_balance"] == "200000.00" and body["transactions"][0]["source"] == "top_up"
    too_much = ops.post(f"{F}/payments/from-wallet/", {"order": order.id, "amount": "250000"}, format="json")
    assert too_much.status_code == 400 and "wallet only holds" in too_much.json()["error"]["message"]
    pay = ops.post(f"{F}/payments/from-wallet/", {"order": order.id, "amount": "150000"}, format="json")
    assert pay.status_code == 201 and pay.json()["method"] == "wallet"
    body = ops.get(f"{url}/").json()
    assert body["wallet_balance"] == "50000.00" and body["total_paid"] == "150000.00"
    assert body["total_due"] == "150000.00" and body["total_orders"] == 1
    finance_view = client_for(StaffLevel.ADMIN_L1)  # finance: view
    assert finance_view.post(f"{url}/top-up/", {"amount": "1", "method": "cash"}, format="json").status_code == 403
    finance = client_for(StaffLevel.FINANCE)  # finance: manage
    assert finance.post(f"{url}/adjust/", {"amount": "60000", "credit": False, "note": "x"},
                        format="json").status_code == 400  # would go negative
    assert finance.post(f"{url}/adjust/", {"amount": "10000", "credit": False, "note": "Fee"},
                        format="json").json()["wallet_balance"] == "40000.00"
    listing = ops.get(f"{F}/wallets/?search={buyer.full_name}").json()
    assert listing["count"] == 1 and listing["results"][0]["wallet_balance"] == "40000.00"


def test_refund_to_wallet_from_returns(ops, make_intl, buyer):
    order = make_intl(total="400000", paid="400000")
    ret = ops.post("/api/returns/", {"order": order.id, "return_type": "damaged_item",
                                     "reason_code": "damaged_in_transit"}, format="json").json()
    ops.post(f"/api/returns/{ret['id']}/transition/", {"status": "received"}, format="json")
    ops.post(f"/api/returns/{ret['id']}/inspect/", {"item_condition": "damaged", "notes": "Broken"}, format="json")
    ops.post(f"/api/returns/{ret['id']}/decide/", {"approve": True, "notes": "OK", "refund_amount": "100000"},
             format="json")
    res = ops.post(f"/api/returns/{ret['id']}/close/", {"refund_method": "wallet"}, format="json")
    assert res.status_code == 200, res.json()
    assert Wallet.objects.get(customer=buyer).balance == D("100000")


def test_installment_plan_approval_and_allocation(ops, make_intl, client_for):
    order = make_intl(total="900000", paid="300000")
    bad = ops.post(f"{F}/installment-plans/", {"order": order.id, "number_of_installments": 3,
                                               "first_due_date": "2020-01-01"}, format="json")
    assert bad.status_code == 400
    plan = ops.post(f"{F}/installment-plans/", {"order": order.id, "number_of_installments": 3,
                                                "first_due_date": future(5), "interval_days": 30},
                    format="json").json()
    assert plan["status"] == "pending_approval" and plan["total_amount"] == "600000.00"
    assert [i["amount"] for i in plan["installments"]] == ["200000.00"] * 3
    detail = ops.get(f"/api/orders/international/{order.id}/").json()
    assert detail["installment_plan"] is True and detail["needs_attention"] is True
    assert client_for(StaffLevel.ADMIN_L1).post(f"{F}/installment-plans/{plan['id']}/decide/", {"approve": True},
                                                format="json").status_code == 403  # finance: view
    assert ops.post(f"{F}/installment-plans/{plan['id']}/decide/", {"approve": False},
                    format="json").status_code == 400  # rejection needs a reason
    plan = ops.post(f"{F}/installment-plans/{plan['id']}/decide/", {"approve": True, "note": "Good history"},
                    format="json").json()
    assert plan["status"] == "active" and plan["approved_by"]
    assert ops.get(f"/api/orders/international/{order.id}/").json()["installment_allowed"] is True
    ops.post(f"{F}/payments/", {"order": order.id, "amount": "250000", "method": "cash", "kind": "installment"},
             format="json")
    plan = ops.get(f"{F}/installment-plans/{plan['id']}/").json()
    assert [i["status"] for i in plan["installments"]] == ["paid", "partial", "pending"]
    assert plan["next_payment"]["amount"] == "150000.00" and plan["next_payment"]["sequence"] == 2
    ops.post(f"{F}/payments/", {"order": order.id, "amount": "350000", "method": "cash"}, format="json")
    assert ops.get(f"{F}/installment-plans/{plan['id']}/").json()["status"] == "completed"
    wallets = ops.get(f"{F}/wallets/").json()["results"]
    assert wallets[0]["total_due"] == "0.00"


# --------------------------------------------------------------------------- #
# Profit & Loss
# --------------------------------------------------------------------------- #
@pytest.fixture
def pl_orders(ops, make_intl, buyer):
    from apps.orders import services as order_services
    from apps.orders.models import Order
    from apps.parties.models import Customer

    a = make_intl(total="2500000", item_cost=D("1800000"), shipping_cost=D("200000"))  # profit 500k
    b = make_intl(total="1000000", item_cost=D("700000"), shipping_cost=D("100000"))
    b.purchase_cost = D("900000")  # manual override → profit 0
    b.save(update_fields=["purchase_cost"])
    other = Customer.objects.create(full_name="Baraka Said", phone="+255712000077")
    equip = order_services.create_order(
        "equipment", customer=other, item_details="Solar inverter", user=ops.user, total_amount=D("400000"),
        details={"service_type": "installation", "equipment": "Solar inverter"})
    equip.shipping_cost = D("50000")
    equip.save(update_fields=["shipping_cost"])
    old = make_intl(total="300000", item_cost=D("100000"), shipping_cost=D("0"))
    Order.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=60))
    cancelled = make_intl(total="9999999")
    Order.objects.filter(pk=cancelled.pk).update(status="cancelled")
    unpriced = make_intl(total="1")
    Order.objects.filter(pk=unpriced.pk).update(total_amount=None)
    return {"a": a, "b": b, "equip": equip, "old": old, "other": other}


def test_profit_loss_totals_breakdown_and_rows(ops, pl_orders):
    body = ops.get(f"{F}/profit-loss/").json()
    # a + b + equip + old; cancelled and unpriced orders are left out
    assert body["totals"] == {"orders": 4, "revenue": "4200000.00", "purchase_cost": "2800000.00",
                              "shipping_cost": "350000.00", "profit": "1050000.00", "margin": "25.0"}
    by_type = {t["order_type"]: t for t in body["by_type"]}
    assert by_type["equipment"]["profit"] == "350000.00" and by_type["equipment"]["orders"] == 1
    assert by_type["international"]["revenue"] == "3800000.00" and by_type["international"]["profit"] == "700000.00"
    assert body["count"] == 4 and body["page"] == 1
    row = next(r for r in body["results"] if r["reference"] == pl_orders["b"].reference)
    assert row["total"] == "1000000.00" and row["purchase_cost"] == "900000.00" and row["shipping_cost"] == "100000.00"
    assert row["profit"] == "0.00" and row["margin"] == "0.0"
    assert row["purchase_cost_set"] is True and row["shipping_cost_set"] is False
    assert row["customer"]["full_name"] == "Fatuma Hassan" and row["order_type"] == "international"
    equip = next(r for r in body["results"] if r["order_type"] == "equipment")
    assert equip["purchase_cost"] == "0.00" and equip["profit"] == "350000.00" and equip["margin"] == "87.5"


def test_profit_loss_filters(ops, pl_orders):
    today = timezone.localdate()
    recent = ops.get(f"{F}/profit-loss/?date_from={(today - timedelta(days=7)).isoformat()}"
                     f"&date_to={today.isoformat()}").json()
    assert recent["totals"]["orders"] == 3 and recent["totals"]["revenue"] == "3900000.00"
    past = ops.get(f"{F}/profit-loss/?date_to={(today - timedelta(days=30)).isoformat()}").json()
    assert [r["reference"] for r in past["results"]] == [pl_orders["old"].reference]
    assert ops.get(f"{F}/profit-loss/?order_type=equipment").json()["totals"]["profit"] == "350000.00"
    by_customer = ops.get(f"{F}/profit-loss/?customer={pl_orders['other'].id}").json()
    assert by_customer["totals"]["orders"] == 1
    searched = ops.get(f"{F}/profit-loss/?search={pl_orders['a'].reference}").json()
    assert searched["count"] == 1 and searched["totals"]["profit"] == "500000.00"
    empty = ops.get(f"{F}/profit-loss/?order_type=shop").json()
    assert empty["totals"] == {"orders": 0, "revenue": "0.00", "purchase_cost": "0.00", "shipping_cost": "0.00",
                               "profit": "0.00", "margin": None}
    assert empty["by_type"] == [] and empty["results"] == []


def test_profit_loss_csv_export(ops, pl_orders):
    today = timezone.localdate().isoformat()
    for url in (f"{F}/profit-loss/?format=csv&order_type=international&date_from=2020-01-01&date_to={today}",
                f"{F}/profit-loss/export/?order_type=international&date_from=2020-01-01&date_to={today}"):
        res = ops.get(url)
        assert res.status_code == 200, res.content
        assert res["Content-Type"].startswith("text/csv")
        assert f'filename="profit-loss-2020-01-01-{today}.csv"' in res["Content-Disposition"]
        lines = res.content.decode().strip().splitlines()
        assert lines[0].startswith("Reference,Date,Customer")
        assert len(lines) == 1 + 3 + 1  # header, 3 international orders, totals row
        assert lines[-1].startswith("TOTAL,,3 orders") and ",700000.00," in lines[-1]
    assert 'filename="profit-loss-all-' in ops.get(f"{F}/profit-loss/export/")["Content-Disposition"]


def test_profit_loss_permissions(client_for, pl_orders):
    assert client_for(StaffLevel.DATA_ENTRY).get(f"{F}/profit-loss/").status_code == 403  # finance: none
    assert client_for(StaffLevel.DATA_ENTRY).get(f"{F}/profit-loss/export/").status_code == 403
    assert client_for(StaffLevel.DATA_ENTRY).get(f"{F}/profit-loss/?format=csv").status_code == 403
    assert client_for(StaffLevel.SALES).get(f"{F}/profit-loss/").status_code == 200  # finance: view
    assert client_for(StaffLevel.FINANCE).get(f"{F}/profit-loss/export/").status_code == 200
