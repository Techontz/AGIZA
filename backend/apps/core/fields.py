"""
Database-portable list-of-strings field.

Stored as a JSON array (PostgreSQL `jsonb`, MySQL `JSON`), exposed in Python as
a plain `list[str]`, and validated item by item like the PostgreSQL
`ArrayField(CharField(max_length=..., choices=...))` it replaces. Forms (the
Django admin) keep the comma-separated input of `ArrayField`.
"""
from django import forms
from django.core import exceptions
from django.db import models


class StringListFormField(forms.CharField):
    """Comma-separated text input that cleans to a list of strings."""

    def prepare_value(self, value):
        if isinstance(value, list | tuple):
            return ",".join(str(v) for v in value)
        return value

    def to_python(self, value):
        if isinstance(value, list | tuple):
            return [str(v).strip() for v in value if str(v).strip()]
        value = super().to_python(value)
        return [item.strip() for item in value.split(",") if item.strip()] if value else []

    def has_changed(self, initial, data):
        return self.to_python(initial if initial is not None else []) != self.to_python(data)


class StringListField(models.JSONField):
    description = "List of strings"

    def __init__(self, *args, item_max_length: int | None = None, item_choices=None, **kwargs):
        self.item_max_length = item_max_length
        self.item_choices = list(item_choices) if item_choices is not None else None
        kwargs.setdefault("default", list)
        super().__init__(*args, **kwargs)

    def deconstruct(self):
        name, path, args, kwargs = super().deconstruct()
        if self.item_max_length is not None:
            kwargs["item_max_length"] = self.item_max_length
        if self.item_choices is not None:
            kwargs["item_choices"] = self.item_choices
        return name, path, args, kwargs

    def from_db_value(self, value, expression, connection):
        value = super().from_db_value(value, expression, connection)
        return [] if value is None else value

    def validate(self, value, model_instance):
        super().validate(value, model_instance)
        if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
            raise exceptions.ValidationError("Enter a list of text values.", code="invalid")
        allowed = {choice for choice, _label in self.item_choices} if self.item_choices else None
        for index, item in enumerate(value, start=1):
            if self.item_max_length is not None and len(item) > self.item_max_length:
                raise exceptions.ValidationError(
                    "Item %(index)s has more than %(max)s characters.",
                    code="item_max_length",
                    params={"index": index, "max": self.item_max_length},
                )
            if allowed is not None and item not in allowed:
                raise exceptions.ValidationError(
                    "Item %(index)s (%(value)s) is not a valid choice.",
                    code="invalid_choice",
                    params={"index": index, "value": item},
                )

    def formfield(self, **kwargs):
        return models.Field.formfield(self, **{"form_class": StringListFormField, **kwargs})
