from rest_framework import serializers

from .models import City, Country, Region, Warehouse


class CountrySerializer(serializers.ModelSerializer):
    class Meta:
        model = Country
        fields = ["id", "iso2", "name", "display_name", "currency", "is_sourcing_origin", "is_active"]


class RegionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Region
        fields = ["id", "country", "name"]


class CitySerializer(serializers.ModelSerializer):
    region_name = serializers.CharField(source="region.name", read_only=True)
    country_iso2 = serializers.CharField(source="country.iso2", read_only=True)

    class Meta:
        model = City
        fields = ["id", "name", "region", "region_name", "country", "country_iso2", "is_active"]


class WarehouseSerializer(serializers.ModelSerializer):
    type_display = serializers.CharField(source="get_type_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    country_name = serializers.CharField(source="country.display_name", read_only=True)
    city_name = serializers.CharField(source="city.name", read_only=True)

    class Meta:
        model = Warehouse
        fields = [
            "id",
            "code",
            "name",
            "type",
            "type_display",
            "country",
            "country_name",
            "city",
            "city_name",
            "address",
            "contact_person",
            "phone",
            "email",
            "capacity_percent",
            "status",
            "status_display",
            "last_audit_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "code", "created_at", "updated_at"]

    def validate(self, attrs):
        country = attrs.get("country") or getattr(self.instance, "country", None)
        city = attrs.get("city") or getattr(self.instance, "city", None)
        if country and city and city.country_id != country.id:
            raise serializers.ValidationError({"city": "City does not belong to the selected country."})
        if self.instance and "country" in attrs and attrs["country"] != self.instance.country:
            # The code prefix (WH-TZ / WH-INT) derives from the country; keep references stable.
            raise serializers.ValidationError({"country": "A warehouse's country cannot be changed."})
        return attrs
