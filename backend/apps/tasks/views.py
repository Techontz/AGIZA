from datetime import timedelta

import django_filters
from django.db.models import Count, Prefetch, Q
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from apps.accounts.constants import Access, Module
from apps.accounts.models import User
from apps.accounts.permissions import HasModulePermission, has_access
from apps.core.audit import diff, record_audit, snapshot
from apps.core.exceptions import ConflictError
from apps.core.workflow import run

from . import services
from .models import OPEN_STATUSES, Task, TaskActivity, TaskStatus
from .serializers import (
    ActivitySerializer,
    NoteSerializer,
    TaskAssignSerializer,
    TaskCreateSerializer,
    TaskSerializer,
    TaskStatusSerializer,
    TaskUpdateSerializer,
)

OPEN = [str(s) for s in OPEN_STATUSES]


def _today_bounds():
    start = timezone.localtime().replace(hour=0, minute=0, second=0, microsecond=0)
    return start, start + timedelta(days=1)


class TaskFilter(django_filters.FilterSet):
    view = django_filters.ChoiceFilter(
        choices=[("mine", "Assigned to Me"), ("unassigned", "Unassigned"), ("overdue", "Overdue"),
                 ("due_today", "Due Today"), ("all", "All")], method="filter_view")
    state = django_filters.ChoiceFilter(choices=[("open", "Open"), ("closed", "Closed"), ("any", "Any")],
                                        method="filter_state")
    status = django_filters.BaseInFilter(field_name="status")
    owner = django_filters.NumberFilter(field_name="owner_id")
    order = django_filters.NumberFilter(field_name="order_id")
    quote = django_filters.NumberFilter(field_name="quote_id")

    class Meta:
        model = Task
        fields = ["view", "state", "status", "owner", "department", "task_type", "priority", "order", "quote"]

    def filter_view(self, qs, name, value):
        now = timezone.now()
        if value == "mine":
            return qs.filter(owner=self.request.user)
        if value == "unassigned":
            return qs.filter(owner__isnull=True)
        if value == "overdue":
            return qs.filter(sla_deadline__lt=now, status__in=OPEN)
        if value == "due_today":
            start, end = _today_bounds()
            return qs.filter(sla_deadline__gte=start, sla_deadline__lt=end)
        return qs

    def filter_state(self, qs, name, value):
        if value == "open":
            return qs.filter(status__in=OPEN)
        if value == "closed":
            return qs.exclude(status__in=OPEN)
        return qs


@extend_schema(tags=["tasks"])
class TaskViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
                  mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """Operational tasks with SLA deadlines, linked to an order or a quotation."""

    module = Module.TASKS
    permission_classes = [HasModulePermission]
    serializer_class = TaskSerializer
    filterset_class = TaskFilter
    search_fields = ["reference", "description", "order__reference", "quote__reference"]
    ordering_fields = ["sla_deadline", "created_at", "priority"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        qs = (
            Task.objects.select_related("order", "quote", "owner")
            .prefetch_related(Prefetch("activity", queryset=TaskActivity.objects.select_related("actor")))
            .order_by("sla_deadline", "id")
        )
        # Open tasks only, unless asked otherwise (the design lists work still to do).
        if self.action == "list" and "state" not in self.request.query_params and \
                "status" not in self.request.query_params:
            qs = qs.filter(status__in=OPEN)
        return qs

    def _respond(self, task, code=status.HTTP_200_OK):
        return Response(TaskSerializer(self.get_queryset().get(pk=task.pk)).data, status=code)

    @extend_schema(request=TaskCreateSerializer, responses={201: TaskSerializer})
    def create(self, request, *args, **kwargs):
        s = TaskCreateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        task = run(services.create_task, user=request.user, request=request, **s.validated_data)
        return self._respond(task, status.HTTP_201_CREATED)

    @extend_schema(request=TaskUpdateSerializer)
    def partial_update(self, request, *args, **kwargs):
        task = self.get_object()
        s = TaskUpdateSerializer(data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        if task.status not in OPEN_STATUSES:
            raise ConflictError("Reopen the task before editing it.")
        before = snapshot(task)
        for key, value in s.validated_data.items():
            setattr(task, key, value)
        task.save()
        changes = diff(before, snapshot(task))
        if changes:
            record_audit(action="update", request=request, instance=task, changes=changes)
        return self._respond(task)

    def update(self, request, *args, **kwargs):
        return self.partial_update(request, *args, **kwargs)

    @extend_schema(request=TaskStatusSerializer)
    @action(detail=True, methods=["post"], url_path="status")
    def change_status(self, request, pk=None):
        s = TaskStatusSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        target = s.validated_data["status"]
        task = self.get_object()
        reopening = task.status in (TaskStatus.COMPLETED, TaskStatus.CANCELLED)
        if (target == TaskStatus.CANCELLED or reopening) and not has_access(request.user, Module.TASKS, Access.MANAGE):
            raise PermissionDenied("Cancelling or reopening a task requires Tasks manage access.")
        task = run(services.change_status, task, target, user=request.user, note=s.validated_data["note"],
                   request=request)
        return self._respond(task)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        task = run(services.change_status, self.get_object(), TaskStatus.COMPLETED, user=request.user,
                   note=request.data.get("note", ""), request=request)
        return self._respond(task)

    @extend_schema(request=TaskAssignSerializer)
    @action(detail=True, methods=["post"])
    def assign(self, request, pk=None):
        s = TaskAssignSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        task = run(services.assign, self.get_object(), s.validated_data["owner"], user=request.user, request=request)
        return self._respond(task)

    @extend_schema(request=NoteSerializer, responses=ActivitySerializer(many=True))
    @action(detail=True, methods=["get", "post"])
    def notes(self, request, pk=None):
        task = self.get_object()
        if request.method == "POST":
            s = NoteSerializer(data=request.data)
            s.is_valid(raise_exception=True)
            run(services.add_note, task, s.validated_data["body"], user=request.user)
        rows = task.activity.filter(kind=TaskActivity.Kind.NOTE).select_related("actor")
        return Response(ActivitySerializer(rows, many=True).data, status=201 if request.method == "POST" else 200)

    @extend_schema(responses=ActivitySerializer(many=True))
    @action(detail=True)
    def activity(self, request, pk=None):
        return Response(ActivitySerializer(self.get_object().activity.select_related("actor"), many=True).data)

    @action(detail=False)
    def stats(self, request):
        now = timezone.now()
        start, end = _today_bounds()
        return Response(Task.objects.filter(status__in=OPEN).aggregate(
            mine=Count("id", filter=Q(owner=request.user)),
            unassigned=Count("id", filter=Q(owner__isnull=True)),
            overdue=Count("id", filter=Q(sla_deadline__lt=now)),
            due_today=Count("id", filter=Q(sla_deadline__gte=start, sla_deadline__lt=end)),
            total=Count("id"),
        ))

    @action(detail=False)
    def owners(self, request):
        qs = User.objects.filter(is_active=True).order_by("full_name")
        return Response([{"id": u.id, "full_name": u.full_name, "staff_level": u.staff_level,
                          "role": u.get_department_display()} for u in qs])
