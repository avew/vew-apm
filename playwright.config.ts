import { defineConfig, devices } from "@playwright/test";

// E2E runs the real app against a throwaway SQLite DB on port 3100, with the
// scheduler disabled (no live network checks). The webserver command wipes +
// migrates the DB on start, so /setup is available and runs are deterministic.
const PORT = 3100;
// Use localhost (not 127.0.0.1): `next dev` treats a mismatched host as a
// cross-origin dev request and blocks the client bundle, so React never
// hydrates and forms fall back to native submits.
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // Generous per-test timeout: routes compile on first hit under `next dev`,
  // and the form specs retry through client hydration.
  timeout: 90_000,
  // Single admin + one shared SQLite DB → serialize to avoid setup/login races.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    // Creates the admin + signs in once, saving the session to reuse everywhere.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "npm run e2e:webserver",
    url: `${BASE_URL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
