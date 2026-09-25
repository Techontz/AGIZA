import pytest

from apps.accounts.constants import StaffLevel
from apps.accounts.models import AuditLog, RolePermission

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize(
    "level,expected",
    [
        (StaffLevel.TOP_ADMIN, 200),
        (StaffLevel.ADMIN_L2, 200),
        (StaffLevel.ADMIN_L1, 200),
        (StaffLevel.SALES, 403),
        (StaffLevel.FINANCE, 403),
        (StaffLevel.DRIVER, 403),
    ],
)
def test_audit_log_visibility_follows_matrix(client_for, level, expected):
    assert client_for(level).get("/api/audit-logs/").status_code == expected


def test_unknown_module_view_is_denied_by_default(client_for):
    # Warehouses: data_entry has edit, driver has none.
    assert client_for(StaffLevel.DATA_ENTRY).get("/api/warehouses/").status_code == 200
    assert client_for(StaffLevel.DRIVER).get("/api/warehouses/").status_code == 403


def test_only_top_admin_can_change_role_permissions(client_for):
    row = RolePermission.objects.get(staff_level="sales", module="audit_logs")
    admin_l2 = client_for(StaffLevel.ADMIN_L2)
    assert admin_l2.patch(f"/api/role-permissions/{row.id}/", {"access": "view"}, format="json").status_code == 403

    top = client_for(StaffLevel.TOP_ADMIN)
    res = top.patch(f"/api/role-permissions/{row.id}/", {"access": "view"}, format="json")
    assert res.status_code == 200
    assert AuditLog.objects.filter(action="permission_change", object_id=str(row.id)).exists()

    # The change takes effect immediately for sales staff.
    assert client_for(StaffLevel.SALES).get("/api/audit-logs/").status_code == 200


def test_staff_management_rules(client_for):
    payload = {
        "email": "new.sales@agiza.test",
        "full_name": "New Sales",
        "staff_level": "sales",
        "department": "sales",
        "password": "Sal3s-Password-123",
    }
    admin_l2 = client_for(StaffLevel.ADMIN_L2)
    created = admin_l2.post("/api/staff/", payload, format="json")
    assert created.status_code == 201, created.json()
    assert created.json()["employee_id"].startswith("STF-")
    assert "password" not in created.json()

    # Admin L2 cannot mint Top Admins.
    res = admin_l2.post(
        "/api/staff/", {**payload, "email": "x@agiza.test", "staff_level": "top_admin"}, format="json"
    )
    assert res.status_code == 400
    assert res.json()["error"]["details"]["staff_level"]

    # Sales can view staff (people=view) but not create.
    sales = client_for(StaffLevel.SALES)
    assert sales.get("/api/staff/").status_code == 200
    assert sales.post("/api/staff/", {**payload, "email": "y@agiza.test"}, format="json").status_code == 403

    # Data entry has no People access.
    assert client_for(StaffLevel.DATA_ENTRY).get("/api/staff/").status_code == 403


def test_cannot_deactivate_self(client_for):
    top = client_for(StaffLevel.TOP_ADMIN)
    res = top.patch(f"/api/staff/{top.user.id}/", {"is_active": False}, format="json")
    assert res.status_code == 400


def test_password_hash_never_leaks_into_audit(client_for):
    top = client_for(StaffLevel.TOP_ADMIN)
    target = client_for(StaffLevel.SALES).user
    top.patch(f"/api/staff/{target.id}/", {"password": "Brand-New-Pass-99", "phone": "+255700000001"}, format="json")
    log = AuditLog.objects.filter(action="update", object_id=str(target.id)).latest("created_at")
    assert "password" not in log.changes
    assert log.changes["phone"] == ["", "+255700000001"]


def test_audit_entities_lists_logged_types(client_for):
    top = client_for(StaffLevel.TOP_ADMIN)
    top.post("/api/customers/", {"full_name": "Grace Mollel", "phone": "+255700111222"}, format="json")
    entities = top.get("/api/audit-logs/entities/").json()
    assert {"value": "customer", "label": "Customer"} in entities
