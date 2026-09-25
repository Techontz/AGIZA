"""
Role-based module permissions, enforced server-side on every request.

A view declares `module = Module.X`. Access required:
  - safe methods (GET/HEAD/OPTIONS) -> view
  - POST / PUT / PATCH               -> edit
  - DELETE                           -> manage
A view may override per action with `required_access = {"approve": "manage"}`,
and may list `read_modules` whose view access also grants read-only access.
"""
from rest_framework.permissions import SAFE_METHODS, BasePermission

from .constants import ACCESS_RANK, Access, Module
from .models import RolePermission


def access_map_for(user) -> dict[str, str]:
    """{module: access} for `user`, cached on the user object for the request."""
    cached = getattr(user, "_access_map", None)
    if cached is not None:
        return cached
    if not user or not user.is_authenticated or not user.is_active:
        result = {m.value: Access.NONE.value for m in Module}
    elif user.is_top_admin:
        result = {m.value: Access.MANAGE.value for m in Module}
    else:
        result = {m.value: Access.NONE.value for m in Module}
        rows = RolePermission.objects.filter(staff_level=user.staff_level).values_list("module", "access")
        result.update(dict(rows))
    user._access_map = result
    return result


def has_access(user, module: str, required: str) -> bool:
    granted = access_map_for(user).get(module, Access.NONE)
    return ACCESS_RANK[Access(granted)] >= ACCESS_RANK[Access(required)]


class HasModulePermission(BasePermission):
    message = "You do not have permission to perform this action."

    def required_access(self, request, view) -> str:
        overrides = getattr(view, "required_access", {}) or {}
        action = getattr(view, "action", None)
        if action and action in overrides:
            return overrides[action]
        if request.method in SAFE_METHODS:
            return Access.VIEW
        if request.method == "DELETE":
            return Access.MANAGE
        return Access.EDIT

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not user or not user.is_authenticated:
            return False
        module = getattr(view, "module", None)
        if module is None:
            # Views must opt in to a module; refuse rather than allow by default.
            return False
        required = self.required_access(request, view)
        if has_access(user, module, required):
            return True
        # Shared reference data (e.g. customers) can be read from related modules.
        if required == Access.VIEW:
            return any(has_access(user, m, Access.VIEW) for m in getattr(view, "read_modules", ()))
        return False


class IsTopAdmin(BasePermission):
    message = "Only a Top Admin can perform this action."

    def has_permission(self, request, view) -> bool:
        return bool(request.user and request.user.is_authenticated and request.user.is_top_admin)
