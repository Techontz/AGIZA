from django.contrib.auth import password_validation
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .constants import Module, StaffLevel
from .models import AuditLog, RolePermission, User
from .permissions import access_map_for


class UserSummarySerializer(serializers.ModelSerializer):
    """Compact user reference embedded in other resources."""

    class Meta:
        model = User
        fields = ["id", "employee_id", "full_name", "email", "staff_level", "department"]
        read_only_fields = fields


class MeSerializer(serializers.ModelSerializer):
    staff_level_display = serializers.CharField(source="get_staff_level_display", read_only=True)
    department_display = serializers.CharField(source="get_department_display", read_only=True)
    initials = serializers.CharField(read_only=True)
    is_top_admin = serializers.BooleanField(read_only=True)
    permissions = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "employee_id",
            "email",
            "full_name",
            "phone",
            "initials",
            "staff_level",
            "staff_level_display",
            "department",
            "department_display",
            "is_top_admin",
            "permissions",
            "last_login",
            "date_joined",
        ]
        read_only_fields = fields

    def get_permissions(self, obj) -> dict[str, str]:
        return access_map_for(obj)


class LoginSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        attrs[self.username_field] = (attrs.get(self.username_field) or "").strip().lower()
        data = super().validate(attrs)
        data["user"] = MeSerializer(self.user).data
        return data


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField()


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)

    def validate_current_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value

    def validate_new_password(self, value):
        password_validation.validate_password(value, self.context["request"].user)
        return value


PRIVILEGED_LEVELS = {StaffLevel.TOP_ADMIN, StaffLevel.ADMIN_L2}


class StaffSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, allow_blank=False)
    staff_level_display = serializers.CharField(source="get_staff_level_display", read_only=True)
    department_display = serializers.CharField(source="get_department_display", read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "employee_id",
            "email",
            "full_name",
            "phone",
            "staff_level",
            "staff_level_display",
            "department",
            "department_display",
            "is_active",
            "password",
            "last_login",
            "date_joined",
        ]
        read_only_fields = ["id", "employee_id", "last_login", "date_joined"]

    def validate_email(self, value):
        value = value.strip().lower()
        qs = User.objects.filter(email=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def validate_staff_level(self, value):
        actor = self.context["request"].user
        if value in PRIVILEGED_LEVELS and not actor.is_top_admin:
            raise serializers.ValidationError("Only a Top Admin can assign this staff level.")
        if self.instance and self.instance.is_top_admin and not actor.is_top_admin:
            raise serializers.ValidationError("Only a Top Admin can change a Top Admin's level.")
        return value

    def validate_is_active(self, value):
        actor = self.context["request"].user
        if self.instance and self.instance.pk == actor.pk and not value:
            raise serializers.ValidationError("You cannot deactivate your own account.")
        return value

    def validate(self, attrs):
        if self.instance is None and not attrs.get("password"):
            raise serializers.ValidationError({"password": "A password is required for new staff."})
        password = attrs.get("password")
        if password:
            candidate = self.instance or User(email=attrs.get("email", ""), full_name=attrs.get("full_name", ""))
            password_validation.validate_password(password, candidate)
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        return User.objects.create_user(password=password, **validated_data)

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for key, value in validated_data.items():
            setattr(instance, key, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class RolePermissionSerializer(serializers.ModelSerializer):
    module_display = serializers.CharField(source="get_module_display", read_only=True)
    staff_level_display = serializers.CharField(source="get_staff_level_display", read_only=True)

    class Meta:
        model = RolePermission
        fields = ["id", "staff_level", "staff_level_display", "module", "module_display", "access", "updated_at"]
        read_only_fields = ["id", "staff_level", "module", "updated_at"]


class AuditLogSerializer(serializers.ModelSerializer):
    actor = UserSummarySerializer(read_only=True)
    action_display = serializers.CharField(source="get_action_display", read_only=True)
    entity = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = [
            "id",
            "actor",
            "action",
            "action_display",
            "entity",
            "object_id",
            "object_repr",
            "changes",
            "ip_address",
            "user_agent",
            "created_at",
        ]
        read_only_fields = fields

    def get_entity(self, obj) -> str | None:
        if obj.content_type_id is None:
            return None
        return obj.content_type.model


MODULE_CHOICES = [m.value for m in Module]
