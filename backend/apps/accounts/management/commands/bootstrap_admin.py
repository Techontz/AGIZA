from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core.management.base import BaseCommand, CommandError

from apps.accounts.constants import Department, StaffLevel
from apps.accounts.models import User


class Command(BaseCommand):
    help = "Create the first Top Admin from BOOTSTRAP_ADMIN_* environment variables (idempotent)."

    def handle(self, *args, **options):
        email = (settings.BOOTSTRAP_ADMIN_EMAIL or "").strip().lower()
        password = settings.BOOTSTRAP_ADMIN_PASSWORD
        if not email or not password:
            raise CommandError("Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD first.")
        if User.objects.filter(email=email).exists():
            self.stdout.write(self.style.WARNING(f"{email} already exists; nothing to do."))
            return
        validate_password(password)
        User.objects.create_superuser(
            email=email,
            password=password,
            full_name=settings.BOOTSTRAP_ADMIN_NAME,
            staff_level=StaffLevel.TOP_ADMIN,
            department=Department.MANAGEMENT,
        )
        self.stdout.write(self.style.SUCCESS(f"Top Admin {email} created."))
