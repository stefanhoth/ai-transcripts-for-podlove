import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for AI Transcripts for Podlove plugin E2E tests.
 *
 * Tests use standalone HTML fixture pages that load the plugin JS directly,
 * so no running WordPress instance is required. The baseURL is used for
 * WordPress-integration tests that do require a live WP instance.
 *
 * Set WP_BASE_URL env var to override the default base URL.
 */
export default defineConfig({
  testDir: './tests/e2e',
  // Run tests serially — fixture-based tests don't share state, but
  // WP-integration tests would share WordPress state so we stay sequential.
  workers: 1,
  fullyParallel: false,

  // Retry once on CI to reduce flakiness from timing issues.
  retries: process.env.CI ? 1 : 0,

  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: process.env.WP_BASE_URL || 'http://localhost:8080',
    // Capture traces on first retry to aid debugging.
    trace: 'on-first-retry',
    // Capture screenshots on failure.
    screenshot: 'only-on-failure',
    // Reasonable timeout for WP admin page loads.
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },

  // Single chromium project — no cross-browser matrix needed for plugin tests.
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Global test timeout (covers slow WP boot on first load).
  timeout: 60_000,
});
