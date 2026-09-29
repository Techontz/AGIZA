"""
The vendor ledger: what AGIZA owes each vendor, as append-only entries.

    earning          + vendor net of a fulfilment, posted once when its order is delivered and paid
    refund           − vendor share of a refund (gross and commission reversed alongside)
    adjustment       ± staff correction, reason required
    payout           − amount taken for a payout (when the payout is created)
    payout_reversal  + the same amount back when a payout fails or is reversed

A vendor's payable balance is the sum of its entries, except refund debits for fulfilments whose
earnings are not due yet: those wait until the earning is posted, so a refund on an unpaid order
never makes a vendor's balance go negative. Payouts take the whole balance at once under a row
lock on the vendor, so the same money can't be paid twice.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.db.models import Q, Sum
from django.utils import timezone

from apps.catalog.models import Vendor
from apps.core.audit import record_audit
from apps.core.workflow import WorkflowError

from .models import (
    LedgerKind,
    PayoutBatch,
    PayoutStatus,
    SettlementStatus,
    VendorFulfillment,
    VendorLedgerEntry,
    VendorPayout,
)

logger = logging.getLogger("apps.marketplace")
ZERO = Decimal("0")
CENT = Decimal("0.01")


def _post(*, key: str, vendor, kind: str, amount: Decimal, gross: Decimal = ZERO, commission: Decimal = ZERO,
          fulfillment=None, payout=None, return_request=None, reference: str = "", note: str = "",
          user=None) -> VendorLedgerEntry:
    """Idempotent: posting the same key twice returns the first entry."""
    existing = VendorLedgerEntry.objects.filter(key=key).first()
    if existing:
        return existing
    try:
        with transaction.atomic():
            return VendorLedgerEntry.objects.create(
                key=key, vendor=vendor, kind=kind, amount=amount.quantize(CENT), gross_amount=gross.quantize(CENT),
                commission_amount=commission.quantize(CENT), fulfillment=fulfillment, payout=payout,
                return_request=return_request, reference=reference[:80], note=note[:255], created_by=user,
            )
    except IntegrityError:
        return VendorLedgerEntry.objects.get(key=key)


def post_earning(fulfillment: VendorFulfillment) -> VendorLedgerEntry | None:
    if fulfillment.vendor_id is None:
        return None
    return _post(key=f"earning:{fulfillment.pk}", vendor=fulfillment.vendor, kind=LedgerKind.EARNING,
                 amount=fulfillment.vendor_net, gross=fulfillment.subtotal, commission=fulfillment.commission,
                 fulfillment=fulfillment, reference=fulfillment.order.reference,
                 note="Order delivered and paid")


def post_refund(fulfillment: VendorFulfillment, *, key: str, gross: Decimal, commission: Decimal, return_request=None,
                user=None, note: str = "") -> VendorLedgerEntry:
    """The vendor gives back its net share of refunded goods (AGIZA gives back its commission)."""
    net = gross - commission
    return _post(key=key, vendor=fulfillment.vendor, kind=LedgerKind.REFUND, amount=-net, gross=-gross,
                 commission=-commission, fulfillment=fulfillment, return_request=return_request,
                 reference=getattr(return_request, "reference", "") or fulfillment.order.reference, note=note,
                 user=user)


@transaction.atomic
def post_adjustment(vendor: Vendor, *, amount: Decimal, reason: str, user, request=None) -> VendorLedgerEntry:
    reason = reason.strip()
    if not reason:
        raise WorkflowError("Give the reason for the adjustment.", field="reason")
    if not amount:
        raise WorkflowError("Enter a non-zero amount.", field="amount")
    Vendor.objects.select_for_update().get(pk=vendor.pk)
    count = VendorLedgerEntry.objects.filter(vendor=vendor, kind=LedgerKind.ADJUSTMENT).count() + 1
    entry = _post(key=f"adjustment:{vendor.pk}:{count}:{timezone.now().timestamp()}", vendor=vendor,
                  kind=LedgerKind.ADJUSTMENT, amount=amount, note=reason, user=user, reference="Adjustment")
    record_audit(action="create", request=request, actor=user, instance=entry,
                 changes={"vendor": [None, vendor.name], "amount": [None, str(amount)], "reason": [None, reason]})
    return entry


# --------------------------------------------------------------------------- #
# Balances
# --------------------------------------------------------------------------- #
DUE = Q(fulfillment__isnull=True) | Q(fulfillment__settlement_status__in=[SettlementStatus.PAYABLE,
                                                                           SettlementStatus.SETTLED])


def _payable_entries(vendor):
    return VendorLedgerEntry.objects.filter(vendor=vendor).filter(DUE)


@dataclass
class Balance:
    payable: Decimal
    gross_sales: Decimal
    commission: Decimal
    refunds: Decimal
    adjustments: Decimal
    paid_out: Decimal
    in_payout: Decimal
    pending: Decimal

    def as_dict(self) -> dict:
        return {k: f"{v:.2f}" for k, v in self.__dict__.items()}


def balance(vendor) -> Balance:
    rows = dict(_payable_entries(vendor).values("kind").annotate(t=Sum("amount")).values_list("kind", "t"))
    earned = _payable_entries(vendor).filter(kind=LedgerKind.EARNING).aggregate(
        g=Sum("gross_amount"), c=Sum("commission_amount"))
    paid = VendorPayout.objects.filter(vendor=vendor, status=PayoutStatus.PAID).aggregate(t=Sum("amount"))["t"]
    processing = VendorPayout.objects.filter(vendor=vendor, status=PayoutStatus.PROCESSING).aggregate(
        t=Sum("amount"))["t"]
    pending = (VendorFulfillment.objects.filter(vendor=vendor, settlement_status=SettlementStatus.PENDING)
               .aggregate(t=Sum("vendor_net"))["t"] or ZERO)
    pending_refunds = (VendorLedgerEntry.objects.filter(vendor=vendor, kind=LedgerKind.REFUND,
                                                        fulfillment__settlement_status=SettlementStatus.PENDING)
                       .aggregate(t=Sum("amount"))["t"] or ZERO)
    return Balance(
        payable=sum(rows.values(), ZERO), gross_sales=earned["g"] or ZERO, commission=earned["c"] or ZERO,
        refunds=-(rows.get(LedgerKind.REFUND) or ZERO), adjustments=rows.get(LedgerKind.ADJUSTMENT) or ZERO,
        paid_out=paid or ZERO, in_payout=processing or ZERO, pending=pending + pending_refunds,
    )


# --------------------------------------------------------------------------- #
# Payouts
# --------------------------------------------------------------------------- #
def _destination(vendor) -> str:
    if not vendor.payout_method:
        return ""
    parts = [vendor.get_payout_method_display(), vendor.payout_provider, vendor.payout_account_name,
             vendor.payout_account_number]
    return " · ".join(p for p in parts if p)[:255]


@transaction.atomic
def create_payout(vendor: Vendor, *, user, method: str | None = None, batch: PayoutBatch | None = None,
                  notes: str = "", request=None) -> VendorPayout:
    """Take the vendor's whole payable balance into a payout that is being processed."""
    vendor = Vendor.objects.select_for_update().get(pk=vendor.pk)  # one payout at a time per vendor
    if VendorPayout.objects.filter(vendor=vendor, status=PayoutStatus.PROCESSING).exists():
        raise WorkflowError(f"{vendor.name} already has a payout being processed. Record its outcome first.",
                            conflict=True)
    entries = list(_payable_entries(vendor).select_for_update())
    amount = sum((e.amount for e in entries), ZERO)
    if amount <= 0:
        raise WorkflowError(f"{vendor.name} has nothing payable.", conflict=True)
    by_kind: dict = {}
    for e in entries:
        by_kind.setdefault(e.kind, [ZERO, ZERO, ZERO])
        by_kind[e.kind][0] += e.amount
        by_kind[e.kind][1] += e.gross_amount
        by_kind[e.kind][2] += e.commission_amount
    method = method or (vendor.payout_method or "other")
    payout = VendorPayout.objects.create(
        vendor=vendor, batch=batch, status=PayoutStatus.PROCESSING, amount=amount, method=method,
        destination=_destination(vendor), notes=notes, recorded_by=user,
        gross_sales=by_kind.get(LedgerKind.EARNING, [ZERO] * 3)[1],
        commission=by_kind.get(LedgerKind.EARNING, [ZERO] * 3)[2],
        refund_deductions=-by_kind.get(LedgerKind.REFUND, [ZERO] * 3)[0],
        adjustments=by_kind.get(LedgerKind.ADJUSTMENT, [ZERO] * 3)[0],
    )
    _post(key=f"payout:{payout.reference}", vendor=vendor, kind=LedgerKind.PAYOUT, amount=-amount, payout=payout,
          reference=payout.reference, note="Payout created", user=user)
    VendorFulfillment.objects.filter(vendor=vendor, settlement_status=SettlementStatus.PAYABLE,
                                     payout__isnull=True).update(payout=payout, updated_at=timezone.now())
    logger.info("Payout %s created for vendor %s: %s %s", payout.reference, vendor.pk, amount, payout.currency)
    record_audit(action="create", request=request, actor=user, instance=payout,
                 changes={"vendor": [None, vendor.name], "amount": [None, str(amount)], "status": [None, "processing"]})
    return payout


@transaction.atomic
def mark_paid(payout: VendorPayout, *, user, transaction_reference: str, paid_at=None, notes: str = "",
              request=None) -> VendorPayout:
    payout = VendorPayout.objects.select_for_update().get(pk=payout.pk)
    if payout.status != PayoutStatus.PROCESSING:
        raise WorkflowError(f"{payout.reference} is {payout.get_status_display().lower()}.", conflict=True)
    transaction_reference = transaction_reference.strip()
    if not transaction_reference:
        raise WorkflowError("Enter the transfer reference (mobile money / bank) as proof of payment.",
                            field="transaction_reference")
    payout.status = PayoutStatus.PAID
    payout.transaction_reference = transaction_reference[:80]
    payout.paid_at = paid_at or timezone.now()
    payout.processed_by = user
    payout.processed_at = timezone.now()
    if notes:
        payout.notes = f"{payout.notes}\n{notes}".strip()
    payout.save()
    payout.fulfillments.filter(settlement_status=SettlementStatus.PAYABLE).update(
        settlement_status=SettlementStatus.SETTLED, updated_at=timezone.now())
    logger.info("Payout %s marked paid (ref %s)", payout.reference, transaction_reference)
    record_audit(action="status_change", request=request, actor=user, instance=payout,
                 changes={"status": ["processing", "paid"], "transaction_reference": [None, transaction_reference]})
    from .services import _notify_owner

    _notify_owner(payout.vendor, "Payout sent",
                  f"AGIZA sent you {payout.amount:,.0f} {payout.currency} ({payout.reference}).",
                  {"payout": payout.reference})
    return payout


@transaction.atomic
def mark_failed(payout: VendorPayout, *, user, reason: str, reversed_after_payment: bool = False,
                request=None) -> VendorPayout:
    """The transfer failed (or was reversed afterwards): the money goes back to the vendor's balance."""
    payout = VendorPayout.objects.select_for_update().get(pk=payout.pk)
    allowed = {PayoutStatus.PAID} if reversed_after_payment else {PayoutStatus.PROCESSING}
    if payout.status not in allowed:
        raise WorkflowError(f"{payout.reference} is {payout.get_status_display().lower()}.", conflict=True)
    reason = reason.strip()
    if not reason:
        raise WorkflowError("Give the reason.", field="reason")
    before = payout.status
    payout.status = PayoutStatus.REVERSED if reversed_after_payment else PayoutStatus.FAILED
    payout.failure_reason = reason[:255]
    payout.processed_by = user
    payout.processed_at = timezone.now()
    payout.save()
    _post(key=f"payout_reversal:{payout.reference}", vendor=payout.vendor, kind=LedgerKind.PAYOUT_REVERSAL,
          amount=payout.amount, payout=payout, reference=payout.reference, note=reason, user=user)
    payout.fulfillments.update(settlement_status=SettlementStatus.PAYABLE, payout=None, updated_at=timezone.now())
    logger.warning("Payout %s %s: %s", payout.reference, payout.status, reason)
    record_audit(action="status_change", request=request, actor=user, instance=payout,
                 changes={"status": [before, payout.status], "reason": [None, reason]})
    return payout


@transaction.atomic
def create_batch(*, user, vendor_ids: list[int] | None = None, notes: str = "", request=None) -> PayoutBatch:
    """A payout for every vendor (or the chosen ones) with a positive payable balance and none in progress."""
    candidates = Vendor.objects.filter(ledger__isnull=False).distinct().order_by("name")
    if vendor_ids:
        candidates = candidates.filter(pk__in=vendor_ids)
    batch = PayoutBatch.objects.create(notes=notes, created_by=user)
    made = 0
    for vendor in candidates:
        if VendorPayout.objects.filter(vendor=vendor, status=PayoutStatus.PROCESSING).exists():
            continue
        if balance(vendor).payable <= 0:
            continue
        create_payout(vendor, user=user, batch=batch, request=request)
        made += 1
    if not made:
        raise WorkflowError("No vendor has a payable balance.", conflict=True)
    record_audit(action="create", request=request, actor=user, instance=batch, changes={"payouts": [None, made]})
    return batch


def record_payout(vendor: Vendor, *, user, method: str, transaction_reference: str = "", paid_at=None,
                  notes: str = "", request=None) -> VendorPayout:
    """A transfer already made: create the payout and record it as paid in one step."""
    with transaction.atomic():
        payout = create_payout(vendor, user=user, method=method, notes=notes, request=request)
        return mark_paid(payout, user=user, transaction_reference=transaction_reference or "recorded", paid_at=paid_at,
                         request=request)
