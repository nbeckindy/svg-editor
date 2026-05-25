import { expect, test } from '@playwright/test';

test.describe('Raster insert (toolbar)', () => {
  test('insert image via file input adds image to content group', async ({ page }) => {
    await page.goto('/');

    const insertBtn = page.getByTestId('tool-insert-image');
    await expect(insertBtn).toBeEnabled({ timeout: 60_000 });

    await page.getByTestId('input-insert-image-file').setInputFiles('e2e/fixtures/tiny.png');

    await expect(page.locator('[data-editor-content-group] image')).toHaveCount(1, { timeout: 20_000 });
  });
});
