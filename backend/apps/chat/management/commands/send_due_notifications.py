"""Notify staff about chat follow-ups that are due (schedule every few minutes)."""
from django.core.management.base import BaseCommand

from apps.chat.services import due_follow_ups


class Command(BaseCommand):
    help = "Create notifications for due chat follow-ups."

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS(f"{due_follow_ups()} follow-up notifications created"))
