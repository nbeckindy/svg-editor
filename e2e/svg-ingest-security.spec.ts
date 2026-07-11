/**
 * E2E attack simulation via the debug panel (Slice 9, ADR 0002).
 *
 * Exercises the full user path:
 *   debug panel apply → onSVGLoaded → initializeSVG → sanitizeSvgMarkup
 *
 * Asserts that malicious SVG payloads are stripped from the live canvas DOM
 * before any rendering occurs.
 */
import { expect, test } from '@playwright/test';

const COMBINED_ATTACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
<script>window.__xss_fired = true;</script>
<defs><script>window.__xss_fired = true;</script></defs>
<rect id="safe-rect" x="10" y="10" width="80" height="60" onload="window.__xss_fired=true" onclick="window.__xss_fired=true" fill="#336699"/>
<circle id="safe-circle" cx="200" cy="150" r="40" onmouseover="window.__xss_fired=true" fill="#cc3333"/>
<foreignObject width="100" height="100">
  <body xmlns="http://www.w3.org/1999/xhtml">
    <script>window.__xss_fired = true;</script>
  </body>
</foreignObject>
</svg>`;

test.describe('SVG ingest security — debug panel attack (Slice 9)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('canvas-viewport')).toBeVisible();

    // Open debug panel and apply the attack payload
    const debugPanel = page.getByTestId('editor-svg-debug-panel');
    await debugPanel.getByRole('button', { name: 'Expand' }).click();
    await expect(page.getByTestId('svg-debug-editor')).toBeVisible();

    // Dismiss any alert the sanitizer may raise (blocked hrefs warning)
    page.on('dialog', (dialog) => dialog.dismiss());

    await page.getByTestId('svg-debug-editor').fill(COMBINED_ATTACK_SVG);
    await page.getByTestId('svg-debug-apply').click();

    // Wait for the canvas to reflect the new document
    await expect(page.locator('[data-editor-content-group] #safe-rect')).toBeVisible();
  });

  test('no <script> elements in canvas DOM after applying attack payload', async ({ page }) => {
    const scriptCount = await page.evaluate(() =>
      document.querySelectorAll('svg script').length
    );
    expect(scriptCount).toBe(0);
  });

  test('no on* event handler attributes on canvas shapes', async ({ page }) => {
    const handlerCount = await page.evaluate(() => {
      const allEls = Array.from(document.querySelectorAll('svg *'));
      return allEls.reduce((n, el) =>
        n + Array.from(el.attributes).filter(a => /^on[a-zA-Z]/i.test(a.name)).length
      , 0);
    });
    expect(handlerCount).toBe(0);
  });

  test('no <foreignObject> elements in canvas DOM', async ({ page }) => {
    const foCount = await page.evaluate(() =>
      document.querySelectorAll('svg foreignObject').length
    );
    expect(foCount).toBe(0);
  });

  test('XSS marker was never set (sanitizer prevented execution)', async ({ page }) => {
    const xssFired = await page.evaluate(() =>
      (window as unknown as Record<string, unknown>)['__xss_fired'] ?? false
    );
    expect(xssFired).toBe(false);
  });

  test('legitimate shapes survive sanitization', async ({ page }) => {
    await expect(page.locator('[data-editor-content-group] #safe-rect')).toBeVisible();
    await expect(page.locator('[data-editor-content-group] #safe-circle')).toBeVisible();
  });
});
