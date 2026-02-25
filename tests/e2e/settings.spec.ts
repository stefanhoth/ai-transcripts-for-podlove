/**
 * E2E tests for the Settings / Batch Transcription page (settings.js).
 *
 * Tests load a standalone HTML fixture page that provides the expected DOM
 * structure and window.aiTranscriptsSettings config object. All REST
 * API calls are intercepted with page.route() — no running WordPress
 * instance is required.
 *
 * REST base intercepted: http://localhost:8080/wp-json/ai-transcripts-for-podlove/v1/*
 */

import { test, expect, Page } from '@playwright/test';
import * as path from 'path';

const FIXTURE_URL = 'file://' + path.resolve(__dirname, 'fixtures/settings.html');

// ---------------------------------------------------------------------------
// Sample episode data
// ---------------------------------------------------------------------------

const episodeWithAudioNoTranscript = {
  post_id: 1,
  title: 'Episode One',
  has_audio: true,
  has_transcript: false,
  assemblyai_status: null,
};

const episodeWithAudioAndTranscript = {
  post_id: 2,
  title: 'Episode Two',
  has_audio: true,
  has_transcript: true,
  assemblyai_status: 'imported',
};

const episodeNoAudio = {
  post_id: 3,
  title: 'Episode Three',
  has_audio: false,
  has_transcript: false,
  assemblyai_status: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Load the fixture, set up REST mocks, then call __initSettings.
 * Waits for the episode list (or no-episodes message) to appear.
 */
async function loadSettings(
  page: Page,
  episodesResponse: { status: number; body: unknown },
  overrides: Record<string, unknown> = {}
) {
  await page.route('**/ai-transcripts-for-podlove/v1/episodes', (route) => {
    route.fulfill({
      status: episodesResponse.status,
      contentType: 'application/json',
      body: JSON.stringify(episodesResponse.body),
    });
  });

  await page.goto(FIXTURE_URL);
  await page.evaluate((o) => (window as any).__initSettings(o), overrides);

  // Wait for loading state to be replaced.
  await page.waitForFunction(() => {
    const c = document.getElementById('ai-transcripts-for-podlove-batch');
    return c !== null && !c.innerHTML.includes('Loading episodes');
  }, { timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Settings Page', () => {
  test('shows loading message then episode list when API key is configured', async ({ page }) => {
    await loadSettings(page, { status: 200, body: [episodeWithAudioNoTranscript, episodeWithAudioAndTranscript] });

    // Episode titles should be visible in the table.
    await expect(page.locator('text=Episode One')).toBeVisible();
    await expect(page.locator('text=Episode Two')).toBeVisible();

    // Toolbar buttons should be present.
    await expect(page.locator('[data-action="select-all"]')).toBeVisible();
    await expect(page.locator('[data-action="select-without"]')).toBeVisible();
    await expect(page.locator('[data-action="deselect-all"]')).toBeVisible();

    // Batch transcribe button must be present.
    await expect(page.locator('[data-action="batch-transcribe"]')).toBeVisible();
  });

  test('shows no-episodes message when episode list is empty', async ({ page }) => {
    await loadSettings(page, { status: 200, body: [] });

    await expect(page.locator('#ai-transcripts-for-podlove-batch')).toContainText('No episodes found.');
    await expect(page.locator('[data-action="batch-transcribe"]')).not.toBeVisible();
  });

  test('shows no-episodes message when API returns error', async ({ page }) => {
    await loadSettings(page, { status: 500, body: { error: 'Server error' } });

    await expect(page.locator('#ai-transcripts-for-podlove-batch')).toContainText('No episodes found.');
  });

  test('select all button checks all enabled checkboxes', async ({ page }) => {
    await loadSettings(page, {
      status: 200,
      body: [episodeWithAudioNoTranscript, episodeWithAudioAndTranscript, episodeNoAudio],
    });

    await page.locator('[data-action="select-all"]').click();

    // Episodes 1 and 2 have audio so they should be checked.
    const ep1Checkbox = page.locator('tbody input[type="checkbox"][value="1"]');
    const ep2Checkbox = page.locator('tbody input[type="checkbox"][value="2"]');
    // Episode 3 has no audio so its checkbox is disabled and must NOT be checked.
    const ep3Checkbox = page.locator('tbody input[type="checkbox"][value="3"]');

    await expect(ep1Checkbox).toBeChecked();
    await expect(ep2Checkbox).toBeChecked();
    await expect(ep3Checkbox).not.toBeChecked();
  });

  test('deselect all button unchecks all checkboxes', async ({ page }) => {
    await loadSettings(page, {
      status: 200,
      body: [episodeWithAudioNoTranscript, episodeWithAudioAndTranscript],
    });

    // First select all, then deselect.
    await page.locator('[data-action="select-all"]').click();
    await page.locator('[data-action="deselect-all"]').click();

    const ep1Checkbox = page.locator('tbody input[type="checkbox"][value="1"]');
    const ep2Checkbox = page.locator('tbody input[type="checkbox"][value="2"]');
    await expect(ep1Checkbox).not.toBeChecked();
    await expect(ep2Checkbox).not.toBeChecked();
  });

  test('select without transcript checks only episodes without a transcript', async ({ page }) => {
    await loadSettings(page, {
      status: 200,
      body: [episodeWithAudioNoTranscript, episodeWithAudioAndTranscript, episodeNoAudio],
    });

    await page.locator('[data-action="select-without"]').click();

    // Episode 1: has audio, no transcript → should be checked.
    await expect(page.locator('tbody input[type="checkbox"][value="1"]')).toBeChecked();
    // Episode 2: has audio, has transcript → should NOT be checked.
    await expect(page.locator('tbody input[type="checkbox"][value="2"]')).not.toBeChecked();
    // Episode 3: no audio → disabled, should NOT be checked.
    await expect(page.locator('tbody input[type="checkbox"][value="3"]')).not.toBeChecked();
  });

  test('toggle-all header checkbox selects and deselects all enabled rows', async ({ page }) => {
    await loadSettings(page, {
      status: 200,
      body: [episodeWithAudioNoTranscript, episodeWithAudioAndTranscript],
    });

    const headerCheckbox = page.locator('thead input[data-action="toggle-all"]');
    await headerCheckbox.check();

    await expect(page.locator('tbody input[type="checkbox"][value="1"]')).toBeChecked();
    await expect(page.locator('tbody input[type="checkbox"][value="2"]')).toBeChecked();

    await headerCheckbox.uncheck();

    await expect(page.locator('tbody input[type="checkbox"][value="1"]')).not.toBeChecked();
    await expect(page.locator('tbody input[type="checkbox"][value="2"]')).not.toBeChecked();
  });

  test('batch transcribe button is disabled when nothing is selected', async ({ page }) => {
    await loadSettings(page, { status: 200, body: [episodeWithAudioNoTranscript] });

    // Nothing selected by default — clicking should be a no-op (no API call).
    let transcribeCalled = false;
    await page.route('**/ai-transcripts-for-podlove/v1/transcribe/**', (route) => {
      transcribeCalled = true;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ transcript_id: 'x', status: 'queued' }) });
    });

    await page.locator('[data-action="batch-transcribe"]').click();

    // No transcribe call should have been made.
    expect(transcribeCalled).toBe(false);
  });

  test('batch transcribe processes selected episodes sequentially', async ({ page }) => {
    const transcribedIds: number[] = [];
    const importedIds: number[]    = [];

    await page.route('**/ai-transcripts-for-podlove/v1/episodes', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([episodeWithAudioNoTranscript, { ...episodeWithAudioAndTranscript, has_transcript: false }]),
      });
    });

    await page.route('**/ai-transcripts-for-podlove/v1/transcribe/**', (route) => {
      const url    = new URL(route.request().url());
      const postId = parseInt(url.pathname.split('/').pop()!, 10);
      transcribedIds.push(postId);
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ transcript_id: 'tx_' + postId, status: 'queued' }) });
    });

    await page.route('**/ai-transcripts-for-podlove/v1/status/**', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'completed' }) });
    });

    await page.route('**/ai-transcripts-for-podlove/v1/import/**', (route) => {
      const url    = new URL(route.request().url());
      const postId = parseInt(url.pathname.split('/').pop()!, 10);
      importedIds.push(postId);
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    });

    await page.goto(FIXTURE_URL);
    await page.evaluate((o) => (window as any).__initSettings(o), {});
    await page.waitForFunction(() => {
      const c = document.getElementById('ai-transcripts-for-podlove-batch');
      return c !== null && !c.innerHTML.includes('Loading episodes');
    });

    // Select all and start batch.
    await page.locator('[data-action="select-all"]').click();
    await page.locator('[data-action="batch-transcribe"]').click();

    // Wait for the "Done!" message which appears after all processing completes.
    await expect(page.locator('.batch-progress-message')).toHaveText('Done!', { timeout: 30_000 });

    // Both episodes should have been transcribed and imported.
    expect(transcribedIds).toContain(1);
    expect(transcribedIds).toContain(2);
    expect(importedIds).toContain(1);
    expect(importedIds).toContain(2);
  });

  test('progress message updates as each episode is processed', async ({ page }) => {
    await page.route('**/ai-transcripts-for-podlove/v1/episodes', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([episodeWithAudioNoTranscript, { ...episodeWithAudioAndTranscript, has_transcript: false }]),
      });
    });

    await page.route('**/ai-transcripts-for-podlove/v1/transcribe/**', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ transcript_id: 'tx_x', status: 'queued' }) });
    });
    await page.route('**/ai-transcripts-for-podlove/v1/status/**', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'completed' }) });
    });
    await page.route('**/ai-transcripts-for-podlove/v1/import/**', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    });

    await page.goto(FIXTURE_URL);
    await page.evaluate((o) => (window as any).__initSettings(o), {});
    await page.waitForFunction(() => {
      const c = document.getElementById('ai-transcripts-for-podlove-batch');
      return c !== null && !c.innerHTML.includes('Loading episodes');
    });

    await page.locator('[data-action="select-all"]').click();
    await page.locator('[data-action="batch-transcribe"]').click();

    // Progress message should show "1 of 2" at some point.
    await expect(page.locator('.batch-progress-message')).toContainText('1 of 2', { timeout: 10_000 });

    // Wait for completion.
    await expect(page.locator('.batch-progress-message')).toHaveText('Done!', { timeout: 30_000 });
  });

  test('cancel stops batch processing after current episode', async ({ page }) => {
    let transcribeCallCount = 0;

    await page.route('**/ai-transcripts-for-podlove/v1/episodes', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          episodeWithAudioNoTranscript,
          { ...episodeWithAudioAndTranscript, has_transcript: false },
          { post_id: 10, title: 'Episode Ten', has_audio: true, has_transcript: false, assemblyai_status: null },
        ]),
      });
    });

    // First transcribe completes immediately; subsequent ones should not be
    // reached because we cancel after the first.
    await page.route('**/ai-transcripts-for-podlove/v1/transcribe/**', (route) => {
      transcribeCallCount++;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ transcript_id: 'tx_x', status: 'queued' }) });
    });
    await page.route('**/ai-transcripts-for-podlove/v1/status/**', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'completed' }) });
    });
    await page.route('**/ai-transcripts-for-podlove/v1/import/**', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    });

    await page.goto(FIXTURE_URL);
    await page.evaluate((o) => (window as any).__initSettings(o), {});
    await page.waitForFunction(() => {
      const c = document.getElementById('ai-transcripts-for-podlove-batch');
      return c !== null && !c.innerHTML.includes('Loading episodes');
    });

    await page.locator('[data-action="select-all"]').click();
    await page.locator('[data-action="batch-transcribe"]').click();

    // Cancel button appears while batch is running — click it promptly.
    await expect(page.locator('[data-action="batch-cancel"]')).toBeVisible({ timeout: 5_000 });
    await page.locator('[data-action="batch-cancel"]').click();

    // After cancellation the batch-transcribe button is re-enabled (no longer
    // disabled) and the cancel button disappears.
    await expect(page.locator('[data-action="batch-cancel"]')).not.toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-action="batch-transcribe"]')).not.toBeDisabled();

    // Not all 3 episodes should have been transcribed.
    expect(transcribeCallCount).toBeLessThan(3);
  });

  test('episode row status cell updates to Completed after import', async ({ page }) => {
    await page.route('**/ai-transcripts-for-podlove/v1/episodes', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([episodeWithAudioNoTranscript]),
      });
    });
    await page.route('**/ai-transcripts-for-podlove/v1/transcribe/1', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ transcript_id: 'tx_1', status: 'queued' }) });
    });
    await page.route('**/ai-transcripts-for-podlove/v1/status/1', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'completed' }) });
    });
    await page.route('**/ai-transcripts-for-podlove/v1/import/1', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    });

    await page.goto(FIXTURE_URL);
    await page.evaluate((o) => (window as any).__initSettings(o), {});
    await page.waitForFunction(() => {
      const c = document.getElementById('ai-transcripts-for-podlove-batch');
      return c !== null && !c.innerHTML.includes('Loading episodes');
    });

    await page.locator('[data-action="select-all"]').click();
    await page.locator('[data-action="batch-transcribe"]').click();

    // The status cell for Episode One should update to "Completed".
    const statusCell = page.locator('tr[data-post-id="1"] .batch-status');
    await expect(statusCell).toContainText('Completed', { timeout: 30_000 });
  });

  test('episode row status cell shows Failed when transcribe API returns error', async ({ page }) => {
    await page.route('**/ai-transcripts-for-podlove/v1/episodes', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([episodeWithAudioNoTranscript]),
      });
    });
    await page.route('**/ai-transcripts-for-podlove/v1/transcribe/1', (route) => {
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'quota exceeded' }) });
    });

    await page.goto(FIXTURE_URL);
    await page.evaluate((o) => (window as any).__initSettings(o), {});
    await page.waitForFunction(() => {
      const c = document.getElementById('ai-transcripts-for-podlove-batch');
      return c !== null && !c.innerHTML.includes('Loading episodes');
    });

    await page.locator('[data-action="select-all"]').click();
    await page.locator('[data-action="batch-transcribe"]').click();

    const statusCell = page.locator('tr[data-post-id="1"] .batch-status');
    await expect(statusCell).toContainText('Failed', { timeout: 10_000 });

    // Batch should finish (no more items) and Done message should appear.
    await expect(page.locator('.batch-progress-message')).toHaveText('Done!', { timeout: 10_000 });
  });
});
