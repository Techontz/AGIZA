import pytest

from apps.accounts.constants import StaffLevel
from apps.accounts.models import AuditLog
from apps.locations.models import City
from apps.parties.models import Customer

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin(client_for):
    return client_for(StaffLevel.ADMIN_L2)


def create(client, **data):
    payload = {"full_name": "Juma Mwangi", "phone": "+255712000001", **data}
    return client.post("/api/customers/", payload, format="json")


def test_create_generates_reference_and_audits(admin):
    res = create(admin)
    assert res.status_code == 201, res.json()
    ref = res.json()["reference"]
    assert ref.startswith("CUST-") and len(ref) == 11
    assert AuditLog.objects.filter(action="create", object_id=str(res.json()["id"])).exists()


def test_needs_phone_or_email(admin):
    res = admin.post("/api/customers/", {"full_name": "No Contact"}, format="json")
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "validation_error"


def test_duplicate_email_rejected(admin):
    assert create(admin, email="amina@example.com").status_code == 201
    dup = create(admin, full_name="Other", phone="+255700000009", email="AMINA@example.com")
    assert dup.status_code == 400


def test_search_filter_and_pagination(admin):
    for i in range(25):
        Customer.objects.create(full_name=f"Customer {i}", phone=f"+2557000{i:05d}")
    Customer.objects.create(full_name="Amina Khamis", phone="+255711111111", status="inactive")

    page = admin.get("/api/customers/?page_size=10&page=2").json()
    assert page["count"] == 26 and page["page"] == 2 and page["total_pages"] == 3
    assert len(page["results"]) == 10

    found = admin.get("/api/customers/?search=amina").json()
    assert found["count"] == 1
    assert admin.get("/api/customers/?status=inactive").json()["count"] == 1


def test_read_access_via_related_module_but_no_write(client_for):
    finance = client_for(StaffLevel.FINANCE)  # people=none, finance=manage, orders/intake=view
    assert finance.get("/api/customers/").status_code == 200
    # Finance can register a customer for a manual invoice, but not edit people settings.
    assert create(finance).status_code == 201
    assert finance.post("/api/service-providers/", {"name": "X"}, format="json").status_code == 403
    # Sales (people=view) can register a customer because they edit orders/quotations.
    assert create(client_for(StaffLevel.SALES), phone="+255700000321").status_code == 201
    # Drivers see the recipient on their own deliveries only, never the customer list.
    assert client_for(StaffLevel.DRIVER).get("/api/customers/").status_code == 403


def test_update_is_audited_with_diff(admin):
    cid = create(admin).json()["id"]
    admin.patch(f"/api/customers/{cid}/", {"company_name": "Mwangi Traders"}, format="json")
    log = AuditLog.objects.filter(action="update", object_id=str(cid)).get()
    assert log.changes == {"company_name": ["", "Mwangi Traders"]}


def test_addresses_single_default(admin):
    cid = create(admin).json()["id"]
    dsm = City.objects.get(name="Dar es Salaam")
    arusha = City.objects.get(name="Arusha")
    url = f"/api/customers/{cid}/addresses/"
    first = admin.post(url, {"line1": "Sam Nujoma Rd", "area": "Mwenge", "city": dsm.id}, format="json").json()
    assert first["is_default"] is True and first["region_name"] == "Dar es Salaam"
    second = admin.post(url, {"line1": "India St", "city": arusha.id, "is_default": True}, format="json").json()
    addresses = admin.get(url).json()
    defaults = [a["id"] for a in addresses if a["is_default"]]
    assert defaults == [second["id"]]
    detail = admin.get(f"/api/customers/{cid}/").json()
    assert detail["default_address"]["city_name"] == "Arusha"
