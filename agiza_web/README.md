# agiza_web — the AGIZA public website

The customer-facing AGIZA marketplace on the web: browse and search products from AGIZA and
approved vendors, open store pages, check out, track orders, request Buy for me / Deliver for
me, and — for vendors — apply to sell and run a store. It is **not** the staff admin
(`agiza_admin`).

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · TanStack Query. The design
is the customer app's (`agiza_mobile/src/theme/tokens.ts`): Outfit, the flame orange
`#C24A04` / `#E25805` with amber, ink `#181818`, white 16px-radius cards on `#F6F7F9`.

## How it talks to the backend

There is one backend (`backend/`, Django). This site never implements business rules:

```
Browser ──► agiza_web (Next.js) ──► Django /api/app/…
            • pages: public catalogue rendered on the server (indexable, cached 60 s; searches 15 s)
            • /api/proxy/*: signed-in requests, customer JWTs in httpOnly cookies
            • /api/auth/*: sign-in, registration, sign-out, session
            • /img/*: product and store images streamed from the API, resized by next/image
```

- Prices, stock, delivery options and fees (Shipping Engine), totals, commission and payment
  state all come from the API. Checkout uses the same `checkout/preview` and
  `checkout/place-order` endpoints as the app (idempotency key, `expected_total`).
- Visitors can browse, search and fill a cart without an account. The browser cart holds only
  variant ids and quantities and is priced by `POST cart/guest/`; at sign-in it is merged into
  the account's cart (`POST cart/merge/`). Checkout, account and seller pages need a session.
- Orders placed here are recorded with channel "Online store" (`X-Agiza-Channel: web`).

## Pages

| Area | Routes |
|---|---|
| Shop | `/`, `/shop` (search `q`, `sort`, `min`/`max`, `deals`, `featured`, `page`), `/category/[slug]`, `/product/[id]/[slug]`, `/stores`, `/store/[slug]` |
| Buying | `/cart`, `/checkout`, `/login`, `/register`, `/forgot-password` |
| Account | `/account`, `/account/orders`, `/account/orders/[reference]`, `/account/addresses`, `/account/requests`, `/account/support` |
| Services | `/buy-for-me`, `/deliver-for-me` |
| Selling | `/sell`, `/sell/apply`, `/seller` (dashboard), `/seller/products`, `/seller/products/new`, `/seller/products/[id]`, `/seller/orders`, `/seller/orders/[id]`, `/seller/earnings`, `/seller/store` |
| Info | `/about`, `/contact`, `/faq`, `/privacy`, `/terms` |
| SEO | `/sitemap.xml`, `/robots.txt`, `/manifest.webmanifest`; per-page metadata, canonical URLs, Open Graph, JSON-LD (Organization, WebSite search, Product, Store, BreadcrumbList, FAQPage) |

The privacy and terms texts describe how the platform works; AGIZA should have them reviewed
before launch.

## Setup

```bash
pnpm install
cp .env.example .env.local   # DJANGO_API_URL, NEXT_PUBLIC_SITE_URL, STOREFRONT_SERVER_KEY…
pnpm dev                     # http://localhost:3200
```

| Variable | Meaning |
|---|---|
| `DJANGO_API_URL` | Django API base (…/api), server-side only |
| `NEXT_PUBLIC_SITE_URL` | Public URL of this site (canonical links, sitemap, Open Graph) |
| `STOREFRONT_SERVER_KEY` | Same value as the backend's; lets server rendering skip the per-visitor anonymous rate limit on public reads |
| `SESSION_COOKIE_SECURE` | `true` in production (HTTPS) |
| `NEXT_PUBLIC_ANDROID_APP_URL`, `NEXT_PUBLIC_IOS_APP_URL` | Optional store links (hidden when empty) |
| `NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_SUPPORT_PHONE` | Contact details shown on the site (phone hidden when empty) |

## Checks

```bash
pnpm typecheck && pnpm lint && pnpm build
pnpm build && pnpm start      # then, with Django + demo data running:
pnpm test:e2e                 # Playwright: desktop + Pixel 7 (BASE_URL defaults to :3200)
node scripts/shots.mjs <dir> / /shop   # screenshots at phone/desktop widths (SIZES=mobile,tablet,laptop,desktop)
```

## Production

`pnpm install --frozen-lockfile && pnpm build` produces `.next/standalone`. Copy `.next/static`
to `.next/standalone/.next/static` and `public` to `.next/standalone/public`, then run
`node .next/standalone/server.js` (port via `PORT`) behind the TLS proxy with the variables
above. Django only needs to be reachable from this server.
