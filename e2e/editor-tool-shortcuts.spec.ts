import { expect, test } from '@playwright/test';

test.describe('Editor tool keyboard shortcuts', () => {
  test('V then Z then H updates toolbar pressed state', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('icon-palette-chat-left-heart').click();
    await expect(page.getByTestId('canvas-viewport')).toBeVisible();

    await page.keyboard.press('p');
    await expect(page.getByTestId('tool-pen')).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('v');
    await expect(page.getByTestId('tool-selector')).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('z');
    await expect(page.getByTestId('tool-zoom')).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('h');
    await expect(page.getByTestId('tool-pan')).toHaveAttribute('aria-pressed', 'true');
  });
});
