#!/bin/sh
# Isolated backend for browser tests: a fresh `agiza_e2e` database on every run,
# so tests never touch development data. Started by playwright.config.ts.
set -e
cd "$(dirname "$0")/../../backend"
DEV_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-)
export DATABASE_URL=$(printf '%s' "$DEV_URL" | sed 's#/[^/]*$#/agiza_e2e#')
ADMIN_URL=$(printf '%s' "$DEV_URL" | sed 's#/[^/]*$#/postgres#')
case "$DEV_URL" in
  mysql*)
    # MySQL 8: recreate the database with the backend's own driver (no mysql CLI needed).
    .venv/bin/python - "$DEV_URL" <<'PY'
import sys
from urllib.parse import unquote, urlparse

import MySQLdb

u = urlparse(sys.argv[1])
db = MySQLdb.connect(host=u.hostname, port=u.port or 3306, user=unquote(u.username), passwd=unquote(u.password or ""))
cur = db.cursor()
cur.execute("DROP DATABASE IF EXISTS agiza_e2e")
cur.execute("CREATE DATABASE agiza_e2e CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci")
PY
    ;;
  *)
    psql "$ADMIN_URL" -q -c "DROP DATABASE IF EXISTS agiza_e2e WITH (FORCE)" -c "CREATE DATABASE agiza_e2e"
    ;;
esac
export DJANGO_DEBUG=true THROTTLE_LOGIN_RATE=200/min
export BOOTSTRAP_ADMIN_EMAIL="${E2E_EMAIL:-e2e.admin@agiza.test}"
export BOOTSTRAP_ADMIN_PASSWORD="${E2E_PASSWORD:-E2e-Admin-Passw0rd!}"
export BOOTSTRAP_ADMIN_NAME="E2E Admin"
.venv/bin/python manage.py migrate --noinput -v 0
.venv/bin/python manage.py bootstrap_admin
.venv/bin/python manage.py seed_demo_data
exec .venv/bin/python manage.py runserver 127.0.0.1:8001 --noreload
