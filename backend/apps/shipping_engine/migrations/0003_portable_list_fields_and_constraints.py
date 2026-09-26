"""
Make the Shipping Engine schema portable to MySQL 8 without changing behaviour.

* Carrier.specializations, Carrier.services and ShippingProfile.handling move
  from PostgreSQL arrays to JSON arrays (apps.core.fields.StringListField).
  PostgreSQL cannot cast varchar[] to jsonb in place, so each list is copied
  into a new column, the old column is dropped and the new one renamed; every
  existing value and its order are preserved.
* The zone-membership and route uniqueness rules are re-expressed in forms
  MySQL enforces (it ignores partial indexes and NULLS NOT DISTINCT).
"""
import json

import django.db.models.functions.comparison
from django.db import migrations, models

import apps.core.fields

CARRIER_SERVICES = [("air_cargo", "Air cargo"), ("sea_cargo", "Sea cargo"), ("local_land_cargo", "Local land cargo")]
HANDLING = [
    ("contains_battery", "Contains battery"), ("fragile", "Fragile"), ("electronics", "Electronics"),
    ("hazardous", "Hazardous material"), ("restricted", "Restricted handling"),
    ("special_documentation", "Special documentation"), ("temperature_controlled", "Temperature controlled"),
    ("oversized", "Oversized"), ("other", "Other"),
]
LIST_FIELDS = [("carrier", "specializations"), ("carrier", "services"), ("shippingprofile", "handling")]


def _raw_lists(schema_editor, model, column):
    """(pk, list) for every row, read straight from the table.

    The column is a PostgreSQL array on databases created by 0001/0002, but JSON
    on databases created by the squashed migration, and Django's historical
    model describes the squashed (JSON) version either way, so the value is
    read raw and normalised instead of through the historical field.
    """
    qn = schema_editor.connection.ops.quote_name
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(f"SELECT {qn(model._meta.pk.column)}, {qn(column)} FROM {qn(model._meta.db_table)}")
        for pk, value in cursor.fetchall():
            if isinstance(value, str | bytes | bytearray):
                value = json.loads(value)
            yield pk, [str(item) for item in (value or [])]


def copy_lists(apps, schema_editor):
    for model_name, field in LIST_FIELDS:
        Model = apps.get_model("shipping_engine", model_name)
        for pk, value in list(_raw_lists(schema_editor, Model, field)):
            Model.objects.filter(pk=pk).update(**{f"{field}_list": value})


def copy_lists_back(apps, schema_editor):
    for model_name, field in LIST_FIELDS:
        Model = apps.get_model("shipping_engine", model_name)
        for pk, value in list(_raw_lists(schema_editor, Model, f"{field}_list")):
            Model.objects.filter(pk=pk).update(**{field: value})


class Migration(migrations.Migration):

    dependencies = [
        ('locations', '0002_reference_data'),
        ('shipping_engine', '0002_carrier_rating_carrier_services_carrier_warehouses'),
    ]

    operations = [
        # 1. List fields: new JSON columns, copy, drop the arrays, take over their names.
        migrations.AddField(
            model_name='carrier',
            name='specializations_list',
            field=apps.core.fields.StringListField(blank=True, default=list, item_max_length=60),
        ),
        migrations.AddField(
            model_name='carrier',
            name='services_list',
            field=apps.core.fields.StringListField(blank=True, default=list, item_choices=CARRIER_SERVICES,
                                                   item_max_length=20),
        ),
        migrations.AddField(
            model_name='shippingprofile',
            name='handling_list',
            field=apps.core.fields.StringListField(blank=True, default=list, item_choices=HANDLING,
                                                   item_max_length=32),
        ),
        migrations.RunPython(copy_lists, copy_lists_back, elidable=True),
        migrations.RemoveField(model_name='carrier', name='specializations'),
        migrations.RemoveField(model_name='carrier', name='services'),
        migrations.RemoveField(model_name='shippingprofile', name='handling'),
        migrations.RenameField(model_name='carrier', old_name='specializations_list', new_name='specializations'),
        migrations.RenameField(model_name='carrier', old_name='services_list', new_name='services'),
        migrations.RenameField(model_name='shippingprofile', old_name='handling_list', new_name='handling'),
        # 2. Uniqueness rules in portable form.
        migrations.RemoveConstraint(model_name='route', name='uniq_route'),
        migrations.RemoveConstraint(model_name='zonedestination', name='uniq_zone_city'),
        migrations.RemoveConstraint(model_name='zonedestination', name='uniq_zone_region'),
        migrations.RemoveConstraint(model_name='zonedestination', name='uniq_zone_country'),
        migrations.AddConstraint(
            model_name='route',
            constraint=models.UniqueConstraint(
                models.F('origin_country'),
                django.db.models.functions.comparison.Coalesce('origin_city', models.Value(0)),
                django.db.models.functions.comparison.Coalesce('destination_country', models.Value(0)),
                django.db.models.functions.comparison.Coalesce('destination_city', models.Value(0)),
                django.db.models.functions.comparison.Coalesce('destination_zone', models.Value(0)),
                name='uniq_route',
            ),
        ),
        migrations.AddConstraint(
            model_name='zonedestination',
            constraint=models.UniqueConstraint(fields=('city',), name='uniq_zone_city'),
        ),
        migrations.AddConstraint(
            model_name='zonedestination',
            constraint=models.UniqueConstraint(fields=('region',), name='uniq_zone_region'),
        ),
        migrations.AddConstraint(
            model_name='zonedestination',
            constraint=models.UniqueConstraint(fields=('country',), name='uniq_zone_country'),
        ),
    ]
