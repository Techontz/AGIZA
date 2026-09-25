from django.db import models


class StaffLevel(models.TextChoices):
    TOP_ADMIN = "top_admin", "Top Admin"
    ADMIN_L2 = "admin_l2", "Admin Level 2"
    ADMIN_L1 = "admin_l1", "Admin Level 1"
    SALES = "sales", "Sales"
    FINANCE = "finance", "Finance"
    PROCUREMENT = "procurement", "Procurement"
    DATA_ENTRY = "data_entry", "Data Entry"
    DRIVER = "driver", "Driver"


class Department(models.TextChoices):
    MANAGEMENT = "management", "Management"
    SALES = "sales", "Sales"
    PROCUREMENT = "procurement", "Procurement"
    SHIPPING = "shipping", "Shipping"
    DELIVERY = "delivery", "Delivery"
    FINANCE = "finance", "Finance"
    SUPPORT = "support", "Support"
    WAREHOUSE = "warehouse", "Warehouse"


class Module(models.TextChoices):
    INTAKE_QUOTES = "intake_quotes", "Intake & Quotes"
    ORDERS = "orders", "Orders"
    DELIVERIES = "deliveries", "Deliveries"
    RETURNS = "returns", "Returns"
    TASKS = "tasks", "Tasks"
    PROCUREMENT = "procurement", "Procurement"
    SHIPPING = "shipping", "Shipping & Tracking"
    CHAT = "chat", "Chat & Customer Support"
    ECOMMERCE = "ecommerce", "E-commerce Platform"
    WAREHOUSE = "warehouse", "Warehouse & Pick Up Points"
    FINANCE = "finance", "Finance"
    SHIPPING_ENGINE = "shipping_engine", "Shipping Engine"
    PEOPLE = "people", "People"
    AUDIT_LOGS = "audit_logs", "Reporting & Audit Logs"
    SETTINGS = "settings", "Settings"


class Access(models.TextChoices):
    NONE = "none", "No access"
    VIEW = "view", "View"
    EDIT = "edit", "Edit"
    MANAGE = "manage", "Manage"


ACCESS_RANK = {Access.NONE: 0, Access.VIEW: 1, Access.EDIT: 2, Access.MANAGE: 3}

# Default permission matrix (approved in the Phase 1 plan). Top Admin bypasses it.
# Column order: admin_l2, admin_l1, sales, finance, procurement, data_entry, driver
_M, _E, _V, _N = Access.MANAGE, Access.EDIT, Access.VIEW, Access.NONE
_MATRIX_LEVELS = [
    StaffLevel.ADMIN_L2,
    StaffLevel.ADMIN_L1,
    StaffLevel.SALES,
    StaffLevel.FINANCE,
    StaffLevel.PROCUREMENT,
    StaffLevel.DATA_ENTRY,
    StaffLevel.DRIVER,
]
_MATRIX = {
    Module.INTAKE_QUOTES: (_M, _E, _E, _V, _V, _E, _N),
    Module.ORDERS: (_M, _E, _E, _V, _E, _E, _N),
    Module.DELIVERIES: (_M, _E, _V, _V, _N, _V, _E),
    Module.RETURNS: (_M, _E, _E, _E, _E, _E, _N),
    Module.TASKS: (_M, _E, _E, _E, _E, _E, _N),
    Module.PROCUREMENT: (_M, _E, _V, _V, _M, _V, _N),
    Module.SHIPPING: (_M, _E, _V, _V, _E, _V, _N),
    Module.CHAT: (_M, _E, _E, _V, _V, _N, _N),
    Module.ECOMMERCE: (_M, _E, _V, _V, _E, _E, _N),
    Module.WAREHOUSE: (_M, _E, _V, _V, _E, _E, _N),
    Module.FINANCE: (_M, _V, _V, _M, _V, _N, _N),
    Module.SHIPPING_ENGINE: (_M, _V, _V, _V, _V, _N, _N),
    Module.PEOPLE: (_M, _V, _V, _N, _N, _N, _N),
    Module.AUDIT_LOGS: (_M, _V, _N, _N, _N, _N, _N),
    Module.SETTINGS: (_M, _V, _N, _N, _N, _N, _N),
}

DEFAULT_PERMISSIONS: dict[str, dict[str, str]] = {
    level.value: {module.value: str(_MATRIX[module][i]) for module in Module} for i, level in enumerate(_MATRIX_LEVELS)
}
