from django.utils import timezone
from rest_framework import serializers

from apps.accounts.models import User
from apps.orders.models import Order
from apps.orders.serializers import _person
from apps.quotes.models import QuoteRequest

from .models import OPEN_STATUSES, TASK_TRANSITIONS, Task, TaskActivity, TaskDepartment, TaskPriority, TaskStatus, TaskType

LINK_TYPE = {"international": "international-order", "express": "express-delivery", "equipment": "service-order",
             "shop": "ecommerce-order"}


class ActivitySerializer(serializers.ModelSerializer):
    actor = serializers.SerializerMethodField()
    kind_display = serializers.CharField(source="get_kind_display", read_only=True)

    class Meta:
        model = TaskActivity
        fields = ["id", "kind", "kind_display", "body", "from_status", "to_status", "actor", "created_at"]

    def get_actor(self, obj) -> dict | None:
        return _person(obj.actor)


class TaskSerializer(serializers.ModelSerializer):
    task_type_display = serializers.CharField(source="get_task_type_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    department_display = serializers.CharField(source="get_department_display", read_only=True)
    linked_item = serializers.SerializerMethodField()
    owner = serializers.SerializerMethodField()
    notes = serializers.SerializerMethodField()
    is_overdue = serializers.SerializerMethodField()
    is_open = serializers.SerializerMethodField()
    allowed_transitions = serializers.SerializerMethodField()

    class Meta:
        model = Task
        fields = ["id", "reference", "task_type", "task_type_display", "status", "status_display", "priority",
                  "linked_item", "owner", "department", "department_display", "sla_deadline", "description", "notes",
                  "is_overdue", "is_open", "completed_at", "allowed_transitions", "created_at", "updated_at"]

    def get_linked_item(self, obj) -> dict | None:
        if obj.order_id:
            return {"kind": LINK_TYPE.get(obj.order.order_type, "order"), "id": obj.order_id,
                    "reference": obj.order.reference, "order_type": obj.order.order_type}
        if obj.quote_id:
            return {"kind": "quote", "id": obj.quote_id, "reference": obj.quote.reference, "order_type": None}
        return None

    def get_owner(self, obj) -> dict | None:
        o = obj.owner
        if not o:
            return None
        return {"id": o.id, "full_name": o.full_name, "role": o.get_department_display()}

    def get_notes(self, obj) -> list[dict]:
        return ActivitySerializer([a for a in obj.activity.all() if a.kind == TaskActivity.Kind.NOTE], many=True).data

    def get_is_overdue(self, obj) -> bool:
        return obj.status in OPEN_STATUSES and obj.sla_deadline < timezone.now()

    def get_is_open(self, obj) -> bool:
        return obj.status in OPEN_STATUSES

    def get_allowed_transitions(self, obj) -> list[dict]:
        labels = dict(TaskStatus.choices)
        return [{"value": str(s), "label": labels[s]} for s in TaskStatus if s in TASK_TRANSITIONS[obj.status]]


class TaskCreateSerializer(serializers.Serializer):
    task_type = serializers.ChoiceField(choices=TaskType.choices)
    description = serializers.CharField()
    sla_deadline = serializers.DateTimeField()
    department = serializers.ChoiceField(choices=TaskDepartment.choices, default=TaskDepartment.UNASSIGNED)
    priority = serializers.ChoiceField(choices=TaskPriority.choices, default=TaskPriority.MEDIUM)
    status = serializers.ChoiceField(choices=[(s.value, s.label) for s in TaskStatus if s in OPEN_STATUSES],
                                     default=TaskStatus.IN_PROGRESS)
    owner = serializers.PrimaryKeyRelatedField(queryset=User.objects.filter(is_active=True), required=False,
                                               allow_null=True)
    order = serializers.PrimaryKeyRelatedField(queryset=Order.objects.all(), required=False, allow_null=True)
    quote = serializers.PrimaryKeyRelatedField(queryset=QuoteRequest.objects.all(), required=False, allow_null=True)


class TaskUpdateSerializer(serializers.Serializer):
    task_type = serializers.ChoiceField(choices=TaskType.choices, required=False)
    description = serializers.CharField(required=False)
    sla_deadline = serializers.DateTimeField(required=False)
    department = serializers.ChoiceField(choices=TaskDepartment.choices, required=False)
    priority = serializers.ChoiceField(choices=TaskPriority.choices, required=False)


class TaskStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=TaskStatus.choices)
    note = serializers.CharField(required=False, allow_blank=True, default="")


class TaskAssignSerializer(serializers.Serializer):
    owner = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(), allow_null=True)


class NoteSerializer(serializers.Serializer):
    body = serializers.CharField()
