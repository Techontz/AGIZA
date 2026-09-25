# AGIZA Platform

| Folder | What |
|---|---|
| `backend/` | Django 5.2 + DRF REST API, PostgreSQL — the system of record |
| `agiza_admin/` | Next.js 15 admin frontend (App Router, TypeScript, Tailwind v4) |
| `docs/Delivery Management Dashboard/` | Figma Make design source — reference only, never edited |

Browser → Next.js (pages + `/api/proxy` BFF, JWT kept in httpOnly cookies) → Django REST API → PostgreSQL.

## Backend

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements/dev.txt
cp .env.example .env            # then fill in DJANGO_SECRET_KEY, DATABASE_URL, BOOTSTRAP_ADMIN_*
.venv/bin/python manage.py migrate
.venv/bin/python manage.py bootstrap_admin     # creates the first Top Admin
.venv/bin/python manage.py runserver 127.0.0.1:8000
.venv/bin/pytest                               # tests (needs CREATEDB on the DB role)
```

API docs: http://127.0.0.1:8000/api/docs/ · Django admin: http://127.0.0.1:8000/admin/

## Frontend

```bash
cd agiza_admin
pnpm install
cp .env.example .env.local      # DJANGO_API_URL=http://127.0.0.1:8000/api
pnpm dev                        # http://localhost:3000
pnpm typecheck && pnpm lint && pnpm build
E2E_EMAIL=... E2E_PASSWORD=... pnpm test:e2e    # needs both servers running
```

## Production notes

- Backend: `DJANGO_SETTINGS_MODULE=config.settings.prod`, `gunicorn config.wsgi`, `pip install -r requirements/prod.txt`,
  `manage.py collectstatic`. Set `DJANGO_NUM_PROXIES` to the number of proxies in front of Django (e.g. nginx + Next = 2).
- Frontend: `SESSION_COOKIE_SECURE=true`; `pnpm build` produces a standalone server in `.next/standalone`.
- Django is only reached by the Next.js server; it does not need to be public.

## Shipping Engine (Phase 2)

All pricing lives in Django: `backend/apps/shipping_engine/calculator.py` (`RateCalculator`).
REST API under `/api/shipping-engine/`: `zones`, `routes`, `methods`, `profiles`, `rules`, `carriers`,
`overrides`, `exchange-rates`, `settings`, `overview`, `calculate` (see `/api/docs/`).

Before prices can be converted to TSh, set the USD (and, if used, AED/CNY) → TSh rates in
**Shipping Engine → Settings**. Rules priced in a currency without a rate return a clear error.
