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

  test('collapses dock to strip and expands while preserving active tab', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('dock-tab-layers').click();
    await expect(page.getByTestId('dock-tab-layers')).toHaveAttribute('aria-selected', 'true');

    await page.getByTestId('dock-collapse').click();
    await expect(page.getByTestId('dock-expanded-region')).toBeHidden();
    await expect(page.getByTestId('dock-expand-handle')).toBeVisible();

    await page.getByTestId('dock-expand-handle').click();
    await expect(page.getByTestId('dock-expanded-region')).toBeVisible();
    await expect(page.getByTestId('dock-tab-layers')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('editor-layers-area')).toBeVisible();
    await expect(page.getByTestId('editor-properties-area')).toBeHidden();
  });
});
