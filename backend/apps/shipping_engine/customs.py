"""
Customs / import charges on imported goods, from the ImportCharge rules staff configure.

Nothing here knows a tax rate: with no matching rule, an item's customs are reported as
not included, never as zero. Per item and kind of charge (duty, VAT…) the most specific
active rule applies; different kinds add up. A charge is either collected at checkout
(`included`) or only shown as an estimate the customer pays separately (`estimate`).

Percentages of "goods + international shipping" use each item's share of the import
shipping fee, split by item value.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal

from django.utils import timezone

from .calculator import RateCalculationError, get_exchange_rate
from .constants import ChargeBasis, ChargeTreatment, ImportChargeKind, PercentBase, Status
from .models import ImportCharge

CENT = Decimal("0.01")

INCLUDED = "included"  # every imported item has customs charged at checkout
ESTIMATED = "estimated"  # some customs are an estimate paid separately
NOT_INCLUDED = "not_included"  # no rule for some imported items: payable separately, amount unknown

NOTES = {
    INCLUDED: "Customs / import charges are included in your total.",
    ESTIMATED: "Customs / import charges marked as estimates are not included in your total; they are paid "
               "separately when the goods are cleared and the final amount may differ.",
    NOT_INCLUDED: "Customs / import charges are not included and may be payable separately.",
}


@dataclass
class Item:
    product: object
    quantity: int
    value: Decimal  # line value in the store currency
    origin_country_id: int | None


@dataclass
class Charges:
    lines: list[dict] = field(default_factory=list)  # {kind, kind_display, name, treatment, amount}
    included: Decimal = Decimal("0")
    estimate: Decimal = Decimal("0")
    status: str | None = None  # None when nothing is imported
    uncovered: list[str] = field(default_factory=list)  # imported products without a customs rule

    @property
    def note(self) -> str:
        if self.status == NOT_INCLUDED and self.lines:
            names = ", ".join(self.uncovered)
            return f"{NOTES[ESTIMATED if self.estimate else INCLUDED]} Customs for {names} are not included and may be payable separately."
        return NOTES.get(self.status, "")

    def as_dict(self) -> dict:
        return {"lines": [{**line, "amount": str(line["amount"])} for line in self.lines],
                "included": str(self.included), "estimate": str(self.estimate), "status": self.status,
                "note": self.note, "uncovered": self.uncovered}


def _matches(charge: ImportCharge, item: Item) -> bool:
    product = item.product
    return ((not charge.origin_country_id or charge.origin_country_id == item.origin_country_id)
            and (not charge.category_id or charge.category_id in (product.category_id, product.subcategory_id))
            and (not charge.profile_id or charge.profile_id == product.shipping_profile_id)
            and (not charge.product_sku or charge.product_sku == product.sku.upper()))


def _in_currency(amount: Decimal, currency: str, target: str) -> Decimal:
    if not currency or currency == target:
        return amount
    found = get_exchange_rate(currency, target, timezone.localdate())
    if found is None:
        raise RateCalculationError(f"No exchange rate from {currency} to {target}.", code="missing_exchange_rate")
    return amount * found[0]


def calculate(items: list[Item], *, currency: str, import_shipping: Decimal = Decimal("0")) -> Charges:
    """Import charges for the imported items of an order (in `currency`, the store currency)."""
    result = Charges()
    if not items:
        return result
    rules = list(ImportCharge.objects.filter(status=Status.ACTIVE).order_by("-id"))
    total_value = sum((i.value for i in items), Decimal("0"))
    totals: dict[tuple, Decimal] = {}
    per_order: dict[int, ImportCharge] = {}
    for item in items:
        best: dict[str, ImportCharge] = {}
        for rule in rules:
            if _matches(rule, item) and (rule.kind not in best or rule.specificity > best[rule.kind].specificity):
                best[rule.kind] = rule
        if ImportChargeKind.CUSTOMS_DUTY not in best:
            result.uncovered.append(item.product.name)
        shipping_share = (import_shipping * item.value / total_value) if total_value else Decimal("0")
        for rule in best.values():
            if rule.basis == ChargeBasis.FIXED_SHIPMENT:
                per_order[rule.pk] = rule  # once per order, however many items it covers
                continue
            if rule.basis == ChargeBasis.PERCENT:
                base = item.value + (shipping_share if rule.percent_base == PercentBase.GOODS_SHIPPING else 0)
                amount = base * rule.rate / Decimal("100")
            else:
                amount = _in_currency(rule.rate, rule.currency, currency) * item.quantity
            key = (rule.kind, rule.name, rule.treatment)
            totals[key] = totals.get(key, Decimal("0")) + amount
    for rule in per_order.values():
        key = (rule.kind, rule.name, rule.treatment)
        totals[key] = totals.get(key, Decimal("0")) + _in_currency(rule.rate, rule.currency, currency)

    kinds = dict(ImportChargeKind.choices)
    for (kind, name, treatment), amount in sorted(totals.items(), key=lambda kv: (kv[0][2], kv[0][0], kv[0][1])):
        amount = amount.quantize(CENT, rounding=ROUND_HALF_UP)
        result.lines.append({"kind": kind, "kind_display": kinds[kind], "name": name, "treatment": treatment,
                             "amount": amount})
        if treatment == ChargeTreatment.INCLUDED:
            result.included += amount
        else:
            result.estimate += amount
    result.status = NOT_INCLUDED if result.uncovered else ESTIMATED if result.estimate else INCLUDED
    return result
