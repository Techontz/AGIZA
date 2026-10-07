"""Intake: staff record a quotation for a walk-in / phone customer — several items, photos, one total —
the customer accepts in the app, and approval creates one order per item."""
from decimal import Decimal as D

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.accounts.constants import StaffLevel
from apps.locations.models import Country
from apps.orders.models import Order, OrderAttachment
from apps.quotes.models import QuoteAttachment, QuoteItem, QuoteRequest
from apps.quotes.serializers import app_item_lines
from apps.storefront.models import CustomerAccount
from apps.storefront.tests.conftest import APP, PASSWORD, client_for_account

pytestmark = pytest.mark.django_db

QUOTES = "/api/quotes"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


def photo(name="item.png"):
    return SimpleUploadedFile(name, PNG, content_type="image/png")


@pytest.fixture(autouse=True)
def _media(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path


@pytest.fixture
def staff(client_for):
    return client_for(StaffLevel.ADMIN_L2)


@pytest.fixture
def countries(db):
    return {c: Country.objects.get(iso2=c) for c in ("CN", "AE")}


@pytest.fixture
def walk_in(staff):
    """A customer registered in the quotation dialog by name + phone."""
    res = staff.post("/api/customers/", {"full_name": "Rehema Said", "phone": "+255713444555"}, format="json")
    assert res.status_code == 201, res.json()
    return res.json()


def app_for(customer_id):
    account = CustomerAccount(customer_id=customer_id, phone="255713444555")
    account.set_password(PASSWORD)
    account.save()
    return client_for_account(account)


def multi_item_quote(staff, customer_id, countries):
    payload = {
        "customer_id": customer_id, "service_type": "international", "origin": "China", "destination": "Dar es Salaam",
        "items": [
            {"name": "Phone case", "quantity": 3, "link": "https://example.com/case", "category": "Accessories",
             "notes": "Black", "service": "full_service", "origin_country": countries["CN"].id},
            {"name": "Sneakers", "quantity": 1, "service": "deliver_for_me", "tracking_number": "YT123CN",
             "origin_country": countries["AE"].id},
        ],
    }
    res = staff.post(f"{QUOTES}/", payload, format="json")
    assert res.status_code == 201, res.json()
    return res.json()


def test_staff_create_multi_item_quote_with_photos_and_the_customer_accepts_in_the_app(staff, walk_in, countries):
    q = multi_item_quote(staff, walk_in["id"], countries)
    assert q["customer"]["phone"] == "+255713444555"
    assert q["description"] == "Several items (2)\n1. Phone case ×3\n2. Sneakers"
    case, shoes = q["items"]
    assert case["category"] == "Accessories" and case["origin_country_name"] == "China"
    assert shoes["tracking_number"] == "YT123CN" and shoes["amount"] is None and q["created_orders"] == []

    # Item photos (customer-side, uploaded by staff), plus one for the quotation as a whole.
    for item, n in ((case, 2), (shoes, 1)):
        for _ in range(n):
            res = staff.post(f"{QUOTES}/{q['id']}/photos/", {"file": photo(), "item": item["id"]}, format="multipart")
            assert res.status_code == 200, res.json()
    res = staff.post(f"{QUOTES}/{q['id']}/photos/", {"file": photo(), "customer_photo": "true"}, format="multipart")
    body = res.json()
    assert [p["from_agiza"] for p in body["photos"]] == [False] * 4
    assert [len(i["photos"]) for i in body["items"]] == [2, 1]
    assert staff.post(f"{QUOTES}/{q['id']}/photos/", {"file": photo(), "item": 999999},
                      format="multipart").status_code == 404

    # Price every item; the quotation's amount is the sum.
    missing = staff.post(f"{QUOTES}/{q['id']}/respond/", {"items": [{"id": case["id"], "unit_price": "5000"}]},
                         format="json")
    assert missing.status_code == 400
    assert staff.post(f"{QUOTES}/{q['id']}/respond/", {"quoted_amount": "1000"}, format="json").status_code == 400
    res = staff.post(f"{QUOTES}/{q['id']}/respond/", {
        "items": [{"id": case["id"], "unit_price": "5000", "price_notes": "incl. shipping"},
                  {"id": shoes["id"], "amount": "30000"}],
        "estimated_delivery": "2026-11-20", "response_notes": "Two orders",
    }, format="json")
    assert res.status_code == 200, res.json()
    body = res.json()
    assert body["status"] == "waiting_reply" and body["quoted_amount"] == "45000.00"
    assert [i["amount"] for i in body["items"]] == ["15000.00", "30000.00"]

    # The customer sees and accepts it in the app (the existing endpoints).
    app = app_for(walk_in["id"])
    detail = app.get(f"{APP}/requests/{q['id']}/").json()
    assert detail["quoted_amount"] == "45000.00" and detail["can_reply"] is True and len(detail["photos"]) == 4
    assert app.post(f"{APP}/requests/{q['id']}/accept/").json()["status"] == "answered"
    lines = app_item_lines(QuoteRequest.objects.get(pk=q["id"]))
    assert [(ln["name"], ln["amount"], len(ln["photo_ids"])) for ln in lines] == [
        ("Phone case", "15000.00", 2), ("Sneakers", "30000.00", 1)]

    # Approval: one order per item, each with its own amount and photos (+ the quotation-wide photo).
    res = staff.post(f"{QUOTES}/{q['id']}/approve/", {"order_class": "simple"}, format="json")
    assert res.status_code == 201, res.json()
    body = res.json()
    assert body["status"] == "approved" and len(body["created_orders"]) == 2
    assert body["created_order"] == body["created_orders"][0]
    first, second = (Order.objects.get(pk=o["id"]) for o in body["created_orders"])
    assert first.total_amount == D("15000") and second.total_amount == D("30000")
    assert first.item_details == "Phone case ×3" and second.item_details == "Sneakers"
    assert first.source_quote_id == q["id"] and second.source_quote_id is None
    assert first.international.source_country == countries["CN"] and first.international.service_type == "full_service"
    assert second.international.source_country == countries["AE"]
    assert second.international.service_type == "deliver_for_me" and second.international.tracking_number == "YT123CN"
    assert first.international.estimated_delivery.isoformat() == "2026-11-20"
    assert "https://example.com/case" in first.notes and "Category: Accessories" in first.notes
    assert OrderAttachment.objects.filter(order=first, caption="Customer photo").count() == 3
    assert OrderAttachment.objects.filter(order=second, caption="Customer photo").count() == 2
    assert [i["created_order"]["id"] for i in body["items"]] == [first.id, second.id]
    assert app.get(f"{APP}/requests/{q['id']}/").json()["order"] == first.reference
    assert QuoteItem.objects.get(pk=shoes["id"]).created_order_id == second.id


def test_multi_item_approval_rolls_back_when_an_item_has_no_origin(staff, walk_in, countries):
    res = staff.post(f"{QUOTES}/", {"customer_id": walk_in["id"], "service_type": "international",
                                    "items": [{"name": "Laptop", "origin_country": countries["CN"].id},
                                              {"name": "Bag"}]}, format="json")
    q = res.json()
    staff.post(f"{QUOTES}/{q['id']}/respond/", {"items": [{"id": i["id"], "amount": "1000"} for i in q["items"]]},
               format="json")
    staff.post(f"{QUOTES}/{q['id']}/reply/", {"accepted": True}, format="json")
    before = Order.objects.count()
    assert staff.post(f"{QUOTES}/{q['id']}/approve/", {}, format="json").status_code == 400
    assert Order.objects.count() == before
    res = staff.post(f"{QUOTES}/{q['id']}/approve/", {"source_country": countries["AE"].id}, format="json")
    assert res.status_code == 201
    origins = [Order.objects.get(pk=o["id"]).international.source_country.iso2 for o in res.json()["created_orders"]]
    assert origins == ["CN", "AE"]


def test_multi_item_equipment_and_validation(staff, walk_in):
    bad = staff.post(f"{QUOTES}/", {"customer_id": walk_in["id"], "service_type": "express",
                                    "items": [{"name": "Box", "service": "deliver_for_me"}]}, format="json")
    assert bad.status_code == 400
    assert staff.post(f"{QUOTES}/", {"customer_id": walk_in["id"], "service_type": "express"},
                      format="json").status_code == 400  # no description, no items
    q = staff.post(f"{QUOTES}/", {"customer_id": walk_in["id"], "service_type": "equipment",
                                  "items": [{"name": "Solar heater"}, {"name": "Water pump", "quantity": 2}]},
                   format="json").json()
    assert staff.patch(f"{QUOTES}/{q['id']}/", {"items": []}, format="json").status_code == 400
    staff.post(f"{QUOTES}/{q['id']}/respond/", {"items": [{"id": q["items"][0]["id"], "amount": "200000"},
                                                          {"id": q["items"][1]["id"], "unit_price": "50000"}]},
               format="json")
    staff.post(f"{QUOTES}/{q['id']}/reply/", {"accepted": True}, format="json")
    res = staff.post(f"{QUOTES}/{q['id']}/approve/", {"service_type": "installation"}, format="json")
    assert res.status_code == 201, res.json()
    orders = [Order.objects.get(pk=o["id"]) for o in res.json()["created_orders"]]
    assert [o.equipment.equipment for o in orders] == ["Solar heater", "Water pump"]
    assert [o.total_amount for o in orders] == [D("200000"), D("100000")]


def test_single_quote_with_intake_photos_keeps_working(staff, walk_in):
    q = staff.post(f"{QUOTES}/", {"customer_id": walk_in["id"], "service_type": "express",
                                  "description": "Parcel to Arusha"}, format="json").json()
    assert q["items"] == [] and q["created_orders"] == []
    res = staff.post(f"{QUOTES}/{q['id']}/photos/", {"file": photo(), "customer_photo": "true"}, format="multipart")
    [shot] = res.json()["photos"]
    assert shot["from_agiza"] is False and shot["item"] is None
    assert QuoteAttachment.objects.get(pk=shot["id"]).uploaded_by_id == staff.user.id
    assert staff.post(f"{QUOTES}/{q['id']}/respond/", {"items": [{"id": 1, "amount": "10"}]},
                      format="json").status_code == 400
    staff.post(f"{QUOTES}/{q['id']}/respond/", {"quoted_amount": "25000"}, format="json")
    staff.post(f"{QUOTES}/{q['id']}/reply/", {"accepted": True}, format="json")
    res = staff.post(f"{QUOTES}/{q['id']}/approve/", {"pickup_address": "a", "delivery_address": "b"}, format="json")
    assert res.status_code == 201
    body = res.json()
    assert body["created_orders"] == [body["created_order"]]
    order = Order.objects.get(pk=body["created_order"]["id"])
    assert order.total_amount == D("25000") and order.source_quote_id == q["id"]
    assert OrderAttachment.objects.filter(order=order, caption="Customer photo").count() == 1


def test_staff_may_remove_photos_they_added_for_the_customer(staff, walk_in):
    q = staff.post(f"{QUOTES}/", {"customer_id": walk_in["id"], "service_type": "express",
                                  "description": "Parcel"}, format="json").json()
    [shot] = staff.post(f"{QUOTES}/{q['id']}/photos/", {"file": photo(), "customer_photo": "1"},
                        format="multipart").json()["photos"]
    assert staff.delete(f"{QUOTES}/{q['id']}/photos/{shot['id']}/").status_code == 200
    for _ in range(5):
        staff.post(f"{QUOTES}/{q['id']}/photos/", {"file": photo(), "customer_photo": "1"}, format="multipart")
    assert staff.post(f"{QUOTES}/{q['id']}/photos/", {"file": photo(), "customer_photo": "1"},
                      format="multipart").status_code == 409


def test_the_app_shows_each_item_line_and_prices_only_once_quoted(staff, walk_in, countries):
    q = multi_item_quote(staff, walk_in["id"], countries)
    case, shoes = q["items"]
    staff.post(f"{QUOTES}/{q['id']}/photos/", {"file": photo(), "item": case["id"]}, format="multipart")
    app = app_for(walk_in["id"])

    lines = app.get(f"{APP}/requests/{q['id']}/").json()["items"]
    assert [(i["name"], i["quantity"], i["service"]) for i in lines] == [
        ("Phone case", 3, "full_service"), ("Sneakers", 1, "deliver_for_me")]
    assert lines[0]["origin_country"] == "China" and lines[1]["tracking_number"] == "YT123CN"
    assert [i["amount"] for i in lines] == [None, None] and len(lines[0]["photo_ids"]) == 1
    assert app.get(f"{APP}/requests/").json()["results"][0]["items"][0]["name"] == "Phone case"

    staff.post(f"{QUOTES}/{q['id']}/respond/", {"items": [{"id": case["id"], "unit_price": "5000"},
                                                         {"id": shoes["id"], "amount": "30000"}]}, format="json")
    lines = app.get(f"{APP}/requests/{q['id']}/").json()["items"]
    assert [i["amount"] for i in lines] == ["15000.00", "30000.00"] and lines[0]["unit_price"] == "5000.00"
