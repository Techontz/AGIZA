"""
Walk an international order through the real operations APIs:
payment → procurement → cargo receipt → shipment milestones → delivery.
Shared by the orders, procurement, shipping and deliveries tests.
"""
from apps.accounts.constants import StaffLevel
from apps.accounts.models import User
from apps.locations.models import City
from apps.procurement.models import Supplier
from apps.shipping_engine.models import Carrier, ShippingMethod

INTL = "/api/orders/international"
STAGES = ["supplier_confirmed", "paid_supplier", "sent_to_consolidation", "shipping_to_destination", "clearance",
          "ready_for_collection", "completed"]
SHIPMENT_PATH = ["booked", "loaded", "export_cleared", "shipping_to_destination", "clearance", "completed"]


def ok(res, code=200):
    assert res.status_code == code, res.json()
    return res.json()


def fixtures(country):
    supplier, _ = Supplier.objects.get_or_create(name="Shenzhen Tech Co.", defaults={"country": country})
    shipper, _ = Carrier.objects.get_or_create(name="Silent Ocean", defaults={"type": "international_sea"})
    method, _ = ShippingMethod.objects.get_or_create(code="SEA-T", defaults={"name": "Sea Cargo (test)",
                                                                             "category": "sea"})
    driver = User.objects.filter(staff_level=StaffLevel.DRIVER, is_active=True).first() or User.objects.create_user(
        email="flow.driver@agiza.test", password="x-Passw0rd!", full_name="Flow Driver",
        staff_level=StaffLevel.DRIVER)
    return supplier, shipper, method, driver


def procurement_id(client, order):
    return ok(client.get(f"/api/procurement/orders/?search={order['reference']}"))["results"][0]["id"]


def parcel_id(client, order):
    return ok(client.get(f"/api/shipping/parcels/?search={order['reference']}&stage=waiting,ready"))["results"][0]["id"]


def walk(client, order: dict, to: str, *, country=None) -> dict:
    """Advance `order` (API dict) from wherever it is to international status `to`; returns the refreshed order."""
    from apps.orders.models import Order

    obj = Order.objects.select_related("international__source_country").get(pk=order["id"])
    supplier, shipper, method, driver = fixtures(country or obj.international.source_country)
    target = STAGES.index(to)

    def status():
        return ok(client.get(f"{INTL}/{order['id']}/"))["status"]

    def at(_):
        current = status()
        return STAGES.index(current) if current in STAGES else -1

    if at(None) < 0:  # pending payment: pay in full and choose the supplier
        due = ok(client.get(f"{INTL}/{order['id']}/"))["payment"]["due"]
        if due and float(due) > 0:
            ok(client.post(f"{INTL}/{order['id']}/payments/", {"amount": due, "method": "bank_transfer"},
                           format="json"), 201)
        ok(client.post(f"/api/procurement/orders/{procurement_id(client, order)}/select-supplier/",
                       {"supplier": supplier.id, "item_cost": "1800000"}, format="json"))
    if target >= 1 and at(None) == 0:
        ok(client.post(f"/api/procurement/orders/{procurement_id(client, order)}/mark-paid/",
                       {"payment_reference": "TT-1"}, format="json"))
    if target >= 2 and at(None) == 1:
        ok(client.post(f"/api/shipping/parcels/{parcel_id(client, order)}/receive/",
                       {"weight_kg": "150", "cbm": "2.5"}, format="json"))
    if target >= 3 and at(None) in (2, 3, 4):
        parcel = ok(client.get(f"/api/shipping/parcels/?search={order['reference']}"))["results"][0]
        if parcel["shipment"] is None:
            dar = City.objects.get(name="Dar es Salaam", country__iso2="TZ")
            shipment_id = ok(client.post("/api/shipping/shipments/", {
                "parcels": [parcel["id"]], "shipper": shipper.id, "shipping_method": method.id,
                "destination_city": dar.id,
            }, format="json"), 201)["id"]
        else:
            shipment_id = parcel["shipment"]["id"]
        stop = {3: "shipping_to_destination", 4: "clearance"}.get(target, "completed")
        current = ok(client.get(f"/api/shipping/shipments/{shipment_id}/"))["status"]
        start = SHIPMENT_PATH.index(current) + 1 if current in SHIPMENT_PATH else 0
        for step in SHIPMENT_PATH[start:SHIPMENT_PATH.index(stop) + 1]:
            ok(client.post(f"/api/shipping/shipments/{shipment_id}/transition/", {"status": step}, format="json"))
    if target >= 6 and at(None) == 5:
        delivery = ok(client.get(f"/api/deliveries/?order={order['id']}"))["results"][0]
        ok(client.post(f"/api/deliveries/{delivery['id']}/assign-driver/", {"driver": driver.id}, format="json"))
        ok(client.post(f"/api/deliveries/{delivery['id']}/transition/", {"status": "out_for_delivery"},
                       format="json"))
        ok(client.post(f"/api/deliveries/{delivery['id']}/complete/", {"signature_name": "Fatuma Hassan"}))
    return ok(client.get(f"{INTL}/{order['id']}/"))
