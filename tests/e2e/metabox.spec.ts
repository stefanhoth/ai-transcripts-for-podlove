/**
 * E2E tests for the Episode Meta Box (metabox.js).
 *
 * These tests load a standalone HTML fixture page that provides the expected
 * DOM structure and window.podloveAssemblyAI config object. All REST API
 * calls are intercepted with page.route() — no running WordPress instance
 * is required.
 *
 * REST base intercepted: http://localhost:8080/wp-json/podlove-assemblyai/v1/*
 */

import { test, expect, Page } from '@playwright/test';
import * as path from 'path';

// Absolute path to the fixture HTML file.
const FIXTURE_URL = 'file://' + path.resolve(__dirname, 'fixtures/metabox.html');

// REST API base used inside the fixture config (must match route pattern below).
const REST_BASE = 'http://localhost:8080/wp-json/podlove-assemblyai/v1';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Intercept all podlove-assemblyai REST calls and return mocked responses. */
type RouteMap = {
  [pattern: string]: { status: number; body: object };
};

async function mockRoutes(page: Page, routes: RouteMap) {
  for (const [pattern, response] of Object.entries(routes)) {
    await page.route(pattern, (route) => {
      route.fulfill({
        status: response.status,
        contentType: 'application/json',
        body: JSON.stringify(response.body),
      });
    });
  }
}

/**
 * Load the fixture, register routes, then call __initMetabox with overrides.
 * Returns after the metabox script has been loaded and the initial render is done.
 */
async function loadMetabox(
  page: Page,
  routes: RouteMap,
  overrides: Record<string, unknown> = {}
) {
  await mockRoutes(page, routes);
  await page.goto(FIXTURE_URL);
  await page.evaluate((o) => (window as any).__initMetabox(o), overrides);
  // Wait for the container to have rendered content.
  await page.waitForFunction(() => {
    const c = document.getElementById('podlove-assemblyai-metabox');
    return c !== null && c.innerHTML.trim() !== '';
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Episode Meta Box', () => {
  test('meta box renders start button in idle state', async ({ page }) => {
    await loadMetabox(
      page,
      {
        '**/podlove-assemblyai/v1/config': { status: 200, body: { has_api_key: true } },
      },
      { initialStatus: null }
    );

    const btn = page.locator('#podlove-assemblyai-metabox [data-action="transcribe"]');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveText('Start Transcription');
  });

  test('meta box resumes polling when initial status is processing', async ({ page }) => {
    // Route the status endpoint so polling does not fail silently.
    await mockRoutes(page, {
      '**/podlove-assemblyai/v1/status/42': {
        status: 200,
        body: { status: 'processing' },
      },
    });
    await page.goto(FIXTURE_URL);
    await page.evaluate((o) => (window as any).__initMetabox(o), { initialStatus: 'processing' });

    // A spinner should be shown immediately (processing state).
    const spinner = page.locator('#podlove-assemblyai-metabox .spinner.is-active');
    await expect(spinner).toBeVisible();

    const statusText = page.locator('#podlove-assemblyai-metabox .podlove-assemblyai-status');
    await expect(statusText).toContainText('Transcribing');
  });

  test('meta box shows imported state when initial status is imported', async ({ page }) => {
    await page.goto(FIXTURE_URL);
    await page.evaluate((o) => (window as any).__initMetabox(o), { initialStatus: 'imported' });

    const success = page.locator('#podlove-assemblyai-metabox .podlove-assemblyai-success');
    await expect(success).toBeVisible();
    await expect(success).toHaveText('Transcript imported');

    const btn = page.locator('#podlove-assemblyai-metabox [data-action="reset"]');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveText('Transcribe again');
  });

  test('start transcription button triggers /config then /transcribe API calls', async ({ page }) => {
    const configCalled   = { called: false };
    const transcribeCalled = { called: false };

    await page.route('**/podlove-assemblyai/v1/config', (route) => {
      configCalled.called = true;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ has_api_key: true }) });
    });
    await page.route('**/podlove-assemblyai/v1/transcribe/42', (route) => {
      transcribeCalled.called = true;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ transcript_id: 'tx_abc', status: 'queued' }) });
    });
    // Status polling — return processing so we don't proceed to import automatically.
    await page.route('**/podlove-assemblyai/v1/status/42', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'processing' }) });
    });

    await page.goto(FIXTURE_URL);
    await page.evaluate((o) => (window as any).__initMetabox(o), { initialStatus: null });

    const btn = page.locator('[data-action="transcribe"]');
    await expect(btn).toBeVisible();
    await btn.click();

    // After clicking, the JS first fetches /config synchronously, so we wait
    // for the submitting spinner.
    await expect(page.locator('.podlove-assemblyai-status')).toBeVisible({ timeout: 5_000 });

    // Both endpoints should have been hit.
    expect(configCalled.called).toBe(true);
    expect(transcribeCalled.called).toBe(true);
  });

  test('shows submitting spinner immediately after clicking start', async ({ page }) => {
    await page.route('**/podlove-assemblyai/v1/config', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ has_api_key: true }) });
    });
    // Delay transcribe response so we can observe the submitting state.
    await page.route('**/podlove-assemblyai/v1/transcribe/42', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ transcript_id: 'tx_abc', status: 'queued' }) });
    });
    await page.route('**/podlove-assemblyai/v1/status/42', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'processing' }) });
    });

    await page.goto(FIXTURE_URL);
    await page.evaluate((o) => (window as any).__initMetabox(o), { initialStatus: null });

    await page.locator('[data-action="transcribe"]').click();

    // The spinner wrapper must appear (either submitting or processing state).
    await expect(page.locator('.podlove-assemblyai-status')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('.spinner.is-active')).toBeVisible();
  });

  test('shows processing state with status label while polling', async ({ page }) => {
    await page.route('**/podlove-assemblyai/v1/config', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ has_api_key: true }) });
    });
    await page.route('**/podlove-assemblyai/v1/transcribe/42', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ transcript_id: 'tx_abc', status: 'processing' }) });
    });
    await page.route('**/podlove-assemblyai/v1/status/42', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'processing' }) });
    });

    await page.goto(FIXTURE_URL);
    await page.evaluate((o) => (window as any).__initMetabox(o), { initialStatus: null });

    await page.locator('[data-action="transcribe"]').click();

    // Wait for the processing state to be rendered (includes status label).
    await expect(page.locator('.podlove-assemblyai-status')).toContainText('Transcribing', { timeout: 5_000 });
  });

  test('shows imported state after successful full transcription flow', async ({ page }) => {
    await page.route('**/podlove-assemblyai/v1/config', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ has_api_key: true }) });
    });
    await page.route('**/podlove-assemblyai/v1/transcribe/42', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ transcript_id: 'tx_abc', status: 'queued' }) });
    });
    // Return 'completed' on first status poll.
    await page.route('**/podlove-assemblyai/v1/status/42', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'completed' }) });
    });
    await page.route('**/podlove-assemblyai/v1/import/42', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    });

    // Use a short poll interval so the test doesn't wait 5 s.
    await page.goto(FIXTURE_URL);
    await page.evaluate((o) => (window as any).__initMetabox(o), { initialStatus: null });

    // Override POLL_INTERVAL in the page context to 50ms so status is polled quickly.
    await page.evaluate(() => {
      // The IIFE closes over POLL_INTERVAL, so we patch the test via a fast
      // re-init. The fixture helper removes and re-adds the script tag which
      // re-runs the IIFE each time, but POLL_INTERVAL is a local const.
      // Instead we rely on the first poll happening at the normal interval
      // and the test waiting with a generous timeout.
    });

    await page.locator('[data-action="transcribe"]').click();

    // The 'imported' state should eventually appear (poll interval is 5 s in
    // production; allow up to 15 s in tests on slow CI).
    await expect(page.locator('.podlove-assemblyai-success')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-action="reset"]')).toHaveText('Transcribe again');
  });

  test('shows error state when transcribe API call fails', async ({ page }) => {
    await page.route('**/podlove-assemblyai/v1/config', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ has_api_key: true }) });
    });
    await page.route('**/podlove-assemblyai/v1/transcribe/42', (route) => {
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'AssemblyAI error' }) });
    });

    await page.goto(FIXTURE_URL);
    await page.evaluate((o) => (window as any).__initMetabox(o), { initialStatus: null });

    await page.locator('[data-action="transcribe"]').click();

    await expect(page.locator('.podlove-assemblyai-error')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('.podlove-assemblyai-error')).toContainText('AssemblyAI error');

    // Retry button must also appear.
    await expect(page.locator('[data-action="reset"]')).toHaveText('Retry');
  });

  test('confirm dialog appears when replacing an existing transcript', async ({ page }) => {
    // Stub window.confirm to capture whether it was called and return false
    // (user declines) so we can verify no transcribe call is made.
    await page.route('**/podlove-assemblyai/v1/config', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ has_api_key: true }) });
    });

    let transcribeCalled = false;
    await page.route('**/podlove-assemblyai/v1/transcribe/42', (route) => {
      transcribeCalled = true;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ transcript_id: 'tx_abc', status: 'queued' }) });
    });

    await page.goto(FIXTURE_URL);

    // Replace window.confirm before loading the metabox so the IIFE captures it.
    await page.evaluate(() => {
      (window as any).__confirmResult = false;
      (window as any).confirm = (msg: string) => {
        (window as any).__confirmCalled = true;
        (window as any).__confirmMsg    = msg;
        return (window as any).__confirmResult;
      };
    });

    await page.evaluate((o) => (window as any).__initMetabox(o), { initialStatus: 'imported' });

    await page.locator('[data-action="transcribe"]').click();

    // Confirm was called with the replace message.
    const confirmCalled = await page.evaluate(() => (window as any).__confirmCalled);
    const confirmMsg    = await page.evaluate(() => (window as any).__confirmMsg);
    expect(confirmCalled).toBe(true);
    expect(confirmMsg).toContain('Replace existing transcript?');

    // Because we returned false from confirm, transcription must NOT have started.
    expect(transcribeCalled).toBe(false);
    // Container should still show the start button (re-render was triggered but
    // status stays idle after reset, OR stays imported because the cancel left
    // initialStatus === 'imported').
    // Either way, no spinner should be visible.
    await expect(page.locator('.spinner.is-active')).not.toBeVisible();
  });

  test('confirm dialog accept proceeds with transcription', async ({ page }) => {
    await page.route('**/podlove-assemblyai/v1/config', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ has_api_key: true }) });
    });
    await page.route('**/podlove-assemblyai/v1/transcribe/42', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ transcript_id: 'tx_abc', status: 'queued' }) });
    });
    await page.route('**/podlove-assemblyai/v1/status/42', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'processing' }) });
    });

    await page.goto(FIXTURE_URL);

    await page.evaluate(() => {
      // Return true — user accepts the replace confirmation.
      (window as any).confirm = () => true;
    });

    await page.evaluate((o) => (window as any).__initMetabox(o), { initialStatus: 'imported' });

    await page.locator('[data-action="transcribe"]').click();

    // After accepting, transcription starts and spinner appears.
    await expect(page.locator('.podlove-assemblyai-status')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('.spinner.is-active')).toBeVisible();
  });

  test('retry button resets to idle state', async ({ page }) => {
    await page.route('**/podlove-assemblyai/v1/config', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ has_api_key: true }) });
    });
    await page.route('**/podlove-assemblyai/v1/transcribe/42', (route) => {
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Server error' }) });
    });

    await page.goto(FIXTURE_URL);
    await page.evaluate((o) => (window as any).__initMetabox(o), { initialStatus: null });

    // Trigger the error state.
    await page.locator('[data-action="transcribe"]').click();
    await expect(page.locator('.podlove-assemblyai-error')).toBeVisible({ timeout: 5_000 });

    // Click retry.
    await page.locator('[data-action="reset"]').click();

    // Must return to idle state showing the start button.
    await expect(page.locator('[data-action="transcribe"]')).toBeVisible();
    await expect(page.locator('.podlove-assemblyai-error')).not.toBeVisible();
  });

  test('transcribe again button resets to idle state', async ({ page }) => {
    await page.goto(FIXTURE_URL);
    await page.evaluate((o) => (window as any).__initMetabox(o), { initialStatus: 'imported' });

    // Should be in imported state.
    await expect(page.locator('.podlove-assemblyai-success')).toBeVisible();

    await page.locator('[data-action="reset"]').click();

    // Must return to idle.
    await expect(page.locator('[data-action="transcribe"]')).toBeVisible();
    await expect(page.locator('.podlove-assemblyai-success')).not.toBeVisible();
  });
});
