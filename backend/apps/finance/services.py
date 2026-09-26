"""
Finance services: invoices, wallets, installment plans, and the figures shown
in Order Payments (purchase cost, shipping cost, profit).

Rules:
  - a payment never exceeds the order's outstanding balance (orders.services);
  - a wallet never goes negative;
  - an installment plan is approved by Finance (manage) before the order can
    proceed on installments; every payment is allocated to the schedule;
  - invoices from an order are marked paid when the order is fully paid.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from decimal import ROUND_DOWN, Decimal

from django.db import transaction
from django.utils import timezone

from apps.core.audit import record_audit
from apps.core.workflow import WorkflowError
from apps.orders import services as order_services
from apps.orders.models import Order, Payment

from .models import (
    Installment,
    InstallmentPlan,
    Invoice,
    InvoiceItem,
    InvoiceStatus,
    PlanStatus,
    Wallet,
    WalletTransaction,
)

CENT = Decimal("0.01")


# --------------------------------------------------------------------------- #
# Order financials
# --------------------------------------------------------------------------- #
@dataclass
class Financials:
    total: Decimal | None
    paid: Decimal
    due: Decimal | None
    purchase_cost: Decimal | None
    shipping_cost: Decimal | None
    profit: Decimal | None
    margin: Decimal | None  # % of total


def default_purchase_cost(order: Order) -> Decimal | None:
    if order.order_type == "international":
        proc = getattr(order, "procurement", None)
        if proc is not None and proc.item_cost is not None:
            return proc.item_cost
        return order.international.item_cost
    if order.order_type == "shop":
        costs = [i.unit_cost * i.quantity for i in order.items.all() if i.unit_cost is not None]
        return sum(costs, Decimal("0")) if costs else None
    return None


def default_shipping_cost(order: Order) -> Decimal | None:
    if order.order_type == "international":
        return order.international.shipping_cost
    return None


def financials(order: Order, paid: Decimal | None = None) -> Financials:
    summary = order_services.payment_summary(order, paid)
    purchase = order.purchase_cost if order.purchase_cost is not None else default_purchase_cost(order)
    shipping = order.shipping_cost if order.shipping_cost is not None else default_shipping_cost(order)
    profit = margin = None
    if order.total_amount is not None:
        profit = order.total_amount - (purchase or Decimal("0")) - (shipping or Decimal("0"))
        if order.total_amount > 0:
            margin = (profit / order.total_amount * 100).quantize(Decimal("0.1"))
    return Financials(order.total_amount, summary.paid, summary.due, purchase, shipping, profit, margin)


@transaction.atomic
def set_costs(order: Order, *, user, purchase_cost=..., shipping_cost=..., request=None) -> Order:
    order = order_services._lock(order)
    changes = {}
    for field, value in (("purchase_cost", purchase_cost), ("shipping_cost", shipping_cost)):
        if value is ...:
            continue
        before = getattr(order, field)
        if before != value:
            setattr(order, field, value)
            changes[field] = [str(before) if before is not None else None, str(value) if value is not None else None]
    if changes:
        order.save(update_fields=[*changes, "updated_at"])
        record_audit(action="update", request=request, actor=user, instance=order, changes=changes)
    return order


# --------------------------------------------------------------------------- #
# Invoices
# --------------------------------------------------------------------------- #
def invoice_totals(invoice: Invoice) -> dict:
    subtotal = sum((i.amount for i in invoice.items.all()), Decimal("0"))
    tax = (subtotal * invoice.tax_rate / 100).quantize(CENT)
    total = subtotal + tax
    if invoice.order_id:
        paid = min(order_services.net_paid(invoice.order), total)
    else:
        paid = total if invoice.status == InvoiceStatus.PAID else Decimal("0")
    return {"subtotal": subtotal, "tax": tax, "total": total, "paid": paid, "balance": total - paid}


def _items_for_order(order: Order) -> list[tuple[str, Decimal, Decimal]]:
    if order.order_type == "shop":
        rows = [(f"{i.product_name}{' — ' + i.variant_name if i.variant_name else ''} ({i.sku})",
                 Decimal(i.quantity), i.unit_price) for i in order.items.all()]
        fee = order.shop.delivery_fee
        if fee:
            rows.append(("Delivery fee", Decimal("1"), fee))
        return rows
    if order.total_amount is None:
        raise WorkflowError(f"{order.reference} has no price yet.", field="order")
    return [(f"{order.get_order_type_display()} — {order.item_details}", Decimal("1"), order.total_amount)]


@transaction.atomic
def create_invoice(*, source: str, user, customer=None, quote=None, order=None, items=None, due_date=None,
                   tax_rate: Decimal = Decimal("0"), notes: str = "", request=None) -> Invoice:
    if source == Invoice.Source.QUOTE:
        if quote is None:
            raise WorkflowError("Choose a quotation.", field="quote")
        if quote.quoted_amount is None:
            raise WorkflowError(f"{quote.reference} hasn't been priced yet.", field="quote")
        customer = quote.customer
        rows = [(quote.description[:255], Decimal("1"), quote.quoted_amount)]
    elif source == Invoice.Source.ORDER:
        if order is None:
            raise WorkflowError("Choose an order.", field="order")
        if order.status == "cancelled":
            raise WorkflowError(f"{order.reference} is cancelled.", conflict=True)
        customer = order.customer
        rows = _items_for_order(order)
    else:
        if customer is None:
            raise WorkflowError("Choose the customer.", field="customer")
        rows = [(i["description"], Decimal(i.get("quantity") or 1), i["unit_price"]) for i in (items or [])]
        if not rows:
            raise WorkflowError("Add at least one line.", field="items")
    today = timezone.localdate()
    if due_date and due_date < today:
        raise WorkflowError("The due date can't be in the past.", field="due_date")
    invoice = Invoice.objects.create(source=source, customer=customer, quote=quote, order=order, issue_date=today,
                                     due_date=due_date, tax_rate=tax_rate, notes=notes, created_by=user,
                                     currency=order.currency if order else "TZS")
    for description, qty, price in rows:
        if price is None or price < 0:
            raise WorkflowError("Line prices must be zero or more.", field="items")
        InvoiceItem.objects.create(invoice=invoice, description=description, quantity=qty, unit_price=price,
                                   amount=(qty * price).quantize(CENT))
    record_audit(action="create", request=request, actor=user, instance=invoice,
                 changes={"source": [None, source], "customer": [None, customer.pk]})
    sync_invoice(invoice)
    return invoice


def _lock_invoice(invoice: Invoice) -> Invoice:
    return Invoice.objects.select_for_update().get(pk=invoice.pk)


def _set_invoice_status(invoice: Invoice, status: str, user, request=None, fields=()):
    before = invoice.status
    invoice.status = status
    invoice.save(update_fields=["status", "updated_at", *fields])
    record_audit(action="status_change", request=request, actor=user, instance=invoice,
                 changes={"status": [before, status]})


@transaction.atomic
def send_invoice(invoice: Invoice, *, user, request=None) -> Invoice:
    invoice = _lock_invoice(invoice)
    if invoice.status != InvoiceStatus.DRAFT:
        raise WorkflowError("Only draft invoices can be sent.", conflict=True)
    invoice.sent_at = timezone.now()
    _set_invoice_status(invoice, InvoiceStatus.SENT, user, request, ["sent_at"])
    sync_invoice(invoice)
    return invoice


@transaction.atomic
def mark_invoice_paid(invoice: Invoice, *, user, method: str, reference: str = "", request=None) -> Invoice:
    invoice = _lock_invoice(invoice)
    if invoice.order_id:
        raise WorkflowError("This invoice is paid by recording payments on its order.", conflict=True)
    if invoice.status not in (InvoiceStatus.DRAFT, InvoiceStatus.SENT):
        raise WorkflowError(f"A {invoice.get_status_display().lower()} invoice can't be paid.", conflict=True)
    invoice.paid_at = timezone.now()
    invoice.payment_method = method
    invoice.payment_reference = reference
    _set_invoice_status(invoice, InvoiceStatus.PAID, user, request, ["paid_at", "payment_method", "payment_reference"])
    return invoice


@transaction.atomic
def void_invoice(invoice: Invoice, *, user, request=None) -> Invoice:
    invoice = _lock_invoice(invoice)
    if invoice.status == InvoiceStatus.PAID:
        raise WorkflowError("Paid invoices can't be voided.", conflict=True)
    if invoice.status == InvoiceStatus.VOID:
        return invoice
    _set_invoice_status(invoice, InvoiceStatus.VOID, user, request)
    return invoice


def sync_invoice(invoice: Invoice):
    """An order invoice becomes Paid once its order is paid in full."""
    if not invoice.order_id or invoice.status not in (InvoiceStatus.DRAFT, InvoiceStatus.SENT):
        return
    totals = invoice_totals(invoice)
    if totals["total"] > 0 and totals["balance"] <= 0:
        invoice.status = InvoiceStatus.PAID
        invoice.paid_at = timezone.now()
        invoice.save(update_fields=["status", "paid_at", "updated_at"])


# --------------------------------------------------------------------------- #
# Wallets
# --------------------------------------------------------------------------- #
def wallet_for(customer) -> Wallet:
    wallet, _ = Wallet.objects.get_or_create(customer=customer)
    return wallet


def _lock_wallet(customer) -> Wallet:
    wallet_for(customer)
    return Wallet.objects.select_for_update().get(customer=customer)


def _post(wallet: Wallet, kind: str, source: str, amount: Decimal, user, **extra) -> WalletTransaction:
    if amount is None or amount <= 0:
        raise WorkflowError("Enter an amount greater than zero.", field="amount")
    new_balance = wallet.balance + amount if kind == WalletTransaction.Kind.CREDIT else wallet.balance - amount
    if new_balance < 0:
        raise WorkflowError(f"The wallet only holds {wallet.balance:,.2f} {wallet.currency}.", field="amount")
    wallet.balance = new_balance
    wallet.save(update_fields=["balance", "updated_at"])
    return WalletTransaction.objects.create(wallet=wallet, kind=kind, source=source, amount=amount,
                                            balance_after=new_balance, created_by=user, **extra)


@transaction.atomic
def top_up(customer, *, amount: Decimal, user, method: str, reference: str = "", note: str = "",
           request=None) -> WalletTransaction:
    wallet = _lock_wallet(customer)
    tx = _post(wallet, WalletTransaction.Kind.CREDIT, WalletTransaction.Source.TOP_UP, amount, user,
               method=method, reference=reference, note=note)
    record_audit(action="update", request=request, actor=user, instance=wallet,
                 changes={"top_up": [None, str(amount)], "balance": [str(wallet.balance - amount), str(wallet.balance)]})
    return tx


@transaction.atomic
def adjust_wallet(customer, *, amount: Decimal, credit: bool, user, note: str, request=None) -> WalletTransaction:
    if not note.strip():
        raise WorkflowError("Give the reason for the adjustment.", field="note")
    wallet = _lock_wallet(customer)
    kind = WalletTransaction.Kind.CREDIT if credit else WalletTransaction.Kind.DEBIT
    tx = _post(wallet, kind, WalletTransaction.Source.ADJUSTMENT, amount, user, note=note)
    record_audit(action="update", request=request, actor=user, instance=wallet,
                 changes={"adjustment": [None, f"{'+' if credit else '-'}{amount}"], "note": [None, note]})
    return tx


@transaction.atomic
def pay_from_wallet(order: Order, *, amount: Decimal, user, request=None) -> Payment:
    """Settle part of an order from the customer's wallet (a Wallet payment + a debit)."""
    wallet = _lock_wallet(order.customer)
    if amount > wallet.balance:
        raise WorkflowError(f"The wallet only holds {wallet.balance:,.2f} {wallet.currency}.", field="amount")
    payment = order_services.record_payment(order, amount=amount, method=Payment.Method.WALLET, user=user,
                                            reference=f"WALLET-{wallet.pk}", request=request)
    _post(wallet, WalletTransaction.Kind.DEBIT, WalletTransaction.Source.ORDER_PAYMENT, amount, user,
          order=order, payment=payment, note=f"Payment for {order.reference}")
    return payment


def refund_to_wallet(order: Order, payment: Payment, user) -> WalletTransaction:
    """Called inside the Returns close transaction for refunds paid to the wallet."""
    wallet = _lock_wallet(order.customer)
    return _post(wallet, WalletTransaction.Kind.CREDIT, WalletTransaction.Source.REFUND, payment.amount, user,
                 order=order, payment=payment, note=payment.notes or f"Refund for {order.reference}")


# --------------------------------------------------------------------------- #
# Installments
# --------------------------------------------------------------------------- #
def _split(total: Decimal, n: int) -> list[Decimal]:
    base = (total / n).quantize(CENT, rounding=ROUND_DOWN)
    parts = [base] * n
    parts[-1] = total - base * (n - 1)
    return parts


@transaction.atomic
def create_plan(order: Order, *, number_of_installments: int, first_due_date, user, interval_days: int = 30,
                notes: str = "", request=None) -> InstallmentPlan:
    order = order_services._lock(order)
    if order.status in ("cancelled", "completed", "delivered"):
        raise WorkflowError(f"{order.reference} is closed.", conflict=True)
    if hasattr(order, "installment_schedule"):
        existing = order.installment_schedule
        if existing.status in (PlanStatus.ACTIVE, PlanStatus.PENDING_APPROVAL):
            raise WorkflowError(f"{order.reference} already has an installment plan.", conflict=True)
        existing.installments.all().delete()
        existing.delete()
    due = order_services.payment_summary(order).due
    if not due or due <= 0:
        raise WorkflowError(f"{order.reference} has nothing left to pay.", conflict=True)
    if not 1 <= number_of_installments <= 24:
        raise WorkflowError("Choose between 1 and 24 installments.", field="number_of_installments")
    if first_due_date < timezone.localdate():
        raise WorkflowError("The first due date can't be in the past.", field="first_due_date")
    plan = InstallmentPlan.objects.create(
        order=order, total_amount=due, number_of_installments=number_of_installments, interval_days=interval_days,
        notes=notes, created_by=user,
        status=PlanStatus.ACTIVE if order.installment_allowed else PlanStatus.PENDING_APPROVAL,
    )
    for i, amount in enumerate(_split(due, number_of_installments), start=1):
        Installment.objects.create(plan=plan, sequence=i, amount=amount,
                                   due_date=first_due_date + timedelta(days=interval_days * (i - 1)))
    if not order.installment_plan:
        order.installment_plan = True
        order.save(update_fields=["installment_plan", "updated_at"])
    record_audit(action="create", request=request, actor=user, instance=plan,
                 changes={"order": [None, order.reference], "installments": [None, number_of_installments],
                          "amount": [None, str(due)]})
    return plan


@transaction.atomic
def decide_plan(plan: InstallmentPlan, *, approve: bool, user, note: str = "", request=None) -> InstallmentPlan:
    plan = InstallmentPlan.objects.select_for_update().select_related("order").get(pk=plan.pk)
    if plan.status != PlanStatus.PENDING_APPROVAL:
        raise WorkflowError("Only plans waiting for approval can be decided.", conflict=True)
    if not approve and not note.strip():
        raise WorkflowError("Give the reason for rejecting the plan.", field="note")
    order = order_services._lock(plan.order)
    before = plan.status
    plan.status = PlanStatus.ACTIVE if approve else PlanStatus.REJECTED
    plan.approved_by = user
    plan.approved_at = timezone.now()
    plan.decision_note = note
    plan.save(update_fields=["status", "approved_by", "approved_at", "decision_note", "updated_at"])
    order.installment_allowed = approve
    if not approve:
        order.installment_plan = False
    order.save(update_fields=["installment_allowed", "installment_plan", "updated_at"])
    order_services._history(order, order.status, order.status, user,
                            f"Installment plan {'approved' if approve else 'rejected'}{': ' + note if note else ''}")
    record_audit(action="status_change", request=request, actor=user, instance=plan,
                 changes={"status": [before, plan.status], **({"note": [None, note]} if note else {})})
    return plan


def allocate(order: Order, amount: Decimal, when=None):
    """Apply a payment to the earliest unpaid installments."""
    plan = InstallmentPlan.objects.filter(order=order, status__in=[PlanStatus.ACTIVE, PlanStatus.PENDING_APPROVAL]).first()
    if plan is None:
        return
    remaining = amount
    for inst in plan.installments.select_for_update().exclude(status=Installment.Status.PAID).order_by("sequence"):
        if remaining <= 0:
            break
        take = min(remaining, inst.amount - inst.paid_amount)
        inst.paid_amount += take
        remaining -= take
        inst.status = Installment.Status.PAID if inst.paid_amount >= inst.amount else Installment.Status.PARTIAL
        inst.paid_at = when or timezone.now()
        inst.save(update_fields=["paid_amount", "status", "paid_at"])
    if not plan.installments.exclude(status=Installment.Status.PAID).exists():
        plan.status = PlanStatus.COMPLETED
        plan.save(update_fields=["status", "updated_at"])


def next_installment(plan: InstallmentPlan) -> Installment | None:
    return next((i for i in plan.installments.all() if i.status != Installment.Status.PAID), None)


def on_payment(order: Order, payment: Payment):
    """Called by orders.services.record_payment inside its transaction."""
    if payment.kind != Payment.Kind.REFUND:
        allocate(order, payment.amount, payment.paid_at)
    for invoice in order.invoices.filter(status__in=[InvoiceStatus.DRAFT, InvoiceStatus.SENT]):
        sync_invoice(invoice)


def overdue_installments(qs=None):
    qs = qs if qs is not None else Installment.objects.all()
    return qs.filter(due_date__lt=timezone.localdate()).exclude(status=Installment.Status.PAID)
