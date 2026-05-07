import { expect, test } from '@playwright/test';

/**
 * Regional layout snapshots for the editor shell (not full-page).
 * Refresh baselines after intentional UI changes:
 *   npx playwright test e2e/editor-shell-regions.spec.ts --update-snapshots
 */
test.describe('Editor shell regions (layout snapshots)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await expect(page.getByTestId('editor-main')).toBeVisible();
    await expect(page.getByTestId('editor-right-dock')).toBeVisible();
  });

  test('editor main workspace matches snapshot', async ({ page }) => {
    const main = page.getByTestId('editor-main');
    await expect(main).toHaveScreenshot('editor-main.png', {
      animations: 'disabled',
      maxDiffPixels: 1200,
      maxDiffPixelRatio: 0.02,
      mask: [page.getByTestId('editor-debug-strip')],
    });
  });

  test('editor right dock matches snapshot', async ({ page }) => {
    const dock = page.getByTestId('editor-right-dock');
    await expect(dock).toHaveScreenshot('editor-right-dock.png', {
      animations: 'disabled',
      maxDiffPixels: 600,
      maxDiffPixelRatio: 0.015,
    });
  });
});
