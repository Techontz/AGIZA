from django.db import transaction
from rest_framework import serializers

from .models import Address, Customer


class AddressSerializer(serializers.ModelSerializer):
    city_name = serializers.CharField(source="city.name", read_only=True)
    region_name = serializers.CharField(source="region.name", read_only=True)
    country_name = serializers.CharField(source="country.display_name", read_only=True)
    one_line = serializers.CharField(read_only=True)

    class Meta:
        model = Address
        fields = [
            "id",
            "label",
            "line1",
            "area",
            "city",
            "city_name",
            "region",
            "region_name",
            "country",
            "country_name",
            "latitude",
            "longitude",
            "is_default",
            "one_line",
        ]
        read_only_fields = ["id", "region", "country"]

    def _save_default(self, customer, instance_id=None):
        Address.objects.filter(customer=customer, is_default=True).exclude(pk=instance_id).update(is_default=False)

    @transaction.atomic
    def create(self, validated_data):
        customer = validated_data["customer"]
        if validated_data.get("is_default") or not customer.addresses.exists():
            validated_data["is_default"] = True
            self._save_default(customer)
        return super().create(validated_data)

    @transaction.atomic
    def update(self, instance, validated_data):
        if validated_data.get("is_default"):
            self._save_default(instance.customer, instance.pk)
        return super().update(instance, validated_data)


class CustomerSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    default_address = serializers.SerializerMethodField()

    class Meta:
        model = Customer
        fields = [
            "id",
            "reference",
            "full_name",
            "email",
            "phone",
            "company_name",
            "status",
            "status_display",
            "preferred_channel",
            "notes",
            "default_address",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "reference", "created_at", "updated_at"]

    def get_default_address(self, obj) -> dict | None:
        # Uses the prefetched `addresses` list to avoid a query per row.
        for address in obj.addresses.all():
            if address.is_default:
                return AddressSerializer(address).data
        return None

    def validate_email(self, value):
        value = (value or "").strip().lower()
        if not value:
            return value
        qs = Customer.objects.filter(email=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A customer with this email already exists.")
        return value

    def validate(self, attrs):
        email = attrs.get("email", getattr(self.instance, "email", ""))
        phone = attrs.get("phone", getattr(self.instance, "phone", ""))
        if not email and not phone:
            raise serializers.ValidationError("Provide at least a phone number or an email address.")
        return attrs
