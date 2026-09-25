import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests run against an ISOLATED stack started here:
 *   Django  :8001 on a fresh `agiza_e2e` database (demo data loaded)
 *   Next.js :3001 (the production build) pointing at it
 * so development data is never touched. Build first: `pnpm build`.
 */
const PORT = 3001;
export const E2E_BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;
process.env.E2E_BASE_URL = E2E_BASE_URL;
process.env.E2E_EMAIL ??= "e2e.admin@agiza.test";
process.env.E2E_PASSWORD ??= "E2e-Admin-Passw0rd!";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: E2E_BASE_URL, trace: "retain-on-failure" },
  webServer: [
    {
      command: "sh e2e/start-backend.sh",
      url: "http://127.0.0.1:8001/api/health/",
      timeout: 180_000,
      reuseExistingServer: false,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      command: `DJANGO_API_URL=http://127.0.0.1:8001/api node_modules/.bin/next start -p ${PORT}`,
      url: `${E2E_BASE_URL}/login`,
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "desktop",
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, storageState: "e2e/.auth/admin.json" },
    },
    {
      name: "mobile",
      dependencies: ["setup"],
      use: { ...devices["Pixel 7"], storageState: "e2e/.auth/admin.json" },
    },
  ],
});
