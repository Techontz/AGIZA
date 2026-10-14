"""
Invoice and receipt PDFs for any order, for staff (admin) and the customer (app).

  - Invoice INV-<order>: what the order costs (items, delivery and other charges, changes), what was
    paid and the balance due, with how to pay.
  - Receipt RCT-<order>: the payments received on the order and what is still due.

Only customer-facing figures are printed (never costs, margins or internal notes).
"""
from __future__ import annotations

from decimal import Decimal

from django.conf import settings
from django.utils import timezone

from apps.core.pdf import MARGIN, PAGE_H, PAGE_W, Canvas, wrap

from . import services
from .models import Order, Payment
from .workflows import OrderType, status_label

INK, MUTED, BRAND = (0.09, 0.09, 0.09), (0.42, 0.40, 0.38), (0.99, 0.72, 0.0)
SOFT = (0.97, 0.96, 0.94)
GREEN, RED = (0.09, 0.48, 0.27), (0.76, 0.15, 0.11)
RIGHT = PAGE_W - MARGIN


def _money(value, currency: str) -> str:
    if value is None:
        return "To be confirmed"
    sign = "-" if value < 0 else ""
    return f"{sign}{currency} {abs(value):,.0f}" if value == value.to_integral_value() else \
        f"{sign}{currency} {abs(value):,.2f}"


def _lines(order: Order) -> list[tuple[str, str, Decimal | None, Decimal | None]]:
    """(description, detail, quantity, amount) rows of what the customer is charged."""
    rows = []
    if order.order_type == OrderType.SHOP:
        for item in order.items.select_related("fulfillment"):
            if item.fulfillment_id and item.fulfillment.status == "cancelled":
                continue  # taken off by its adjustment
            name = item.product_name + (f" - {item.variant_name}" if item.variant_name else "")
            rows.append((name, f"{item.quantity} x {_money(item.unit_price, order.currency)}", item.quantity,
                         item.line_total))
        details = order.shop
        delivery = details.delivery_fee - details.import_fee
        if details.import_fee:
            rows.append(("Shipping to Tanzania", details.import_shipping_method.name
                         if details.import_shipping_method_id else "", None, details.import_fee))
        if delivery:
            rows.append(("Delivery", details.shipping_method.name if details.shipping_method_id else "", None, delivery))
        if details.customs_fee:
            rows.append(("Customs & import charges", "", None, details.customs_fee))
        for adj in order.adjustments.all():
            rows.append((adj.reason[:90], "Change to the order", None, adj.amount))
        return rows
    if order.order_type == OrderType.INTERNATIONAL:
        d = order.international
        detail = f"{d.get_service_type_display()} from {d.source_country.name}"
    elif order.order_type == OrderType.EXPRESS:
        d = order.express
        frm = d.pickup_city.name if d.pickup_city_id else d.pickup_address
        to = d.delivery_city.name if d.delivery_city_id else d.delivery_address
        detail = f"Express delivery {frm} to {to}"
    else:
        d = order.equipment
        detail = f"{d.get_service_type_display()}: {d.equipment}"
    rows.append((order.item_details, detail, Decimal("1"), order.total_amount))
    for adj in order.adjustments.all():
        rows.append((adj.reason[:90], "Change to the order", None, adj.amount))
    return rows


class _Doc:
    def __init__(self, title: str, number: str, order: Order):
        self.c, self.y, self.order, self.title, self.number = Canvas(), 0.0, order, title, number
        self._header()

    def _header(self):
        c, company = self.c, settings.AGIZA_COMPANY
        c.rect(0, 0, PAGE_W, 6, fill=BRAND)
        c.text(MARGIN, 52, company["name"], size=22, bold=True, color=INK)
        y = 68
        for part in [company["address"], " · ".join(p for p in (company["phone"], company["email"], company["website"]) if p),
                     f"TIN {company['tin']}" if company["tin"] else ""]:
            if part:
                c.text(MARGIN, y, part, size=9, color=MUTED)
                y += 12
        c.text(RIGHT, 52, self.title, size=20, bold=True, color=INK, align="right")
        c.text(RIGHT, 68, self.number, size=10, color=MUTED, align="right")
        c.text(RIGHT, 80, f"Date: {timezone.localdate():%d %b %Y}", size=9, color=MUTED, align="right")
        self.y = max(y, 92) + 14
        c.line(MARGIN, self.y, RIGHT, self.y)
        self.y += 22

    def need(self, height: float):
        if self.y + height > PAGE_H - 70:
            self.c.new_page()
            self.c.rect(0, 0, PAGE_W, 6, fill=BRAND)
            self.c.text(MARGIN, 34, f"{self.title} {self.number} (continued)", size=9, color=MUTED)
            self.y = 56

    def parties(self):
        o, c, y = self.order, self.c, self.y
        cust = o.customer
        c.text(MARGIN, y, "BILL TO", size=8, bold=True, color=MUTED)
        rows = [cust.full_name, cust.company_name, cust.phone, cust.email]
        if o.order_type == OrderType.SHOP:
            d = o.shop
            rows.append(", ".join(p for p in (d.shipping_address, d.area, d.city.name if d.city_id else "") if p))
        yy = y + 14
        for i, r in enumerate(r for r in rows if r):
            for part in wrap(r, 10, 240):
                c.text(MARGIN, yy, part, size=10, bold=i == 0, color=INK)
                yy += 13
        x = PAGE_W / 2 + 20
        c.text(x, y, "ORDER", size=8, bold=True, color=MUTED)
        info = [("Order", o.reference), ("Placed", f"{timezone.localtime(o.created_at):%d %b %Y}"),
                ("Type", o.get_order_type_display()), ("Status", status_label(o.order_type, o.status))]
        when = services.expected_delivery(o)
        if when:
            info.append(("Expected delivery", f"{when:%d %b %Y}"))
        elif o.order_type == OrderType.SHOP and o.shop.estimated_delivery:
            info.append(("Expected delivery", o.shop.estimated_delivery))
        iy = y + 14
        for label, value in info:
            c.text(x, iy, label, size=9, color=MUTED)
            c.text(RIGHT, iy, value, size=9, bold=True, color=INK, align="right")
            iy += 13
        self.y = max(yy, iy) + 18

    def items(self):
        c, cur = self.c, self.order.currency
        self.need(40)
        c.rect(MARGIN, self.y, RIGHT - MARGIN, 22, fill=SOFT)
        c.text(MARGIN + 10, self.y + 15, "DESCRIPTION", size=8, bold=True, color=MUTED)
        c.text(RIGHT - 10, self.y + 15, "AMOUNT", size=8, bold=True, color=MUTED, align="right")
        self.y += 22
        for desc, detail, _qty, amount in _lines(self.order):
            parts = wrap(desc, 10, 330, bold=True)
            height = 14 * len(parts) + (12 if detail else 0) + 12
            self.need(height)
            yy = self.y + 16
            for i, part in enumerate(parts):
                c.text(MARGIN + 10, yy, part, size=10, bold=True, color=INK)
                if i == 0:
                    c.text(RIGHT - 10, yy, _money(amount, cur), size=10, color=INK, align="right")
                yy += 14
            if detail:
                c.text(MARGIN + 10, yy - 2, detail[:90], size=9, color=MUTED)
            self.y += height
            c.line(MARGIN, self.y, RIGHT, self.y)
        self.y += 10

    def totals(self, summary):
        c, cur = self.c, self.order.currency
        self.need(80)
        x = PAGE_W / 2 + 20
        rows = [("Total", _money(summary.total, cur), INK, True), ("Paid", _money(summary.paid, cur), GREEN, False)]
        due = summary.due if summary.due is not None else None
        rows.append(("Balance due", _money(due, cur), RED if due and due > 0 else INK, True))
        for label, value, color, bold in rows:
            c.text(x, self.y + 12, label, size=10, bold=bold, color=MUTED if not bold else INK)
            c.text(RIGHT - 10, self.y + 12, value, size=11 if bold else 10, bold=bold, color=color, align="right")
            self.y += 18
        stamp = {"fully_paid": ("PAID", GREEN), "partial": ("PARTLY PAID", (0.66, 0.35, 0.0)),
                 "installment": ("INSTALLMENTS", (0.40, 0.25, 0.60))}.get(summary.status, ("UNPAID", RED))
        c.text(MARGIN, self.y - 24, stamp[0], size=18, bold=True, color=stamp[1])
        self.y += 14

    def payments(self, payments: list[Payment]):
        c, cur = self.c, self.order.currency
        self.need(50)
        c.text(MARGIN, self.y + 10, "PAYMENTS RECEIVED", size=8, bold=True, color=MUTED)
        self.y += 18
        if not payments:
            c.text(MARGIN, self.y + 12, "No payments yet.", size=10, color=MUTED)
            self.y += 24
            return
        c.rect(MARGIN, self.y, RIGHT - MARGIN, 20, fill=SOFT)
        for x, label, align in [(MARGIN + 10, "DATE", "left"), (MARGIN + 110, "METHOD", "left"),
                                (MARGIN + 260, "REFERENCE", "left"), (RIGHT - 10, "AMOUNT", "right")]:
            c.text(x, self.y + 14, label, size=8, bold=True, color=MUTED, align=align)
        self.y += 20
        for p in payments:
            self.need(20)
            refund = p.kind == Payment.Kind.REFUND
            c.text(MARGIN + 10, self.y + 14, f"{timezone.localtime(p.paid_at):%d %b %Y}", size=9, color=INK)
            c.text(MARGIN + 110, self.y + 14, ("Refund - " if refund else "") + p.get_method_display()[:26], size=9,
                   color=INK)
            c.text(MARGIN + 260, self.y + 14, (p.reference or "-")[:34], size=9, color=MUTED)
            c.text(RIGHT - 10, self.y + 14, _money(-p.amount if refund else p.amount, cur), size=9, bold=True,
                   color=RED if refund else INK, align="right")
            self.y += 20
            c.line(MARGIN, self.y, RIGHT, self.y)
        self.y += 12

    def footer(self, note: str):
        c = self.c
        self.need(60)
        self.y += 6
        for part in wrap(note, 9, RIGHT - MARGIN):
            c.text(MARGIN, self.y, part, size=9, color=MUTED)
            self.y += 12
        c.text(MARGIN, PAGE_H - 30, f"Thank you for choosing {settings.AGIZA_COMPANY['name']}.", size=9, color=MUTED)


def invoice(order: Order) -> tuple[str, bytes]:
    summary = services.payment_summary(order)
    doc = _Doc("INVOICE", f"INV-{order.reference}", order)
    doc.parties()
    doc.items()
    doc.totals(summary)
    doc.payments(list(order.payments.order_by("paid_at", "id")))
    due = summary.due and summary.due > 0
    doc.footer(f"How to pay: {settings.AGIZA_COMPANY['payment_instructions']}" if due else
               "This invoice is fully paid.")
    return f"INV-{order.reference}.pdf", doc.c.build()


def receipt(order: Order) -> tuple[str, bytes]:
    summary = services.payment_summary(order)
    doc = _Doc("RECEIPT", f"RCT-{order.reference}", order)
    doc.parties()
    doc.payments(list(order.payments.order_by("paid_at", "id")))
    doc.totals(summary)
    doc.footer("Received with thanks." + ("" if not summary.due or summary.due <= 0 else
                                         f" {_money(summary.due, order.currency)} is still due on this order."))
    return f"RCT-{order.reference}.pdf", doc.c.build()


DOCUMENTS = {"invoice": invoice, "receipt": receipt}


def pdf_response(order: Order, kind: str):
    from django.http import HttpResponse

    filename, data = DOCUMENTS[kind](order)
    response = HttpResponse(data, content_type="application/pdf")
    response["Content-Disposition"] = f'inline; filename="{filename}"'
    response["Cache-Control"] = "private, no-store"
    return response
