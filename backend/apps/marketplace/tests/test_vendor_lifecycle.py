"""Vendor applications: apply, review, approve / reject / request changes, suspend, reactivate — all audited."""
import pytest

from apps.accounts.constants import StaffLevel
from apps.catalog.models import Vendor
from apps.locations.models import Warehouse
from apps.marketplace.models import MarketplaceSettings, VendorStatusHistory
from apps.notifications.models import Notification
from apps.storefront.models import CustomerAccount

from .conftest import APP, SELLER, application, client_for_account, make_account, product_payload

pytestmark = pytest.mark.django_db


def review(staff, vendor_id, status, note=""):
    return staff.post(f"/api/catalog/vendors/{vendor_id}/review/", {"status": status, "note": note}, format="json")


def test_registering_as_a_customer_never_creates_a_vendor(sms, anon):
    anon.post(f"{APP}/auth/request-code/", {"phone": "0712 000 555", "purpose": "register"}, format="json")
    res = anon.post(f"{APP}/auth/register/", {"phone": "0712000555", "code": sms.last_code(),
                                               "full_name": "Plain Customer", "password": "Mzigo-Salama-2026"},
                    format="json")
    assert res.status_code == 201
    assert Vendor.objects.count() == 0
    client = client_for_account(CustomerAccount.objects.get(phone="255712000555"))
    assert client.get(f"{SELLER}/store/").status_code == 404  # no store until they apply
    assert client.get(f"{SELLER}/products/").status_code == 404


def test_apply_requires_sign_in_and_creates_a_pending_application(anon, app, shop, staff):
    assert anon.post(f"{SELLER}/store/", application(), format="json").status_code == 401
    res = app.post(f"{SELLER}/store/", application(), format="json")
    assert res.status_code == 201, res.json()
    body = res.json()
    assert body["approval_status"] == "pending" and body["can_sell"] is False and body["can_edit_application"]
    vendor = Vendor.objects.get(pk=body["id"])
    assert vendor.owner == app.account and vendor.commission_mode == "default" and vendor.warehouse is None
    assert vendor.slug == "kariakoo-electronics"
    assert VendorStatusHistory.objects.filter(vendor=vendor, to_status="pending", by_vendor=True).exists()
    assert Notification.objects.filter(title__startswith="New vendor application").exists()
    # Staff see it among pending applications.
    rows = staff.get("/api/catalog/vendors/", {"approval_status": "pending"}).json()["results"]
    assert [r["name"] for r in rows] == ["Kariakoo Electronics"] and rows[0]["owner"]["phone"] == "+255712345678"
    assert staff.get("/api/catalog/vendors/counts/").json()["pending"] == 1
    # Not a store yet: invisible to customers, can't sell.
    assert anon.get(f"{APP}/stores/kariakoo-electronics/").status_code == 404
    assert app.get(f"{SELLER}/products/").status_code == 403
    assert app.post(f"{SELLER}/products/", product_payload(shop.product.category), format="json").status_code == 403


def test_one_application_per_account_and_unique_store_names(app, other_app, shop):
    assert app.post(f"{SELLER}/store/", application(), format="json").status_code == 201
    assert app.post(f"{SELLER}/store/", application(name="Another"), format="json").status_code == 409
    res = other_app.post(f"{SELLER}/store/", application(name="kariakoo  ELECTRONICS"), format="json")
    assert res.status_code == 400 and "name" in res.json()["error"]["details"]


def test_applications_can_be_closed(app, shop):
    settings = MarketplaceSettings.load()
    settings.vendor_applications_open = False
    settings.save()
    assert app.post(f"{SELLER}/store/", application(), format="json").status_code == 409


def test_request_changes_then_resubmit_then_approve(app, staff, anon, shop):
    vendor_id = app.post(f"{SELLER}/store/", application(tin=""), format="json").json()["id"]
    assert review(staff, vendor_id, "under_review").status_code == 200
    assert review(staff, vendor_id, "changes_requested").status_code == 400  # a note is required
    res = review(staff, vendor_id, "changes_requested", "Add your TIN number.")
    assert res.json()["approval_status"] == "changes_requested"
    mine = app.get(f"{SELLER}/store/").json()
    assert mine["review_note"] == "Add your TIN number." and mine["can_edit_application"]
    res = app.patch(f"{SELLER}/store/", {"tin": "111-222-333"}, format="json")
    assert res.json()["approval_status"] == "pending" and res.json()["tin"] == "111-222-333"
    res = review(staff, vendor_id, "approved")
    assert res.status_code == 200
    vendor = Vendor.objects.get(pk=vendor_id)
    assert vendor.approval_status == "approved" and vendor.verified and vendor.joined_date
    # Approval opens the vendor's own stock location, in its city.
    assert vendor.warehouse.type == Warehouse.Type.VENDOR and vendor.warehouse.city.name == "Dar es Salaam"
    assert vendor.warehouse.status == "active"
    steps = list(VendorStatusHistory.objects.filter(vendor=vendor).values_list("to_status", flat=True))
    assert steps == ["pending", "under_review", "changes_requested", "pending", "approved"]
    history = staff.get(f"/api/catalog/vendors/{vendor_id}/history/").json()
    assert history[0]["to_status"] == "approved" and history[-1]["by"] == "Vendor"
    assert anon.get(f"{APP}/stores/kariakoo-electronics/").json()["name"] == "Kariakoo Electronics"
    # Once approved the application is closed: the store name and status are AGIZA's to change.
    res = app.patch(f"{SELLER}/store/", {"name": "Renamed", "description": "Phones and accessories"}, format="json")
    assert res.status_code == 200 and res.json()["name"] == "Kariakoo Electronics"
    assert res.json()["description"] == "Phones and accessories"


def test_reject_needs_a_reason_and_is_final_for_the_applicant(app, staff, shop):
    vendor_id = app.post(f"{SELLER}/store/", application(), format="json").json()["id"]
    assert review(staff, vendor_id, "rejected").status_code == 400
    assert review(staff, vendor_id, "rejected", "Business could not be verified.").status_code == 200
    assert app.get(f"{SELLER}/store/").json()["approval_status"] == "rejected"
    assert app.patch(f"{SELLER}/store/", {"tin": "1"}, format="json").status_code == 409
    assert review(staff, vendor_id, "approved").status_code == 409  # must be reviewed again first
    assert review(staff, vendor_id, "under_review").status_code == 200


def test_suspend_hides_the_store_and_blocks_changes_until_reactivated(vendor_a, staff, anon, app):
    vid, owner = vendor_a.vendor.pk, vendor_a.client
    assert anon.get(f"{APP}/products/{vendor_a.product.pk}/").status_code == 200
    assert review(staff, vid, "suspended").status_code == 400  # needs a reason
    assert review(staff, vid, "suspended", "Customer complaints under investigation").status_code == 200
    # Hidden from customers everywhere; can't be bought.
    assert anon.get(f"{APP}/products/{vendor_a.product.pk}/").status_code == 404
    assert anon.get(f"{APP}/stores/{vendor_a.vendor.slug}/").status_code == 404
    assert app.post(f"{APP}/cart/items/", {"variant": vendor_a.variant.pk, "quantity": 1},
                    format="json").status_code == 400
    Vendor.objects.get(pk=vid).warehouse.refresh_from_db()
    assert Vendor.objects.get(pk=vid).warehouse.status == "inactive"  # its stock can't be reserved either
    # The vendor can still read its records but not change anything.
    assert owner.get(f"{SELLER}/products/").status_code == 200
    assert owner.get(f"{SELLER}/earnings/").status_code == 200
    assert owner.patch(f"{SELLER}/products/{vendor_a.product.pk}/", {"price": "1000"}, format="json").status_code == 409
    assert owner.post(f"{SELLER}/products/{vendor_a.product.pk}/stock/",
                      {"variant": vendor_a.variant.pk, "quantity": 99}, format="json").status_code == 409
    assert owner.patch(f"{SELLER}/store/", {"description": "x"}, format="json").status_code == 403
    # Reactivate.
    assert review(staff, vid, "approved").status_code == 200
    assert anon.get(f"{APP}/products/{vendor_a.product.pk}/").status_code == 200
    assert Vendor.objects.get(pk=vid).warehouse.status == "active"


def test_only_staff_with_edit_rights_review_vendors(vendor_a, client_for):
    sales = client_for(StaffLevel.SALES)  # E-commerce: view only
    assert sales.get("/api/catalog/vendors/").status_code == 200
    assert sales.post(f"/api/catalog/vendors/{vendor_a.vendor.pk}/review/", {"status": "suspended", "note": "x"},
                      format="json").status_code == 403
    # A customer (vendor) token is not a staff token.
    assert vendor_a.client.get("/api/catalog/vendors/").status_code == 401
    assert vendor_a.client.post(f"/api/catalog/vendors/{vendor_a.vendor.pk}/review/",
                                {"status": "suspended", "note": "x"}, format="json").status_code == 401
    # And the approval status can't be set by editing the vendor either.
    admin = client_for(StaffLevel.ADMIN_L2)
    admin.patch(f"/api/catalog/vendors/{vendor_a.vendor.pk}/", {"approval_status": "rejected"}, format="json")
    assert Vendor.objects.get(pk=vendor_a.vendor.pk).approval_status == "approved"


def test_closing_the_owner_account_suspends_the_store(vendor_a, anon):
    from apps.storefront import accounts

    accounts.delete_account(vendor_a.vendor.owner, password="Mzigo-Salama-2026")
    vendor = Vendor.objects.get(pk=vendor_a.vendor.pk)
    assert vendor.owner is None and vendor.approval_status == "suspended"
    assert anon.get(f"{APP}/products/{vendor_a.product.pk}/").status_code == 404


def test_existing_staff_managed_vendors_keep_working(client_for, shop):
    admin = client_for(StaffLevel.ADMIN_L2)
    res = admin.post("/api/catalog/vendors/", {"name": "Mama Saida Shop", "profit_type": "percent",
                                               "profit_value": "10", "profit_scope": "all"}, format="json")
    assert res.status_code == 201, res.json()
    body = res.json()
    assert body["approval_status"] == "approved" and body["self_service"] is False and body["slug"] == "mama-saida-shop"
    assert body["commission_mode"] == "custom"
    another = make_account(phone="255700000999")
    assert Vendor.objects.filter(owner=another).count() == 0
