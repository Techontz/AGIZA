"""Import the old AGIZA cargo system's database (see apps/core/legacy_import.py)."""
import os
from urllib.parse import quote

from django.core.management.base import BaseCommand
from django.db import connection, transaction


class DryRun(Exception):
    pass


class Command(BaseCommand):
    help = "Bring customers, orders, payments, invoices, chats and staff from the old AGIZA cargo database."

    def add_arguments(self, parser):
        parser.add_argument("--legacy-url", default=os.environ.get("LEGACY_DATABASE_URL", ""),
                            help="mysql://user:password@host:port/agizasto_cargo8 (or LEGACY_DATABASE_URL). "
                                 "Without it, the old tables are read from this database with the old_ prefix "
                                 "(load agiza-old-data.sql first).")
        parser.add_argument("--legacy-media", default="", help="The old app's media folder (shop product photos)")
        parser.add_argument("--skip-photos", action="store_true", help="Don't download order photos from Cloudinary")
        parser.add_argument("--dry-run", action="store_true", help="Do everything, then undo it (a full rehearsal)")

    def handle(self, *args, **opts):
        from apps.core.legacy_import import Importer

        url, prefix = opts["legacy_url"], ""
        if not url:
            db = connection.settings_dict
            url = (f"mysql://{quote(db['USER'], safe='')}:{quote(db['PASSWORD'], safe='')}"
                   f"@{db['HOST'] or 'localhost'}:{db['PORT'] or 3306}/{db['NAME']}")
            prefix = "old_"
            with connection.cursor() as cur:
                cur.execute("SHOW TABLES LIKE 'old_ujenzi_laguage'")
                if not cur.fetchone():
                    self.stderr.write("The old tables aren't in this database: import agiza-old-data.sql first "
                                      "(or give --legacy-url).")
                    return
        importer = Importer(url, media_dir=opts["legacy_media"],
                            download_images=not opts["skip_photos"] and not opts["dry_run"],
                            log=self.stdout.write, table_prefix=prefix)
        result = None
        try:
            with transaction.atomic():
                result = importer.run()
                if opts["dry_run"]:
                    raise DryRun
        except DryRun:
            pass
        title = "DRY RUN — nothing was saved" if opts["dry_run"] else "Imported"
        self.stdout.write(self.style.SUCCESS(title))
        for name, n in sorted(result["counts"].items()):
            self.stdout.write(f"  {name}: {n}")
        if result["warnings"]:
            self.stdout.write(self.style.WARNING(f"{len(result['warnings'])} warning(s):"))
            for w in result["warnings"][:200]:
                self.stdout.write(f"  - {w}")
            if len(result["warnings"]) > 200:
                self.stdout.write(f"  … and {len(result['warnings']) - 200} more")
