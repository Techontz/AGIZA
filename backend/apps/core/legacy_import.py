"""
Bring the old AGIZA cargo system ("ujenzi", database agizasto_cargo8) into this platform.

    python manage.py import_legacy --legacy-url mysql://user:pass@localhost:3306/agizasto_cargo8 [--dry-run]

or, with the old tables loaded into this platform's own database under an `old_` prefix
(agiza-old-data.sql), simply:

    python manage.py import_legacy [--dry-run]

What moves where:
  auth_user (staff)            → accounts.User (same password; level from the old groups)
  ujenzi_client                → parties.Customer + storefront.CustomerAccount (same password: old app users
                                 sign in as before) + parties.Address when the city is known
  ujenzi_supplier / shipper    → procurement.Supplier / shipping_engine.Carrier
  ujenzi_laguage (orders)      → orders.Order: "Buy for me" / "Deliver for me" → International, "ecommerce" →
                                 E-commerce; the old order number stays the reference; status, prices, costs,
                                 expected date, supplier, tracking, notes and photos (Cloudinary) are kept
  ujenzi_orderstatuslog        → order status history (with the old dates and staff)
  ujenzi_paymentlogs           → payments, up to the order total (the old system's "paid" is wrong on some
                                 orders: those are flagged for Finance with the old figure)
  ujenzi_laguagealert / issue  → exception flags (open and resolved)
  ujenzi_invoice / invoiceitem → finance invoices (old quotations are marked as such in the notes)
  ujenzi_orderchatroom / msg   → chat conversations on the order (the customer sees them in the app)
  ujenzi_pushdevicetoken       → push devices of the customers' accounts
  shop_product (+ images)      → catalog products as Draft, to review before publishing

Open orders also get what the workflow needs next: a procurement record, a cargo parcel, or a delivery.
Nothing is sent to customers (no push, no inbox) and no audit noise is written. Every imported row is
recorded in core.LegacyRecord, so the command can be run again safely: rows already imported are not
duplicated. Orders imported earlier get the old system's newer status steps and payments on a re-run
(unless staff have already handled them here since the import).
"""
from __future__ import annotations

import contextlib
import json
import os
import re
import urllib.request
from collections import defaultdict
from datetime import UTC, date, datetime, time
from decimal import Decimal, InvalidOperation
from urllib.parse import unquote, urlparse

import pymysql
from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.core.models import LegacyRecord
from apps.core.uploads import sniff

ZERO = Decimal("0")

# Old order statuses → (international status, extra flag note or "").
INTL_STATUS = {
    "delivered": "completed",
    "solved": "completed",
    "pending": "pending_payment",
    "initiated": "pending_payment",
    "pending sourcing": "pending_payment",
    "installment": "pending_payment",
    "active": "supplier_confirmed",
    "approved": "supplier_confirmed",
    "pre ordered": "supplier_confirmed",
    "paid supplier": "paid_supplier",
    "shipped to shipping agent": "waiting_to_receive",
    "received at shipping agent": "sent_to_consolidation",
    "shipping to destination country": "shipping_to_destination",
    "ready for delivery": "ready_for_collection",
    "at technical support": "ready_for_collection",
    "lost/damaged": "shipping_to_destination",
    "cancelled": "cancelled",
    "refund in process": "cancelled",
}
# Steps that only appear in the old status log (not as an order's current status).
LOG_STATUS = {
    "shiped to cargo": "waiting_to_receive",
    "waiting to be received": "waiting_to_receive",
    "received at cargo": "sent_to_consolidation",
    "received": "sent_to_consolidation",
    "at supplier": "in_production",
    "production stage": "in_production",
    "loaded": "shipping_to_destination",
    "delivering": "ready_for_collection",
}
# Statuses that need someone's attention: they also get a flag.
STATUS_FLAG = {"at technical support": ("needs_care", "At Technical Support (old system)"),
               "lost/damaged": ("other", "Lost / damaged (old system)"),
               "refund in process": ("other", "Refund in process (old system)")}
SHOP_STATUS = {"delivered": "delivered", "cancelled": "cancelled", "installment": "pending",
               "received at shipping agent": "at_origin_warehouse"}
COUNTRY_ISO = {"china": "CN", "dubai": "AE", "uae": "AE", "united state": "US", "united states": "US", "usa": "US",
               "united kingdom": "GB", "uk": "GB", "india": "IN", "tanzania": "TZ"}
GROUP_LEVEL = [  # first match wins
    ("admin", "admin_l2", "management"), ("logistical manager", "admin_l1", "shipping"),
    ("finance", "finance", "finance"), ("procument", "procurement", "procurement"),
    ("shipping", "admin_l1", "shipping"), ("sales", "sales", "sales"), ("delivery", "driver", "delivery"),
    ("operator", "data_entry", "support"),
]
PROCUREMENT_STAGES = {"pending_payment", "issue_pending_payment", "supplier_confirmed", "paid_supplier",
                      "in_production"}
PARCEL_STAGE = {"waiting_to_receive": "waiting", "sent_to_consolidation": "ready",
                "shipping_to_destination": "in_shipment", "clearance": "in_shipment",
                "ready_for_collection": "arrived"}
IMAGE_HOSTS = {"res.cloudinary.com"}
OLD_PHOTO_CAPTION = "Photo from the old AGIZA system"
CLOSED = {"completed", "cancelled", "delivered"}


def _aware(value) -> datetime | None:
    """Old dates → aware datetimes (the old app stored UTC; plain dates count as midday)."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if timezone.is_aware(value) else value.replace(tzinfo=UTC)
    if isinstance(value, date):
        return timezone.make_aware(datetime.combine(value, time(12, 0)))
    return None


def _dec(value) -> Decimal:
    try:
        return Decimal(str(value or 0)).quantize(Decimal("0.01"))
    except InvalidOperation:
        return ZERO


def _text(value, limit: int | None = None) -> str:
    text = (value or "").strip() if isinstance(value, str) else ("" if value is None else str(value))
    return text[:limit] if limit else text


@contextlib.contextmanager
def keep_timestamps(*models):
    """Let the import write the old dates: auto_now / auto_now_add fields keep a value already set on the
    record, and only fill in "now" when it's empty."""
    patched = []
    for model in models:
        for field in model._meta.fields:
            if getattr(field, "auto_now", False) or getattr(field, "auto_now_add", False):
                def pre_save(instance, add, _field=field):
                    value = getattr(instance, _field.attname)
                    if value is None:
                        value = timezone.now()
                        setattr(instance, _field.attname, value)
                    return value

                field.pre_save = pre_save
                patched.append(field)
    try:
        yield
    finally:
        for field in patched:
            del field.pre_save


# The old system's table names, renamed with a prefix when they sit in this platform's own database.
OLD_TABLE = re.compile(r"\b(?:auth_user_groups|auth_user|auth_group|ujenzi_\w+|shop_\w+)\b")


class Importer:
    def __init__(self, legacy_url: str, *, media_dir: str = "", download_images: bool = True, log=print,
                 table_prefix: str = ""):
        parts = urlparse(legacy_url)
        self.db = pymysql.connect(host=parts.hostname or "localhost", port=parts.port or 3306,
                                  user=unquote(parts.username or ""), password=unquote(parts.password or ""),
                                  database=parts.path.lstrip("/"), charset="utf8mb4",
                                  cursorclass=pymysql.cursors.DictCursor)
        self.prefix = table_prefix
        self.media_dir = media_dir
        self.download_images = download_images
        self.log = log
        self.map: dict[str, dict[int, int]] = defaultdict(dict)
        for source, legacy_id, object_id in LegacyRecord.objects.values_list("source", "legacy_id", "object_id"):
            self.map[source][legacy_id] = object_id
        self.stats: dict[str, int] = defaultdict(int)
        self.warnings: list[str] = []

    # ------------------------------------------------------------------ helpers
    def rows(self, sql: str, *args) -> list[dict]:
        if self.prefix:
            sql = OLD_TABLE.sub(lambda m: self.prefix + m.group(0), sql)
        with self.db.cursor() as cur:
            cur.execute(sql, args)
            return list(cur.fetchall())

    def has_table(self, name: str) -> bool:
        return bool(self.rows("SHOW TABLES LIKE %s", self.prefix + name))

    def remember(self, source: str, legacy_id: int, obj):
        LegacyRecord.objects.create(source=source, legacy_id=legacy_id, object_id=obj.pk)
        self.map[source][legacy_id] = obj.pk

    def warn(self, text: str):
        self.warnings.append(text)

    # ------------------------------------------------------------------ run
    def run(self) -> dict:
        from apps.chat.models import Conversation, Message
        from apps.finance.models import Invoice, Wallet, WalletTransaction
        from apps.orders.models import Order, OrderFlag, OrderStatusHistory, Payment
        from apps.parties.models import Customer
        from apps.procurement.models import ProcurementOrder, ProcurementStatusHistory
        from apps.storefront.models import CustomerAccount, PushDevice

        with keep_timestamps(Customer, CustomerAccount, Order, OrderStatusHistory, Payment, OrderFlag, Invoice,
                             Conversation, Message, PushDevice, ProcurementOrder, ProcurementStatusHistory, Wallet,
                             WalletTransaction):
            for step in (self.staff, self.countries, self.customers, self.suppliers, self.carriers, self.orders,
                         self.invoices, self.chats, self.devices, self.shop_products):
                with transaction.atomic():
                    step()
        return {"counts": dict(self.stats), "warnings": self.warnings}

    # ------------------------------------------------------------------ staff
    def staff(self):
        from apps.accounts.models import User

        groups = defaultdict(list)
        for row in self.rows("SELECT ug.user_id, g.name FROM auth_user_groups ug JOIN auth_group g ON g.id = ug.group_id"):
            groups[row["user_id"]].append(row["name"].lower())
        for u in self.rows("SELECT * FROM auth_user ORDER BY id"):
            if u["id"] in self.map["auth_user"]:
                continue
            email = _text(u["email"]).lower() or f"{_text(u['username']).lower()}@legacy.agiza.local"
            existing = User.objects.filter(email__iexact=email).first()
            if existing:  # already working in the new admin: keep their account as it is
                self.remember("auth_user", u["id"], existing)
                self.stats["staff matched"] += 1
                continue
            level, dept = ("top_admin", "management") if u["is_superuser"] else ("data_entry", "support")
            if not u["is_superuser"]:
                for needle, lvl, dep in GROUP_LEVEL:
                    if needle in groups[u["id"]]:
                        level, dept = lvl, dep
                        break
            name = f"{_text(u['first_name'])} {_text(u['last_name'])}".strip().title() or _text(u["username"])
            user = User(email=email, full_name=name[:150], staff_level=level, department=dept,
                        is_active=bool(u["is_active"]), is_staff=bool(u["is_superuser"]),
                        is_superuser=bool(u["is_superuser"]), date_joined=_aware(u["date_joined"]) or timezone.now())
            user.password = u["password"]  # same Django hash: they sign in with their old password
            user.save()
            self.remember("auth_user", u["id"], user)
            self.stats["staff created"] += 1

    def user(self, legacy_id):
        return self.map["auth_user"].get(legacy_id) if legacy_id else None

    # ------------------------------------------------------------------ countries
    def countries(self):
        from apps.locations.models import City, Country

        self.country = {c.iso2: c for c in Country.objects.filter(iso2__in=set(COUNTRY_ISO.values()))}
        missing = set(COUNTRY_ISO.values()) - set(self.country)
        if missing:
            self.warn(f"Countries missing in the new system: {', '.join(sorted(missing))} (orders from there use China)")
        self.default_country = self.country.get("CN") or Country.objects.first()
        tz = self.country.get("TZ")
        self.cities = {c.name.lower(): c for c in City.objects.filter(country=tz).select_related("region")} if tz else {}
        self.dar = self.cities.get("dar es salaam")

    def origin(self, text) -> object:
        iso = COUNTRY_ISO.get(_text(text).lower())
        return self.country.get(iso) if iso else None

    # ------------------------------------------------------------------ customers
    def customers(self):
        from apps.parties.models import Address, Customer
        from apps.storefront.models import CustomerAccount
        from apps.storefront.phone import normalize_phone

        by_phone = {}
        for c in Customer.objects.exclude(phone=""):
            digits = normalize_phone(c.phone)
            if digits:
                by_phone.setdefault(digits, c)
        used_emails = {e.lower() for e in Customer.objects.exclude(email="").values_list("email", flat=True)}
        accounts = set(CustomerAccount.objects.values_list("phone", flat=True))
        for row in self.rows("SELECT * FROM ujenzi_client ORDER BY id"):
            if row["id"] in self.map["ujenzi_client"]:
                continue
            phone = normalize_phone(_text(row["phone_number"]))
            name = _text(row["name"], 150) or "Customer"
            customer = by_phone.get(phone) if phone else None
            if customer is None:
                email = _text(row["email"]).lower()
                if email and (email in used_emails or not re.match(r"^[^@\s]+@[^@\s]+\.[a-z]{2,}$", email)):
                    email = ""  # taken by another customer, or not a valid address
                notes = "Imported from the old AGIZA system"
                location = _text(row["location"])
                if location:
                    notes += f". Location: {location}"
                customer = Customer(full_name=name, phone=f"+{phone}" if phone else "", email=email,
                                    status="active" if row["is_active"] else "inactive", notes=notes)
                customer.save()
                Customer.objects.filter(pk=customer.pk).update(created_at=_aware(row["created_at"]))
                if email:
                    used_emails.add(email)
                if phone:
                    by_phone[phone] = customer
                self.stats["customers created"] += 1
                city = self.cities.get(_text(row["region"]).lower())
                if city and location:
                    Address.objects.create(customer=customer, label="Home", line1=location[:255], city=city,
                                           region=city.region, country=city.country, is_default=True)
                    self.stats["addresses"] += 1
            else:
                self.stats["customers matched (same phone)"] += 1
            if phone and phone not in accounts and not hasattr(customer, "account"):
                account = CustomerAccount(customer=customer, phone=phone, password=row["password"],
                                          is_active=bool(row["is_active"]),
                                          phone_verified_at=_aware(row["created_at"]))
                account.created_at = account.updated_at = _aware(row["created_at"])
                account.save()
                accounts.add(phone)
                self.stats["app accounts (old password works)"] += 1
            self.remember("ujenzi_client", row["id"], customer)

    # ------------------------------------------------------------------ suppliers & carriers
    def suppliers(self):
        from apps.procurement.models import Supplier

        for row in self.rows("SELECT * FROM ujenzi_supplier ORDER BY id"):
            if row["id"] in self.map["ujenzi_supplier"]:
                continue
            supplier = Supplier.objects.filter(name__iexact=_text(row["name"])).first() or Supplier.objects.create(
                name=_text(row["name"], 150), country=self.default_country, phone=_text(row["phone_number"], 32),
                notes="Imported from the old AGIZA system")
            self.remember("ujenzi_supplier", row["id"], supplier)
            self.stats["suppliers"] += 1
        self.supplier_names = {}
        if self.has_table("ujenzi_laguagesupplier"):
            for row in self.rows("SELECT ls.laguage_id, s.name FROM ujenzi_laguagesupplier ls "
                                 "JOIN ujenzi_supplier s ON s.id = ls.supplier_id ORDER BY ls.id"):
                self.supplier_names[row["laguage_id"]] = _text(row["name"], 150)

    def carriers(self):
        from apps.shipping_engine.models import Carrier

        for row in self.rows("SELECT * FROM ujenzi_shipper ORDER BY id"):
            if row["id"] in self.map["ujenzi_shipper"]:
                continue
            carrier = Carrier.objects.filter(name__iexact=_text(row["name"])).first()
            if carrier is None:
                carrier = Carrier.objects.create(name=_text(row["name"], 120), type=Carrier._meta.get_field(
                    "type").choices[0][0], contact_phone=_text(row["contact"], 32),
                    notes="Imported from the old AGIZA system", status="active")
                origin = self.origin(row["country_of_origin"])
                if origin:
                    carrier.origins.add(origin)
            self.remember("ujenzi_shipper", row["id"], carrier)
            self.stats["shippers"] += 1

    # ------------------------------------------------------------------ orders
    def orders(self):
        logs = defaultdict(list)
        for row in self.rows("SELECT * FROM ujenzi_orderstatuslog ORDER BY created_at, id"):
            logs[row["order_id"]].append(row)
        pays = defaultdict(list)
        for row in self.rows("SELECT * FROM ujenzi_paymentlogs ORDER BY created_at, id"):
            pays[row["order_id"]].append(row)
        flags = defaultdict(list)
        if self.has_table("ujenzi_laguagealert"):
            for row in self.rows("SELECT * FROM ujenzi_laguagealert ORDER BY id"):
                flags[row["laguage_id"]].append(("alert", row))
        if self.has_table("ujenzi_laguageissue"):
            for row in self.rows("SELECT * FROM ujenzi_laguageissue ORDER BY id"):
                flags[row["laguage_id"]].append(("issue", row))
        groups = {}
        if self.has_table("ujenzi_ordergroup"):
            for row in self.rows("SELECT d.product_id, g.group_id, g.status FROM ujenzi_ordergroupdata d "
                                 "JOIN ujenzi_ordergroup g ON g.id = d.group_id"):
                groups[row["product_id"]] = row
        used_refs = set()
        imported_at = dict(LegacyRecord.objects.filter(source="ujenzi_laguage").values_list("legacy_id", "created_at"))
        for row in self.rows("SELECT * FROM ujenzi_laguage ORDER BY id"):
            if row["id"] in self.map["ujenzi_laguage"]:
                with transaction.atomic():
                    self.refresh(row, self.map["ujenzi_laguage"][row["id"]], imported_at.get(row["id"]),
                                 logs[row["id"]], pays[row["id"]])
                continue
            customer_id = self.map["ujenzi_client"].get(row["client_id"])
            if customer_id is None:
                self.warn(f"Order {row['lag_id'] or row['id']}: its customer (#{row['client_id']}) doesn't exist; skipped")
                continue
            with transaction.atomic():
                self.order(row, customer_id, logs[row["id"]], pays[row["id"]], flags[row["id"]],
                           groups.get(row["id"]), used_refs)

    def _reference(self, row, used: set) -> str:
        from apps.orders.models import Order

        base = _text(row["lag_id"]) or _text(row["old_id"]) or f"OLD-{row['id']}"
        ref, n = base[:20], 1
        while ref in used or Order.objects.filter(reference=ref).exists():
            n += 1
            ref = f"{base[:17]}-{n}"
        used.add(ref)
        return ref

    def order(self, row, customer_id, logs, pays, flags, group, used_refs):
        from apps.orders.models import Department, InternationalDetails, Order, OrderStatusHistory, ShopDetails
        from apps.orders.workflows import INTERNATIONAL_DEPARTMENT, InternationalStatus

        legacy_status = _text(row["status"]).lower()
        shop = _text(row["order_type"]).lower() == "ecommerce"
        if shop:
            status = SHOP_STATUS.get(legacy_status, "pending")
        else:
            status = INTL_STATUS.get(legacy_status)
            if status is None:
                self.warn(f"Order {row['lag_id']}: unknown old status “{row['status']}” → Pending Payment")
                status = "pending_payment"
        total, paid = _dec(row["total"]), _dec(row["paid"])
        if total <= 0 and paid > 0:
            total = paid  # paid but never priced: what was paid is the price
        created = _aware(row["created_at"]) or timezone.now()
        notes = []
        if _text(row["descriptions"]):
            notes.append(_text(row["descriptions"]))
        try:
            requested = json.loads(row["product_requested"]) if row["product_requested"] else None
        except (TypeError, ValueError):
            requested = None
        if requested:
            notes.append(f"Requested: {json.dumps(requested, ensure_ascii=False)[:500]}")
        if _text(row["sku"]):
            notes.append(f"SKU: {_text(row['sku'])}")
        if _text(row["source"]):
            notes.append(f"Source / link: {_text(row['source'])}")
        if group:
            notes.append(f"Shipment group in the old system: {_text(group['group_id'])} ({_text(group['status'])})")
        notes.append(f"Imported from the old AGIZA system (old status: {row['status']}; "
                     f"invoice: {row['invoice_status'] or '—'})")
        order = Order(
            order_type="shop" if shop else "international", customer_id=customer_id, status=status,
            item_details=self._item_name(row),
            department=Department.DELIVERY if shop else INTERNATIONAL_DEPARTMENT[InternationalStatus(status)],
            handler_id=self.user(row["operator_id"]), currency="TZS",
            total_amount=total if total > 0 else None,
            installment_plan=legacy_status == "installment", installment_allowed=legacy_status == "installment",
            notes="\n".join(notes), purchase_cost=_dec(row["purchase_price"]) or None,
            shipping_cost=_dec(row["shiping_price"]) or None, created_by_id=self.user(row["created_by_id"]),
            reference=self._reference(row, used_refs), created_at=created, updated_at=created,
        )
        if status == "cancelled":
            last = logs[-1] if logs else None
            order.cancelled_at = _aware(last["created_at"]) if last else created
            order.cancelled_by_id = self.user(last["created_by_id"]) if last else None
            order.cancellation_reason = (_text(last["descriptions"]) if last else "") or \
                f"Cancelled in the old AGIZA system ({row['status']})"
        order.save()
        if shop:
            ShopDetails.objects.create(order=order, shipping_address="To be confirmed with the customer",
                                       city=self.dar, channel="app")
        else:
            details = InternationalDetails(
                order=order, source_country=self.origin(row["country"]) or self.default_country,
                service_type="deliver_for_me" if _text(row["order_type"]).lower() == "deliver for me" else "full_service",
                supplier_name=self.supplier_names.get(row["id"], ""), tracking_number=_text(row["tracking_number"], 80),
                item_cost=_dec(row["purchase_price"]) or None, shipping_cost=_dec(row["client_shiping_price"]) or None,
                estimated_delivery=row["expected_delivery_data"])
            if row["supplier_id"] and not details.supplier_name:
                from apps.procurement.models import Supplier

                sid = self.map["ujenzi_supplier"].get(row["supplier_id"])
                details.supplier_name = Supplier.objects.filter(pk=sid).values_list("name", flat=True).first() or ""
            details.save()
        self.remember("ujenzi_laguage", row["id"], order)
        self.stats["orders (e-commerce)" if shop else "orders (international)"] += 1

        # Status history with the old dates and staff.
        first = self._map_status(logs[0]["status"], shop, None) if logs else None
        history = [OrderStatusHistory(order=order, from_status="", to_status=first or status,
                                      changed_by_id=self.user(row["created_by_id"]),
                                      note="Order created in the old AGIZA system", created_at=created)]
        previous = history[0].to_status
        for log in logs:
            to = self._map_status(log["status"], shop, previous)
            note = _text(log["status"]) + (f": {_text(log['descriptions'])}" if _text(log["descriptions"]) else "")
            history.append(OrderStatusHistory(order=order, from_status=previous, to_status=to,
                                              changed_by_id=self.user(log["created_by_id"]), note=note[:1000],
                                              created_at=_aware(log["created_at"]) or created))
            previous = to
        if previous != status:
            history.append(OrderStatusHistory(order=order, from_status=previous, to_status=status,
                                              note=f"Status in the old system: {row['status']}", created_at=created))
        OrderStatusHistory.objects.bulk_create(history)
        self.stats["status history rows"] += len(history)

        self._payments(order, row, pays, total, paid, created)
        self._flags(order, row, flags, legacy_status)
        if self.download_images:
            self._photos(order, row)
        if status not in CLOSED:
            self._next_steps(order, row, status, created)

    def refresh(self, row, order_id, imported_at, logs, pays):
        """
        An order imported earlier that the old system kept working on: add its newer status steps and
        payments, and move it to its current status (procurement / cargo / delivery follow). Orders staff
        have already handled in this platform since the import are left as they are and listed to check.
        """
        from apps.orders.models import Order, OrderStatusHistory, Payment
        from apps.orders.services import _after_status_change
        from apps.orders.workflows import INTERNATIONAL_DEPARTMENT, InternationalStatus

        order = Order.objects.select_for_update().filter(pk=order_id).first()
        if order is None:  # deleted here since the import
            return
        # Orders first imported without their photos (--skip-photos) get them now.
        if self.download_images and not order.attachments.filter(caption=OLD_PHOTO_CAPTION).exists():
            self._photos(order, row)
        shop = order.order_type == "shop"
        legacy_status = _text(row["status"]).lower()
        status = SHOP_STATUS.get(legacy_status, order.status) if shop else INTL_STATUS.get(legacy_status, order.status)
        history = OrderStatusHistory.objects.filter(order=order)
        last_old = history.filter(created_at__lte=imported_at).order_by("-created_at").values_list(
            "created_at", flat=True).first() if imported_at else None
        new_logs = [log for log in logs if last_old is None or (_aware(log["created_at"]) or last_old) > last_old]
        paid = _dec(row["paid"])
        total = _dec(row["total"]) or order.total_amount or ZERO
        target_paid = min(paid, total) if total > 0 else paid
        have_paid = Payment.objects.filter(order=order, reference=f"OLD-{row['id']}").aggregate(
            s=Sum("amount"))["s"] or ZERO
        if not new_logs and status == order.status and (target_paid <= have_paid or paid < 0):
            return
        if imported_at and history.filter(created_at__gt=imported_at).exists():
            self.warn(f"Order {order.reference}: changed in the old system ({row['status']}) and in this platform "
                      f"({order.status}) since the import — kept as it is here; check it")
            self.stats["orders changed in both systems (kept, check)"] += 1
            return

        before = previous = order.status
        rows = []
        for log in new_logs:
            to = self._map_status(log["status"], shop, previous)
            note = _text(log["status"]) + (f": {_text(log['descriptions'])}" if _text(log["descriptions"]) else "")
            rows.append(OrderStatusHistory(order=order, from_status=previous, to_status=to,
                                           changed_by_id=self.user(log["created_by_id"]), note=note[:1000],
                                           created_at=_aware(log["created_at"]) or timezone.now()))
            previous = to
        if previous != status:
            rows.append(OrderStatusHistory(order=order, from_status=previous, to_status=status,
                                           note=f"Status in the old system: {row['status']}"))
        OrderStatusHistory.objects.bulk_create(rows)  # bulk: no customer notifications
        self.stats["status history rows (updates)"] += len(rows)

        if target_paid > have_paid and paid >= 0:
            when = max((_aware(p["created_at"]) for p in pays if _aware(p["created_at"])), default=timezone.now())
            Payment.objects.bulk_create([Payment(
                order=order, amount=target_paid - have_paid, currency="TZS", method=Payment.Method.OTHER,
                kind=Payment.Kind.BALANCE if total and target_paid >= total else Payment.Kind.ADVANCE,
                reference=f"OLD-{row['id']}", paid_at=when, notes="Paid in the old AGIZA system after the first import",
                created_at=when, updated_at=when)])
            self.stats["payments (updates)"] += 1

        fields = {"total_amount": total if total > 0 else order.total_amount}
        if status != order.status:
            fields["status"] = status
            if not shop:
                fields["department"] = INTERNATIONAL_DEPARTMENT[InternationalStatus(status)]
            if status == "cancelled":
                last = logs[-1] if logs else None
                fields.update(cancelled_at=(_aware(last["created_at"]) if last else None) or timezone.now(),
                              cancelled_by_id=self.user(last["created_by_id"]) if last else None,
                              cancellation_reason=(_text(last["descriptions"]) if last else "")
                              or f"Cancelled in the old AGIZA system ({row['status']})")
        Order.objects.filter(pk=order.pk).update(**fields)
        if not shop:
            order.international.__class__.objects.filter(order=order).update(
                tracking_number=_text(row["tracking_number"], 80) or order.international.tracking_number,
                estimated_delivery=row["expected_delivery_data"] or order.international.estimated_delivery)
        if status != before:
            order.refresh_from_db()
            _after_status_change(order, before, status, None)
            self._sync_steps(order, row, status)
        # From now on, only changes made here after this sync count as "handled in this platform".
        LegacyRecord.objects.filter(source="ujenzi_laguage", legacy_id=row["id"]).update(created_at=timezone.now())
        self.stats["orders updated from the old system"] += 1

    def _sync_steps(self, order, row, status):
        """After a status jump from the old system: close procurement, move or create the cargo parcel and delivery."""
        from apps.procurement.models import ProcurementOrder, ProcurementStatusHistory
        from apps.shipping.models import CargoParcel

        if order.order_type == "shop":
            return
        proc = ProcurementOrder.objects.filter(order=order).first()
        if proc and status not in PROCUREMENT_STAGES and proc.status not in ("received_at_cargo", "cancelled"):
            to = "cancelled" if status == "cancelled" else "received_at_cargo"
            ProcurementStatusHistory.objects.create(procurement=proc, from_status=proc.status, to_status=to,
                                                    note=f"Old AGIZA system: {row['status']}")
            proc.status = to
            proc.save(update_fields=["status", "updated_at"])
        if status in PARCEL_STAGE:
            parcel = CargoParcel.objects.filter(order=order).first()
            if parcel is None:
                self._next_steps(order, row, status, timezone.now())
            else:
                if parcel.stage != PARCEL_STAGE[status]:
                    parcel.stage = PARCEL_STAGE[status]
                    parcel.save(update_fields=["stage", "updated_at"])
                if status == "ready_for_collection" and not order.deliveries.exists():
                    from apps.deliveries.models import Delivery

                    address = order.customer.addresses.first()
                    Delivery.objects.create(
                        order=order, delivery_address=address.line1 if address else "To be confirmed with the customer",
                        destination_city=address.city if address else self.dar, recipient_name=order.customer.full_name,
                        recipient_phone=order.customer.phone, notes="Imported from the old AGIZA system")
        elif status in PROCUREMENT_STAGES and proc is None:
            self._next_steps(order, row, status, timezone.now())

    @staticmethod
    def _item_name(row) -> str:
        """Early orders of the old system saved their own number as the product name."""
        name = _text(row["product"])
        if name and not re.fullmatch(r"\d+", name):
            return name[:255]
        description = _text(row["descriptions"])
        if description:
            return description[:255]
        return "Item name not recorded in the old system"

    def _map_status(self, legacy, shop: bool, previous):
        """A step of the old log in the new workflow; an unknown step keeps the previous status (as a note)."""
        key = _text(legacy).lower()
        if shop:
            return SHOP_STATUS.get(key, previous or "pending")
        return INTL_STATUS.get(key) or LOG_STATUS.get(key) or previous or "pending_payment"

    def _payments(self, order, row, pays, total, paid, created):
        from apps.orders.models import Payment

        if paid < 0:
            from apps.orders.models import OrderFlag

            OrderFlag.objects.create(order=order, kind="other", department="support",
                                     note=f"Old system showed a negative amount paid (TSh {paid:,.0f}) — check the payments",
                                     created_at=created, updated_at=created)
            self.stats["orders with an inconsistent old 'paid' (flagged for Finance)"] += 1
            return
        if paid == 0:
            return
        if total > 0 and paid > total:
            # The old system's "paid" is wrong on these orders (often many times the total, with payment logs that
            # don't agree either): count the order as paid up to its total and let Finance check the old figure.
            from apps.orders.models import OrderFlag

            OrderFlag.objects.create(order=order, kind="other", department="support",
                                     note=f"Old system showed TSh {paid:,.0f} paid on a TSh {total:,.0f} order — "
                                          "imported as paid up to the total; check the payments",
                                     created_at=created, updated_at=created)
            order.notes += f"\nOld system recorded TSh {paid:,.0f} paid (more than the total of TSh {total:,.0f})."
            order.save(update_fields=["notes"])
            self.stats["orders with an inconsistent old 'paid' (flagged for Finance)"] += 1
            pays, paid = [], total
        entries = []
        for log in pays:
            amount = _dec(log["delta"]) if _text(log["adjustment_type"]) in ("add", "reduce") else _dec(log["paid"])
            if _text(log["adjustment_type"]) == "reduce":
                amount = -abs(amount)
            if amount:
                entries.append((amount, _aware(log["created_at"]) or created, self.user(log["created_by_id"]),
                                _text(log["note"])))
        if sum((a for a, *_ in entries), ZERO) != paid or any(a < 0 for a, *_ in entries):
            # The old log doesn't add up to what the order shows as paid: keep the order's figure.
            last = max((when for _, when, *_ in entries), default=created)
            entries = [(paid, last, None, "Total paid as recorded in the old system")]
        capped = min(paid, total) if total > 0 else paid
        left = capped
        rows, running = [], ZERO
        for amount, when, user_id, note in entries:
            amount = min(amount, left)
            if amount <= 0:
                break
            left -= amount
            running += amount
            kind = Payment.Kind.BALANCE if total and running >= total else Payment.Kind.ADVANCE
            rows.append(Payment(order=order, amount=amount, currency="TZS", method=Payment.Method.OTHER, kind=kind,
                                reference=f"OLD-{row['id']}", paid_at=when, recorded_by_id=user_id,
                                notes=("Imported from the old AGIZA system" + (f". {note}" if note else ""))[:1000],
                                created_at=when, updated_at=when))
        Payment.objects.bulk_create(rows)
        self.stats["payments"] += len(rows)

    def _flags(self, order, row, flags, legacy_status):
        from apps.orders.models import OrderFlag

        rows = []
        kinds = {"shipping_due": "delivery_due_soon", "procurement_delay": "procurement_stalled"}
        for source, f in flags:
            kind = "other" if source == "issue" else kinds.get(_text(f["alert_type"]), "other")
            when = _aware(f["created_at"]) or timezone.now()
            rows.append(OrderFlag(
                order=order, kind=kind, note=_text(f["description"], 255) or _text(f.get("alert_type")),
                department=_text(f["department"], 16) if _text(f["department"]) in
                ("procurement", "shipping", "delivery", "support") else "",
                automatic=bool(f.get("is_auto")), raised_by_id=self.user(f["created_by_id"]),
                resolved_at=_aware(f["updated_at"]) if f["is_resolved"] else None,
                resolved_by_id=self.user(f["updated_by_id"]) if f["is_resolved"] else None,
                resolution_note="Resolved in the old AGIZA system" if f["is_resolved"] else "",
                created_at=when, updated_at=when))
        if legacy_status in STATUS_FLAG:
            kind, note = STATUS_FLAG[legacy_status]
            rows.append(OrderFlag(order=order, kind=kind, note=note, department="support",
                                  created_at=order.created_at, updated_at=order.created_at))
        # One open flag per kind (the new rule): keep the newest open one of each kind.
        open_seen = set()
        for f in sorted(rows, key=lambda r: r.created_at, reverse=True):
            if f.resolved_at is None:
                if f.kind in open_seen:
                    f.resolved_at, f.resolution_note = f.created_at, "Superseded (old system)"
                open_seen.add(f.kind)
        OrderFlag.objects.bulk_create(rows)
        self.stats["flags"] += len(rows)

    def _photos(self, order, row):
        from apps.orders.models import OrderAttachment

        try:
            urls = json.loads(row["images"] or "[]")
        except (TypeError, ValueError):
            return
        for url in urls if isinstance(urls, list) else []:
            if not isinstance(url, str) or urlparse(url).hostname not in IMAGE_HOSTS:
                continue
            content, ctype = None, None
            # As uploaded first; then Cloudinary's JPEG of it (HEIC, AVIF and odd formats convert on the fly).
            for attempt in (url, url.replace("/image/upload/", "/image/upload/f_jpg/", 1)):
                try:
                    with urllib.request.urlopen(attempt, timeout=20) as resp:  # noqa: S310 (host checked above)
                        data = resp.read(8 * 1024 * 1024 + 1)
                except Exception as exc:  # noqa: BLE001
                    self.warn(f"Order {order.reference}: photo not downloaded ({exc.__class__.__name__}): {url}")
                    break
                name = os.path.splitext(os.path.basename(urlparse(attempt).path))[0] or "photo"
                content = ContentFile(data, name=f"{name}.jpg")
                ctype = sniff(content) if len(data) <= 8 * 1024 * 1024 else None
                if ctype:
                    break
            if ctype is None:
                self.warn(f"Order {order.reference}: skipped a photo that isn't a JPEG/PNG/WebP/PDF: {url}")
                continue
            OrderAttachment.objects.create(order=order, file=content, content_type=ctype,
                                           caption=OLD_PHOTO_CAPTION)
            self.stats["order photos"] += 1

    def _next_steps(self, order, row, status, created):
        """Open orders get the record their next team works from."""
        from apps.deliveries.models import Delivery
        from apps.procurement.models import ProcurementOrder, ProcurementStatusHistory, Supplier
        from apps.shipping.models import CargoParcel

        if order.order_type == "shop":
            return
        details = order.international
        if status in PROCUREMENT_STAGES and details.service_type == "full_service":
            supplier = Supplier.objects.filter(pk=self.map["ujenzi_supplier"].get(row["supplier_id"])).first() \
                if row["supplier_id"] else None
            proc_status = {"supplier_confirmed": "supplier_selected" if supplier else "pending_sourcing",
                           "paid_supplier": "paid", "in_production": "paid"}.get(status, "pending_sourcing")
            proc = ProcurementOrder.objects.create(
                order=order, status=proc_status, supplier=supplier, operator_id=order.handler_id,
                item_cost=_dec(row["purchase_price"]) or None, supplier_tracking_number=_text(row["tracking_number"], 80),
                paid_at=created if proc_status == "paid" else None, created_at=created, updated_at=created,
                notes="Imported from the old AGIZA system")
            ProcurementStatusHistory.objects.create(procurement=proc, to_status=proc_status, created_at=created,
                                                    note="Imported from the old AGIZA system")
            self.stats["procurement records (open orders)"] += 1
        elif status in PARCEL_STAGE:
            weight = None
            try:
                weight = Decimal(re.sub(r"[^\d.]", "", _text(row["weight"]))) if _text(row["weight"]) else None
            except InvalidOperation:
                weight = None
            CargoParcel.objects.create(
                order=order, stage=PARCEL_STAGE[status],
                source="client_purchased" if details.service_type == "deliver_for_me" else "agiza_procured",
                shipper_id=self.map["ujenzi_shipper"].get(row["shipper_id"]), item_name=order.item_details[:200],
                supplier_tracking_number=_text(row["tracking_number"], 80), weight_kg=weight or None,
                estimated_arrival=row["receiceiving_date"], destination_city=self.dar,
                received_at=_aware(row["receiceiving_date"]) if PARCEL_STAGE[status] != "waiting" else None,
                description="Imported from the old AGIZA system")
            self.stats["cargo parcels (open orders)"] += 1
            if status == "ready_for_collection" and not order.deliveries.exists():
                address = order.customer.addresses.first()
                Delivery.objects.create(order=order, delivery_address=address.line1 if address else
                                        "To be confirmed with the customer", destination_city=address.city if address
                                        else self.dar, recipient_name=order.customer.full_name,
                                        recipient_phone=order.customer.phone, notes="Imported from the old AGIZA system")
                self.stats["deliveries (ready for collection)"] += 1

    # ------------------------------------------------------------------ invoices
    def invoices(self):
        from apps.finance.models import Invoice, InvoiceItem

        items = defaultdict(list)
        for row in self.rows("SELECT ii.*, l.product, l.lag_id FROM ujenzi_invoiceitem ii "
                             "LEFT JOIN ujenzi_laguage l ON l.id = ii.laguage_id ORDER BY ii.id"):
            items[row["invoice_id"]].append(row)
        for inv in self.rows("SELECT * FROM ujenzi_invoice ORDER BY id"):
            if inv["id"] in self.map["ujenzi_invoice"]:
                continue
            customer_id = self.map["ujenzi_client"].get(inv["client_id"])
            if customer_id is None:
                continue
            lines = items[inv["id"]]
            orders = {self.map["ujenzi_laguage"].get(li["laguage_id"]) for li in lines} - {None}
            quotation = _text(inv["type"]) == "quotation"
            legacy_status = _text(inv["status"])
            paid = _dec(inv["paid"])
            status = "void" if legacy_status == "rejected" else (
                "paid" if not quotation and legacy_status == "approved" and paid >= _dec(inv["total"]) else "sent")
            created = _aware(inv["created_at"]) or timezone.now()
            notes = f"{'Quotation' if quotation else 'Invoice'} from the old AGIZA system ({legacy_status})"
            if _text(inv["rejection_reason"]):
                notes += f". Rejected: {_text(inv['rejection_reason'])}"
            invoice = Invoice(source="order" if len(orders) == 1 else "manual", customer_id=customer_id,
                              order_id=next(iter(orders)) if len(orders) == 1 else None, status=status,
                              issue_date=created.date(), tax_rate=_dec(inv["vat_rate"]), notes=notes,
                              created_by_id=self.user(inv["created_by_id"]), created_at=created, updated_at=created,
                              paid_at=created if status == "paid" else None, sent_at=created)
            invoice.save()
            InvoiceItem.objects.bulk_create([
                InvoiceItem(invoice=invoice, description=(f"{_text(li['lag_id'])} · " if li["lag_id"] else "") +
                            _text(li["product"] or "Item")[:220], quantity=Decimal("1"), unit_price=_dec(li["price"]),
                            amount=_dec(li["price"])) for li in lines] or [
                InvoiceItem(invoice=invoice, description="Amount (old system)", quantity=Decimal("1"),
                            unit_price=_dec(inv["total"]), amount=_dec(inv["total"]))])
            self.remember("ujenzi_invoice", inv["id"], invoice)
            self.stats["quotations (as invoices)" if quotation else "invoices"] += 1

    # ------------------------------------------------------------------ chat
    def chats(self):
        from apps.chat.models import Conversation, Message
        from apps.parties.models import Customer

        messages = defaultdict(list)
        for row in self.rows("SELECT * FROM ujenzi_orderchatmessage ORDER BY created_at, id"):
            messages[row["room_id"]].append(row)
        for room in self.rows("SELECT * FROM ujenzi_orderchatroom ORDER BY id"):
            if room["id"] in self.map["ujenzi_orderchatroom"]:
                continue
            customer = Customer.objects.filter(pk=self.map["ujenzi_client"].get(room["client_id"])).select_related(
                "account").first()
            if customer is None:
                continue
            order_id = self.map["ujenzi_laguage"].get(room["order_id"])
            account = getattr(customer, "account", None)
            # The app finds a customer's rooms by their account phone ("+255…").
            handle = f"+{account.phone}" if account else (customer.phone or customer.reference)
            rows = messages[room["id"]]
            last = rows[-1] if rows else None
            created = _aware(room["created_at"]) or timezone.now()
            conv = Conversation(channel="web", contact_name=customer.full_name, contact_handle=handle,
                                customer=customer, order_id=order_id, assigned_agent_id=self.user(room["assigned_admin_id"]),
                                last_message_at=_aware(room["last_message_at"]) or created,
                                last_message_preview=_text(room["last_message"], 200),
                                team_read_at=_aware(room["last_message_at"]) or created,
                                response_status="waiting_client", created_at=created, updated_at=created)
            if last and last["sender_type"] == "client":
                conv.last_customer_message_at = _aware(last["created_at"])
                if not last["is_read_by_admin"]:
                    conv.team_read_at, conv.response_status = None, "waiting_team"
            conv.save()
            Message.objects.bulk_create([
                Message(conversation=conv, sender="customer" if m["sender_type"] == "client" else "agent",
                        body=_text(m["message"]), author_id=self.user(m["sender_user_id"]),
                        delivery_status="received" if m["sender_type"] == "client" else "stored",
                        created_at=_aware(m["created_at"]) or created) for m in rows])
            self.remember("ujenzi_orderchatroom", room["id"], conv)
            self.stats["chat conversations"] += 1
            self.stats["chat messages"] += len(rows)

    # ------------------------------------------------------------------ push devices
    def devices(self):
        from apps.parties.models import Customer
        from apps.storefront.models import PushDevice

        known = set(PushDevice.objects.values_list("token", flat=True))
        accounts = {c.pk: c.account for c in Customer.objects.filter(account__isnull=False).select_related("account")}
        rows = []
        for d in self.rows("SELECT * FROM ujenzi_pushdevicetoken WHERE client_id IS NOT NULL ORDER BY id"):
            token = _text(d["expo_push_token"])
            account = accounts.get(self.map["ujenzi_client"].get(d["client_id"]))
            if not token or token in known or account is None:
                continue
            known.add(token)
            platform = d["platform"] if d["platform"] in ("ios", "android") else "unknown"
            rows.append(PushDevice(account=account, token=token, platform=platform, app="customer",
                                   is_active=bool(d["is_active"]), last_seen_at=_aware(d["last_seen_at"]) or timezone.now(),
                                   created_at=_aware(d["created_at"]) or timezone.now(), updated_at=timezone.now()))
        PushDevice.objects.bulk_create(rows)
        self.stats["push devices"] += len(rows)

    # ------------------------------------------------------------------ shop products
    def shop_products(self):
        from apps.catalog.models import Category, Product, ProductImage, ProductVariant

        if not self.has_table("shop_product"):
            return
        categories = {r["id"]: _text(r["name"]) for r in self.rows("SELECT * FROM shop_category")}
        images = defaultdict(list)
        for r in self.rows("SELECT * FROM shop_productimage ORDER BY product_id, sort_order, id"):
            images[r["product_id"]].append(r)
        for p in self.rows("SELECT * FROM shop_product ORDER BY id"):
            if p["id"] in self.map["shop_product"]:
                continue
            title = _text(p["title"], 200)
            if Product.objects.filter(name__iexact=title).exists():
                self.stats["shop products already in the new catalogue (skipped)"] += 1
                continue
            name = categories.get(p["category_id"]) or "Imported products"
            category = Category.objects.filter(parent__isnull=True, name__iexact=name).first() or \
                Category.objects.create(name=name[:120], slug=re.sub(r"[^a-z0-9]+", "-", f"old-{name}".lower())[:140],
                                        is_active=False)
            sku = _text(p["sku"], 64) or f"OLD-SHOP-{p['id']}"
            if Product.objects.filter(sku=sku).exists() or ProductVariant.objects.filter(sku=sku).exists():
                sku = f"OLD-SHOP-{p['id']}"
            product = Product.objects.create(
                name=title, sku=sku, category=category, status="draft", price=_dec(p["price"]),
                compare_at_price=_dec(p["compare_at_price"]) or None, description=_text(p["description"]),
                featured=bool(p["featured"]), keywords="imported from old shop")
            ProductVariant.objects.create(product=product, name="Default", sku=product.sku, is_default=True)
            for i, img in enumerate(images[p["id"]]):
                path = os.path.join(self.media_dir, img["image"]) if self.media_dir else ""
                if not path or not os.path.isfile(path):
                    self.warn(f"Shop product “{title}”: photo not found ({img['image']}); pass --legacy-media")
                    continue
                with open(path, "rb") as fh:
                    content = ContentFile(fh.read(), name=os.path.basename(path))
                ctype = sniff(content)
                if ctype not in ("image/jpeg", "image/png", "image/webp"):
                    continue
                ProductImage.objects.create(product=product, file=content, content_type=ctype, is_primary=i == 0,
                                            sort_order=i)
                self.stats["shop product photos"] += 1
            self.remember("shop_product", p["id"], product)
            self.stats["shop products (as Draft)"] += 1
