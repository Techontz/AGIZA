"""In-app notifications for staff (assignments, escalations, follow-ups, approvals)."""
from django.conf import settings
from django.db import models


class Notification(models.Model):
    class Kind(models.TextChoices):
        ASSIGNMENT = "assignment", "Assignment"
        ESCALATION = "escalation", "Escalation"
        FOLLOW_UP = "follow_up", "Follow-up due"
        APPROVAL = "approval", "Approval needed"
        MESSAGE = "message", "New message"
        SYSTEM = "system", "System"

    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    kind = models.CharField(max_length=12, choices=Kind.choices)
    title = models.CharField(max_length=150)
    body = models.CharField(max_length=500, blank=True)
    link = models.CharField(max_length=255, blank=True, help_text="App path, e.g. /chat?open=12")
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["recipient", "read_at"])]

    def __str__(self) -> str:
        return f"{self.recipient_id}: {self.title}"
