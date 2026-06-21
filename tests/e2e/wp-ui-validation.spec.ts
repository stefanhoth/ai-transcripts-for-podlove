/**
 * Live WordPress UI validation — AI Transcripts for Podlove plugin.
 *
 * Covers three checks:
 *   1. Settings page structure (heading, API key field, Save button,
 *      Batch Transcription section conditioned on API key presence)
 *   2. Episode meta box presence on podcast post edit page
 *   3. Invalid API key save — validation error feedback
 *
 * Prerequisites:
 *   - WordPress running at http://localhost:8888 (override: WP_BASE_URL)
 *   - Admin credentials: admin / password (wp-env defaults; override: WP_USER / WP_PASSWORD)
 *   - AI Transcripts for Podlove plugin active
 *   - Podlove Publisher with Transcripts + Contributors modules enabled
 */

import { test, expect, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const BASE_URL      = process.env.WP_BASE_URL  || 'http://localhost:8888';
const ADMIN_USER    = process.env.WP_USER      || 'admin';
const ADMIN_PASS    = process.env.WP_PASSWORD  || 'password';
const SETTINGS_URL  = `${BASE_URL}/wp-admin/admin.php?page=ai-transcripts-for-podlove`;
const SCREENSHOT_DIR = path.resolve(__dirname, 'screenshots');

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Auth helper — logs in via wp-login.php form.
// Uses waitForLoadState('domcontentloaded') + URL check rather than
// waitForURL which can race with cookie-redirect timing.
// ---------------------------------------------------------------------------

async function wpLogin(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/wp-login.php`);
  await page.waitForLoadState('domcontentloaded');
  // Clear both fields before filling to avoid leftover state.
  await page.locator('#user_login').clear();
  await page.locator('#user_login').fill(ADMIN_USER);
  await page.locator('#user_pass').clear();
  await page.locator('#user_pass').fill(ADMIN_PASS);
  // Wait for submit button to be enabled before clicking.
  await expect(page.locator('#wp-submit')).toBeEnabled();
  await page.locator('#wp-submit').click();
  // Dashboard has a <body class="wp-admin"> — wait for that to appear.
  await page.waitForSelector('body.wp-admin', { timeout: 30_000 });
}

async function screenshot(page: Page, name: string): Promise<void> {
  const file = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`[screenshot] ${file}`);
}

// ---------------------------------------------------------------------------
// Helper: clear the saved API key by blanking the field on the settings page
// and saving. Assumes caller is already logged in.
// ---------------------------------------------------------------------------

async function clearApiKey(page: Page): Promise<void> {
  await page.goto(SETTINGS_URL);
  await page.waitForSelector('#ai_transcripts_api_key', { timeout: 15_000 });
  await page.locator('input[name="ai_transcripts_api_key"]').fill('');
  await page.locator('input[type="submit"]').first().click();
  // Wait for the redirect back to the settings page after options.php.
  await page.waitForSelector('#ai_transcripts_api_key', { timeout: 15_000 });
}

// ---------------------------------------------------------------------------
// Check 1 — Settings page structure
// ---------------------------------------------------------------------------

test.describe('Check 1 – Settings page structure', () => {

  test.beforeEach(async ({ page }) => {
    await wpLogin(page);
    await clearApiKey(page);
  });

  test('1a – page heading, API key field, and Save button are present', async ({ page }) => {
    await page.goto(SETTINGS_URL);
    await page.waitForSelector('.wrap h1', { timeout: 15_000 });

    // --- Heading ---
    await expect(page.locator('.wrap h1')).toContainText('AI Transcripts for Podlove');
    console.log('[pass] h1 heading contains "AI Transcripts for Podlove"');

    // --- API key field ---
    const apiKeyField = page.locator('input[name="ai_transcripts_api_key"]');
    await expect(apiKeyField).toBeVisible();
    await expect(apiKeyField).toBeEnabled();
    console.log('[pass] API key input is visible and enabled');

    // --- Label for API key ---
    await expect(page.locator('label[for="ai_transcripts_api_key"]')).toBeVisible();
    console.log('[pass] API key label is visible');

    // --- Save button ---
    const saveBtn = page.locator('input[type="submit"]');
    await expect(saveBtn).toBeVisible();
    const saveBtnValue = await saveBtn.getAttribute('value');
    console.log('[pass] Save button is visible, value:', saveBtnValue);

    await screenshot(page, '01a-settings-no-key');
  });

  test('1b – Batch Transcription section is ABSENT when no API key is saved', async ({ page }) => {
    await page.goto(SETTINGS_URL);
    await page.waitForSelector('.wrap h1', { timeout: 15_000 });

    // The batch section should not exist when the key is empty
    // (PHP conditional: if ($has_key) renders the batch div).
    await expect(page.locator('#ai-transcripts-for-podlove-batch')).not.toBeAttached();
    console.log('[pass] #ai-transcripts-for-podlove-batch is absent when no API key');

    const batchHeading = page.locator('h2').filter({ hasText: 'Batch Transcription' });
    await expect(batchHeading).not.toBeAttached();
    console.log('[pass] "Batch Transcription" h2 is absent when no API key');

    await screenshot(page, '01b-settings-batch-absent');
  });

  test('1c – Batch Transcription section state is consistent with API key presence', async ({ page }) => {
    await page.goto(SETTINGS_URL);
    await page.waitForSelector('.wrap h1', { timeout: 15_000 });

    // After clearApiKey() in beforeEach the batch section must be absent.
    const batchPresent = await page.locator('#ai-transcripts-for-podlove-batch').count() > 0;
    console.log('[info] Batch section present with blank key:', batchPresent);

    if (batchPresent) {
      // If a key was somehow pre-saved, verify the section is properly rendered.
      await expect(page.locator('#ai-transcripts-for-podlove-batch')).toBeVisible();
      await expect(page.locator('h2').filter({ hasText: 'Batch Transcription' })).toBeVisible();
      console.log('[pass] Batch Transcription section is visible (key was pre-configured)');
    } else {
      // Expected state after clearApiKey.
      await expect(page.locator('#ai-transcripts-for-podlove-batch')).not.toBeAttached();
      console.log('[pass] Batch Transcription section correctly absent with no API key');
    }

    await screenshot(page, '01c-settings-batch-state');
  });

});

// ---------------------------------------------------------------------------
// Check 2 — Episode meta box
// ---------------------------------------------------------------------------

test.describe('Check 2 – Episode meta box on podcast edit page', () => {

  test.beforeEach(async ({ page }) => {
    await wpLogin(page);
  });

  test('2a – find an existing podcast post and verify meta box behaviour', async ({ page }) => {
    // Navigate to the podcast post list.
    await page.goto(`${BASE_URL}/wp-admin/edit.php?post_type=podcast`);
    await page.waitForSelector('body.wp-admin', { timeout: 15_000 });

    await screenshot(page, '02a-podcast-list');

    const bodyText = await page.locator('body').innerText();
    const noEpisodes = bodyText.includes('No posts found') || bodyText.includes('No episodes found');

    if (noEpisodes) {
      console.log('[info] No podcast posts found — meta box test cannot navigate to an episode');
      await screenshot(page, '02a-no-podcast-posts');
      // Fail explicitly so the gap is captured.
      expect(noEpisodes, 'At least one podcast post must exist for meta box validation').toBe(false);
      return;
    }

    // Click the first row's title link (Edit link).
    const firstRow = page.locator('table.wp-list-table tbody tr').first();
    const editLink = firstRow.locator('a.row-title').first();
    const episodeTitle = await editLink.textContent();
    console.log('[info] Opening episode:', episodeTitle?.trim());
    await editLink.click();

    // Gutenberg keeps background requests running indefinitely, so use
    // 'domcontentloaded' + wait for the editor iframe or post title field.
    await page.waitForLoadState('domcontentloaded');
    // Wait for the Gutenberg editor toolbar to signal the editor is ready.
    await page.waitForSelector('.editor-post-title, .wp-block-post-title, #title, h1.editor-post-title', {
      timeout: 30_000,
    });

    const postUrl = page.url();
    console.log('[info] Episode edit URL:', postUrl);

    await screenshot(page, '02b-episode-edit-page');

    // Determine if an API key is configured by querying the REST /config endpoint.
    // wpApiSettings.nonce is available on WP admin pages.
    const configResult = await page.evaluate(async () => {
      try {
        const nonce = (window as any).wpApiSettings?.nonce ||
                      (window as any).aiTranscripts?.nonce || '';
        const r = await fetch('/wp-json/ai-transcripts-for-podlove/v1/config', {
          headers: nonce ? { 'X-WP-Nonce': nonce } : {},
          credentials: 'same-origin',
        });
        if (!r.ok) return { error: r.status, has_api_key: false };
        return r.json();
      } catch (e: any) {
        return { error: e.message, has_api_key: false };
      }
    });
    console.log('[info] /config response:', JSON.stringify(configResult));
    const hasApiKey = configResult?.has_api_key === true;
    console.log('[info] Plugin reports API key configured:', hasApiKey);

    // Locate the Gutenberg "Meta Boxes" panel which wraps classic meta boxes.
    // The #ai-transcripts-for-podlove postbox is inside the Gutenberg meta boxes panel.
    const metaboxPostbox = page.locator('#ai-transcripts-for-podlove');

    if (!hasApiKey) {
      // MetaBox::register() returns early when key is absent.
      const metaboxCount = await metaboxPostbox.count();
      console.log('[info] #ai-transcripts-for-podlove count (expect 0 with no key):', metaboxCount);
      expect(metaboxCount, 'Meta box should NOT render when no API key is configured').toBe(0);
      console.log('[pass] Meta box correctly absent when no API key is configured');
      await screenshot(page, '02c-metabox-absent-no-key');
    } else {
      // The meta box must be present and visible.
      await expect(metaboxPostbox).toBeAttached({ timeout: 10_000 });
      console.log('[pass] #ai-transcripts-for-podlove postbox is attached to DOM');

      // Title should read "AssemblyAI Transcription".
      const hndle = metaboxPostbox.locator('.postbox-header h2, .hndle');
      await expect(hndle).toContainText('AssemblyAI Transcription');
      console.log('[pass] Meta box title is "AssemblyAI Transcription"');

      // The JS renders into #ai-transcripts-for-podlove-metabox inside the postbox.
      const innerDiv = page.locator('#ai-transcripts-for-podlove-metabox');
      await expect(innerDiv).toBeAttached();

      // Wait for the JS to render the Start Transcription button.
      const startBtn = innerDiv.locator('[data-action="transcribe"]');
      await expect(startBtn).toBeVisible({ timeout: 10_000 });
      await expect(startBtn).toContainText('Start Transcription');
      console.log('[pass] "Start Transcription" button is visible inside meta box');

      await screenshot(page, '02d-metabox-present-with-key');
    }
  });

});

// ---------------------------------------------------------------------------
// Check 3 — Invalid API key validation error
// ---------------------------------------------------------------------------

test.describe('Check 3 – Invalid API key save shows validation error', () => {

  test.beforeEach(async ({ page }) => {
    await wpLogin(page);
    await clearApiKey(page);
  });

  test('3a – entering "invalid_test_key" and saving shows a rejection error notice', async ({ page }) => {
    await page.goto(SETTINGS_URL);
    await page.waitForSelector('#ai_transcripts_api_key', { timeout: 15_000 });

    const apiKeyField = page.locator('input[name="ai_transcripts_api_key"]');
    await expect(apiKeyField).toBeVisible();

    // Track the save form POST request.
    const savedRequests: string[] = [];
    page.on('request', req => {
      if (req.url().includes('options.php') || req.url().includes('admin.php')) {
        savedRequests.push(`${req.method()} ${req.url()}`);
      }
    });

    // Fill in the invalid key.
    await apiKeyField.fill('invalid_test_key');
    console.log('[action] API key field filled with "invalid_test_key"');

    const saveBtn = page.locator('input[type="submit"]');
    await expect(saveBtn).toBeVisible();
    console.log('[action] Clicking Save...');

    // WordPress POSTs to options.php, validates against AssemblyAI, then
    // redirects back to settings with the error in a transient. We wait
    // for the settings page to reload — use domcontentloaded + selector
    // rather than networkidle because AssemblyAI call can take a few seconds.
    const [response] = await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45_000 }),
      saveBtn.click(),
    ]);
    // After the redirect, wait for the key input to be present again.
    await page.waitForSelector('#ai_transcripts_api_key', { timeout: 15_000 });

    console.log('[info] Navigation after save, final URL:', page.url());
    console.log('[info] Requests during save:', savedRequests);

    await screenshot(page, '03a-after-invalid-key-save');

    // --- Primary check: a .notice-error must be rendered ---
    // WordPress outputs: <div class="notice notice-error settings-error is-dismissible">
    const errorNotices = page.locator('.notice-error');
    const errorCount   = await errorNotices.count();
    console.log('[check] .notice-error count:', errorCount);

    for (let i = 0; i < errorCount; i++) {
      const txt = await errorNotices.nth(i).innerText();
      console.log(`  Error notice [${i}]: ${txt.trim().slice(0, 300)}`);
    }

    await expect(errorNotices.first()).toBeVisible();
    console.log('[pass] At least one .notice-error is visible after save');

    // --- The error must reference the API key / AssemblyAI ---
    const noticeText = await errorNotices.first().innerText();
    const relevant = /assemblyai|api key|rejected|invalid/i.test(noticeText);
    expect(
      relevant,
      `Error notice "${noticeText.trim().slice(0, 200)}" should reference AssemblyAI key rejection`
    ).toBe(true);
    console.log('[pass] Error notice text references AssemblyAI/API key rejection');

    // --- The invalid key must NOT be persisted ---
    // SettingsPage::validate_api_key() returns '' on 401, so the field must be empty.
    const savedValue = await apiKeyField.inputValue();
    console.log('[check] API key field value after save:', savedValue || '(empty)');
    expect(
      savedValue,
      `Invalid key should not be persisted — field must be empty, got: "${savedValue}"`
    ).toBe('');
    console.log('[pass] API key was not persisted (field is empty)');

    await screenshot(page, '03b-invalid-key-error-state');
  });

});
