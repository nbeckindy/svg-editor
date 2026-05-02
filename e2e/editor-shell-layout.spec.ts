import { expect, test } from '@playwright/test';

test.describe('Editor shell layout', () => {
  test('shows top bar, left rail, canvas, and right dock', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByTestId('editor-top-bar')).toBeVisible();
    await expect(page.getByTestId('editor-tool-context-bar')).toBeVisible();
    await expect(page.getByTestId('editor-left-rail')).toBeVisible();
    await expect(page.getByTestId('editor-canvas-area')).toBeVisible();
    await expect(page.getByTestId('editor-right-dock')).toBeVisible();
  });

  test('defaults to properties tab', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByTestId('dock-tab-properties')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('editor-properties-area')).toBeVisible();
    await expect(page.getByTestId('editor-layers-area')).toBeHidden();
  });

  test('switches between properties and layers tabs', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('dock-tab-layers').click();
    await expect(page.getByTestId('dock-tab-layers')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('editor-layers-area')).toBeVisible();
    await expect(page.getByTestId('editor-properties-area')).toBeHidden();

    await page.getByTestId('dock-tab-properties').click();
    await expect(page.getByTestId('dock-tab-properties')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('editor-properties-area')).toBeVisible();
    await expect(page.getByTestId('editor-layers-area')).toBeHidden();
  });

  test('keeps compact dock and tool rail visible on narrower viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 900 });
    await page.goto('/');

    await expect(page.getByTestId('editor-left-rail')).toBeVisible();
    await expect(page.getByTestId('editor-right-dock')).toBeVisible();
    await expect(page.getByTestId('dock-tab-properties')).toBeVisible();
    await expect(page.getByTestId('dock-tab-layers')).toBeVisible();
    await expect(page.getByTestId('editor-canvas-area')).toBeVisible();
  });
});
