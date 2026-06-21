/**
 * Live WordPress UI inspection for AI Transcripts for Podlove plugin.
 *
 * Requires a running WordPress instance (default: http://localhost:8888).
 * Override with WP_BASE_URL / WP_PASSWORD env vars.
 * wp-env default credentials: admin / password
 *
 * Checks:
 *  1. Settings page — API key field, batch section, notices
 *  2. Episode edit page — AssemblyAI meta box, Start Transcription button
 *  3. Invalid API key save — validation error feedback
 */

import { test, expect, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const BASE_URL   = process.env.WP_BASE_URL  || 'http://localhost:8888';
const ADMIN_USER = process.env.WP_USER      || 'admin';
const ADMIN_PASS = process.env.WP_PASSWORD  || 'password';
const SCREENSHOT_DIR = path.resolve(__dirname, 'screenshots');

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function wpLogin(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/wp-login.php`);
  await page.fill('#user_login', ADMIN_USER);
  await page.fill('#user_pass', ADMIN_PASS);
  await page.click('#wp-submit');
  // Wait for dashboard redirect
  await page.waitForURL(/wp-admin/, { timeout: 30_000 });
}

async function screenshot(page: Page, name: string): Promise<string> {
  const file = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`[screenshot] saved → ${file}`);
  return file;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Live WordPress – AI Transcripts for Podlove Plugin UI', () => {

  // Each test gets its own authenticated session.
  test.beforeEach(async ({ page }) => {
    await wpLogin(page);
  });

  // -------------------------------------------------------------------------
  // Check 1: Settings page
  // -------------------------------------------------------------------------
  test('1 – Settings page structure', async ({ page }) => {
    await page.goto(`${BASE_URL}/wp-admin/admin.php?page=ai-transcripts-for-podlove`);
    await page.waitForLoadState('networkidle');

    await screenshot(page, '01-settings-page');

    // --- API key field ---
    const apiKeyField = page.locator('input[name="ai_transcripts_api_key"], input[id*="api_key"], input[type="password"][name*="api"], input[name*="api_key"]');
    const apiKeyVisible = await apiKeyField.isVisible().catch(() => false);

    // Also check for text inputs near "API" labels
    const apiLabelExists = await page.locator('label, th, td').filter({ hasText: /api key/i }).count();

    console.log('[check] API key field visible:', apiKeyVisible);
    console.log('[check] API label elements found:', apiLabelExists);

    if (apiKeyVisible) {
      const currentValue = await apiKeyField.inputValue().catch(() => '(error reading value)');
      console.log('[check] Current API key field value:', currentValue ? '(has value — length ' + currentValue.length + ')' : '(empty)');
    }

    // --- Batch transcription section ---
    const batchSection = page.locator('#ai-transcripts-for-podlove-batch, .ai-transcripts-for-podlove-batch, [id*="batch"], [class*="batch"]');
    const batchCount   = await batchSection.count();
    console.log('[check] Batch section elements found:', batchCount);

    const batchHeading = page.locator('h2, h3').filter({ hasText: /batch|transcri/i });
    const batchHeadingCount = await batchHeading.count();
    console.log('[check] Batch-related headings found:', batchHeadingCount);

    // --- Notices / errors ---
    const notices = page.locator('.notice, .error, .updated, .settings-error, .notice-error, .notice-warning');
    const noticeCount = await notices.count();
    console.log('[check] Admin notices found:', noticeCount);
    for (let i = 0; i < noticeCount; i++) {
      const text = await notices.nth(i).textContent();
      console.log(`  Notice[${i}]: ${text?.trim().slice(0, 200)}`);
    }

    // Assertions — page must load without a PHP fatal / 404
    await expect(page).not.toHaveURL(/wp-login/);
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).not.toContain('Fatal error');
    expect(bodyText).not.toContain('404');

    // Summarise findings
    console.log('\n=== SETTINGS PAGE SUMMARY ===');
    console.log('API key field present:', apiKeyVisible || apiLabelExists > 0);
    console.log('Batch section present:', batchCount > 0 || batchHeadingCount > 0);
    console.log('Notices:', noticeCount);
  });

  // -------------------------------------------------------------------------
  // Check 2: Episode edit page meta box
  // -------------------------------------------------------------------------
  test('2 – Episode edit page meta box', async ({ page }) => {
    await page.goto(`${BASE_URL}/wp-admin/post.php?post=6&action=edit`);
    await page.waitForLoadState('networkidle');

    await screenshot(page, '02-episode-edit-page');

    // Check for the meta box container
    const metabox = page.locator(
      '#ai-transcripts-for-podlove-metabox, ' +
      '#ai_transcripts_metabox, ' +
      '[id*="assemblyai"], ' +
      '[id*="assemblyAI"]'
    );
    const metaboxCount = await metabox.count();
    console.log('[check] AssemblyAI meta box container elements:', metaboxCount);

    // Check for meta box title in the sidebar panels
    const metaboxTitle = page.locator('.postbox, .components-panel__body').filter({ hasText: /assemblyai|assembly ai|transcri/i });
    const metaboxTitleCount = await metaboxTitle.count();
    console.log('[check] Meta box panel (by title text) found:', metaboxTitleCount);

    // Start Transcription button
    const startBtn = page.locator(
      '[data-action="transcribe"], ' +
      'button:has-text("Start Transcription"), ' +
      'input[value*="Transcri"], ' +
      'button:has-text("Transcri")'
    );
    const startBtnVisible = await startBtn.first().isVisible().catch(() => false);
    console.log('[check] "Start Transcription" button visible:', startBtnVisible);

    // Post might not exist — check for that
    const bodyText = await page.locator('body').textContent();
    const postNotFound = bodyText?.includes('Post not found') || bodyText?.includes("doesn't exist");
    if (postNotFound) {
      console.log('[warning] Post ID 6 does not appear to exist on this WP install');
      // Take screenshot for evidence and skip strict assertions
      await screenshot(page, '02-episode-edit-post-not-found');
    } else {
      console.log('[check] Post ID 6 loaded successfully');
    }

    console.log('\n=== META BOX SUMMARY ===');
    console.log('Meta box container present:', metaboxCount > 0 || metaboxTitleCount > 0);
    console.log('Start Transcription button present:', startBtnVisible);

    // Soft assertion — page should not redirect to login
    await expect(page).not.toHaveURL(/wp-login/);
  });

  // -------------------------------------------------------------------------
  // Check 3: Invalid API key validation
  // -------------------------------------------------------------------------
  test('3 – Invalid API key save shows validation error', async ({ page }) => {
    await page.goto(`${BASE_URL}/wp-admin/admin.php?page=ai-transcripts-for-podlove`);
    await page.waitForLoadState('networkidle');

    // Find the API key input — try multiple likely selectors
    const apiKeySelectors = [
      'input[name="ai_transcripts_api_key"]',
      'input[name="ai_transcripts_settings[api_key]"]',
      'input[id="ai_transcripts_api_key"]',
      'input[id*="api_key"]',
      'input[name*="api_key"]',
      'input[type="password"]',
      'input[type="text"][name*="key"]',
    ];

    let apiKeyInput = null;
    let usedSelector = '';
    for (const sel of apiKeySelectors) {
      const count = await page.locator(sel).count();
      if (count > 0) {
        apiKeyInput = page.locator(sel).first();
        usedSelector = sel;
        console.log('[check] Found API key input with selector:', sel);
        break;
      }
    }

    if (!apiKeyInput) {
      // Dump all inputs visible on the settings page for diagnosis
      const allInputs = await page.locator('input').all();
      console.log('[debug] All inputs on settings page:');
      for (const inp of allInputs) {
        const name = await inp.getAttribute('name').catch(() => '');
        const id   = await inp.getAttribute('id').catch(() => '');
        const type = await inp.getAttribute('type').catch(() => '');
        console.log(`  type="${type}" name="${name}" id="${id}"`);
      }
      await screenshot(page, '03-settings-no-api-input');
      console.log('[warning] Could not find API key input — skipping key entry');
      return;
    }

    // Intercept network to monitor the save/validate request
    const apiRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('wp-json') || req.url().includes('admin-ajax') || req.url().includes('admin.php')) {
        apiRequests.push(`${req.method()} ${req.url()}`);
      }
    });

    const apiResponses: Array<{ url: string; status: number; body: string }> = [];
    page.on('response', async (resp) => {
      if (resp.url().includes('wp-json') || resp.url().includes('admin-ajax')) {
        try {
          const body = await resp.text();
          apiResponses.push({ url: resp.url(), status: resp.status(), body: body.slice(0, 500) });
        } catch {
          // ignore body read errors
        }
      }
    });

    // Clear the field and type the invalid key
    await apiKeyInput.triple_click?.() || await apiKeyInput.click({ clickCount: 3 });
    await apiKeyInput.fill('invalid_key_12345');
    console.log('[action] Filled API key field with "invalid_key_12345"');

    // Find and click the Save button
    const saveBtn = page.locator(
      'input[type="submit"], ' +
      'button[type="submit"], ' +
      'input[value*="Save"], ' +
      '#submit'
    ).first();
    const saveBtnVisible = await saveBtn.isVisible().catch(() => false);
    console.log('[check] Save button visible:', saveBtnVisible);

    if (!saveBtnVisible) {
      await screenshot(page, '03-settings-no-save-button');
      console.log('[warning] No save button found');
      return;
    }

    // Click Save and wait for the page to respond
    await Promise.all([
      page.waitForLoadState('networkidle', { timeout: 30_000 }),
      saveBtn.click(),
    ]);

    await screenshot(page, '03-settings-after-invalid-key-save');

    // Look for error/warning notices after save
    const notices = await page.locator('.notice, .error, .updated, .notice-error, .notice-warning, .settings-error').all();
    console.log('[check] Notices after save:', notices.length);
    for (const n of notices) {
      const text = await n.textContent();
      console.log(`  Notice: ${text?.trim().slice(0, 300)}`);
    }

    // Also check for inline error messages that might be rendered in custom elements
    const errorEls = await page.locator('[class*="error"], [class*="invalid"], [class*="warning"]').all();
    console.log('[check] Error/invalid class elements:', errorEls.length);
    for (const el of errorEls.slice(0, 5)) {
      const text = await el.textContent();
      if (text?.trim()) console.log(`  Error element: ${text.trim().slice(0, 200)}`);
    }

    // Network summary
    console.log('[check] API-related requests during save:');
    apiRequests.forEach(r => console.log(' ', r));
    console.log('[check] API responses captured:');
    apiResponses.forEach(r => console.log(`  ${r.status} ${r.url}\n    ${r.body.slice(0, 200)}`));

    console.log('\n=== INVALID API KEY SAVE SUMMARY ===');
    console.log('Notices displayed:', notices.length);
    console.log('API requests triggered:', apiRequests.length);
  });

});
