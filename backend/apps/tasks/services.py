"""Task services: creation, status changes, ownership and notes, all recorded as activity."""
from __future__ import annotations

from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from apps.core.audit import record_audit
from apps.core.workflow import WorkflowError, check_transition

from .models import TASK_TRANSITIONS, Task, TaskActivity, TaskDepartment, TaskPriority, TaskStatus, TaskType

T = TaskStatus


def _lock(task: Task) -> Task:
    return Task.objects.select_for_update().get(pk=task.pk)


@transaction.atomic
def create_task(*, task_type: str, description: str, sla_deadline, user, department: str = TaskDepartment.UNASSIGNED,
                owner=None, order=None, quote=None, priority: str = TaskPriority.MEDIUM,
                status: str = T.IN_PROGRESS, request=None) -> Task:
    if order is not None and quote is not None:
        raise WorkflowError("Link a task to an order or a quotation, not both.", field="quote")
    if status not in (T.IN_PROGRESS, T.WAITING_FOR_CLIENT, T.WAITING_FOR_PAYMENT, T.BLOCKED, T.REVIEW_REQUIRED):
        raise WorkflowError("New tasks start in an open status.", field="status")
    task = Task.objects.create(task_type=task_type, description=description.strip(), sla_deadline=sla_deadline,
                               department=department, owner=owner, order=order, quote=quote, priority=priority,
                               status=status, created_by=user)
    TaskActivity.objects.create(task=task, kind=TaskActivity.Kind.CREATED, to_status=status, actor=user,
                                body="Task created")
    record_audit(action="create", request=request, actor=user, instance=task,
                 changes={"task_type": [None, task_type], "sla_deadline": [None, sla_deadline.isoformat()]})
    return task


@transaction.atomic
def change_status(task: Task, to_status: str, *, user, note: str = "", request=None) -> Task:
    task = _lock(task)
    check_transition(task.status, to_status, transitions=TASK_TRANSITIONS, choices=TaskStatus, subject=task.reference)
    from_status = task.status
    task.status = to_status
    fields = ["status", "updated_at"]
    if to_status == T.COMPLETED:
        task.completed_at = timezone.now()
        task.completed_by = user
        fields += ["completed_at", "completed_by"]
    elif from_status in (T.COMPLETED, T.CANCELLED):
        task.completed_at = None
        task.completed_by = None
        fields += ["completed_at", "completed_by"]
    task.save(update_fields=fields)
    TaskActivity.objects.create(task=task, kind=TaskActivity.Kind.STATUS, from_status=from_status,
                                to_status=to_status, body=note.strip(), actor=user)
    record_audit(action="status_change", request=request, actor=user, instance=task,
                 changes={"status": [from_status, to_status], **({"note": [None, note]} if note else {})})
    return task


@transaction.atomic
def assign(task: Task, owner, *, user, request=None) -> Task:
    task = _lock(task)
    if task.status in (T.COMPLETED, T.CANCELLED):
        raise WorkflowError("Reopen the task before changing its owner.", conflict=True)
    if owner is not None and not owner.is_active:
        raise WorkflowError(f"{owner.full_name} is inactive.", field="owner")
    previous = task.owner
    task.owner = owner
    task.save(update_fields=["owner", "updated_at"])
    TaskActivity.objects.create(task=task, kind=TaskActivity.Kind.OWNER, actor=user,
                                body=f"Owner: {previous.full_name if previous else 'Unassigned'} → "
                                     f"{owner.full_name if owner else 'Unassigned'}")
    record_audit(action="update", request=request, actor=user, instance=task,
                 changes={"owner": [previous.pk if previous else None, owner.pk if owner else None]})
    return task


def add_note(task: Task, body: str, *, user) -> TaskActivity:
    if not body.strip():
        raise WorkflowError("Write a note first.", field="body")
    note = TaskActivity.objects.create(task=task, kind=TaskActivity.Kind.NOTE, body=body.strip(), actor=user)
    Task.objects.filter(pk=task.pk).update(updated_at=timezone.now())
    return note


# --------------------------------------------------------------------------- #
# Automatic tasks
# --------------------------------------------------------------------------- #
QUOTE_SLA = timedelta(hours=24)


def open_quote_task(quote, user=None) -> Task | None:
    """Every new quotation request gets a Generate Quote task with a 24-hour SLA."""
    if Task.objects.filter(quote=quote, task_type=TaskType.GENERATE_QUOTE).exists():
        return None
    task = Task.objects.create(
        task_type=TaskType.GENERATE_QUOTE, quote=quote, department=TaskDepartment.SALES,
        sla_deadline=quote.created_at + QUOTE_SLA, priority=TaskPriority.MEDIUM,
        description=f"Generate quote for {quote.customer.full_name}: {quote.description[:200]}", created_by=user,
    )
    TaskActivity.objects.create(task=task, kind=TaskActivity.Kind.CREATED, to_status=task.status, actor=user,
                                body="Opened automatically for a new quotation request")
    return task


def complete_quote_tasks(quote, user, note: str):
    for task in Task.objects.filter(quote=quote, task_type=TaskType.GENERATE_QUOTE).exclude(
            status__in=(T.COMPLETED, T.CANCELLED)):
        change_status(task, T.COMPLETED, user=user, note=note)
