"""
RateCalculator: the single source of truth for shipping prices.

Flow (per the Shipping Engine spec):
  product / profile -> destination zones -> route -> shipping method
  -> most specific applicable rule (product > profile > general; then route
     specificity; then narrower conditions) -> override (if active)
  -> chargeable weight -> price -> minimum charge -> currency conversion.

Every step is recorded in an explanation so the Test Rate screen can show
*why* a rule and price were chosen. All arithmetic uses Decimal.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import ROUND_CEILING, ROUND_HALF_UP, Decimal
from typing import Any

from django.db.models import Q
from django.utils import timezone

from apps.locations.models import City, Country

from .constants import (
    CURRENCY_DECIMALS,
    CURRENCY_SYMBOL,
    PRICING_UNIT,
    WEIGHT_ROUNDING_STEP,
    AppliesTo,
    CbmMethod,
    NoRuleFallback,
    PricingModel,
    ProfileType,
    Status,
    ZoneStatus,
)
from .models import (
    EngineSettings,
    ExchangeRate,
    Route,
    RuleOverride,
    ShippingMethod,
    ShippingProfile,
    ShippingRule,
    Zone,
    ZoneDestination,
)

CM3_PER_M3 = Decimal("1000000")
TIER_LABEL = {1: "Specific Product rule", 2: "Shipping Profile rule", 3: "General Route rule"}


class RateCalculationError(Exception):
    """Invalid shipment input or engine configuration (reported as HTTP 400)."""

    def __init__(self, message: str, code: str = "invalid_shipment", field: str | None = None):
        super().__init__(message)
        self.message = message
        self.code = code
        self.field = field


# --------------------------------------------------------------------------- #
# Input
# --------------------------------------------------------------------------- #
@dataclass
class Shipment:
    origin_country: Country
    method: ShippingMethod
    weight_kg: Decimal
    quantity: int = 1
    origin_city: City | None = None
    destination_country: Country | None = None
    destination_city: City | None = None
    destination_zone: Zone | None = None
    profile: ShippingProfile | None = None
    product_sku: str = ""
    length_cm: Decimal | None = None
    width_cm: Decimal | None = None
    height_cm: Decimal | None = None
    cbm: Decimal | None = None  # per item; used when dimensions are not given / manual CBM mode
    on_date: date | None = None


# --------------------------------------------------------------------------- #
# Formatting helpers
# --------------------------------------------------------------------------- #
def money(amount: Decimal | None, currency: str) -> str:
    if amount is None:
        return "—"
    places = CURRENCY_DECIMALS.get(currency, 2)
    q = amount.quantize(Decimal(1) if places == 0 else Decimal("0.01"), rounding=ROUND_HALF_UP)
    text = f"{q:,.{places}f}"
    return f"{CURRENCY_SYMBOL.get(currency, currency + ' ')}{text}"


def rate_display(pricing_model: str, rate: Decimal | None, currency: str) -> str:
    if pricing_model == PricingModel.MANUAL or rate is None:
        return "Manual"
    # Whole rates read "$25/KG"; fractional ones keep two decimals ("$12.50/KG").
    places = 0 if rate == rate.to_integral() else 2
    amount = f"{CURRENCY_SYMBOL.get(currency, currency + ' ')}{rate:,.{places}f}"
    unit = PRICING_UNIT.get(PricingModel(pricing_model))
    if pricing_model == PricingModel.FIXED:
        return f"{amount} flat"
    return f"{amount}/{unit}"


def kg(value: Decimal | None) -> str:
    if value is None:
        return "—"
    return f"{value.normalize():f} KG" if value == value.to_integral() else f"{value.quantize(Decimal('0.001')).normalize():f} KG"


def round_weight(value: Decimal, rounding: str) -> Decimal:
    step = WEIGHT_ROUNDING_STEP.get(rounding)
    if step is None:
        return value.quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)
    return (value / step).to_integral_value(rounding=ROUND_CEILING) * step


def get_exchange_rate(base: str, quote: str, on_date: date) -> tuple[Decimal, date | None] | None:
    """Rate converting 1 `base` into `quote` on `on_date` (direct, else inverse)."""
    if base == quote:
        return Decimal("1"), None
    direct = (
        ExchangeRate.objects.filter(base_currency=base, quote_currency=quote, effective_date__lte=on_date)
        .order_by("-effective_date")
        .first()
    )
    if direct:
        return direct.rate, direct.effective_date
    inverse = (
        ExchangeRate.objects.filter(base_currency=quote, quote_currency=base, effective_date__lte=on_date)
        .order_by("-effective_date")
        .first()
    )
    if inverse:
        return (Decimal("1") / inverse.rate).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP), inverse.effective_date
    return None


# --------------------------------------------------------------------------- #
# Calculator
# --------------------------------------------------------------------------- #
@dataclass
class _Trace:
    steps: list[dict[str, Any]] = field(default_factory=list)
    considered: list[dict[str, Any]] = field(default_factory=list)

    def ok(self, text: str):
        self.steps.append({"ok": True, "text": text})

    def fail(self, text: str):
        self.steps.append({"ok": False, "text": text})


class RateCalculator:
    def __init__(self, settings: EngineSettings | None = None):
        self.settings = settings or EngineSettings.load()

    # ---- public ------------------------------------------------------------ #
    def calculate(self, s: Shipment) -> dict[str, Any]:
        self._validate(s)
        on_date = s.on_date or timezone.localdate()
        trace = _Trace()
        measures = self._measurements(s)
        destination_country = s.destination_country or (s.destination_city.country if s.destination_city else None)

        # 1. Profile / product
        profile = s.profile
        if profile:
            handling = ", ".join(profile.handling_labels) or "none"
            trace.ok(f"Shipping profile: {profile.name} (special handling: {handling})")
        else:
            trace.ok("No shipping profile given — only general route rules and product rules can apply")
        if s.product_sku:
            trace.ok(f"Product SKU: {s.product_sku}")

        # 2. Destination -> zones
        zones = self._resolve_zones(s, destination_country)
        if s.destination_city:
            if zones:
                trace.ok(f"Destination resolved: {s.destination_city.name} → {', '.join(z.name for z in zones)}")
            else:
                trace.ok(f"Destination resolved: {s.destination_city.name} (not part of any active zone)")

        # 3. Route
        routes = self._candidate_routes(s, destination_country, zones)
        if not routes:
            trace.fail(f"No active route from {self._origin_label(s)} to {self._destination_label(s)}")
            return self._fallback(s, trace, measures, reason="No active route covers this origin and destination.")

        method = s.method
        with_method = [r for r in routes if any(m.id == method.id for m in r.methods.all())]
        if not with_method:
            available = sorted({m.name for r in routes for m in r.methods.all() if m.status == Status.ACTIVE})
            trace.ok(f"Route found: {routes[0].label}")
            trace.fail(
                f"Shipping method {method.name} is not available on this route"
                + (f" (available: {', '.join(available)})" if available else "")
            )
            return self._fallback(s, trace, measures, reason=f"{method.name} is not offered on this route.")
        route_labels = ", ".join(r.label for r in with_method)
        trace.ok(f"Route matched: {route_labels}")
        trace.ok(f"Shipping method matched: {method.name}")
        if method.status != Status.ACTIVE:
            # Per the design: deactivation hides a method from new assignments only.
            trace.ok(f"Note: {method.name} is inactive — hidden from new rules, but existing routes still use it")

        if method.max_weight_kg is not None and measures["actual_weight_kg"] > method.max_weight_kg:
            trace.fail(f"Total weight {kg(measures['actual_weight_kg'])} exceeds {method.name} maximum of {kg(method.max_weight_kg)}")
            return self._result(
                "blocked",
                f"{method.name} accepts at most {kg(method.max_weight_kg)} per shipment.",
                s,
                trace,
                measures,
            )

        # 4. Rules
        rule, runner_up = self._select_rule(s, with_method, measures, trace)
        if rule is None:
            trace.fail("No active rule matches this shipment")
            return self._fallback(s, trace, measures, reason="No shipping rule matches this shipment.")

        tier_text = f"{TIER_LABEL[rule.tier]} (priority {rule.tier})"
        if runner_up is not None:
            tier_text += (
                f" selected over {rule_ref(runner_up)} — {TIER_LABEL[runner_up.tier].lower()} (priority {runner_up.tier})"
                if runner_up.tier != rule.tier
                else f" selected over {rule_ref(runner_up)} (less specific route or conditions)"
            )
        trace.ok(f"Rule selected: {rule.code} — {tier_text}")
        if rule.condition_count:
            trace.ok(f"Rule conditions passed: {self._conditions_text(rule)}")

        # Manual-quote profiles never auto-price (unless a product-specific rule exists).
        if profile and profile.type == ProfileType.MANUAL and rule.applies_to != AppliesTo.PRODUCT:
            trace.fail(f"Profile {profile.name} requires a manual quote — no automatic rate applied")
            return self._result("manual_quote", "This profile requires a manual quotation.", s, trace, measures, rule=rule)

        # 5. Override
        override = self._find_override(s, rule, on_date)
        pricing_model, rate, currency = rule.pricing_model, rule.rate, rule.currency
        if override:
            trace.ok(
                f"Override {override.code} applied: {rate_display(rule.pricing_model, rule.rate, rule.currency)} → "
                f"{rate_display(override.pricing_model, override.rate, override.currency)} "
                f"({override.reason.strip()}; valid {override.start_date:%-d %b %Y} – {override.end_date:%-d %b %Y})"
            )
            pricing_model, rate, currency = override.pricing_model, override.rate, override.currency

        if pricing_model == PricingModel.MANUAL:
            trace.fail(f"Rule {rule.code} uses Manual Quote pricing — an admin must quote this shipment")
            return self._result("manual_quote", "A manual quotation is required for this shipment.", s, trace, measures, rule=rule)

        # 6. Price
        divisor = rule.volumetric_divisor or self.settings.default_volumetric_divisor
        pricing = self._price(pricing_model, rate, currency, divisor, measures, trace)

        # 7. Minimum charge — set in the rule's currency; an override may price in
        # another currency, so compare like with like.
        minimum = rule.minimum_charge
        if minimum is not None and rule.currency != currency:
            fx_min = get_exchange_rate(rule.currency, currency, on_date)
            if fx_min is None:
                raise RateCalculationError(
                    f"No exchange rate configured for {rule.currency} → {currency} (needed for the minimum charge). "
                    "Set it in Shipping Engine Settings.",
                    code="missing_exchange_rate",
                )
            converted = (minimum * fx_min[0]).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            trace.ok(f"Minimum charge {money(minimum, rule.currency)} converted to {money(converted, currency)}")
            minimum = converted
        pricing["minimum_charge"] = minimum
        pricing["minimum_applied"] = False
        if minimum is not None and self.settings.apply_minimum_charge:
            if pricing["amount"] < minimum:
                trace.ok(
                    f"Minimum charge check: {money(pricing['amount'], currency)} < {money(minimum, currency)} minimum — "
                    f"raised to the minimum"
                )
                pricing["amount"] = minimum
                pricing["minimum_applied"] = True
            else:
                trace.ok(
                    f"Minimum charge check: {money(pricing['amount'], currency)} ≥ {money(minimum, currency)} minimum — passed"
                )
        elif minimum is not None:
            trace.ok("Minimum charge not enforced (disabled in Shipping Engine Settings)")

        # 8. Currency conversion
        target = self.settings.display_currency
        fx = get_exchange_rate(currency, target, on_date)
        if fx is None:
            raise RateCalculationError(
                f"No exchange rate configured for {currency} → {target}. Set it in Shipping Engine Settings.",
                code="missing_exchange_rate",
            )
        fx_rate, fx_date = fx
        places = CURRENCY_DECIMALS.get(target, 2)
        total = (pricing["amount"] * fx_rate).quantize(
            Decimal(1) if places == 0 else Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        if currency != target:
            trace.ok(
                f"Converted {currency} → {target} at {fx_rate.normalize():,f}"
                + (f" (rate effective {fx_date:%-d %b %Y})" if fx_date else "")
            )
        pricing.update(
            {
                "source_currency": currency,
                "target_currency": target,
                "exchange_rate": fx_rate,
                "exchange_rate_date": fx_date,
                "total": total,
                "amount_display": money(pricing["amount"], currency),
                "subtotal_display": money(pricing["subtotal"], currency),
                "total_display": money(total, target),
                "minimum_charge_display": money(minimum, currency) if minimum is not None else None,
            }
        )
        return self._result(
            "priced", "Shipping price calculated.", s, trace, measures, rule=rule, override=override, pricing=pricing
        )

    # ---- steps ------------------------------------------------------------- #
    def _validate(self, s: Shipment):
        if s.weight_kg is None or s.weight_kg <= 0:
            raise RateCalculationError("Weight must be greater than zero.", field="weight_kg")
        if s.quantity < 1:
            raise RateCalculationError("Quantity must be at least 1.", field="quantity")
        if not (s.destination_country or s.destination_city or s.destination_zone):
            raise RateCalculationError("A destination is required.", field="destination")
        if s.origin_city and s.origin_city.country_id != s.origin_country.id:
            raise RateCalculationError("Origin city is not in the origin country.", field="origin_city")
        if s.destination_city and s.destination_country and s.destination_city.country_id != s.destination_country.id:
            raise RateCalculationError("Destination city is not in the destination country.", field="destination_city")
        if s.profile and s.profile.status != Status.ACTIVE:
            raise RateCalculationError(f"Shipping profile {s.profile.name} is inactive.", field="profile")
        dims = [s.length_cm, s.width_cm, s.height_cm]
        if any(d is not None for d in dims) and not all(d is not None and d > 0 for d in dims):
            raise RateCalculationError("Provide length, width and height (all greater than zero).", field="dimensions")

    def _measurements(self, s: Shipment) -> dict[str, Any]:
        qty = Decimal(s.quantity)
        cbm_item: Decimal | None = None
        cbm_source = None
        if (
            self.settings.cbm_method == CbmMethod.DIMENSIONS
            and s.length_cm is not None
            and s.width_cm is not None
            and s.height_cm is not None
        ):
            cbm_item = s.length_cm * s.width_cm * s.height_cm / CM3_PER_M3
            cbm_source = "dimensions"
        elif s.cbm is not None:
            cbm_item = s.cbm
            cbm_source = "manual"
        return {
            "quantity": s.quantity,
            "weight_per_item_kg": s.weight_kg,
            "actual_weight_kg": (s.weight_kg * qty).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP),
            "cbm_per_item": cbm_item.quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP) if cbm_item is not None else None,
            "cbm": (cbm_item * qty).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP) if cbm_item is not None else None,
            "cbm_source": cbm_source,
            "dimensions_cm": [s.length_cm, s.width_cm, s.height_cm] if s.length_cm is not None else None,
        }

    def _volumetric(self, cbm: Decimal | None, divisor: int) -> Decimal | None:
        if cbm is None:
            return None
        # L×W×H (cm³) ÷ divisor, where L×W×H = CBM × 1,000,000.
        return (cbm * CM3_PER_M3 / Decimal(divisor)).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)

    def _resolve_zones(self, s: Shipment, country: Country | None) -> list[Zone]:
        if s.destination_zone:
            return [s.destination_zone] if s.destination_zone.status == ZoneStatus.ACTIVE else []
        q = Q()
        if s.destination_city:
            q |= Q(city_id=s.destination_city.id) | Q(region_id=s.destination_city.region_id)
        if country:
            q |= Q(country_id=country.id)
        members = (
            ZoneDestination.objects.filter(q, zone__status=ZoneStatus.ACTIVE).select_related("zone")
            if q
            else ZoneDestination.objects.none()
        )
        # City membership beats region membership beats country membership.
        rank = {"city": 0, "region": 1, "country": 2}
        ordered = sorted(members, key=lambda m: rank[m.kind])
        seen: dict[int, Zone] = {}
        for m in ordered:
            seen.setdefault(m.zone_id, m.zone)
        return list(seen.values())

    def _candidate_routes(self, s: Shipment, country: Country | None, zones: list[Zone]) -> list[Route]:
        origin_q = Q(origin_country=s.origin_country) & (
            Q(origin_city__isnull=True) | Q(origin_city=s.origin_city) if s.origin_city else Q(origin_city__isnull=True)
        )
        dest_q = Q(pk__in=[])
        if s.destination_zone:
            dest_q |= Q(destination_zone=s.destination_zone)
        else:
            if s.destination_city:
                dest_q |= Q(destination_city=s.destination_city)
            if zones:
                dest_q |= Q(destination_zone__in=zones)
        if country:
            dest_q |= Q(destination_country=country, destination_city__isnull=True)
        routes = (
            Route.objects.filter(origin_q & dest_q, status=Status.ACTIVE)
            .select_related("origin_country", "origin_city", "destination_country", "destination_city", "destination_zone")
            .prefetch_related("methods")
        )
        return sorted(routes, key=lambda r: (-r.specificity, r.id))

    def _select_rule(self, s: Shipment, routes: list[Route], measures: dict, trace: _Trace):
        route_ids = [r.id for r in routes]
        route_score = {r.id: r.specificity for r in routes}
        rules = list(
            ShippingRule.objects.filter(route_id__in=route_ids, method=s.method, status=Status.ACTIVE)
            .select_related("route__origin_country", "route__origin_city", "route__destination_country",
                            "route__destination_city", "route__destination_zone", "method", "profile", "carrier")
        )
        eligible: list[ShippingRule] = []
        for rule in rules:
            reason = self._inapplicable_reason(rule, s, measures)
            if reason:
                trace.considered.append(self._considered(rule, reason))
            else:
                eligible.append(rule)
        eligible.sort(key=lambda r: (r.tier, -route_score[r.route_id], -r.condition_count, r.id))
        if not eligible:
            return None, None
        selected = eligible[0]
        for other in eligible[1:]:
            if other.tier != selected.tier:
                why = f"Lower priority — {TIER_LABEL[other.tier].lower()} (priority {other.tier}); {selected.code} is more specific"
            else:
                why = f"Same priority but less specific route or conditions than {selected.code}"
            trace.considered.append(self._considered(other, why))
        # Put not-applied rules in a stable, readable order: priority, then code.
        trace.considered.sort(key=lambda c: (c["priority"], c["code"]))
        return selected, (eligible[1] if len(eligible) > 1 else None)

    def _inapplicable_reason(self, rule: ShippingRule, s: Shipment, measures: dict) -> str | None:
        if rule.applies_to == AppliesTo.PRODUCT and rule.product_sku != (s.product_sku or "").upper():
            return f"Applies only to product SKU {rule.product_sku}"
        if rule.applies_to == AppliesTo.PROFILE and (not s.profile or rule.profile_id != s.profile.id):
            return f"Applies only to the {rule.profile.name} profile"
        weight = measures["actual_weight_kg"]
        if rule.min_weight_kg is not None and weight < rule.min_weight_kg:
            return f"Weight {kg(weight)} is below the rule minimum of {kg(rule.min_weight_kg)}"
        if rule.max_weight_kg is not None and weight > rule.max_weight_kg:
            return f"Weight {kg(weight)} is above the rule maximum of {kg(rule.max_weight_kg)}"
        cbm = measures["cbm"]
        if rule.min_cbm is not None or rule.max_cbm is not None:
            if cbm is None:
                return "Rule has a CBM condition but no dimensions/CBM were given"
            if rule.min_cbm is not None and cbm < rule.min_cbm:
                return f"Volume {cbm.normalize():f} CBM is below the rule minimum of {rule.min_cbm.normalize():f} CBM"
            if rule.max_cbm is not None and cbm > rule.max_cbm:
                return f"Volume {cbm.normalize():f} CBM is above the rule maximum of {rule.max_cbm.normalize():f} CBM"
        if rule.min_volumetric_kg is not None or rule.max_volumetric_kg is not None:
            vol = self._volumetric(cbm, rule.volumetric_divisor or self.settings.default_volumetric_divisor)
            if vol is None:
                return "Rule has a volumetric-weight condition but no dimensions/CBM were given"
            if rule.min_volumetric_kg is not None and vol < rule.min_volumetric_kg:
                return f"Volumetric weight {kg(vol)} is below the rule minimum of {kg(rule.min_volumetric_kg)}"
            if rule.max_volumetric_kg is not None and vol > rule.max_volumetric_kg:
                return f"Volumetric weight {kg(vol)} is above the rule maximum of {kg(rule.max_volumetric_kg)}"
        return None

    def _find_override(self, s: Shipment, rule: ShippingRule, on_date: date) -> RuleOverride | None:
        if rule.applies_to == AppliesTo.PRODUCT:
            return None  # product rules are already explicit exceptions
        dest_q = Q(destination_city__isnull=True, destination_region__isnull=True)
        if s.destination_city:
            dest_q |= Q(destination_city=s.destination_city) | Q(destination_region_id=s.destination_city.region_id)
        profile_q = Q(profile__isnull=True)
        if s.profile:
            profile_q |= Q(profile=s.profile)
        candidates = RuleOverride.objects.filter(
            dest_q,
            profile_q,
            route_id=rule.route_id,
            status=Status.ACTIVE,
            start_date__lte=on_date,
            end_date__gte=on_date,
        ).select_related("destination_city", "destination_region", "profile")
        ranked = sorted(candidates, key=lambda o: (-o.specificity, -o.start_date.toordinal(), -o.id))
        return ranked[0] if ranked else None

    def _price(self, model: str, rate: Decimal, currency: str, divisor: int, m: dict, trace: _Trace) -> dict:
        actual = m["actual_weight_kg"]
        volumetric = self._volumetric(m["cbm"], divisor)
        rounding = self.settings.weight_rounding
        out: dict[str, Any] = {
            "pricing_model": model,
            "pricing_model_display": PricingModel(model).label,
            "base_rate": rate,
            "rate_display": rate_display(model, rate, currency),
            "volumetric_divisor": divisor,
            "volumetric_weight_kg": volumetric,
            "chargeable_weight_kg": None,
            "weight_basis": None,
        }
        if model == PricingModel.PER_KG:
            chargeable = round_weight(actual, rounding)
            units, unit_label = chargeable, "KG"
            out.update(chargeable_weight_kg=chargeable, weight_basis="actual")
            trace.ok(f"Chargeable weight: {kg(chargeable)} (actual weight {kg(actual)}{self._rounding_note(actual, chargeable)})")
        elif model == PricingModel.PER_VOL_WEIGHT:
            if volumetric is None:
                raise RateCalculationError(
                    "This rule prices by volumetric weight: enter the package dimensions (or CBM).", field="dimensions"
                )
            basis = "volumetric" if volumetric > actual else "actual"
            raw = max(actual, volumetric)
            chargeable = round_weight(raw, rounding)
            units, unit_label = chargeable, "KG"
            out.update(chargeable_weight_kg=chargeable, weight_basis=basis)
            comparison = (
                f"volumetric {kg(volumetric)} > actual {kg(actual)}"
                if basis == "volumetric"
                else f"actual {kg(actual)} ≥ volumetric {kg(volumetric)}"
            )
            trace.ok(
                f"Chargeable weight: {kg(chargeable)} ({comparison}, divisor {divisor:,}{self._rounding_note(raw, chargeable)})"
            )
        elif model == PricingModel.PER_CBM:
            if m["cbm"] is None:
                raise RateCalculationError("This rule prices by CBM: enter the package dimensions (or CBM).", field="dimensions")
            units, unit_label = m["cbm"], "CBM"
            trace.ok(f"Chargeable volume: {m['cbm'].normalize():f} CBM")
        elif model == PricingModel.PER_ITEM:
            units, unit_label = Decimal(m["quantity"]), "Item"
            trace.ok(f"Charged per item: {m['quantity']} item{'s' if m['quantity'] != 1 else ''}")
        else:  # FIXED
            units, unit_label = Decimal(1), "shipment"
            trace.ok("Fixed price per shipment")
        subtotal = (rate * units).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        out.update(units=units, unit_label=unit_label, subtotal=subtotal, amount=subtotal)
        return out

    @staticmethod
    def _rounding_note(raw: Decimal, rounded: Decimal) -> str:
        return f", rounded up from {kg(raw)}" if rounded != raw.quantize(Decimal("0.001")) else ""

    @staticmethod
    def _conditions_text(rule: ShippingRule) -> str:
        parts = []
        if rule.min_weight_kg is not None or rule.max_weight_kg is not None:
            parts.append(f"weight {range_text(rule.min_weight_kg, rule.max_weight_kg, 'KG')}")
        if rule.min_cbm is not None or rule.max_cbm is not None:
            parts.append(f"volume {range_text(rule.min_cbm, rule.max_cbm, 'CBM')}")
        if rule.min_volumetric_kg is not None or rule.max_volumetric_kg is not None:
            parts.append(f"volumetric weight {range_text(rule.min_volumetric_kg, rule.max_volumetric_kg, 'KG')}")
        return "; ".join(parts)

    # ---- results ----------------------------------------------------------- #
    def _fallback(self, s: Shipment, trace: _Trace, measures: dict, reason: str) -> dict:
        fallback = self.settings.no_rule_fallback
        if fallback == NoRuleFallback.MANUAL_QUOTE:
            trace.ok("Fallback (Shipping Engine Settings): return a manual quote")
            return self._result("manual_quote", f"{reason} A manual quote is required.", s, trace, measures)
        if fallback == NoRuleFallback.BLOCK:
            trace.fail("Fallback (Shipping Engine Settings): block checkout")
            return self._result("blocked", f"{reason} Checkout is blocked.", s, trace, measures)
        trace.fail("Fallback (Shipping Engine Settings): return an error")
        return self._result("no_rule", reason, s, trace, measures)

    def _result(self, status, message, s, trace, measures, rule=None, override=None, pricing=None) -> dict:
        profile = s.profile
        handling = profile.handling_labels if profile else []
        carrier = rule.carrier if rule and rule.carrier_id else None
        eta = rule.eta_label if rule else None
        divisor = (rule.volumetric_divisor if rule else None) or self.settings.default_volumetric_divisor
        measures = {**measures, "volumetric_divisor": divisor, "volumetric_weight_kg": self._volumetric(measures["cbm"], divisor)}
        if pricing:
            measures["chargeable_weight_kg"] = pricing["chargeable_weight_kg"]
            measures["weight_basis"] = pricing["weight_basis"]
            measures["volumetric_divisor"] = pricing["volumetric_divisor"]
            measures["volumetric_weight_kg"] = pricing["volumetric_weight_kg"]
        return {
            "status": status,
            "message": message,
            "route": {"id": rule.route_id, "label": rule.route.label, "type": rule.route.type} if rule else None,
            "method": {"id": s.method.id, "name": s.method.name, "code": s.method.code},
            "profile": (
                {"id": profile.id, "name": profile.name, "type": profile.type, "handling": handling} if profile else None
            ),
            "carrier": {"id": carrier.id, "name": carrier.name} if carrier else None,
            "rule": (
                {
                    "id": rule.id,
                    "code": rule.code,
                    "name": rule.display_name,
                    "applies_to": rule.applies_to,
                    "applies_to_display": AppliesTo(rule.applies_to).label,
                    "target": rule.target_label,
                    "priority": rule.tier,
                    "priority_display": TIER_LABEL[rule.tier],
                    "pricing_model": rule.pricing_model,
                    "pricing_model_display": PricingModel(rule.pricing_model).label,
                    "rate": rule.rate,
                    "currency": rule.currency,
                    "rate_display": rate_display(rule.pricing_model, rule.rate, rule.currency),
                    "minimum_charge": rule.minimum_charge,
                    "minimum_charge_display": money(rule.minimum_charge, rule.currency) if rule.minimum_charge is not None else None,
                    "estimated_delivery": eta,
                }
                if rule
                else None
            ),
            "override": (
                {
                    "id": override.id,
                    "code": override.code,
                    "reason": override.reason,
                    "original_rate_display": rate_display(rule.pricing_model, rule.rate, rule.currency),
                    "override_rate_display": rate_display(override.pricing_model, override.rate, override.currency),
                    "start_date": override.start_date,
                    "end_date": override.end_date,
                }
                if override
                else None
            ),
            "measurements": measures,
            "pricing": pricing,
            "estimated_delivery": eta,
            "requires_special_handling": bool(handling) or (s.method.requires_special_handling if s.method else False),
            "special_handling": handling,
            "explanation": trace.steps,
            "considered": trace.considered,
            "summary": (
                {
                    "shipping_cost": pricing["total"],
                    "shipping_cost_display": pricing["total_display"],
                    "shipping_method": s.method.name,
                    "estimated_delivery": eta,
                    "applicable_rule": rule.code,
                    "carrier": carrier.name if carrier else None,
                    "requires_special_handling": bool(handling),
                }
                if status == "priced"
                else None
            ),
        }

    def _considered(self, rule: ShippingRule, reason: str) -> dict:
        return {
            "code": rule.code,
            "label": f"{rule.code} — {rule.route.label} ({rule.target_label})",
            "rate_display": rate_display(rule.pricing_model, rule.rate, rule.currency),
            "priority": rule.tier,
            "reason": reason,
        }

    @staticmethod
    def _origin_label(s: Shipment) -> str:
        return s.origin_city.name if s.origin_city else s.origin_country.name

    @staticmethod
    def _destination_label(s: Shipment) -> str:
        if s.destination_zone:
            return s.destination_zone.name
        if s.destination_city:
            return s.destination_city.name
        return s.destination_country.name if s.destination_country else "—"


def rule_ref(rule: ShippingRule) -> str:
    return f"{rule.code} ({rate_display(rule.pricing_model, rule.rate, rule.currency)})"


def range_text(lo: Decimal | None, hi: Decimal | None, unit: str) -> str:
    fmt = lambda v: f"{v.normalize():f}"  # noqa: E731
    if lo is not None and hi is not None:
        return f"{fmt(lo)}–{fmt(hi)} {unit}"
    if lo is not None:
        return f"≥ {fmt(lo)} {unit}"
    return f"≤ {fmt(hi)} {unit}"
