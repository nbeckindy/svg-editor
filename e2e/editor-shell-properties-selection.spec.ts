import { expect, test } from '@playwright/test';

test.describe('Editor shell: Properties vs document context', () => {
  test('default document: Properties tab active; document settings visible; no shape transform readouts in DOM', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(page.getByTestId('dock-tab-properties')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('editor-properties-area')).toBeVisible();

    await expect(page.getByTestId('document-settings-panel')).toBeVisible();
    await expect(page.getByTestId('document-settings')).toBeVisible();

    await expect(page.getByTestId('properties-transform-x')).toHaveCount(0);
  });

  test('bundled icon + path selection: transform readouts populated; document settings panel not rendered', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('icon-palette-chat-left-heart').click();
    await expect(page.getByTestId('canvas-zoom-level')).toBeVisible();

    await page.getByTestId('canvas-viewport').locator('path').nth(1).click();
    await expect(page.getByTestId('canvas-handle-rotate')).toBeVisible();

    const xReadout = page.getByTestId('properties-transform-x');
    await expect(xReadout).toBeVisible();
    const xText = (await xReadout.textContent())?.trim() ?? '';
    expect(xText.length).toBeGreaterThan(0);

    await expect(page.getByTestId('document-settings-panel')).toHaveCount(0);
    await expect(page.getByTestId('document-settings')).toHaveCount(0);
  });
});
