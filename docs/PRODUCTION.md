# AGIZA — production runbook

How to configure, deploy, upgrade, monitor, back up and roll back the AGIZA platform: one Django/MySQL
backend (`backend/`) serving the staff admin (`agiza_admin/`), the public website (`agiza_web/`) and the
customer app (`agiza_mobile/`). Nothing here requires a second backend or database.

## 1. Environment variables

Templates: `backend/.env.example`, `agiza_web/.env.example`, `agiza_admin/.env.example`,
`agiza_mobile/.env.example`. Never commit the real files.

### Backend (Django)

| Variable | Production value | Notes |
|---|---|---|
| `DJANGO_SETTINGS_MODULE` | `config.settings.prod` | Set in the process environment (systemd / gunicorn). |
| `DJANGO_ENV` | `production` | The dev settings refuse to start when this is set, so a wrong settings module fails loudly. |
| `DJANGO_SECRET_KEY` | long random value | `python -c "import secrets; print(secrets.token_urlsafe(64))"` |
| `DJANGO_DEBUG` | `false` | |
| `DJANGO_ALLOWED_HOSTS` | the API host(s) | Required. `*`, `localhost` and `127.0.0.1` are refused. |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | `https://…` | |
| `DJANGO_ADMIN_URL` | a non-default path | `admin/` is refused. |
| `DJANGO_NUM_PROXIES` | e.g. `2` | Next.js server + nginx. Wrong values break per-IP rate limits. |
| `DATABASE_URL` | `mysql://…/agiza` | MySQL 8, utf8mb4 / utf8mb4_0900_ai_ci. |
| `MEDIA_ROOT` or `DJANGO_FILE_STORAGE` + `AWS_*` | | Uploaded files are private and streamed through authenticated views. |
| `STOREFRONT_SERVER_KEY` | long random value | Same value in agiza_web. Lets server rendering skip the anonymous per-IP limit. |
| `THROTTLE_*_RATE` | defaults in `.env.example` | Login, OTP, checkout, anonymous, reviews, returns, uploads, support, seller applications. |
| `BEEM_API_KEY`, `BEEM_SECRET_KEY`, `BEEM_SENDER_ID` | | Required for customer registration and password reset (OTP SMS). |
| `SELCOM_*` | | Mobile money / card checkout. Offered only when all are set. |
| `EXPO_PUSH_ENABLED` | `true` | Push notifications to the customer app. |
| `EMAIL_*`, `DEFAULT_FROM_EMAIL` | | Email notifications and campaigns. |
| `SENTRY_DSN`, `SENTRY_ENVIRONMENT` | optional | Needs `pip install sentry-sdk`. Personal data is not sent. |
| `LOG_LEVEL` | `INFO` | |

OTP codes are never written to the log in production (`OTP_LOG_CODES` is forced off in `config.settings.prod`).

### Website (agiza_web)

| Variable | Production value | Notes |
|---|---|---|
| `DJANGO_API_URL` | internal URL of Django, ending in `/api` | Server-side only. |
| `NEXT_PUBLIC_SITE_URL` | `https://…` | **Required**: the production build fails without it (canonical links, sitemap, Open Graph). |
| `STOREFRONT_SERVER_KEY` | same as the backend | |
| `SESSION_COOKIE_SECURE` | leave unset | Cookies are Secure automatically in production builds. Set `false` only to test a production build over plain http. |
| `NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_SUPPORT_PHONE`, `NEXT_PUBLIC_*_APP_URL` | optional | |

### Admin (agiza_admin)

| Variable | Production value |
|---|---|
| `DJANGO_API_URL` | internal URL of Django, ending in `/api` |
| `SESSION_COOKIE_SECURE` | leave unset (Secure by default in production builds) |

### Customer app (agiza_mobile)

| Variable | Production value |
|---|---|
| `EXPO_PUBLIC_API_URL` | `https://<api host>/api` (release builds refuse to start without it) |

There is no `eas.json` yet. Create EAS build profiles that set `EXPO_PUBLIC_API_URL` before building releases.

## 2. First deployment

1. Database: create the MySQL database and a user with privileges on it.
2. Backend:
   1. `pip install -r requirements/prod.txt -r requirements/mysql.txt`
   2. `python manage.py migrate`
   3. `python manage.py collectstatic --noinput`
   4. `python manage.py bootstrap_admin`
   5. `python manage.py check --deploy` must report no issues.
   6. Run `gunicorn config.wsgi --workers 3 --bind 127.0.0.1:8000` behind nginx (TLS, `client_max_body_size 50m`).
3. Configuration in the admin (data, not code): shipping methods and rules, cities, warehouses and pickup
   points, marketplace settings (commission, return window, payout schedule, review publishing).
   Delivery fees come from shipping rules only: for example, Dar es Salaam → Dar es Salaam by rider is rule
   #20 (800 TZS/kg, minimum TZS 3,000). No fee is hard-coded.
4. Website and admin: `pnpm install --frozen-lockfile && pnpm build`, then run the standalone servers
   behind the same TLS proxy (see README).
5. Scheduled jobs: `evaluate_tag_rules` hourly and `send_due_notifications` every 5 minutes.

## 3. Upgrading an existing installation

1. **Back up first** (section 5).
2. Deploy the new code and run `python manage.py migrate`. The production-readiness migrations are additive,
   and their data steps are idempotent:
   - `marketplace.0002_production_readiness` builds the vendor ledger from existing settlements and payouts
     (earning rows for payable/settled parts, payout rows for recorded payouts).
   - `orders.0008_refund_adjustments` adds an explicit order adjustment for every refund recorded through
     Returns before this release. Those refunds had left the refunded amount showing as "balance due".
3. `python manage.py check --deploy`, then restart gunicorn and the Next.js servers.
4. Check `/api/health/` and do a smoke test: sign in to the admin, open the website, and place a
   pay-on-delivery test order on staging.

## 4. Health checks and monitoring

| Endpoint | Meaning |
|---|---|
| `GET /api/health/live/` | Liveness: the process answers. No database call. |
| `GET /api/health/` | Readiness: the database is reachable (200), otherwise 503 with no internal details. |

- **Logs:** Django logs to stdout in the format `time level logger message`. Money and workflow events are
  logged at INFO: ledger postings, payouts, refunds, return status changes, fulfilment problems, and
  checkout refusals. Phone numbers are masked.
- **Errors:** unhandled errors return `{"error": {"code", "message", "details"}}` with no stack trace, and
  go to Sentry when `SENTRY_DSN` is set.
- **Alert on:** readiness failing, a 5xx rate above normal, repeated `Readiness check failed`, payouts
  stuck in `processing`, and pickups marked `failed`. Staff are notified of failed pickups in-app.

## 5. Backup, restore and rollback

**Back up the database and the media storage together.**

```bash
# Consistent MySQL dump (InnoDB), compressed, kept off the server
mysqldump --single-transaction --routines --triggers --set-gtid-purged=OFF \
  -h DB_HOST -u BACKUP_USER -p agiza | gzip > agiza-$(date +%F-%H%M).sql.gz
# Media (if on local disk)
tar czf agiza-media-$(date +%F-%H%M).tgz -C /var/lib/agiza media
```

- **Schedule:** at least daily, plus before every deployment. Keep 30 days. Test a restore monthly on a
  staging server.
- **Restore:**
  1. Stop gunicorn.
  2. Restore into an empty database: `gunzip -c dump.sql.gz | mysql -u … agiza`.
  3. Restore the media archive.
  4. Run `python manage.py migrate` (no-op if the code matches) and start the services.
- **Rolling back code:** prefer a fix forward. Some tables gained required columns in this release, such
  as a payout's status. Django keeps defaults in the code, not in the database, so the previous release
  can fail when it writes to those tables. To go back to the previous release, restore the pre-deployment
  backup together with it. Never reverse migrations that created financial records.
- **Rolling back data:** restore the pre-deployment backup. This loses anything recorded since, including
  orders and payments, so it is a last resort and needs a business decision.

## 6. Money operations

- **Customer payments:** Selcom checkout. A payment is always confirmed with Selcom's order-status API before
  it is recorded, so an unsigned or forged callback can't mark an order paid. Webhook signature
  verification is optional for that reason. Pay on delivery is recorded by staff.
- **Refunds (manual; no automatic refund API is used):**
  1. The customer asks for a return.
  2. AGIZA approves it and the refund becomes pending.
  3. Finance pays the customer outside the system (M-Pesa / bank).
  4. Finance closes the return with the method and transaction reference.

  Closing records the refund on the order, lowers the order total with an explicit adjustment, and posts
  a refund debit to the seller's ledger.
- **Seller payouts:**
  1. Prepare a payout batch. It includes only sellers with a positive payable balance, one processing
     payout per seller.
  2. Transfer each payout outside the system.
  3. Mark each payout paid with its transaction reference, or failed with a reason.

  Paid payouts can be reversed with a reason. A refund made after a seller was paid becomes a negative
  balance, deducted from future earnings. Ledger rows are never edited or deleted; corrections are new rows.
- **Reconciliation:** E-commerce → Vendor Earnings & Payouts shows gross, commission, refunds to
  customers, payable to vendors and paid to vendors. `apps/marketplace/tests` asserts these always
  reconcile with the ledger.

## 7. Go-live checklist

- [ ] All environment variables set per section 1. `check --deploy` is clean. The website build succeeds
      with `NEXT_PUBLIC_SITE_URL`.
- [ ] TLS on every public host. Django is not public, except the payment and chat webhooks if used.
- [ ] Beem sender ID approved; one real OTP delivered to a staff phone.
- [ ] Selcom production credentials set and server IP whitelisted; one small real payment made and
      refunded (with approval).
- [ ] Shipping rules, cities, warehouses and pickup points reviewed. Rule #20 (Dar → Dar rider) confirmed.
- [ ] Marketplace settings reviewed: commission tiers, return window, payout schedule, review publishing.
- [ ] Legal pages approved by management / legal, and the "Draft" notice removed.
- [ ] Backups scheduled and one restore tested.
- [ ] Monitoring on `/api/health/` and error tracking (Sentry) enabled.
- [ ] Mobile release built with the production `EXPO_PUBLIC_API_URL` (EAS profile), tested on a device.
- [ ] Test data removed (listed in the production-readiness report) after approval.
