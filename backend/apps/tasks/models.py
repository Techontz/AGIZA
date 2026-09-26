"""
Operational tasks with an owner, department and SLA deadline, optionally
linked to an order or a quotation. Activity (notes, status and owner changes)
is kept in TaskActivity.
"""
from django.conf import settings
from django.db import models
from django.db.models import Q

from apps.core.models import TimeStampedModel
from apps.core.references import next_reference


class TaskType(models.TextChoices):
    GENERATE_QUOTE = "generate_quote", "Generate Quote"
    VERIFY_PAYMENT = "verify_payment", "Verify Payment"
    ASSIGN_CARGO = "assign_cargo", "Assign Cargo"
    FOLLOW_UP_CLIENT = "follow_up_client", "Follow Up Client"
    CUSTOMS_CLEARANCE = "customs_clearance", "Customs Clearance"
    ARRANGE_DELIVERY = "arrange_delivery", "Arrange Delivery"
    QUALITY_CHECK = "quality_check", "Quality Check"
    PRICING_APPROVAL = "pricing_approval", "Pricing Approval"
    OTHER = "other", "Other"


class TaskStatus(models.TextChoices):
    IN_PROGRESS = "in_progress", "In Progress"
    WAITING_FOR_CLIENT = "waiting_for_client", "Waiting for Client"
    WAITING_FOR_PAYMENT = "waiting_for_payment", "Waiting for Payment"
    BLOCKED = "blocked", "Blocked"
    REVIEW_REQUIRED = "review_required", "Review Required"
    COMPLETED = "completed", "Completed"
    CANCELLED = "cancelled", "Cancelled"


OPEN_STATUSES = {
    TaskStatus.IN_PROGRESS, TaskStatus.WAITING_FOR_CLIENT, TaskStatus.WAITING_FOR_PAYMENT,
    TaskStatus.BLOCKED, TaskStatus.REVIEW_REQUIRED,
}
# Open tasks move freely between the open statuses; completing and
# cancelling are separate actions, and closed tasks can only be reopened.
TASK_TRANSITIONS = {s: (OPEN_STATUSES - {s}) | {TaskStatus.COMPLETED, TaskStatus.CANCELLED} for s in OPEN_STATUSES}
TASK_TRANSITIONS[TaskStatus.COMPLETED] = {TaskStatus.IN_PROGRESS}
TASK_TRANSITIONS[TaskStatus.CANCELLED] = {TaskStatus.IN_PROGRESS}


class TaskDepartment(models.TextChoices):
    UNASSIGNED = "unassigned", "Unassigned"
    SALES = "sales", "Sales"
    PROCUREMENT = "procurement", "Procurement"
    SHIPPING = "shipping", "Shipping"
    DELIVERY = "delivery", "Delivery"
    FINANCE = "finance", "Finance"
    SUPPORT = "support", "Support"
    WAREHOUSE = "warehouse", "Warehouse"


class TaskPriority(models.TextChoices):
    HIGH = "high", "High"
    MEDIUM = "medium", "Medium"
    LOW = "low", "Low"


class Task(TimeStampedModel):
    reference = models.CharField(max_length=20, unique=True, editable=False)
    task_type = models.CharField(max_length=20, choices=TaskType.choices)
    status = models.CharField(max_length=20, choices=TaskStatus.choices, default=TaskStatus.IN_PROGRESS,
                              db_index=True)
    priority = models.CharField(max_length=8, choices=TaskPriority.choices, default=TaskPriority.MEDIUM)
    order = models.ForeignKey("orders.Order", null=True, blank=True, on_delete=models.SET_NULL, related_name="tasks")
    quote = models.ForeignKey("quotes.QuoteRequest", null=True, blank=True, on_delete=models.SET_NULL,
                              related_name="tasks")
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                              related_name="tasks")
    department = models.CharField(max_length=12, choices=TaskDepartment.choices, default=TaskDepartment.UNASSIGNED)
    sla_deadline = models.DateTimeField(db_index=True)
    description = models.TextField()
    completed_at = models.DateTimeField(null=True, blank=True)
    completed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                     related_name="+")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="+")

    class Meta:
        ordering = ["sla_deadline", "id"]
        indexes = [models.Index(fields=["owner", "status"]), models.Index(fields=["department"])]
        constraints = [
            models.CheckConstraint(name="task_single_link", condition=Q(order__isnull=True) | Q(quote__isnull=True)),
        ]

    def __str__(self) -> str:
        return f"{self.reference} · {self.get_task_type_display()}"

    def save(self, *args, **kwargs):
        if not self.reference:
            self.reference = next_reference("TSK", width=3)
        super().save(*args, **kwargs)


class TaskActivity(models.Model):
    class Kind(models.TextChoices):
        NOTE = "note", "Note"
        STATUS = "status", "Status change"
        OWNER = "owner", "Owner change"
        CREATED = "created", "Created"

    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="activity")
    kind = models.CharField(max_length=10, choices=Kind.choices)
    body = models.TextField(blank=True)
    from_status = models.CharField(max_length=20, blank=True)
    to_status = models.CharField(max_length=20, blank=True)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                              related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]
        verbose_name_plural = "task activity"

    def __str__(self) -> str:
        return f"{self._meta.verbose_name} #{self.pk}"
