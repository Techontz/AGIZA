#!/bin/zsh
# Start the AGIZA stack on this Mac: MySQL 8.0 (:3308), Django (:8765), website (:3200), admin (:3000).
# Safe to run again: anything already running is left alone. Logs go to ./logs/.
#   ./scripts/start-local.sh            start (reuses existing website/admin builds)
#   ./scripts/start-local.sh --build    rebuild website and admin first
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOGS="$ROOT/logs"; mkdir -p "$LOGS"
listening() { lsof -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
wait_for() { for _ in $(seq 1 60); do listening "$1" && return 0; sleep 1; done; echo "  !! nothing on :$1 yet — see $LOGS"; }

echo "MySQL 8.0 :3308"
if listening 3308; then echo "  already running"; else
  /usr/local/opt/mysql@8.0/bin/mysqld --no-defaults --datadir=/usr/local/var/mysql80 --port=3308 \
    --socket=/tmp/mysql80.sock --bind-address=127.0.0.1 --log-error=/usr/local/var/mysql80/error.log \
    --character-set-server=utf8mb4 --collation-server=utf8mb4_0900_ai_ci >/dev/null 2>&1 &
  wait_for 3308
fi

echo "Django :8765"
if listening 8765; then echo "  already running"; else
  (cd "$ROOT/backend" && nohup .venv/bin/python manage.py runserver 0.0.0.0:8765 >> "$LOGS/django.log" 2>&1 &)
  wait_for 8765
fi

for app in agiza_web:3200 agiza_admin:3000; do
  dir=${app%%:*}; port=${app##*:}
  echo "$dir :$port"
  if listening "$port"; then echo "  already running"; continue; fi
  if [[ "$1" == "--build" || ! -d "$ROOT/$dir/.next" ]]; then
    echo "  building (a few minutes)…"; (cd "$ROOT/$dir" && pnpm -s build > "$LOGS/$dir-build.log" 2>&1) || { echo "  !! build failed — $LOGS/$dir-build.log"; continue; }
  fi
  (cd "$ROOT/$dir" && nohup pnpm start > "$LOGS/$dir.log" 2>&1 &)
  wait_for "$port"
done

IP=$(ipconfig getifaddr en1 2>/dev/null || ipconfig getifaddr en0 2>/dev/null)
echo
echo "Website  http://localhost:3200   (phone on the same Wi-Fi: http://$IP:3200)"
echo "Admin    http://localhost:3000"
echo "API      http://localhost:8765/api/health/   (phone: http://$IP:8765/api)"
