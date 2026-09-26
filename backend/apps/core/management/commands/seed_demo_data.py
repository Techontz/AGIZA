"""
Load (or remove) optional DEMO data based on the Figma Make design.

    python manage.py seed_demo_data              # load every demo set
    python manage.py seed_demo_data --only shipping
    python manage.py seed_demo_data --list       # what is currently demo data
    python manage.py seed_demo_data --flush      # remove all demo data

Safe to run repeatedly: existing rows are reused, never duplicated. Every row
the seeder creates is recorded in core.SeedRecord, which is how demo data is
told apart from real data. Refuses to run when DEBUG is off unless --force.
"""
from importlib import import_module

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Count

from apps.core.models import SeedRecord
from apps.core.seeding import flush as flush_seed

# name -> module exposing SEED, FLUSH_ORDER and seed(stdout). Order matters for loading.
SETS = {
    "shipping": "apps.shipping_engine.demo",
    "orders": "apps.orders.demo",
    "operations": "apps.demo.operations",
    "commerce": "apps.demo.commerce",
}
# "operations" moves the demo orders along their workflows, so the two are
# always removed together.
COUPLED = {"operations": {"orders"}, "orders": {"operations"}}


class Command(BaseCommand):
    help = "Load optional demo data (Figma examples). Idempotent; removable with --flush."

    def add_arguments(self, parser):
        parser.add_argument("--only", choices=list(SETS), action="append", help="Limit to these demo sets")
        parser.add_argument("--flush", dest="remove", action="store_true", help="Remove demo data instead of loading it")
        parser.add_argument("--list", dest="show", action="store_true", help="Show how many demo rows exist per model")
        parser.add_argument("--force", action="store_true", help="Allow running with DEBUG=False")

    def handle(self, *args, only=None, remove=False, show=False, force=False, **options):
        if show:
            rows = SeedRecord.objects.values("seed", "content_type__model").annotate(n=Count("id")).order_by("seed")
            for r in rows:
                self.stdout.write(f"{r['seed']:>10}  {r['content_type__model']:<20} {r['n']}")
            if not rows:
                self.stdout.write("No demo data loaded.")
            return
        if not settings.DEBUG and not force:
            raise CommandError("Refusing to touch demo data with DEBUG=False. Re-run with --force if intended.")

        names = only or list(SETS)
        if remove:
            # Removing a set also removes the sets loaded after it (they build on it).
            order = list(SETS)
            first = min(order.index(n) for n in names)
            chosen = set(names) | set(order[first:])
            for n in list(chosen):
                chosen |= COUPLED.get(n, set())
            dropped = chosen - set(names)
            if dropped:
                self.stdout.write(f"Also removing dependent demo sets: {', '.join(sorted(dropped))}")
            done: set[str] = set()
            for name in [n for n in reversed(order) if n in chosen]:
                if name in done:
                    continue
                mod = import_module(SETS[name])
                group = [name, *getattr(mod, "FLUSH_WITH", [])]
                seeds = [import_module(SETS[n]).SEED for n in group]
                with transaction.atomic():
                    removed = flush_seed(seeds, mod.FLUSH_ORDER)
                done.update(group)
                self.stdout.write(self.style.WARNING(f"[{' + '.join(group)}] removed: {removed or 'nothing'}"))
            return

        for name in names:
            mod = import_module(SETS[name])
            with transaction.atomic():
                seeder = mod.seed(self.stdout)
            self.stdout.write(self.style.SUCCESS(
                f"[{name}] demo data ready — {seeder.created} created, {seeder.existing} already present"
            ))

