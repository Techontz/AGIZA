"""Re-evaluate every tag rule (schedule e.g. hourly: time-based conditions such as inactivity change daily)."""
from django.core.management.base import BaseCommand

from apps.parties.models import Customer
from apps.crm.services import evaluate_all, recompute_interests


class Command(BaseCommand):
    help = "Recompute customer interests and apply all tag rules."

    def add_arguments(self, parser):
        parser.add_argument("--skip-interests", action="store_true")

    def handle(self, *args, skip_interests=False, **options):
        if not skip_interests:
            for customer in Customer.objects.all().iterator():
                recompute_interests(customer)
        runs = evaluate_all(trigger="scheduled")
        self.stdout.write(self.style.SUCCESS(
            f"{len(runs)} rules applied: +{sum(r.added for r in runs)} / -{sum(r.removed for r in runs)} tags"))
