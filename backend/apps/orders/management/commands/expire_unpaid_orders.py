"""Cancel orders with imported items that weren't paid by their deadline (schedule every few minutes)."""
from django.core.management.base import BaseCommand

from apps.orders.expiry import expire_due


class Command(BaseCommand):
    help = "Cancel unpaid orders with imported items whose payment deadline has passed."

    def handle(self, *args, **options):
        expired = expire_due()
        self.stdout.write(self.style.SUCCESS(f"{len(expired)} unpaid order(s) expired{': ' + ', '.join(expired) if expired else ''}"))
