"""Raise / clear the automatic exception flags on orders (schedule hourly)."""
from django.core.management.base import BaseCommand

from apps.orders.alerts import refresh_automatic


class Command(BaseCommand):
    help = "Flag orders stuck in procurement or close to their expected delivery date; clear flags that no longer apply."

    def handle(self, *args, **options):
        result = refresh_automatic()
        self.stdout.write(self.style.SUCCESS(f"{result['raised']} flag(s) raised, {result['resolved']} cleared"))
