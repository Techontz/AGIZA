# AGIZA customer app

React Native (Expo SDK 57, Expo Router) app for AGIZA customers: shop, cart and checkout,
order tracking and payment, Buy for me / Deliver for me requests, and support chat.
It uses the unified AGIZA backend's customer API (`/api/app/`, see `backend/apps/storefront`).
Prices, stock, delivery costs and totals are always computed by the backend.

## Requirements

- Node.js 20+, JDK 17, Android SDK (`ANDROID_HOME=~/Library/Android/sdk`)
- The backend running and reachable from the phone:
  `cd ../backend && .venv/bin/python manage.py runserver 0.0.0.0:8000`

## Configuration

Copy `.env.example` to `.env`. `EXPO_PUBLIC_API_URL` is the API base URL including `/api`.
In development it can stay empty: the app then calls port 8000 on the computer running Metro,
which a phone on the same Wi-Fi reaches (a phone's own `127.0.0.1` is the phone itself).
Over USB you can instead run `adb reverse tcp:8000 tcp:8000` and set
`EXPO_PUBLIC_API_URL=http://127.0.0.1:8000/api`. Release builds need the public HTTPS URL.

## Run on an Android phone

```bash
npm install
adb devices                 # the phone must be listed as "device" (USB debugging allowed)
npm run android             # builds the development app, installs it and starts Metro
```

Later runs only need `npm start` (Metro) while the development app is installed.

## Checks

```bash
npm run lint && npm run typecheck && npm run doctor
```

## Push notifications

Order updates, quotations, payments and support replies are pushed with Expo. They need an
EAS project (`npx eas-cli@latest init`, which sets `extra.eas.projectId`) and Firebase
Cloud Messaging credentials for Android (`google-services.json`, uploaded with
`npx eas-cli@latest credentials`). Until then the app works normally without push.
