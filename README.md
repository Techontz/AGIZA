# AGIZA Platform

AGIZA is the operations and commerce platform for a Tanzanian logistics
business: international sourcing (China, Dubai, USA, UK, India), express
local deliveries, equipment support jobs, an e-commerce shop, warehouses,
finance, customers, campaigns and multi-channel customer chat. Staff use the
admin dashboard; customers use the mobile app. Both talk to the same backend.

| Folder | What |
|---|---|
| `backend/` | Django 5.2 + Django REST Framework API on MySQL 8 (PostgreSQL also supported) — the system of record for all data and business rules. Staff API at `/api/…`, customer app API at `/api/app/…` |
| `agiza_admin/` | Next.js 15 admin frontend (App Router, TypeScript, Tailwind v4, TanStack Query) |
| `agiza_mobile/` | Customer app: React Native, Expo SDK 57, Expo Router — see `agiza_mobile/README.md` |
| `docs/Delivery Management Dashboard/` | The Figma Make design source — the visual reference, never edited |
| `docs/cargo-main/`, `docs/agiza-server-main/` | Local-only copies of the previous staff portal and server (git-ignored references; contain credentials and data dumps) |

## Architecture

```
Browser ──► Next.js (pages + /api/auth + /api/proxy BFF) ──► Django REST API ──► PostgreSQL
              JWTs live only in httpOnly cookies              every rule, status change,
              (agiza_at / agiza_rt); the browser never        permission and calculation
              sees a token and never calls Django directly    is enforced here
```

- **Auth**: `POST /api/auth/login` (Next route handler) calls Django, stores the access/refresh JWTs in
  httpOnly, SameSite=Lax cookies. `/api/proxy/*` forwards requests to Django with the bearer token, refreshes
  it transparently (single-flight), and rejects cross-origin writes. Middleware redirects to `/login` without a session.
- **Permissions**: role-based (staff level × module → none / view / edit / manage), editable by a Top Admin in
  **Settings → Role Permissions**, enforced by Django on every request (`HasModulePermission`). Some data is
  readable through related modules (e.g. Finance can read quotations). Drivers only ever see their own deliveries.
- **Workflows**: every status change goes through a service function that checks the transition, locks the row,
  writes a history row (who / when / note) and an audit-log entry in one transaction. Statuses can't be edited
  directly (not even in the Django admin).
- **Files**: uploads are validated (type by content sniffing, 8 MB max) and served only through authenticated
  API views — never as public media URLs.

### Modules

| Area | Screens | Backend apps |
|---|---|---|
| Orders | Intake & Quotes, International, Express Delivery, E-commerce Shop Orders, Equipment Support | `quotes`, `orders` |
| Operations | Procurement, Shipping & Tracking, Deliveries, Returns, Tasks | `procurement`, `shipping`, `deliveries`, `returns`, `tasks` |
| Commerce | E-commerce Platform (products, variants, categories, brands, labels, options, vendors, store settings), Warehouse & Pick Up Points (locations, inventory, shop floor) | `catalog`, `inventory`, `locations` |
| Finance | Order payments & receipts, payments ledger, invoices (PDF), wallets, installment plans | `finance` (+ `orders.Payment`) |
| People & Support | People (customers, staff, drivers, shippers, shop vendors, service providers), customer detail, tags & interests, campaigns, Chat & Customer Support, notifications | `parties`, `accounts`, `crm`, `chat`, `notifications` |
| Platform | Shipping Engine (rate calculator), Reporting & Audit Logs, Settings (tag rules engine, role permissions, quick replies) | `shipping_engine`, `accounts`, `core` |

**International order flow:** Quote → approved into an order → payment → Procurement (supplier selected →
supplier paid) → goods Waiting to Receive → received at the consolidation warehouse (Ready for Shipment) →
consolidated Shipment (Booked → Loaded → Export Cleared → Shipping → Clearance → Completed) → last-mile
Delivery with proof of delivery → order Completed → Returns if needed. Each step moves the order's status; the
order can't be moved into those stages by hand.

## Requirements

- Python 3.11+, MySQL 8.0+ (or PostgreSQL 14+); the DB user needs rights on the `test_<name>` database to run tests
- Node.js 20+ and pnpm 10; for the mobile app also JDK 17 and the Android SDK

## Database

MySQL 8.0+ is the production database, and the full test suite runs on it (PostgreSQL is also supported and tested):
`pip install -r requirements/mysql.txt`, create the database as `utf8mb4` / `utf8mb4_0900_ai_ci`, and set
`DATABASE_URL=mysql://user:password@host:3306/dbname`. Strict mode, utf8mb4 and READ COMMITTED are configured
automatically; MySQL time-zone tables are not needed. MySQL's default collation compares text case- and
accent-insensitively, so unique names/codes that differ only by case (e.g. "DHL" and "dhl") are treated as equal.

### PostgreSQL setup

```bash
createuser agiza --pwprompt --createdb
createdb agiza --owner agiza
```

## Backend setup

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements/dev.txt
cp .env.example .env        # set DJANGO_SECRET_KEY, DJANGO_DEBUG=true, DATABASE_URL, BOOTSTRAP_ADMIN_*
.venv/bin/python manage.py migrate
.venv/bin/python manage.py bootstrap_admin          # first Top Admin, from BOOTSTRAP_ADMIN_*
.venv/bin/python manage.py runserver 127.0.0.1:8000
```

`manage.py` uses `config.settings.dev`; WSGI uses `config.settings.prod`. All secrets and host settings
come from environment variables (`backend/.env` locally) — see `backend/.env.example` for every variable.

### Migrations

```bash
.venv/bin/python manage.py makemigrations   # after model changes
.venv/bin/python manage.py migrate
```

Migrations are additive (data migrations only add rows, e.g. the procurement backfill).

### Scheduled jobs (cron / systemd timers)

```bash
.venv/bin/python manage.py evaluate_tag_rules        # hourly: interests + every tag rule (time-based conditions)
.venv/bin/python manage.py send_due_notifications    # every 5 min: chat follow-up reminders
```

## Frontend setup

```bash
cd agiza_admin
pnpm install
cp .env.example .env.local      # DJANGO_API_URL=http://127.0.0.1:8000/api, SESSION_COOKIE_SECURE=false
pnpm dev                        # http://localhost:3000
```

| Variable | Meaning |
|---|---|
| `DJANGO_API_URL` | Django API base URL, used server-side only (never sent to the browser) |
| `SESSION_COOKIE_SECURE` | `true` in production (HTTPS) so auth cookies get the Secure flag |

## Demo data

Optional demo data built from the Figma Make examples, created through the real workflows (so every record
has genuine history). Every demo row is registered in `core.SeedRecord`, which is how it is told apart
from real data; flushing removes exactly those rows and never touches real records. Refuses to run with
`DEBUG=False` unless `--force`.

```bash
cd backend
.venv/bin/python manage.py seed_demo_data                  # load all sets (safe to repeat)
.venv/bin/python manage.py seed_demo_data --only commerce  # shipping | orders | operations | commerce | people
.venv/bin/python manage.py seed_demo_data --list           # what is demo data right now
.venv/bin/python manage.py seed_demo_data --flush          # remove all demo data
```

Sets build on each other (shipping → orders → operations → commerce → people); flushing a set also flushes
the sets loaded after it. Demo staff (`@agiza.demo`) have unusable passwords.

## Customer app (agiza_mobile)

The app never prices anything itself: the backend computes item prices, stock, delivery options
and fees (Shipping Engine), totals and payment state. Orders placed in the app appear in
E-commerce Orders (filter Channel → Mobile app), customers in People, requests in Intake & Quotes
and messages in Chat.

```bash
# Backend reachable from devices
cd backend && .venv/bin/python manage.py runserver 0.0.0.0:8000
# (add 10.0.2.2 and/or the Mac's LAN IP to DJANGO_ALLOWED_HOSTS in backend/.env)

# App (Android emulator: agiza_mobile/.env → EXPO_PUBLIC_API_URL=http://10.0.2.2:8000/api)
cd agiza_mobile && npm install && npm run android
```

Customer registration sends an SMS code (Africa's Talking `SMS_AT_*`); with `DJANGO_DEBUG=true`
and no SMS configured the code is written to the backend log. Mobile-money checkout appears when
the `SELCOM_*` settings are present.

## Tests

```bash
# Backend: unit + API tests (pytest, isolated test database, temporary media folder)
cd backend && .venv/bin/pytest
.venv/bin/ruff check .                                    # lint

# Frontend
cd agiza_admin && pnpm typecheck && pnpm lint && pnpm build

# Browser tests (Playwright, desktop 1440px + Pixel 7). Starts its own isolated stack:
# Django on :8001 with a fresh `agiza_e2e` database (demo data loaded) + Next on :3001.
cd agiza_admin && pnpm build && pnpm test:e2e
# screenshots for review: E2E_SCREENSHOTS=/tmp/shots pnpm test:e2e
```

The backend suite includes an N+1 guard: every list endpoint must answer a page of the full demo data
with a bounded number of queries.

## API documentation

OpenAPI schema at `/api/schema/` and Swagger UI at `/api/docs/` (both require a signed-in staff session in
production). Error responses always have the shape `{"error": {"code", "message", "details"}}`; lists are
paginated as `{count, page, page_size, total_pages, results}` (`?page=&page_size=` up to 100).

## Storage configuration

Uploaded files (package photos, delivery signatures/photos, shipment documents, product images, brand logos)
use Django's default storage: local disk under `MEDIA_ROOT` by default. For S3-compatible storage, install
`django-storages[s3]` and set `DJANGO_FILE_STORAGE=storages.backends.s3.S3Storage` plus the `AWS_*`
variables (bucket, endpoint, region, keys). Files stay private and are streamed through authenticated views.

## Messaging channels

Email, SMS (Africa's Talking), WhatsApp Cloud API, Facebook Messenger and TikTok are wired but **disabled until
their credentials are set** (see `.env.example`). Without credentials, chat replies are saved with the delivery
status "stored (channel not connected)" and campaigns end as "Not sent — channel not configured"; nothing is
faked. Webhooks (`/api/chat/webhooks/{whatsapp,facebook,tiktok}/`) verify signatures and return 503 until configured.

## Production deployment

Backend
1. `pip install -r requirements/prod.txt` (gunicorn + whitenoise).
2. Environment: `DJANGO_SECRET_KEY`, `DJANGO_DEBUG=false`, `DJANGO_ALLOWED_HOSTS`, `DJANGO_CSRF_TRUSTED_ORIGINS`,
   `DATABASE_URL`, `DJANGO_NUM_PROXIES`, `MEDIA_ROOT` (or S3), `DJANGO_ADMIN_URL`, channel credentials as needed.
3. `python manage.py migrate && python manage.py collectstatic --noinput && python manage.py bootstrap_admin`
4. `python manage.py check --deploy` must report no issues.
5. Run `gunicorn config.wsgi --workers 3 --bind 127.0.0.1:8000` behind nginx (TLS, `client_max_body_size 50m`).
6. Schedule `evaluate_tag_rules` (hourly) and `send_due_notifications` (every 5 minutes).

Frontend
1. `pnpm install --frozen-lockfile && pnpm build` → standalone server in `.next/standalone`.
2. Environment: `DJANGO_API_URL` (internal URL of Django), `SESSION_COOKIE_SECURE=true`, `NODE_ENV=production`.
3. Run `node .next/standalone/server.js` (copy `.next/static` and `public` next to it) behind the same TLS proxy.

Django only needs to be reachable from the Next.js server; it doesn't need to be public (except the chat
webhooks, if channels are enabled). Back up PostgreSQL and the media storage.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Login fails with "Too many attempts" | Login is rate-limited (`THROTTLE_LOGIN_RATE`); wait a minute. Behind proxies, set `DJANGO_NUM_PROXIES` correctly. |
| Every page redirects to `/login` | The refresh cookie is missing/expired. With HTTPS disabled locally keep `SESSION_COOKIE_SECURE=false`. |
| Frontend shows "Network error" | Django isn't reachable at `DJANGO_API_URL` from the Next.js server. |
| Prices show "No exchange rate" | Set USD/AED/CNY → TSh rates in Shipping Engine → Settings. |
| `seed_demo_data` refuses to run | It only runs with `DJANGO_DEBUG=true` (or `--force`). |
| `pytest` can't create the test DB | Give the DB role `CREATEDB`. |
| E2E can't start | Port 8001/3001 in use, or `pnpm build` wasn't run first. |
| Chat replies show "stored" | The channel isn't connected — set its credentials. |
