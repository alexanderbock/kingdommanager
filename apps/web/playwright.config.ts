import { defineConfig } from '@playwright/test';

const port = 3111;

export default defineConfig({
  testDir: './test/e2e',
  timeout: 30_000,
  // Tests share one database, so run them one at a time.
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
  },
  webServer: {
    // Production server (serves the built web app) against a throwaway DB.
    // Single node process (no npx/tsx wrapper) so Playwright can kill it
    // reliably on Windows and the DB file is not left locked.
    command: 'node --import tsx server/src/index.ts',
    cwd: '..',
    env: {
      PORT: String(port),
      BASE_PATH: '/',
      DB_PATH: '../data/e2e-playwright.sqlite',
      // Recreate the database on every run so tests start from the seed.
      FRESH_DB: '1',
      LOG_LEVEL: 'warn',
    },
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});