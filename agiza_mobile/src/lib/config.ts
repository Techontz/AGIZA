import Constants from 'expo-constants';

/**
 * Base URL of the AGIZA API (".../api").
 *
 * Set EXPO_PUBLIC_API_URL in `.env` (see `.env.example`). In development, when it isn't set,
 * the app uses the computer running Metro: on a physical phone "127.0.0.1" would be the phone
 * itself, so the host is taken from the dev server address (e.g. 192.168.1.20:8081 → :8000).
 * Release builds must set EXPO_PUBLIC_API_URL (HTTPS).
 */
function resolveApiUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  if (__DEV__) {
    const host = Constants.expoConfig?.hostUri?.split(':')[0];
    if (host) return `http://${host}:8000/api`;
  }
  throw new Error('EXPO_PUBLIC_API_URL is not set. Copy .env.example to .env and set the API URL.');
}

export const API_URL = resolveApiUrl();
export const REQUEST_TIMEOUT_MS = 20_000;
