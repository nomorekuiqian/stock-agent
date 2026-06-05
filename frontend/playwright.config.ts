import { defineConfig, devices } from '@playwright/test';

const authFile = 'e2e/.auth/user.json';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    // Setup: login once and save cookies for authenticated tests
    {
      name: 'auth-setup',
      testMatch: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Default: tests that don't need authentication
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /auth\.setup\.ts/,
      grepInvert: /@auth/,
    },
    // Authenticated: tests that need a logged-in session
    {
      name: 'authenticated',
      use: {
        ...devices['Desktop Chrome'],
        storageState: authFile,
      },
      grep: /@auth/,
      dependencies: ['auth-setup'],
    },
  ],
  webServer: {
    command: 'E2E_AUTH_MOCK=1 npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
