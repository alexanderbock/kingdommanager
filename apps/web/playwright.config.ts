import { defineConfig } from '@playwright/test';

const port = 3111;

export default defineConfig({
  testDir: './test/e2e',
  timeout: 30_000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
  },
  webServer: {
    // Production server (serves the built web app) against a throwaway DB.
    command: 'npx tsx server/src/index.ts',
    cwd: '..',
    env: {
      PORT: String(port),
      BASE_PATH: '/',
      DB_PATH: '../data/e2e-playwright.sqlite',
      LOG_LEVEL: 'warn',
    },
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});