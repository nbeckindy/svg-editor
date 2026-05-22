import { expect, test } from '@playwright/test';

test.describe('Text refinement (79x): placement preview', () => {
  test('text tool shows preview ghost after pointer moves over canvas', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('editor-assets-menu-button').click();
    await page.getByTestId('icon-palette-chat-left-heart').click();
    await expect(page.getByTestId('canvas-viewport')).toBeVisible();

    await page.keyboard.press('t');
    await expect(page.getByTestId('tool-text')).toHaveAttribute('aria-pressed', 'true');

    const vp = page.getByTestId('canvas-viewport');
    const box = await vp.boundingBox();
    expect(box).toBeTruthy();

    await page.mouse.move(box!.x + box!.width * 0.42, box!.y + box!.height * 0.42);

    const preview = page.locator('[data-editor-text-tool-preview]');
    await expect(preview).toBeVisible();
    await expect(preview).toHaveAttribute('data-editor-text-tool-preview', 'true');
  });
});
