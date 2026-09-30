import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests for the public website. They run against a running stack (Django with the
 * demo data loaded, and this site): BASE_URL defaults to http://localhost:3200.
 *   pnpm build && pnpm start   # in another terminal
 *   pnpm test:e2e
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  // One worker: every test browses from the same IP, and the API's per-IP limit for anonymous
  // visitors would otherwise throttle the browser-side requests (as it should for a real crawler).
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: process.env.BASE_URL ?? "http://localhost:3200", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
